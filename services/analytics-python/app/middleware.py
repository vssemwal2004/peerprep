"""ASGI request boundary: correlation IDs and streaming body limits."""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


class BodyTooLarge(Exception):
    pass


class InternalBoundaryMiddleware:
    def __init__(self, app: Callable[..., Awaitable[None]], max_request_bytes: int) -> None:
        self.app = app
        self.max_request_bytes = max_request_bytes

    @staticmethod
    def _headers(scope: dict[str, Any]) -> dict[bytes, bytes]:
        return {key.lower(): value for key, value in scope.get("headers", [])}

    @staticmethod
    def _request_id(headers: dict[bytes, bytes]) -> str:
        supplied = headers.get(b"x-request-id", headers.get(b"x-correlation-id", b"")).decode(
            "ascii", errors="ignore"
        )
        return supplied if REQUEST_ID_PATTERN.fullmatch(supplied) else uuid.uuid4().hex

    async def _send_error(self, send: Callable[..., Awaitable[None]], request_id: str, status: int, code: str, message: str) -> None:
        body = json.dumps({"error": {"code": code, "message": message}, "request_id": request_id}, separators=(",", ":")).encode()
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"x-request-id", request_id.encode()),
                (b"x-correlation-id", request_id.encode()),
            ],
        })
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope: dict[str, Any], receive: Callable[..., Awaitable[dict[str, Any]]], send: Callable[..., Awaitable[None]]) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        headers = self._headers(scope)
        request_id = self._request_id(headers)
        scope.setdefault("state", {})["request_id"] = request_id
        response_started = False

        async def send_with_request_id(message: dict[str, Any]) -> None:
            nonlocal response_started
            if message.get("type") == "http.response.start":
                response_started = True
                response_headers = [
                    (key, value)
                    for key, value in message.get("headers", [])
                    if key.lower() not in {b"x-request-id", b"x-correlation-id"}
                ]
                response_headers.append((b"x-request-id", request_id.encode()))
                response_headers.append((b"x-correlation-id", request_id.encode()))
                message["headers"] = response_headers
            await send(message)

        limit_body = scope.get("method") == "POST" and scope.get("path") == "/v1/analyze"
        if limit_body:
            raw_length = headers.get(b"content-length")
            if raw_length:
                try:
                    content_length = int(raw_length)
                except ValueError:
                    await self._send_error(send, request_id, 400, "invalid_content_length", "Content-Length is invalid.")
                    return
                if content_length < 0:
                    await self._send_error(send, request_id, 400, "invalid_content_length", "Content-Length is invalid.")
                    return
                if content_length > self.max_request_bytes:
                    await self._send_error(send, request_id, 413, "request_too_large", "Request body exceeds the configured limit.")
                    return
            received = 0

            async def limited_receive() -> dict[str, Any]:
                nonlocal received
                message = await receive()
                if message.get("type") == "http.request":
                    received += len(message.get("body", b""))
                    if received > self.max_request_bytes:
                        raise BodyTooLarge
                return message
        else:
            limited_receive = receive

        try:
            await self.app(scope, limited_receive, send_with_request_id)
        except BodyTooLarge:
            if not response_started:
                await self._send_error(send, request_id, 413, "request_too_large", "Request body exceeds the configured limit.")
