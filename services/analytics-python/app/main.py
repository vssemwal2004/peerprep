"""FastAPI entry point for the authenticated internal analytics service."""

from collections.abc import Callable

import anyio
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from .auth import ServicePrincipal, verify_service_token
from .config import Settings
from .engine import analyze
from .errors import ServiceError, register_exception_handlers
from .formulas import FORMULA_VERSION
from .middleware import InternalBoundaryMiddleware
from .models import AnalyzeRequest, AnalyzeResponse, HealthResponse, ReadyResponse

Analyzer = Callable[[AnalyzeRequest], AnalyzeResponse]


def create_app(settings: Settings | None = None, analyzer: Analyzer = analyze) -> FastAPI:
    runtime = settings or Settings.from_env()
    app = FastAPI(
        title="PeerPrep Internal Analytics",
        version="1.0.0",
        description="Deterministic analytics over already-authorized normalized metric rows.",
    )
    app.state.settings = runtime
    app.add_middleware(InternalBoundaryMiddleware, max_request_bytes=runtime.max_request_bytes)
    register_exception_handlers(app)
    limiter = anyio.CapacityLimiter(runtime.max_concurrency)

    def authenticate(request: Request) -> ServicePrincipal:
        return verify_service_token(request, runtime)

    @app.get("/health", response_model=HealthResponse, tags=["operations"])
    def health() -> HealthResponse:
        return HealthResponse(
            formula_version=FORMULA_VERSION,
            readiness="ready" if runtime.ready else "not_ready",
            auth_mode=runtime.auth_mode,
            max_request_bytes=runtime.max_request_bytes,
        )

    @app.get("/ready", response_model=ReadyResponse, tags=["operations"])
    def ready(request: Request) -> ReadyResponse | JSONResponse:
        payload = ReadyResponse(
            status="ready" if runtime.ready else "not_ready",
            checks={
                "configuration": not bool(runtime.configuration_errors),
                "authentication": runtime.auth_mode in {"jwt", "development_bypass"},
            },
        )
        if runtime.ready:
            return payload
        return JSONResponse(
            status_code=503,
            content={**payload.model_dump(), "request_id": getattr(request.state, "request_id", "unknown")},
        )

    @app.post("/v1/analyze", response_model=AnalyzeResponse, tags=["analytics"])
    async def analyze_metrics(
        request: AnalyzeRequest,
        _principal: ServicePrincipal = Depends(authenticate),
    ) -> AnalyzeResponse:
        try:
            with anyio.fail_after(runtime.execution_timeout_seconds):
                return await anyio.to_thread.run_sync(
                    analyzer,
                    request,
                    abandon_on_cancel=True,
                    limiter=limiter,
                )
        except TimeoutError as error:
            raise ServiceError(504, "analysis_timeout", "Analytics execution exceeded the configured deadline.") from error

    return app


app = create_app()
