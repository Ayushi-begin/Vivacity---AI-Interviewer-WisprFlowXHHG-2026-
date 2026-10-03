import uuid
from datetime import timedelta

import jwt

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    generate_otp,
    hash_otp,
    hash_password,
    otp_matches,
    utcnow,
    verify_password,
)


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("s3cret-password")
    assert hashed != "s3cret-password"
    assert verify_password("s3cret-password", hashed)
    assert not verify_password("wrong", hashed)
    assert not verify_password("anything", None)


def test_access_token_roundtrip() -> None:
    user_id = uuid.uuid4()
    assert decode_access_token(create_access_token(user_id)) == user_id


def test_expired_access_token_is_rejected() -> None:
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "exp": utcnow() - timedelta(seconds=1)},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    assert decode_access_token(token) is None


def test_token_signed_with_other_key_is_rejected() -> None:
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "exp": utcnow() + timedelta(minutes=5)},
        "some-other-secret-key-that-is-long-enough",
        algorithm="HS256",
    )
    assert decode_access_token(token) is None


def test_token_without_access_type_is_rejected() -> None:
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "refresh", "exp": utcnow() + timedelta(minutes=5)},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    assert decode_access_token(token) is None


def test_otp_format_and_matching() -> None:
    otp = generate_otp()
    assert len(otp) == 6 and otp.isdigit()
    assert otp_matches(otp, hash_otp(otp))
    assert not otp_matches("000000" if otp != "000000" else "111111", hash_otp(otp))
