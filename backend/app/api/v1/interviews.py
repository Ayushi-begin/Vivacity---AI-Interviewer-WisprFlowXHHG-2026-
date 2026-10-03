import uuid
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, File, Form, Query, Response, UploadFile, status

from app.api.deps import (
    CurrentUser,
    DBSession,
    InterviewGraph,
    OptionalInterviewGraph,
    SessionFactory,
)
from app.api.rate_limits import per_user
from app.core.config import settings
from app.schemas.interview import (
    AnswerSubmit,
    InterviewDetail,
    InterviewList,
    InterviewSummary,
    RoadmapOut,
)
from app.services import interview_service

router = APIRouter(prefix="/interviews", tags=["interviews"])


def _detail(interview: Any) -> InterviewDetail:
    return InterviewDetail.from_model(
        interview, processing=interview_service.is_processing(interview.id)
    )


@router.post(
    "",
    response_model=InterviewDetail,
    status_code=status.HTTP_201_CREATED,
    # Every start calls the LLM, so cap it per user.
    dependencies=[per_user("start_interview", 10, 3600)],
)
async def start_interview(
    session: DBSession,
    graph: InterviewGraph,
    user: CurrentUser,
    resume: Annotated[UploadFile, File(description="Resume as a PDF")],
    role: Annotated[str, Form(min_length=2, max_length=100)],
    company: Annotated[str, Form(min_length=2, max_length=100)],
) -> InterviewDetail:
    # Read one byte past the limit so oversized files are detected without loading them fully.
    data = await resume.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    interview = await interview_service.start_interview(
        session,
        graph,
        user,
        filename=resume.filename or "resume.pdf",
        data=data,
        role=role,
        company=company,
    )
    return _detail(interview)


@router.get("", response_model=InterviewList)
async def list_interviews(
    session: DBSession,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> InterviewList:
    rows, total = await interview_service.list_interviews(session, user, limit=limit, offset=offset)
    return InterviewList(
        items=[InterviewSummary.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{interview_id}", response_model=InterviewDetail)
async def get_interview(
    interview_id: uuid.UUID, session: DBSession, user: CurrentUser
) -> InterviewDetail:
    return _detail(await interview_service.get_interview(session, user, interview_id))


@router.delete(
    "/{interview_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_interview(
    interview_id: uuid.UUID, session: DBSession, graph: OptionalInterviewGraph, user: CurrentUser
) -> None:
    await interview_service.delete_interview(session, graph, user, interview_id)


@router.post(
    "/{interview_id}/answers",
    response_model=InterviewDetail,
    dependencies=[per_user("submit_answer", 30, 60)],
)
async def submit_answer(
    interview_id: uuid.UUID,
    data: AnswerSubmit,
    session: DBSession,
    session_factory: SessionFactory,
    graph: InterviewGraph,
    user: CurrentUser,
    background: BackgroundTasks,
) -> InterviewDetail:
    interview, finish = await interview_service.submit_answer(
        session, user, interview_id, question_id=data.question_id, answer=data.answer
    )
    if finish:
        background.add_task(
            interview_service.finish_in_background, session_factory, graph, user.id, interview.id
        )
    return _detail(interview)


@router.post(
    "/{interview_id}/retry",
    response_model=InterviewDetail,
    dependencies=[per_user("retry_interview", 10, 600)],
)
async def retry_interview(
    interview_id: uuid.UUID,
    session: DBSession,
    session_factory: SessionFactory,
    graph: InterviewGraph,
    user: CurrentUser,
    background: BackgroundTasks,
) -> InterviewDetail:
    interview, finish = await interview_service.retry(session, user, interview_id)
    if finish:
        background.add_task(
            interview_service.finish_in_background, session_factory, graph, user.id, interview.id
        )
    return _detail(interview)


@router.get("/{interview_id}/roadmap", response_model=RoadmapOut)
async def get_roadmap(interview_id: uuid.UUID, session: DBSession, user: CurrentUser) -> RoadmapOut:
    return RoadmapOut.model_validate(
        await interview_service.get_roadmap(session, user, interview_id)
    )
