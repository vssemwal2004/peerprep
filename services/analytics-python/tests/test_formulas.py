from app.formulas import (
    FORMULA_VERSION,
    arithmetic_mean,
    compare_values,
    safe_percentage,
    threshold_severity,
)


def test_missing_denominators_and_empty_means_remain_missing() -> None:
    assert safe_percentage(0, 0) is None
    assert safe_percentage(4, None) is None
    assert arithmetic_mean([None, None]) is None


def test_zero_is_real_evidence_not_a_missing_sentinel() -> None:
    assert safe_percentage(0, 10) == 0
    assert arithmetic_mean([0, 50, None]) == 25


def test_comparison_orients_lower_is_better_metrics() -> None:
    result = compare_values(20, 30, higher_is_better=False)
    assert result.absolute_change == -10
    assert result.performance_change_points == 10
    assert result.direction == "improved"
    assert compare_values(10, 0, higher_is_better=True).relative_change_percent is None
    assert compare_values(None, 20, higher_is_better=True).direction == "unavailable"


def test_threshold_classification_is_direction_aware() -> None:
    assert threshold_severity(35, higher_is_better=True, warning_threshold=60, critical_threshold=40) == "critical"
    assert threshold_severity(55, higher_is_better=True, warning_threshold=60, critical_threshold=40) == "watch"
    assert threshold_severity(65, higher_is_better=False, warning_threshold=40, critical_threshold=60) == "critical"
    assert FORMULA_VERSION.startswith("peerprep-analytics-python-v1")
