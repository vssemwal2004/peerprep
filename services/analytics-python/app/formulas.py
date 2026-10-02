"""Deterministic, side-effect-free analytics formulas.

Missing evidence is represented by ``None``. A real zero is always retained as
an observed value and is never used as a missing-value sentinel.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from math import isfinite

FORMULA_VERSION = "peerprep-analytics-python-v1.0.0"
DEFAULT_PRECISION = 2


def round_metric(value: float | int | None, precision: int = DEFAULT_PRECISION) -> float | None:
    """Round a finite metric while preserving missing evidence."""

    if value is None:
        return None
    numeric = float(value)
    if not isfinite(numeric):
        return None
    return round(numeric, precision)


def safe_percentage(numerator: float | int | None, denominator: float | int | None) -> float | None:
    """Return numerator / denominator * 100, or None for an invalid denominator."""

    if numerator is None or denominator is None:
        return None
    top = float(numerator)
    bottom = float(denominator)
    if not isfinite(top) or not isfinite(bottom) or bottom <= 0:
        return None
    return round_metric((top / bottom) * 100)


def arithmetic_mean(values: Iterable[float | int | None]) -> float | None:
    """Return an equal-row mean of finite observed values."""

    observed = [float(value) for value in values if value is not None and isfinite(float(value))]
    if not observed:
        return None
    return round_metric(sum(observed) / len(observed))


@dataclass(frozen=True, slots=True)
class ComparisonResult:
    absolute_change: float | None
    relative_change_percent: float | None
    performance_change_points: float | None
    direction: str


def compare_values(
    current: float | None,
    previous: float | None,
    *,
    higher_is_better: bool,
    stable_tolerance: float = 0.5,
) -> ComparisonResult:
    """Compare two normalized values and orient direction by metric semantics."""

    if current is None or previous is None:
        return ComparisonResult(None, None, None, "unavailable")
    absolute_change = round_metric(current - previous)
    relative_change = None if previous == 0 else round_metric(((current - previous) / abs(previous)) * 100)
    performance_change = round_metric((current - previous) if higher_is_better else (previous - current))
    if abs(performance_change or 0) <= stable_tolerance:
        direction = "stable"
    elif (performance_change or 0) > 0:
        direction = "improved"
    else:
        direction = "declined"
    return ComparisonResult(absolute_change, relative_change, performance_change, direction)


def threshold_severity(
    value: float | None,
    *,
    higher_is_better: bool,
    warning_threshold: float,
    critical_threshold: float,
) -> str | None:
    """Classify a present value as critical, watch, or not risky."""

    if value is None:
        return None
    if higher_is_better:
        if value <= critical_threshold:
            return "critical"
        if value <= warning_threshold:
            return "watch"
    else:
        if value >= critical_threshold:
            return "critical"
        if value >= warning_threshold:
            return "watch"
    return None


def confidence_from_coverage(coverage_percent: float | None) -> str:
    """Map evidence coverage to an explainable confidence label."""

    if coverage_percent is None:
        return "unavailable"
    if coverage_percent >= 80:
        return "high"
    if coverage_percent >= 50:
        return "medium"
    return "low"
