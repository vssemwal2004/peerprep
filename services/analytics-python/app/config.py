"""Environment-backed configuration with fail-closed readiness checks."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _boolean(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _integer(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer") from error


def _number(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError as error:
        raise RuntimeError(f"{name} must be a number") from error


@dataclass(frozen=True, slots=True)
class Settings:
    environment: str = "production"
    jwt_secret: str = ""
    jwt_issuer: str = "peerprep-api"
    jwt_audience: str = "peerprep-analytics-runtime"
    jwt_max_ttl_seconds: int = 60
    jwt_clock_skew_seconds: int = 5
    dev_auth_bypass: bool = False
    max_request_bytes: int = 8 * 1024 * 1024
    execution_timeout_seconds: float = 10.0
    max_concurrency: int = 2

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            environment=os.getenv("ANALYTICS_ENV", "production").strip().lower(),
            jwt_secret=os.getenv(
                "ANALYTICS_JWT_SECRET",
                os.getenv("ANALYTICS_PYTHON_JWT_SECRET", ""),
            ),
            jwt_issuer=os.getenv("ANALYTICS_JWT_ISSUER", "peerprep-api").strip(),
            jwt_audience=os.getenv("ANALYTICS_JWT_AUDIENCE", "peerprep-analytics-runtime").strip(),
            jwt_max_ttl_seconds=_integer("ANALYTICS_JWT_MAX_TTL_SECONDS", 60),
            jwt_clock_skew_seconds=_integer("ANALYTICS_JWT_CLOCK_SKEW_SECONDS", 5),
            dev_auth_bypass=_boolean("ANALYTICS_DEV_AUTH_BYPASS"),
            max_request_bytes=_integer("ANALYTICS_MAX_REQUEST_BYTES", 8 * 1024 * 1024),
            execution_timeout_seconds=_number("ANALYTICS_EXECUTION_TIMEOUT_SECONDS", 10.0),
            max_concurrency=_integer("ANALYTICS_MAX_CONCURRENCY", 2),
        )

    @property
    def dev_bypass_active(self) -> bool:
        return self.dev_auth_bypass and self.environment in {"development", "test"}

    @property
    def configuration_errors(self) -> tuple[str, ...]:
        errors: list[str] = []
        if self.environment not in {"production", "development", "test"}:
            errors.append("ANALYTICS_ENV is unsupported")
        if self.dev_auth_bypass and not self.dev_bypass_active:
            errors.append("development auth bypass is forbidden in this environment")
        if not self.dev_bypass_active and len(self.jwt_secret.encode("utf-8")) < 32:
            errors.append("JWT secret must contain at least 32 bytes")
        if not self.jwt_issuer:
            errors.append("JWT issuer is required")
        if not self.jwt_audience:
            errors.append("JWT audience is required")
        if not 10 <= self.jwt_max_ttl_seconds <= 300:
            errors.append("JWT maximum TTL must be between 10 and 300 seconds")
        if not 0 <= self.jwt_clock_skew_seconds <= 30:
            errors.append("JWT clock skew must be between 0 and 30 seconds")
        if not 64 * 1024 <= self.max_request_bytes <= 20 * 1024 * 1024:
            errors.append("maximum request bytes must be between 64 KiB and 20 MiB")
        if not 0.1 <= self.execution_timeout_seconds <= 120:
            errors.append("execution timeout must be between 0.1 and 120 seconds")
        if not 1 <= self.max_concurrency <= 16:
            errors.append("maximum concurrency must be between 1 and 16")
        return tuple(errors)

    @property
    def ready(self) -> bool:
        return not self.configuration_errors

    @property
    def auth_mode(self) -> str:
        if self.dev_bypass_active:
            return "development_bypass"
        if len(self.jwt_secret.encode("utf-8")) >= 32:
            return "jwt"
        return "unconfigured"
