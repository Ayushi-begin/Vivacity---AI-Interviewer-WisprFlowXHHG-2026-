from fastapi import APIRouter

from app.api.v1 import analytics, auth, health, interviews, oauth, users

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(oauth.router)
api_router.include_router(users.router)
api_router.include_router(interviews.router)
api_router.include_router(analytics.router)
