import time

import jwt
from fastapi.testclient import TestClient

from app.config import Settings
from app.engine import analyze
from app.formulas import FORMULA_VERSION
from app.main import create_app

SECRET = "test-secret-that-is-deliberately-longer-than-32-characters"
SETTINGS = Settings(environment="test", jwt_secret=SECRET)


def minimal_payload() -> dict:
    return {
        "analysis_id": "smoke",
        "current_period": {"label": "September", "start_date": "2026-09-01", "end_date": "2026-09-30"},
        "metrics": [{"key": "learning", "label": "Learning completion", "source": "learning", "minimum_evidence": 1}],
        "rows": [{"entity_id": "student-1", "metric_key": "learning", "period": "current", "value": 75, "evidence_count": 4}],
    }


def token(*, audience: str = "peerprep-analytics-runtime", lifetime: int = 60) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": "peerprep-node-api",
            "iss": "peerprep-api",
            "aud": audience,
            "iat": now,
            "exp": now + lifetime,
        },
        SECRET,
        algorithm="HS256",
    )


def authorization(value: str | None = None) -> dict[str, str]:
    return {"Authorization": f"Bearer {value or token()}"}


def test_health_and_readiness_expose_safe_runtime_state() -> None:
    client = TestClient(create_app(SETTINGS))
    response = client.get("/health", headers={"X-Request-ID": "health-check-1"})
    assert response.status_code == 200
    assert response.headers["x-request-id"] == "health-check-1"
    assert response.json() == {
        "status": "ok",
        "service": "peerprep-analytics-python",
        "api_version": "v1",
        "formula_version": FORMULA_VERSION,
        "readiness": "ready",
        "auth_mode": "jwt",
        "max_request_bytes": SETTINGS.max_request_bytes,
    }
    assert client.get("/ready").status_code == 200


def test_node_correlation_header_is_preserved_on_success_and_error() -> None:
    client = TestClient(create_app(SETTINGS))
    success = client.post(
        "/v1/analyze",
        json=minimal_payload(),
        headers={**authorization(), "X-Correlation-ID": "node-call-1"},
    )
    assert success.status_code == 200
    assert success.headers["x-request-id"] == "node-call-1"
    assert success.headers["x-correlation-id"] == "node-call-1"

    rejected = client.post(
        "/v1/analyze",
        json=minimal_payload(),
        headers={"X-Correlation-ID": "node-call-2"},
    )
    assert rejected.status_code == 401
    assert rejected.headers["x-request-id"] == "node-call-2"
    assert rejected.headers["x-correlation-id"] == "node-call-2"
    assert rejected.json()["request_id"] == "node-call-2"


def test_missing_secret_is_live_but_not_ready_and_rejects_analysis() -> None:
    client = TestClient(create_app(Settings(environment="production", jwt_secret="")))
    assert client.get("/health").json()["readiness"] == "not_ready"
    assert client.get("/ready").status_code == 503
    response = client.post("/v1/analyze", json=minimal_payload())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_not_ready"


def test_analyze_requires_valid_bearer_token_and_returns_typed_contract() -> None:
    client = TestClient(create_app(SETTINGS))
    missing = client.post("/v1/analyze", json=minimal_payload())
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "authentication_required"

    response = client.post("/v1/analyze", json=minimal_payload(), headers=authorization())
    assert response.status_code == 200
    body = response.json()
    assert body["api_version"] == "v1"
    assert body["formula"]["version"] == FORMULA_VERSION
    assert body["metrics"][0]["current"]["value"] == 75
    assert body["metrics"][0]["comparison"]["direction"] == "unavailable"
    assert body["meta"]["input_rows"] == 1


def test_wrong_audience_and_excessive_lifetime_are_rejected() -> None:
    client = TestClient(create_app(SETTINGS))
    wrong_audience = client.post(
        "/v1/analyze",
        json=minimal_payload(),
        headers=authorization(token(audience="another-service")),
    )
    assert wrong_audience.status_code == 401
    assert wrong_audience.json()["error"]["code"] == "invalid_token"

    long_lived = client.post(
        "/v1/analyze",
        json=minimal_payload(),
        headers=authorization(token(lifetime=SETTINGS.jwt_max_ttl_seconds + 1)),
    )
    assert long_lived.status_code == 401
    assert long_lived.json()["error"]["code"] == "invalid_token_lifetime"


def test_explicit_development_bypass_does_not_work_in_production() -> None:
    development = Settings(environment="development", dev_auth_bypass=True)
    assert TestClient(create_app(development)).post("/v1/analyze", json=minimal_payload()).status_code == 200

    production = Settings(environment="production", dev_auth_bypass=True, jwt_secret=SECRET)
    client = TestClient(create_app(production))
    assert client.get("/ready").status_code == 503
    assert client.post("/v1/analyze", json=minimal_payload()).status_code == 503


def test_oversized_body_is_rejected_before_json_validation() -> None:
    constrained = Settings(environment="test", jwt_secret=SECRET, max_request_bytes=64 * 1024)
    client = TestClient(create_app(constrained))
    response = client.post(
        "/v1/analyze",
        content=b"{" + (b"x" * (64 * 1024)) + b"}",
        headers={**authorization(), "Content-Type": "application/json", "X-Request-ID": "oversize-1"},
    )
    assert response.status_code == 413
    assert response.headers["x-request-id"] == "oversize-1"
    assert response.json() == {
        "error": {"code": "request_too_large", "message": "Request body exceeds the configured limit."},
        "request_id": "oversize-1",
    }


def test_validation_and_unexpected_failures_use_safe_error_envelopes() -> None:
    client = TestClient(create_app(SETTINGS))
    invalid = client.post("/v1/analyze", json={"secret": "must-not-be-echoed"}, headers=authorization())
    assert invalid.status_code == 422
    assert invalid.json()["error"] == {"code": "invalid_request", "message": "Request validation failed."}
    assert "must-not-be-echoed" not in invalid.text

    def fail(_request):
        raise RuntimeError("private implementation detail")

    failing_client = TestClient(create_app(SETTINGS, analyzer=fail), raise_server_exceptions=False)
    failure = failing_client.post("/v1/analyze", json=minimal_payload(), headers=authorization())
    assert failure.status_code == 500
    assert failure.json()["error"] == {"code": "internal_error", "message": "The analytics request could not be completed."}
    assert "private implementation detail" not in failure.text


def test_execution_deadline_returns_a_bounded_error() -> None:
    def slow(request):
        time.sleep(0.2)
        return analyze(request)

    settings = Settings(environment="test", jwt_secret=SECRET, execution_timeout_seconds=0.1)
    client = TestClient(create_app(settings, analyzer=slow))
    response = client.post("/v1/analyze", json=minimal_payload(), headers=authorization())
    assert response.status_code == 504
    assert response.json()["error"]["code"] == "analysis_timeout"


def test_analyze_rejects_extra_fields_and_out_of_range_values() -> None:
    client = TestClient(create_app(SETTINGS))
    payload = minimal_payload()
    payload["unexpected"] = True
    assert client.post("/v1/analyze", json=payload, headers=authorization()).status_code == 422

    payload = minimal_payload()
    payload["rows"][0]["value"] = 101
    assert client.post("/v1/analyze", json=payload, headers=authorization()).status_code == 422
