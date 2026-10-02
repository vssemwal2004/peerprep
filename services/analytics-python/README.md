# PeerPrep Python analytics foundation

Internal FastAPI service for deterministic analysis of already-authorized,
normalized metric rows. It has no database or queue access.
Every analysis request is protected by a short-lived HS256 service JWT and the
service should still be deployed only on private networking. The caller remains
responsible for user authorization and data minimization before sending rows.

## Contract

- `GET /health` is public liveness and reports safe readiness metadata.
- `GET /ready` is public readiness and returns `503` until authentication and
  runtime settings are valid. The container healthcheck uses this endpoint.
- `POST /v1/analyze` accepts metric definitions, current/previous period
  windows, and one normalized row per entity/metric/period. It requires
  `Authorization: Bearer <service JWT>`.
- Values are normalized to `0..100`. `null` means missing evidence; numeric
  zero is a real observation. Rows below a metric's `minimum_evidence` are
  excluded rather than converted to zero.
- Cohort values use an equal-row mean. Comparisons respect
  `higher_is_better`. Risk signals include their observed value, threshold,
  evidence count, and a plain-language explanation.
- Responses expose `formula.version`; formula changes require a new version.
- Every response includes matching `X-Request-ID` and `X-Correlation-ID`
  headers. A valid caller-provided header (including Node's
  `X-Correlation-ID`) is preserved; otherwise the service generates one. Safe JSON errors have
  `{error:{code,message},request_id}` and never echo submitted rows or tokens.

Example:

```json
{
  "analysis_id": "semester-5-cse",
  "current_period": {
    "label": "September",
    "start_date": "2026-09-01",
    "end_date": "2026-09-30"
  },
  "metrics": [
    {
      "key": "coding_mastery",
      "label": "Coding mastery",
      "source": "coding",
      "minimum_evidence": 2
    }
  ],
  "rows": [
    {
      "entity_id": "student-123",
      "metric_key": "coding_mastery",
      "period": "current",
      "value": 72.5,
      "evidence_count": 8
    }
  ]
}
```

## Authentication and runtime limits

Copy `.env.example` into your secret/configuration system. The app reads the
process environment; it does not load `.env` itself.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ANALYTICS_ENV` | `production` | `production`, `development`, or `test`. |
| `ANALYTICS_JWT_SECRET` | blank | Shared random secret, minimum 32 UTF-8 bytes. Match Node's `ANALYTICS_PYTHON_JWT_SECRET`; that name is also accepted as a fallback. |
| `ANALYTICS_JWT_ISSUER` | `peerprep-api` | Required `iss`. |
| `ANALYTICS_JWT_AUDIENCE` | `peerprep-analytics-runtime` | Required `aud`. |
| `ANALYTICS_JWT_MAX_TTL_SECONDS` | `60` | Maximum allowed `exp - iat`; bounded to 10–300 seconds. |
| `ANALYTICS_JWT_CLOCK_SKEW_SECONDS` | `5` | JWT validation leeway; bounded to 0–30 seconds. |
| `ANALYTICS_DEV_AUTH_BYPASS` | `false` | Explicit bypass, honored only when environment is `development` or `test`. Never accepted in production. |
| `ANALYTICS_MAX_REQUEST_BYTES` | `8388608` | Streaming body limit, bounded to 64 KiB–20 MiB and aligned with the Node caller's default. |
| `ANALYTICS_EXECUTION_TIMEOUT_SECONDS` | `10` | Response deadline, bounded to 0.1–120 seconds. |
| `ANALYTICS_MAX_CONCURRENCY` | `2` | Capacity limit for CPU analysis, bounded to 1–16. |

Tokens must use `alg=HS256` and include string `sub`, `iss`, `aud`, numeric
`iat`, and numeric `exp`. A Node caller can sign the same claim set with its
reviewed JWT library, the shared secret, explicit HS256 algorithm, issuer,
audience, and a lifetime no longer than the configured maximum. A fingerprint,
request ID, or end-user token is not a substitute for this service token.

The execution deadline bounds the HTTP wait. Python threads cannot be killed
safely, so a timed-out calculation may finish in the background; the capacity
limiter prevents those abandoned calculations from creating unbounded
concurrency. Deployment CPU/memory limits remain required.

## Local development

```powershell
python -m venv .venv
# Activate .venv, then:
python -m pip install -e ".[test]"
pytest
$env:ANALYTICS_ENV="development"              # PowerShell example
$env:ANALYTICS_DEV_AUTH_BYPASS="true"         # explicit local-only bypass
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

OpenAPI is available at `/docs` during this foundation phase.

## Container

```bash
docker build -t peerprep-analytics-python .
docker run --rm --env-file .env -p 127.0.0.1:8000:8000 peerprep-analytics-python
```

The image runs as an unprivileged user and remains unhealthy until `/ready`
succeeds. Production deployment must still add network policy, secret rotation,
TLS at the service boundary, resource limits, telemetry, and the reviewed Node
integration.
