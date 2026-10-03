import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

_password_hash = PasswordHash.recommended()  # argon2id

# Verified against when the user doesn't exist, so login timing doesn't reveal
# which emails are registered.
_DUMMY_PASSWORD_HASH = _password_hash.hash(secrets.token_urlsafe(16))


def utcnow() -> datetime:
    return datetime.now(UTC)


def as_utc(dt: datetime) -> datetime:
    """Some drivers (e.g. SQLite in tests) return naive datetimes; treat them as UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


# --- Passwords ---

def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, hashed: str | None) -> bool:
    if hashed is None:
        _password_hash.verify(password, _DUMMY_PASSWORD_HASH)
        return False
    return _password_hash.verify(password, hashed)


# --- Access tokens (JWT) ---

def create_access_token(user_id: uuid.UUID) -> str:
    now = utcnow()
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> uuid.UUID | None:
    """Return the user id, or None if the token is invalid, expired or not an access token."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["sub", "exp", "type"]},
        )
        if payload["type"] != "access":
            return None
        return uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, ValueError):
        return None


# --- Refresh tokens (opaque, stored hashed) ---

def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# --- One-time passwords ---

def generate_otp(digits: int = 6) -> str:
    return f"{secrets.randbelow(10**digits):0{digits}d}"


def hash_otp(otp: str) -> str:
    # Keyed hash: a leaked table can't be brute-forced without the secret.
    return hmac.new(settings.JWT_SECRET_KEY.encode(), otp.encode(), hashlib.sha256).hexdigest()


def otp_matches(otp: str, otp_hash: str) -> bool:
    return hmac.compare_digest(hash_otp(otp), otp_hash)


# --- OAuth state ---

def generate_state() -> str:
    return secrets.token_urlsafe(32)
