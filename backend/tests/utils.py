from typing import Any

from httpx import AsyncClient, Response

from tests.fakes import make_pdf

PASSWORD = "correct-horse-battery"


async def register(
    client: AsyncClient,
    email: str = "ada@example.com",
    password: str = PASSWORD,
    full_name: str | None = "Ada Lovelace",
) -> Response:
    return await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )


async def login(
    client: AsyncClient, email: str = "ada@example.com", password: str = PASSWORD
) -> Response:
    return await client.post("/api/v1/auth/login", json={"email": email, "password": password})


async def me(client: AsyncClient, access_token: str) -> Response:
    return await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {access_token}"}
    )


async def auth_headers(
    client: AsyncClient, email: str = "ada@example.com", full_name: str | None = "Ada Lovelace"
) -> dict[str, str]:
    resp = await register(client, email=email, full_name=full_name)
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def start_interview(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    role: str = "Backend Engineer",
    company: str = "Stripe",
    pdf: bytes | None = None,
    filename: str = "resume.pdf",
) -> Response:
    return await client.post(
        "/api/v1/interviews",
        headers=headers,
        files={"resume": (filename, pdf if pdf is not None else make_pdf(), "application/pdf")},
        data={"role": role, "company": company},
    )


async def answer(
    client: AsyncClient, headers: dict[str, str], interview: dict[str, Any], text: str = "My answer"
) -> Response:
    question = interview["next_question"]
    return await client.post(
        f"/api/v1/interviews/{interview['id']}/answers",
        headers=headers,
        json={"question_id": question["id"], "answer": f"{text} (q{question['position']})"},
    )


async def complete_interview(
    client: AsyncClient, headers: dict[str, str], **start_kwargs: Any
) -> dict[str, Any]:
    resp = await start_interview(client, headers, **start_kwargs)
    assert resp.status_code == 201, resp.text
    interview = resp.json()
    for _ in range(3):
        resp = await answer(client, headers, interview)
        assert resp.status_code == 200, resp.text
        interview = resp.json()
    assert interview["status"] == "completed"
    return interview
