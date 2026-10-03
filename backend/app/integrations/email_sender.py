"""Transactional email through Brevo's HTTP API (https://developers.brevo.com).

HTTP rather than SMTP because many hosts, including Render's free tier, block
outbound SMTP ports. No database access and no business rules here.
"""
import httpx

_BREVO_URL = "https://api.brevo.com/v3/smtp/email"
_TIMEOUT = httpx.Timeout(15.0)


class EmailError(Exception):
    pass


async def send(
    *, api_key: str, sender_email: str, sender_name: str, to: str, subject: str, text: str
) -> None:
    payload = {
        "sender": {"email": sender_email, "name": sender_name},
        "to": [{"email": to}],
        "subject": subject,
        "textContent": text,
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                _BREVO_URL,
                json=payload,
                headers={"api-key": api_key, "accept": "application/json"},
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise EmailError(f"Email to {to} failed") from exc
