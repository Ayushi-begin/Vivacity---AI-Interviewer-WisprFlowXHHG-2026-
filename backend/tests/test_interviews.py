import uuid

import pytest
from httpx import AsyncClient
from langgraph.checkpoint.memory import InMemorySaver

from app.agents.interview_graph import build_interview_graph
from app.api.deps import get_interview_graph
from app.core.config import settings
from app.main import app
from tests.fakes import FakeLLM, make_pdf
from tests.utils import answer, auth_headers, complete_interview, start_interview

pytestmark = pytest.mark.usefixtures("interview_graph")


# --- Happy path ---

async def test_full_interview_flow(client: AsyncClient, fake_llm: FakeLLM) -> None:
    headers = await auth_headers(client)

    resp = await start_interview(client, headers)
    assert resp.status_code == 201, resp.text
    interview = resp.json()
    assert interview["status"] == "in_progress"
    assert [q["topic"] for q in interview["questions"]] == ["Python", "System Design", "SQL"]
    assert interview["next_question"]["position"] == 1
    assert interview["roadmap"] is None
    # what_it_tests stays hidden until the end.
    assert all(q["what_it_tests"] is None for q in interview["questions"])

    # Answers 1 and 2 are stored but not scored yet.
    for expected_next in (2, 3):
        resp = await answer(client, headers, interview)
        assert resp.status_code == 200, resp.text
        interview = resp.json()
        assert interview["status"] == "in_progress"
        assert interview["next_question"]["position"] == expected_next
        answered = [q for q in interview["questions"] if q["answer"]]
        assert all(q["answer"]["score"] is None for q in answered)
    assert fake_llm.count("AnswerEvaluation") == 0

    # The third answer triggers evaluation and the roadmap.
    resp = await answer(client, headers, interview)
    assert resp.status_code == 200, resp.text
    done = resp.json()
    assert done["status"] == "completed"
    assert done["next_question"] is None
    assert done["total_score"] == 8 + 5 + 3
    assert done["max_score"] == 30
    assert done["completed_at"] is not None

    scores = {q["topic"]: q["answer"]["score"] for q in done["questions"]}
    assert scores == {"Python": 8, "System Design": 5, "SQL": 3}
    sql = next(q for q in done["questions"] if q["topic"] == "SQL")
    assert sql["answer"]["what_was_good"] == "Good points on SQL"
    assert sql["answer"]["what_was_missing"] == "Missing depth on SQL"
    assert sql["answer"]["better_answer"] == "A stronger SQL answer"
    assert sql["answer"]["weak_topics"] == ["Indexing"]
    assert sql["answer"]["answer_text"] == "My answer (q3)"
    assert sql["what_it_tests"] == "Depth in SQL"

    # Weak areas: low-scoring topics (score < 7) first, then the evaluator's weak topics.
    roadmap = done["roadmap"]
    assert roadmap["weak_areas"] == ["System Design", "SQL", "Indexing"]
    assert [item["topic"] for item in roadmap["items"]] == ["System Design", "SQL", "Indexing"]

    resp = await client.get(f"/api/v1/interviews/{done['id']}/roadmap", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["summary"] == "Focus on the weak areas."

    assert fake_llm.count("QuestionSet") == 1
    assert fake_llm.count("AnswerEvaluation") == 3
    assert fake_llm.count("StudyRoadmap") == 1


async def test_questions_are_generated_from_the_pdf_role_and_company(
    client: AsyncClient, fake_llm: FakeLLM, upload_dir
) -> None:
    headers = await auth_headers(client)
    resp = await start_interview(client, headers, role="Staff Engineer", company="Netflix")
    assert resp.status_code == 201

    call = fake_llm.calls[0]
    assert call["schema"] == "QuestionSet"
    assert "sharded PostgreSQL cluster" in call["user"]  # text extracted from the PDF
    assert "Staff Engineer" in call["system"] and "Netflix" in call["system"]
    # The PDF is stored under the user's folder.
    assert len(list(upload_dir.rglob("*.pdf"))) == 1


async def test_evaluation_prompt_contains_question_resume_and_answer(
    client: AsyncClient, fake_llm: FakeLLM
) -> None:
    await complete_interview(client, await auth_headers(client))
    evaluation_prompts = [c["user"] for c in fake_llm.calls if c["schema"] == "AnswerEvaluation"]
    sql_prompt = next(p for p in evaluation_prompts if 'topic="SQL"' in p)
    assert "Tell me about your SQL experience" in sql_prompt
    assert "My answer (q3)" in sql_prompt
    assert "payments platform" in sql_prompt


async def test_list_and_get_interviews(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    finished = await complete_interview(client, headers)
    started = (await start_interview(client, headers, company="Shopify")).json()

    resp = await client.get("/api/v1/interviews", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    by_id = {item["id"]: item for item in body["items"]}
    assert by_id[finished["id"]]["answered_count"] == 3
    assert by_id[finished["id"]]["total_score"] == 16
    assert by_id[started["id"]]["answered_count"] == 0
    assert by_id[started["id"]]["status"] == "in_progress"

    page = (await client.get("/api/v1/interviews?limit=1&offset=1", headers=headers)).json()
    assert len(page["items"]) == 1 and page["total"] == 2

    resp = await client.get(f"/api/v1/interviews/{finished['id']}", headers=headers)
    assert resp.json()["total_score"] == 16


# --- Upload validation ---

async def test_rejects_non_pdf(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    resp = await start_interview(client, headers, pdf=b"hello, not a pdf", filename="resume.txt")
    assert resp.status_code == 422
    assert resp.json()["detail"] == "Resume must be a PDF file"


async def test_rejects_pdf_without_text(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    resp = await start_interview(client, headers, pdf=make_pdf(["tiny"]))
    assert resp.status_code == 422
    assert "No readable text" in resp.json()["detail"]


async def test_rejects_corrupt_pdf(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    resp = await start_interview(client, headers, pdf=b"%PDF-1.4\n garbage")
    assert resp.status_code == 422


async def test_rejects_oversized_upload(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "MAX_UPLOAD_MB", 1)
    headers = await auth_headers(client)
    big = make_pdf() + b"%" * (1024 * 1024)
    resp = await start_interview(client, headers, pdf=big)
    assert resp.status_code == 413


async def test_requires_role_and_company(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    resp = await client.post(
        "/api/v1/interviews",
        headers=headers,
        files={"resume": ("resume.pdf", make_pdf(), "application/pdf")},
        data={"role": "Backend Engineer"},
    )
    assert resp.status_code == 422


async def test_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/interviews")).status_code == 401
    assert (await start_interview(client, {})).status_code == 401


# --- Answer rules ---

async def test_answers_must_follow_question_order(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    interview = (await start_interview(client, headers)).json()
    second = interview["questions"][1]

    resp = await client.post(
        f"/api/v1/interviews/{interview['id']}/answers",
        headers=headers,
        json={"question_id": second["id"], "answer": "skipping ahead"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Answer question 1 next"


async def test_cannot_answer_twice_or_after_completion(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    interview = (await start_interview(client, headers)).json()
    first_id = interview["next_question"]["id"]
    await answer(client, headers, interview)

    again = await client.post(
        f"/api/v1/interviews/{interview['id']}/answers",
        headers=headers,
        json={"question_id": first_id, "answer": "second try"},
    )
    assert again.status_code == 409

    done = await complete_interview(client, headers)
    late = await client.post(
        f"/api/v1/interviews/{done['id']}/answers",
        headers=headers,
        json={"question_id": done["questions"][0]["id"], "answer": "too late"},
    )
    assert late.status_code == 409


async def test_unknown_question_and_empty_answer(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    interview = (await start_interview(client, headers)).json()
    url = f"/api/v1/interviews/{interview['id']}/answers"

    resp = await client.post(url, headers=headers, json={"question_id": str(uuid.uuid4()), "answer": "x"})
    assert resp.status_code == 404
    resp = await client.post(url, headers=headers, json={"question_id": interview["next_question"]["id"], "answer": ""})
    assert resp.status_code == 422


async def test_roadmap_not_ready_until_completed(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    interview = (await start_interview(client, headers)).json()
    resp = await client.get(f"/api/v1/interviews/{interview['id']}/roadmap", headers=headers)
    assert resp.status_code == 409


# --- Ownership ---

async def test_users_only_see_their_own_interviews(client: AsyncClient) -> None:
    alice = await auth_headers(client, email="alice@example.com", full_name="Alice")
    bob = await auth_headers(client, email="bob@example.com", full_name="Bob")
    finished = await complete_interview(client, alice)
    in_progress = (await start_interview(client, alice)).json()

    for interview in (finished, in_progress):
        base = f"/api/v1/interviews/{interview['id']}"
        assert (await client.get(base, headers=bob)).status_code == 404
        assert (await client.get(f"{base}/roadmap", headers=bob)).status_code == 404
        assert (await client.post(f"{base}/retry", headers=bob)).status_code == 404
    resp = await client.post(
        f"/api/v1/interviews/{in_progress['id']}/answers",
        headers=bob,
        json={"question_id": in_progress["next_question"]["id"], "answer": "hijack"},
    )
    assert resp.status_code == 404

    assert (await client.get("/api/v1/interviews", headers=bob)).json()["total"] == 0
    assert (await client.get("/api/v1/interviews", headers=alice)).json()["total"] == 2
    # Bob's failed attempt didn't touch Alice's interview.
    still = (await client.get(f"/api/v1/interviews/{in_progress['id']}", headers=alice)).json()
    assert still["next_question"]["position"] == 1


# --- Failures and recovery (nothing is lost) ---

async def test_evaluation_failure_keeps_answers_and_retry_finishes(
    client: AsyncClient, fake_llm: FakeLLM
) -> None:
    headers = await auth_headers(client)
    interview = (await start_interview(client, headers)).json()
    interview = (await answer(client, headers, interview)).json()
    interview = (await answer(client, headers, interview)).json()

    fake_llm.fail_on = {"AnswerEvaluation"}
    resp = await answer(client, headers, interview)
    assert resp.status_code == 502
    assert "progress is saved" in resp.json()["detail"]

    saved = (await client.get(f"/api/v1/interviews/{interview['id']}", headers=headers)).json()
    assert saved["status"] == "in_progress"
    assert all(q["answer"] and q["answer"]["score"] is None for q in saved["questions"])
    assert saved["next_question"] is None

    # Submitting again is refused. The user is told to retry instead.
    resp = await client.post(
        f"/api/v1/interviews/{interview['id']}/answers",
        headers=headers,
        json={"question_id": saved["questions"][2]["id"], "answer": "again"},
    )
    assert resp.status_code == 409

    fake_llm.fail_on = set()
    resp = await client.post(f"/api/v1/interviews/{interview['id']}/retry", headers=headers)
    assert resp.status_code == 200
    done = resp.json()
    assert done["status"] == "completed"
    assert done["total_score"] == 16
    assert fake_llm.count("QuestionSet") == 1  # questions were not regenerated


async def test_roadmap_failure_keeps_scores_and_does_not_rescore(
    client: AsyncClient, fake_llm: FakeLLM
) -> None:
    headers = await auth_headers(client)
    interview = (await start_interview(client, headers)).json()
    interview = (await answer(client, headers, interview)).json()
    interview = (await answer(client, headers, interview)).json()

    fake_llm.fail_on = {"StudyRoadmap"}
    assert (await answer(client, headers, interview)).status_code == 502

    saved = (await client.get(f"/api/v1/interviews/{interview['id']}", headers=headers)).json()
    assert saved["status"] == "in_progress"
    assert [q["answer"]["score"] for q in saved["questions"]] == [8, 5, 3]  # already stored

    fake_llm.fail_on = set()
    done = (await client.post(f"/api/v1/interviews/{interview['id']}/retry", headers=headers)).json()
    assert done["status"] == "completed"
    assert done["roadmap"] is not None
    assert fake_llm.count("AnswerEvaluation") == 3  # evaluations were not re-run


async def test_question_generation_failure_can_be_retried(
    client: AsyncClient, fake_llm: FakeLLM
) -> None:
    headers = await auth_headers(client)
    fake_llm.fail_on = {"QuestionSet"}
    resp = await start_interview(client, headers)
    assert resp.status_code == 502
    assert "Interview id:" in resp.json()["detail"]

    listed = (await client.get("/api/v1/interviews", headers=headers)).json()["items"]
    assert len(listed) == 1
    interview_id = listed[0]["id"]

    fake_llm.fail_on = set()
    retried = (await client.post(f"/api/v1/interviews/{interview_id}/retry", headers=headers)).json()
    assert len(retried["questions"]) == 3
    assert retried["next_question"]["position"] == 1


async def test_interview_survives_a_restart(
    client: AsyncClient, fake_llm: FakeLLM, checkpointer: InMemorySaver
) -> None:
    """A new graph instance on the same checkpointer (as after a server restart) continues the interview."""
    headers = await auth_headers(client)
    interview = (await start_interview(client, headers)).json()
    interview = (await answer(client, headers, interview)).json()

    restarted = build_interview_graph(fake_llm, checkpointer)
    app.dependency_overrides[get_interview_graph] = lambda: restarted

    interview = (await answer(client, headers, interview)).json()
    done = (await answer(client, headers, interview)).json()
    assert done["status"] == "completed"
    assert done["total_score"] == 16
    assert fake_llm.count("QuestionSet") == 1


async def test_retry_on_completed_interview_is_a_no_op(client: AsyncClient, fake_llm: FakeLLM) -> None:
    headers = await auth_headers(client)
    done = await complete_interview(client, headers)
    calls = len(fake_llm.calls)
    resp = await client.post(f"/api/v1/interviews/{done['id']}/retry", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total_score"] == 16
    assert len(fake_llm.calls) == calls


async def test_returns_503_when_openai_is_not_configured(client: AsyncClient) -> None:
    app.dependency_overrides.pop(get_interview_graph)
    headers = await auth_headers(client)
    resp = await start_interview(client, headers)
    assert resp.status_code == 503
    # Read-only endpoints still work.
    assert (await client.get("/api/v1/interviews", headers=headers)).status_code == 200
