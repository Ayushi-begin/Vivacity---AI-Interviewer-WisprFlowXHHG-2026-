"""Outbound messages to users.

For now these print to the server console. Swap the body for a real email
provider later without touching callers.
"""


def send_password_reset_otp(email: str, otp: str, expires_in_minutes: int) -> None:
    print(
        f"[password-reset] OTP for {email}: {otp} "
        f"(expires in {expires_in_minutes} minutes)",
        flush=True,
    )
