"""Interview flow: start from a resume, answer three questions, then evaluate and plan.

Two stores work together:
- The LangGraph checkpoint (thread_id = interview id) drives the flow and holds the
  LLM outputs as they're produced.
- The SQL tables are what the API, history and analytics read.

Answers are only written to SQL while the interview is under way, which keeps each
answer request fast. After the last one, a background task runs `_advance`: it walks
the graph forward, feeding it every answer it hasn't consumed yet, then copies the
results back into SQL. It is idempotent, so a failed LLM call loses nothing: calling
it again (via the retry endpoint) resumes from the step that failed.

Scoring the three answers and writing the roadmap takes 10-20 seconds. Meanwhile the
API reports `processing: true` and the client polls.
"""
import logging
import time
import uuid

from langchain_core.runnables import RunnableConfig
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Command
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agents.llm import LLMError
from app.core.config import settings
from app.core.exceptions import (
    AppError,
    BadGatewayError,
    ConflictError,
    NotFoundError,
    PayloadTooLargeError,
    UnprocessableError,
)
from app.core.security import utcnow
from app.integrations import file_storage, pdf_parser
from app.integrations.pdf_parser import PdfParseError
from app.models import Interview, Roadmap, User
from app.repositories import interview_repo, resume_repo

logger = logging.getLogger(__name__)

NOT_FOUND = "Interview not found"
LLM_FAILED = "The AI interviewer couldn't finish this step. Your progress is saved, so please retry."
# Generate questions, answer x3, evaluate, roadmap: well under this.
_MAX_GRAPH_STEPS = 10
# A background step that hasn't finished by now is assumed lost (e.g. the task never
# started), so the interview offers a retry instead of spinning forever.
_PROCESSING_TIMEOUT_SECONDS = 300

# Interviews with a background step running in this process, with its start time.
# A restart forgets them, which is safe: the interview then shows as needing a retry,
# and retrying is idempotent.
_in_flight: dict[uuid.UUID, float] = {}


def is_processing(interview_id: uuid.UUID) -> bool:
    started = _in_flight.get(interview_id)
    return started is not None and time.monotonic() - started < _PROCESSING_TIMEOUT_SECONDS


def _claim(interview_id: uuid.UUID) -> bool:
    """Mark a background step as started. False if one is already running."""
    if is_processing(interview_id):
        return False
    _in_flight[interview_id] = time.monotonic()
    return True


def _clean_label(value: str) -> str:
    # Role and company go into the system prompt, so keep them to one plain line.
    return " ".join(value.split())


def _config(interview_id: uuid.UUID) -> RunnableConfig:
    return {"configurable": {"thread_id": str(interview_id)}}


async def _get_owned(session: AsyncSession, user: User, interview_id: uuid.UUID) -> Interview:
    # Someone else's interview is reported as missing, so ids can't be probed.
    interview = await interview_repo.get_for_user(session, interview_id, user.id)
    if interview is None:
        raise NotFoundError(NOT_FOUND)
    return interview


def _validate_upload(filename: str, data: bytes) -> None:
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise PayloadTooLargeError(f"Resume must be {settings.MAX_UPLOAD_MB} MB or smaller")
    if not data.startswith(b"%PDF-") or not filename.lower().endswith(".pdf"):
        raise UnprocessableError("Resume must be a PDF file")


async def start_interview(
    session: AsyncSession,
    graph: CompiledStateGraph,
    user: User,
    *,
    filename: str,
    data: bytes,
    role: str,
    company: str,
) -> Interview:
    _validate_upload(filename, data)
    try:
        resume_text = await pdf_parser.extract_text(data)
    except PdfParseError as exc:
        raise UnprocessableError(str(exc)) from None

    storage_path = await file_storage.save_resume(settings.upload_path, user.id, data)
    resume = await resume_repo.create(
        session,
        user_id=user.id,
        filename=filename[:255],
        storage_path=storage_path,
        parsed_text=resume_text,
    )
    interview = await interview_repo.create(
        session,
        user_id=user.id,
        resume_id=resume.id,
        role=_clean_label(role),
        company=_clean_label(company),
    )
    # Commit first, so the interview exists (and can be retried) even if the LLM fails.
    await session.commit()

    try:
        await _advance(session, graph, interview)
    except BadGatewayError:
        # The client has no id yet, so include it so they can retry.
        raise BadGatewayError(f"{LLM_FAILED} Interview id: {interview.id}") from None
    return await _get_owned(session, user, interview.id)


async def submit_answer(
    session: AsyncSession,
    user: User,
    interview_id: uuid.UUID,
    *,
    question_id: uuid.UUID,
    answer: str,
) -> tuple[Interview, bool]:
    """Store an answer and move the interview on. Returns (interview, finish_in_background):
    after the last answer the caller must schedule `finish_in_background`."""
    interview = await _get_owned(session, user, interview_id)
    if interview.status == "completed":
        raise ConflictError("This interview is already finished")
    if not interview.questions:
        raise ConflictError("Questions aren't ready yet. Retry the interview to generate them.")

    questions = sorted(interview.questions, key=lambda q: q.position)
    pending = next((q for q in questions if q.answer is None), None)
    if pending is None:
        raise ConflictError("All questions are answered. Retry the interview to finish evaluation.")
    if question_id != pending.id:
        if any(q.id == question_id for q in questions):
            raise ConflictError(f"Answer question {pending.position} next")
        raise NotFoundError("Question not found in this interview")

    try:
        pending.answer = await interview_repo.add_answer(session, pending.id, answer.strip())
        await session.commit()
    except IntegrityError:  # a concurrent request answered it first
        await session.rollback()
        raise ConflictError("This question was already answered") from None

    # The graph catches up on the stored answers after the last one, in the background.
    return interview, pending is questions[-1] and _claim(interview_id)


async def retry(
    session: AsyncSession, user: User, interview_id: uuid.UUID
) -> tuple[Interview, bool]:
    """Resume an interview whose last AI step failed. Safe to call at any time.
    Returns (interview, finish_in_background), like `submit_answer`."""
    interview = await _get_owned(session, user, interview_id)
    if interview.status == "completed":
        return interview, False
    return interview, _claim(interview_id)


async def finish_in_background(
    session_factory: async_sessionmaker[AsyncSession],
    graph: CompiledStateGraph,
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
) -> None:
    """Run the remaining AI steps after the response has been sent. Failures are logged
    and leave the interview retryable; nothing is raised to the caller."""
    try:
        async with session_factory() as session:
            interview = await interview_repo.get_for_user(session, interview_id, user_id)
            if interview is not None and interview.status != "completed":
                await _advance(session, graph, interview)
    except AppError as exc:
        logger.warning("Interview %s: background step stopped: %s", interview_id, exc.detail)
    except Exception:
        logger.exception("Interview %s: background step crashed", interview_id)
    finally:
        _in_flight.pop(interview_id, None)


async def delete_interview(
    session: AsyncSession,
    graph: CompiledStateGraph | None,
    user: User,
    interview_id: uuid.UUID,
) -> None:
    """Delete an interview with its answers, roadmap, resume file and LangGraph checkpoint."""
    interview = await _get_owned(session, user, interview_id)
    if is_processing(interview_id):
        raise ConflictError("This interview is still being scored. Try again in a moment.")

    resume = await interview.awaitable_attrs.resume
    await interview_repo.delete(session, interview)
    remove_file = None
    if resume is not None and await resume_repo.count_interviews(session, resume.id) == 0:
        remove_file = resume.storage_path
        await resume_repo.delete(session, resume)
    await session.commit()

    # Cleanup after the commit. If it fails the leftovers are unreachable, so log and move on.
    if graph is not None and graph.checkpointer is not None:
        try:
            await graph.checkpointer.adelete_thread(str(interview_id))
        except Exception:
            logger.exception("Interview %s: could not delete its checkpoint", interview_id)
    if remove_file:
        try:
            await file_storage.delete_resume(settings.upload_path, remove_file)
        except (OSError, ValueError):
            logger.exception("Interview %s: could not delete the resume file", interview_id)


async def get_interview(session: AsyncSession, user: User, interview_id: uuid.UUID) -> Interview:
    return await _get_owned(session, user, interview_id)


async def list_interviews(session: AsyncSession, user: User, *, limit: int, offset: int):
    return await interview_repo.list_for_user(session, user.id, limit=limit, offset=offset)


async def get_roadmap(session: AsyncSession, user: User, interview_id: uuid.UUID) -> Roadmap:
    interview = await _get_owned(session, user, interview_id)
    if interview.roadmap is None:
        raise ConflictError("The roadmap is ready once all three answers have been evaluated")
    return interview.roadmap


async def _advance(session: AsyncSession, graph: CompiledStateGraph, interview: Interview) -> None:
    """Run the graph as far as it can go with the answers stored in SQL, then sync results."""
    config = _config(interview.id)
    try:
        for _ in range(_MAX_GRAPH_STEPS):
            snapshot = await graph.aget_state(config)
            if not snapshot.values:
                # Not started (or its first checkpoint was lost): start from the resume.
                resume = await interview.awaitable_attrs.resume
                if resume is None or not resume.parsed_text:
                    raise ConflictError("This interview's resume is no longer available")
                await graph.ainvoke(
                    {
                        "resume_text": resume.parsed_text,
                        "role": interview.role,
                        "company": interview.company,
                    },
                    config,
                )
            elif snapshot.interrupts:
                # Paused for an answer: feed it if the user has submitted one.
                position = snapshot.interrupts[0].value["position"]
                answer = await interview_repo.get_answer_text(session, interview.id, position)
                if answer is None:
                    break
                await graph.ainvoke(Command(resume=answer), config)
            elif snapshot.next:
                # A step failed earlier. Run it again.
                await graph.ainvoke(None, config)
            else:
                break  # finished
    except LLMError:
        logger.exception("Interview %s: LLM step failed", interview.id)
        await _sync_results(session, interview, (await graph.aget_state(config)).values)
        raise BadGatewayError(LLM_FAILED) from None

    await _sync_results(session, interview, (await graph.aget_state(config)).values)


async def _sync_results(session: AsyncSession, interview: Interview, values: dict) -> None:
    """Copy whatever the graph has produced into SQL. Each part is written once."""
    interview = await interview_repo.get_for_user(session, interview.id, interview.user_id)
    assert interview is not None
    now = utcnow()

    if values.get("questions") and not interview.questions:
        await interview_repo.add_questions(session, interview.id, values["questions"])

    for position, evaluation in enumerate(values.get("evaluations") or [], start=1):
        await interview_repo.save_evaluation(session, interview.id, position, evaluation, now)

    roadmap = values.get("roadmap")
    if roadmap and interview.roadmap is None:
        await interview_repo.create_roadmap(
            session,
            interview.id,
            summary=roadmap["summary"],
            weak_areas=values.get("weak_areas") or [],
            items=roadmap["items"],
        )
        await interview_repo.mark_completed(session, interview.id, now)

    await session.commit()
