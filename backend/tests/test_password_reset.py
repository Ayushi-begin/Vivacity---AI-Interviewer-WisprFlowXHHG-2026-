import re
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import utcnow
from app.models import PasswordResetOTP
from tests.utils import PASSWORD, login, register

NEW_PASSWORD = "a-brand-new-password"
OTP_LINE = re.compile(r"OTP for (\S+): (\d{6})")


async def request_otp(
    client: AsyncClient, capsys: pytest.CaptureFixture[str], email: str = "ada@example.com"
) -> str | None:
    resp = await client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert resp.status_code == 202
    match = OTP_LINE.search(capsys.readouterr().out)
    return match.group(2) if match else None


async def reset(client: AsyncClient, otp: str, password: str = NEW_PASSWORD, email: str = "ada@example.com"):
    return await client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp": otp, "new_password": password},
    )


def wrong(otp: str) -> str:
    return f"{(int(otp) + 1) % 1_000_000:06d}"


async def test_full_reset_flow(client: AsyncClient, capsys: pytest.CaptureFixture[str]) -> None:
    old_refresh = (await register(client)).json()["refresh_token"]

    otp = await request_otp(client, capsys)
    assert otp is not None

    resp = await reset(client, otp)
    assert resp.status_code == 200

    assert (await login(client, password=PASSWORD)).status_code == 401
    assert (await login(client, password=NEW_PASSWORD)).status_code == 200
    # Existing sessions are signed out.
    refresh = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert refresh.status_code == 401


async def test_unknown_email_gets_same_response_and_no_otp(
    client: AsyncClient, capsys: pytest.CaptureFixture[str]
) -> None:
    await register(client)
    known = await client.post("/api/v1/auth/forgot-password", json={"email": "ada@example.com"})
    capsys.readouterr()
    unknown = await client.post("/api/v1/auth/forgot-password", json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert "OTP" not in capsys.readouterr().out


async def test_otp_is_single_use(client: AsyncClient, capsys: pytest.CaptureFixture[str]) -> None:
    await register(client)
    otp = await request_otp(client, capsys)
    assert (await reset(client, otp)).status_code == 200
    assert (await reset(client, otp, password="yet-another-password")).status_code == 400


async def test_new_otp_invalidates_previous_one(
    client: AsyncClient, capsys: pytest.CaptureFixture[str]
) -> None:
    await register(client)
    first = await request_otp(client, capsys)
    second = await request_otp(client, capsys)
    if first == second:  # 1-in-a-million collision; nothing to assert
        pytest.skip("random OTPs collided")
    assert (await reset(client, first)).status_code == 400
    assert (await reset(client, second)).status_code == 200


async def test_wrong_otp_is_rejected(client: AsyncClient, capsys: pytest.CaptureFixture[str]) -> None:
    await register(client)
    otp = await request_otp(client, capsys)
    resp = await reset(client, wrong(otp))
    assert resp.status_code == 400
    assert resp.json() == {"detail": "Invalid or expired code"}
    # The real code still works after one miss.
    assert (await reset(client, otp)).status_code == 200


async def test_otp_locks_after_max_attempts(
    client: AsyncClient, capsys: pytest.CaptureFixture[str]
) -> None:
    await register(client)
    otp = await request_otp(client, capsys)
    for _ in range(5):
        assert (await reset(client, wrong(otp))).status_code == 400
    # Even the correct code is refused once the limit is hit.
    assert (await reset(client, otp)).status_code == 400
    assert (await login(client, password=PASSWORD)).status_code == 200


async def test_expired_otp_is_rejected(
    client: AsyncClient,
    capsys: pytest.CaptureFixture[str],
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await register(client)
    otp = await request_otp(client, capsys)
    async with session_factory() as session:
        await session.execute(
            update(PasswordResetOTP).values(expires_at=utcnow() - timedelta(seconds=1))
        )
        await session.commit()
    assert (await reset(client, otp)).status_code == 400


async def test_otp_is_stored_hashed(
    client: AsyncClient,
    capsys: pytest.CaptureFixture[str],
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await register(client)
    otp = await request_otp(client, capsys)
    async with session_factory() as session:
        row = (await session.execute(PasswordResetOTP.__table__.select())).one()
    assert row.otp_hash != otp
    assert len(row.otp_hash) == 64


async def test_reset_validates_input(client: AsyncClient) -> None:
    assert (await reset(client, "12ab56")).status_code == 422
    assert (await reset(client, "123456", password="short")).status_code == 422
    # Unknown email gives the same error as a bad code.
    resp = await reset(client, "123456", email="nobody@example.com")
    assert resp.status_code == 400
    assert resp.json() == {"detail": "Invalid or expired code"}


async def test_otp_is_emailed_when_email_is_configured(
    client: AsyncClient, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    import asyncio
    import json

    import httpx

    from app.core.config import settings
    from app.integrations import email_sender
    from app.services import notification_service

    monkeypatch.setattr(settings, "BREVO_API_KEY", "brevo-test-key")
    monkeypatch.setattr(settings, "EMAIL_FROM", "noreply@vivacity.test")
    sent: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(201, json={"messageId": "1"})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        email_sender.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )

    await register(client)
    capsys.readouterr()
    resp = await client.post("/api/v1/auth/forgot-password", json={"email": "ada@example.com"})
    assert resp.status_code == 202
    await asyncio.gather(*notification_service._pending)

    # The code goes by email, never into the server logs.
    assert "OTP" not in capsys.readouterr().out
    assert len(sent) == 1
    assert sent[0].headers["api-key"] == "brevo-test-key"
    body = json.loads(sent[0].content)
    assert body["to"] == [{"email": "ada@example.com"}]
    assert body["sender"]["email"] == "noreply@vivacity.test"
    otp = re.search(r"code is (\d{6})", body["textContent"]).group(1)
    assert (await reset(client, otp)).status_code == 200

    # Unknown emails send nothing (and get the same response).
    resp = await client.post("/api/v1/auth/forgot-password", json={"email": "nobody@example.com"})
    assert resp.status_code == 202
    assert len(sent) == 1
