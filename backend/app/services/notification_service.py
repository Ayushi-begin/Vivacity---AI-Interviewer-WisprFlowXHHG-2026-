"""Outbound messages to users.

With BREVO_API_KEY and EMAIL_FROM set, messages are emailed. Otherwise they are
printed to the server console (local development).

Emails are sent in the background, so a request that triggers one returns as fast
as one that doesn't. Otherwise response time would reveal which emails are registered.
"""
import asyncio
import logging

from app.core.config import settings
from app.integrations import email_sender
from app.integrations.email_sender import EmailError

logger = logging.getLogger(__name__)

# Strong references, so pending sends aren't garbage-collected mid-flight.
_pending: set[asyncio.Task[None]] = set()


async def _deliver(to: str, subject: str, text: str) -> None:
    try:
        await email_sender.send(
            api_key=settings.BREVO_API_KEY,
            sender_email=settings.EMAIL_FROM,
            sender_name=settings.EMAIL_FROM_NAME,
            to=to,
            subject=subject,
            text=text,
        )
    except EmailError:
        logger.exception("Could not send %r", subject)


def _send(to: str, subject: str, text: str) -> None:
    task = asyncio.get_running_loop().create_task(_deliver(to, subject, text))
    _pending.add(task)
    task.add_done_callback(_pending.discard)


def send_password_reset_otp(email: str, otp: str, expires_in_minutes: int) -> None:
    if not settings.email_enabled:
        print(
            f"[password-reset] OTP for {email}: {otp} "
            f"(expires in {expires_in_minutes} minutes)",
            flush=True,
        )
        return
    _send(
        email,
        f"Your {settings.EMAIL_FROM_NAME} password reset code",
        f"Your password reset code is {otp}\n\n"
        f"It expires in {expires_in_minutes} minutes and can be used once.\n"
        "If you didn't ask to reset your password, you can ignore this email.",
    )
