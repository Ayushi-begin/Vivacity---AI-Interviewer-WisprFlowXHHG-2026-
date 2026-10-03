import uuid
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import utcnow
from app.models import Interview
from tests.fakes import FakeLLM
from tests.utils import auth_headers, complete_interview, start_interview

pytestmark = pytest.mark.usefixtures("interview_graph")


# --- /analytics/me ---

async def test_analytics_for_new_user_is_empty(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    body = (await client.get("/api/v1/analytics/me", headers=headers)).json()
    assert body["summary"] == {
        "interviews_completed": 0,
        "interviews_in_progress": 0,
        "average_total": None,
        "best_total": None,
        "max_total": 30,
        "average_answer_score": None,
        "max_answer_score": 10,
    }
    assert body["score_history"] == []
    assert body["strong_topics"] == [] and body["weak_topics"] == []


async def test_analytics_scores_over_time_and_topics(client: AsyncClient, fake_llm: FakeLLM) -> None:
    headers = await auth_headers(client)

    # Interview 1: 8 + 5 + 3 = 16.  Interview 2: 10 + 7 + 5 = 22.
    first = await complete_interview(client, headers, company="Stripe")
    fake_llm.scores = {"Python": 10, "System Design": 7, "SQL": 5}
    second = await complete_interview(client, headers, company="Netflix")
    await start_interview(client, headers)  # in progress, excluded from the scores

    resp = await client.get("/api/v1/analytics/me", headers=headers)
    assert resp.status_code == 200
    body = resp.json()

    summary = body["summary"]
    assert summary["interviews_completed"] == 2
    assert summary["interviews_in_progress"] == 1
    assert summary["average_total"] == 19.0  # (16 + 22) / 2
    assert summary["best_total"] == 22
    assert summary["average_answer_score"] == pytest.approx(6.33, abs=0.01)  # 38 / 6

    history = body["score_history"]
    assert [p["interview_id"] for p in history] == [first["id"], second["id"]]
    assert [p["total_score"] for p in history] == [16, 22]
    assert [p["percentage"] for p in history] == [53.3, 73.3]
    assert [p["company"] for p in history] == ["Stripe", "Netflix"]

    # Per-topic averages: Python (8+10)/2 = 9, System Design (5+7)/2 = 6, SQL (3+5)/2 = 4.
    assert body["strong_topics"] == [{"topic": "Python", "answers": 2, "average_score": 9.0}]
    assert body["weak_topics"] == [
        {"topic": "SQL", "answers": 2, "average_score": 4.0},
        {"topic": "System Design", "answers": 2, "average_score": 6.0},
    ]


async def test_analytics_only_include_my_interviews(client: AsyncClient) -> None:
    alice = await auth_headers(client, email="alice@example.com", full_name="Alice")
    bob = await auth_headers(client, email="bob@example.com", full_name="Bob")
    await complete_interview(client, alice)

    body = (await client.get("/api/v1/analytics/me", headers=bob)).json()
    assert body["summary"]["interviews_completed"] == 0
    assert body["score_history"] == []


# --- /leaderboard ---

async def test_leaderboard_ranks_by_best_score_and_shows_names_only(
    client: AsyncClient, fake_llm: FakeLLM
) -> None:
    ada = await auth_headers(client, email="ada@example.com", full_name="Ada Lovelace")
    grace = await auth_headers(client, email="grace@example.com", full_name="Grace Hopper")
    anon = await auth_headers(client, email="anon@example.com", full_name=None)

    await complete_interview(client, ada)  # 16
    fake_llm.scores = {"Python": 9, "System Design": 8, "SQL": 7}
    await complete_interview(client, grace)  # 24
    fake_llm.scores = {"Python": 2, "System Design": 2, "SQL": 2}
    await complete_interview(client, grace)  # 6: lowers her average, not her best
    await complete_interview(client, anon)  # 6

    resp = await client.get("/api/v1/leaderboard", headers=ada)
    assert resp.status_code == 200
    body = resp.json()
    entries = body["entries"]
    assert [(e["rank"], e["name"], e["best_score"]) for e in entries] == [
        (1, "Grace Hopper", 24),
        (2, "Ada Lovelace", 16),
        (3, "Anonymous", 6),
    ]
    assert entries[0]["average_score"] == 15.0 and entries[0]["interviews_completed"] == 2
    assert [e["is_you"] for e in entries] == [False, True, False]
    assert body["you"]["rank"] == 2

    # Never expose emails or user ids.
    assert "@example.com" not in resp.text
    assert all(set(e) == {"rank", "name", "best_score", "average_score", "interviews_completed", "is_you"} for e in entries)


async def test_leaderboard_includes_you_outside_the_top(client: AsyncClient, fake_llm: FakeLLM) -> None:
    grace = await auth_headers(client, email="grace@example.com", full_name="Grace Hopper")
    ada = await auth_headers(client, email="ada@example.com", full_name="Ada Lovelace")
    fake_llm.scores = {"Python": 10, "System Design": 10, "SQL": 10}
    await complete_interview(client, grace)
    fake_llm.scores = {"Python": 1, "System Design": 1, "SQL": 1}
    await complete_interview(client, ada)

    body = (await client.get("/api/v1/leaderboard?limit=1", headers=ada)).json()
    assert [e["name"] for e in body["entries"]] == ["Grace Hopper"]
    assert body["you"]["name"] == "Ada Lovelace" and body["you"]["rank"] == 2


async def test_leaderboard_ties_share_a_rank(client: AsyncClient) -> None:
    ada = await auth_headers(client, email="ada@example.com", full_name="Ada")
    bob = await auth_headers(client, email="bob@example.com", full_name="Bob")
    await complete_interview(client, ada)
    await complete_interview(client, bob)
    entries = (await client.get("/api/v1/leaderboard", headers=ada)).json()["entries"]
    assert [e["rank"] for e in entries] == [1, 1]


async def test_leaderboard_filters_by_role_company_and_period(
    client: AsyncClient, fake_llm: FakeLLM, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    ada = await auth_headers(client, email="ada@example.com", full_name="Ada")
    bob = await auth_headers(client, email="bob@example.com", full_name="Bob")
    await complete_interview(client, ada, role="Backend Engineer", company="Stripe")
    old = await complete_interview(client, bob, role="Data Scientist", company="Netflix")

    async with session_factory() as session:
        await session.execute(
            update(Interview)
            .where(Interview.id == uuid.UUID(old["id"]))
            .values(completed_at=utcnow() - timedelta(days=60))
        )
        await session.commit()

    async def names(query: str) -> list[str]:
        resp = await client.get(f"/api/v1/leaderboard{query}", headers=ada)
        assert resp.status_code == 200, resp.text
        return [e["name"] for e in resp.json()["entries"]]

    assert sorted(await names("")) == ["Ada", "Bob"]
    assert await names("?company=stripe") == ["Ada"]  # case-insensitive
    assert await names("?role=DATA SCIENTIST") == ["Bob"]
    assert await names("?period=month") == ["Ada"]
    assert await names("?period=week&company=Netflix") == []
    assert (await client.get("/api/v1/leaderboard?period=year", headers=ada)).status_code == 422


async def test_leaderboard_ignores_in_progress_interviews(client: AsyncClient) -> None:
    ada = await auth_headers(client)
    await start_interview(client, ada)
    body = (await client.get("/api/v1/leaderboard", headers=ada)).json()
    assert body["entries"] == [] and body["you"] is None


async def test_leaderboard_requires_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/leaderboard")).status_code == 401
    assert (await client.get("/api/v1/analytics/me")).status_code == 401
