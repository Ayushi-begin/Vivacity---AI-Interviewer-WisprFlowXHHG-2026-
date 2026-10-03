from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base for errors raised by services. Routes never translate these by hand."""

    status_code = 400

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class BadRequestError(AppError):
    status_code = 400


class AuthenticationError(AppError):
    status_code = 401


class NotFoundError(AppError):
    status_code = 404


class ConflictError(AppError):
    status_code = 409


class PayloadTooLargeError(AppError):
    status_code = 413


class UnprocessableError(AppError):
    status_code = 422


class TooManyRequestsError(AppError):
    status_code = 429

    def __init__(self, detail: str, retry_after: int) -> None:
        super().__init__(detail)
        self.retry_after = retry_after


class BadGatewayError(AppError):
    """An upstream service (e.g. the LLM) failed."""

    status_code = 502


class ServiceUnavailableError(AppError):
    status_code = 503


async def _app_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    headers = None
    if isinstance(exc, AuthenticationError):
        headers = {"WWW-Authenticate": "Bearer"}
    elif isinstance(exc, TooManyRequestsError):
        headers = {"Retry-After": str(exc.retry_after)}
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=headers)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
