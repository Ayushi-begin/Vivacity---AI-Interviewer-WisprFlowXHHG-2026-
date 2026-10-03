# Import every model here so Base.metadata is complete for Alembic.
from app.models.interview import Answer, Interview, Question, Roadmap
from app.models.resume import Resume
from app.models.user import OAuthAccount, PasswordResetOTP, RefreshToken, User

__all__ = [
    "Answer",
    "Interview",
    "OAuthAccount",
    "PasswordResetOTP",
    "Question",
    "RefreshToken",
    "Resume",
    "Roadmap",
    "User",
]
