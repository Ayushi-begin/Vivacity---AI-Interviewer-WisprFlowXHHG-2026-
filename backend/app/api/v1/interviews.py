import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, Query, UploadFile, status

from app.api.deps import CurrentUser, DBSession, InterviewGraph
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


@router.post("", response_model=InterviewDetail, status_code=status.HTTP_201_CREATED)
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
    return InterviewDetail.from_model(interview)


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
    return InterviewDetail.from_model(
        await interview_service.get_interview(session, user, interview_id)
    )


@router.post("/{interview_id}/answers", response_model=InterviewDetail)
async def submit_answer(
    interview_id: uuid.UUID,
    data: AnswerSubmit,
    session: DBSession,
    graph: InterviewGraph,
    user: CurrentUser,
) -> InterviewDetail:
    interview = await interview_service.submit_answer(
        session, graph, user, interview_id, question_id=data.question_id, answer=data.answer
    )
    return InterviewDetail.from_model(interview)


@router.post("/{interview_id}/retry", response_model=InterviewDetail)
async def retry_interview(
    interview_id: uuid.UUID, session: DBSession, graph: InterviewGraph, user: CurrentUser
) -> InterviewDetail:
    return InterviewDetail.from_model(
        await interview_service.retry(session, graph, user, interview_id)
    )


@router.get("/{interview_id}/roadmap", response_model=RoadmapOut)
async def get_roadmap(interview_id: uuid.UUID, session: DBSession, user: CurrentUser) -> RoadmapOut:
    return RoadmapOut.model_validate(
        await interview_service.get_roadmap(session, user, interview_id)
    )
