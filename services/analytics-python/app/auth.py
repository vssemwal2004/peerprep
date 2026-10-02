"""HS256 service-to-service JWT verification."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import jwt
from fastapi import Request
from jwt import InvalidTokenError

from .config import Settings
from .errors import ServiceError


@dataclass(frozen=True, slots=True)
class ServicePrincipal:
    subject: str
    claims: dict[str, Any]


def _bearer_token(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token.strip():
        raise ServiceError(401, "authentication_required", "A Bearer service token is required.")
    return token.strip()


def verify_service_token(request: Request, settings: Settings) -> ServicePrincipal:
    if settings.dev_bypass_active:
        return ServicePrincipal(subject="development-bypass", claims={"bypass": True})
    if not settings.ready:
        raise ServiceError(503, "service_not_ready", "Analytics service authentication is not configured.")
    token = _bearer_token(request)
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            leeway=settings.jwt_clock_skew_seconds,
            options={"require": ["sub", "iss", "aud", "iat", "exp"]},
        )
    except InvalidTokenError as error:
        raise ServiceError(401, "invalid_token", "The service token is invalid or expired.") from error
    issued_at = claims.get("iat")
    expires_at = claims.get("exp")
    if isinstance(issued_at, bool) or isinstance(expires_at, bool) or not isinstance(issued_at, (int, float)) or not isinstance(expires_at, (int, float)):
        raise ServiceError(401, "invalid_token", "The service token is invalid or expired.")
    lifetime = float(expires_at) - float(issued_at)
    if lifetime <= 0 or lifetime > settings.jwt_max_ttl_seconds:
        raise ServiceError(401, "invalid_token_lifetime", "The service token lifetime is not permitted.")
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject.strip():
        raise ServiceError(401, "invalid_token", "The service token is invalid or expired.")
    return ServicePrincipal(subject=subject, claims=claims)
