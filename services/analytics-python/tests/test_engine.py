from datetime import date

import pytest
from pydantic import ValidationError

from app.engine import analyze
from app.models import AnalyzeRequest


def request_payload() -> dict:
    return {
        "analysis_id": "cohort-cse-5",
        "current_period": {"label": "Current", "start_date": "2026-09-01", "end_date": "2026-09-30"},
        "previous_period": {"label": "Previous", "start_date": "2026-08-01", "end_date": "2026-08-31"},
        "metrics": [
            {"key": "coding", "label": "Coding mastery", "source": "coding", "minimum_evidence": 2},
            {"key": "time", "label": "Resolution time", "source": "custom", "higher_is_better": False, "minimum_evidence": 1},
        ],
        "rows": [
            {"entity_id": "s1", "entity_label": "Aman", "metric_key": "coding", "period": "current", "value": 80, "evidence_count": 5},
            {"entity_id": "s2", "entity_label": "Riya", "metric_key": "coding", "period": "current", "value": 0, "evidence_count": 2},
            {"entity_id": "s3", "entity_label": "No evidence", "metric_key": "coding", "period": "current", "value": 95, "evidence_count": 1},
            {"entity_id": "s1", "entity_label": "Aman", "metric_key": "coding", "period": "previous", "value": 95, "evidence_count": 5},
            {"entity_id": "s2", "entity_label": "Riya", "metric_key": "coding", "period": "previous", "value": 20, "evidence_count": 2},
            {"entity_id": "s1", "entity_label": "Aman", "metric_key": "time", "period": "current", "value": 20, "evidence_count": 1},
            {"entity_id": "s1", "entity_label": "Aman", "metric_key": "time", "period": "previous", "value": 35, "evidence_count": 1},
        ],
    }


def test_engine_aggregates_with_explicit_missing_evidence_semantics() -> None:
    response = analyze(AnalyzeRequest.model_validate(request_payload()))
    coding = next(metric for metric in response.metrics if metric.metric_key == "coding")
    assert coding.current.value == 40
    assert coding.current.input_rows == 3
    assert coding.current.usable_rows == 2
    assert coding.current.excluded_rows == 1
    assert coding.current.coverage_percent == 66.67
    assert coding.previous.value == 57.5
    assert coding.comparison.direction.value == "declined"
    assert coding.comparison.performance_change_points == -17.5
    assert response.meta.usable_rows == 6
    assert response.formula.version.startswith("peerprep-analytics-python-v1")


def test_risk_signals_are_explainable_and_deterministically_ordered() -> None:
    response = analyze(AnalyzeRequest.model_validate(request_payload()))
    ids = [signal.id for signal in response.risk_signals]
    assert "risk:level:s2:coding" in ids
    assert "risk:decline:s1:coding" in ids
    assert "risk:missing:s3:coding" in ids
    assert ids == [signal.id for signal in sorted(response.risk_signals, key=lambda item: ({"critical": 0, "watch": 1, "info": 2}[item.severity.value], item.entity_id, item.metric_key, item.kind.value))]
    assert all(signal.explanation for signal in response.risk_signals)
    assert response.insights
    assert all(insight.evidence for insight in response.insights)


def test_contract_rejects_unknown_metrics_duplicates_and_previous_rows_without_period() -> None:
    payload = request_payload()
    payload["rows"][0]["metric_key"] = "unknown"
    with pytest.raises(ValidationError, match="unknown metric"):
        AnalyzeRequest.model_validate(payload)

    payload = request_payload()
    payload["rows"].append(dict(payload["rows"][0]))
    with pytest.raises(ValidationError, match="uniquely identify"):
        AnalyzeRequest.model_validate(payload)

    payload = request_payload()
    payload["previous_period"] = None
    with pytest.raises(ValidationError, match="previous rows require"):
        AnalyzeRequest.model_validate(payload)


def test_period_window_is_typed() -> None:
    request = AnalyzeRequest.model_validate(request_payload())
    assert request.current_period.start_date == date(2026, 9, 1)
