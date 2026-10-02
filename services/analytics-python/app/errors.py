"""Safe internal API error types and FastAPI exception handlers."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

LOGGER = logging.getLogger("peerprep.analytics")


class ServiceError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def error_response(request: Request, status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}, "request_id": request_id(request)},
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ServiceError)
    async def handle_service_error(request: Request, error: ServiceError) -> JSONResponse:
        return error_response(request, error.status_code, error.code, error.message)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, _error: RequestValidationError) -> JSONResponse:
        return error_response(request, 422, "invalid_request", "Request validation failed.")

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, error: StarletteHTTPException) -> JSONResponse:
        if error.status_code == 404:
            return error_response(request, 404, "not_found", "Endpoint not found.")
        if error.status_code == 405:
            return error_response(request, 405, "method_not_allowed", "Method not allowed.")
        return error_response(request, error.status_code, "http_error", "Request could not be completed.")

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, error: Exception) -> JSONResponse:
        LOGGER.exception("Unhandled analytics service error request_id=%s", request_id(request), exc_info=error)
        return error_response(request, 500, "internal_error", "The analytics request could not be completed.")
