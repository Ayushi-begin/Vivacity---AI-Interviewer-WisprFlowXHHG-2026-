"""Interview flow: start from a resume, answer three questions, then evaluate and plan.

Two stores work together:
- The LangGraph checkpoint (thread_id = interview id) drives the flow and holds the
  LLM outputs as they're produced.
- The SQL tables are what the API, history and analytics read.

Answers are committed to SQL *before* the graph runs. `_advance` then walks the graph
forward, feeding it any answers it hasn't consumed yet, and copies its results back
into SQL. It is idempotent, so a failed LLM call loses nothing: calling it again (via
the retry endpoint) resumes from the step that failed.
"""
import logging
import uuid

from langchain_core.runnables import RunnableConfig
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Command
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.llm import LLMError
from app.core.config import settings
from app.core.exceptions import (
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
        session, user_id=user.id, resume_id=resume.id, role=role.strip(), company=company.strip()
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
    graph: CompiledStateGraph,
    user: User,
    interview_id: uuid.UUID,
    *,
    question_id: uuid.UUID,
    answer: str,
) -> Interview:
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
        await interview_repo.add_answer(session, pending.id, answer.strip())
        await session.commit()
    except IntegrityError:  # a concurrent request answered it first
        await session.rollback()
        raise ConflictError("This question was already answered") from None

    await _advance(session, graph, interview)
    return await _get_owned(session, user, interview_id)


async def retry(
    session: AsyncSession, graph: CompiledStateGraph, user: User, interview_id: uuid.UUID
) -> Interview:
    """Resume an interview whose last AI step failed. Safe to call at any time."""
    interview = await _get_owned(session, user, interview_id)
    if interview.status != "completed":
        await _advance(session, graph, interview)
    return await _get_owned(session, user, interview_id)


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
