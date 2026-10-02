"""Columnar analytics engine over already-authorized normalized rows."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

import polars as pl

from .formulas import (
    FORMULA_VERSION,
    arithmetic_mean,
    compare_values,
    confidence_from_coverage,
    safe_percentage,
    threshold_severity,
)
from .models import (
    AnalysisMeta,
    AnalyzeRequest,
    AnalyzeResponse,
    ComparisonDirection,
    ConfidenceLevel,
    ExplainableInsight,
    FormulaMetadata,
    InsightKind,
    MetricAnalysis,
    MetricDefinition,
    MetricSnapshot,
    PeriodComparison,
    PeriodName,
    RiskKind,
    RiskSeverity,
    RiskSignal,
)

SEVERITY_ORDER = {RiskSeverity.critical: 0, RiskSeverity.watch: 1, RiskSeverity.info: 2}


def _frame(request: AnalyzeRequest) -> pl.DataFrame:
    records = [
        {
            "entity_id": row.entity_id,
            "entity_label": row.entity_label,
            "metric_key": row.metric_key,
            "period": row.period.value,
            "value": row.value,
            "evidence_count": row.evidence_count,
        }
        for row in request.rows
    ]
    return pl.DataFrame(
        records,
        schema={
            "entity_id": pl.String,
            "entity_label": pl.String,
            "metric_key": pl.String,
            "period": pl.String,
            "value": pl.Float64,
            "evidence_count": pl.Int64,
        },
        strict=False,
    )


def _snapshot(frame: pl.DataFrame, definition: MetricDefinition, period: PeriodName) -> MetricSnapshot:
    subset = frame.filter(
        (pl.col("metric_key") == definition.key) & (pl.col("period") == period.value)
    )
    usable = subset.filter(
        pl.col("value").is_not_null()
        & (pl.col("evidence_count") >= definition.minimum_evidence)
    )
    input_rows = subset.height
    usable_rows = usable.height
    evidence_count = int(usable.get_column("evidence_count").sum() or 0) if usable_rows else 0
    return MetricSnapshot(
        value=arithmetic_mean(usable.get_column("value").to_list()),
        input_rows=input_rows,
        usable_rows=usable_rows,
        excluded_rows=input_rows - usable_rows,
        evidence_count=evidence_count,
        coverage_percent=safe_percentage(usable_rows, input_rows),
    )


def _metric_analyses(request: AnalyzeRequest, frame: pl.DataFrame) -> list[MetricAnalysis]:
    analyses: list[MetricAnalysis] = []
    for definition in request.metrics:
        current = _snapshot(frame, definition, PeriodName.current)
        previous = _snapshot(frame, definition, PeriodName.previous) if request.previous_period else None
        raw_comparison = compare_values(
            current.value,
            previous.value if previous else None,
            higher_is_better=definition.higher_is_better,
        )
        analyses.append(
            MetricAnalysis(
                metric_key=definition.key,
                label=definition.label,
                source=definition.source,
                higher_is_better=definition.higher_is_better,
                current=current,
                previous=previous,
                comparison=PeriodComparison(
                    absolute_change=raw_comparison.absolute_change,
                    relative_change_percent=raw_comparison.relative_change_percent,
                    performance_change_points=raw_comparison.performance_change_points,
                    direction=ComparisonDirection(raw_comparison.direction),
                ),
                confidence=ConfidenceLevel(confidence_from_coverage(current.coverage_percent)),
            )
        )
    return analyses


def _risk_signals(request: AnalyzeRequest) -> tuple[list[RiskSignal], bool]:
    definitions = {definition.key: definition for definition in request.metrics}
    previous = {
        (row.entity_id, row.metric_key): row
        for row in request.rows
        if row.period == PeriodName.previous
    }
    signals: list[RiskSignal] = []
    for row in sorted(
        (item for item in request.rows if item.period == PeriodName.current),
        key=lambda item: (item.entity_id, item.metric_key),
    ):
        definition = definitions[row.metric_key]
        usable = row.value is not None and row.evidence_count >= definition.minimum_evidence
        if not usable:
            if request.risk_policy.include_missing_evidence:
                if row.value is None:
                    explanation = f"{definition.label} is unavailable because no normalized value was supplied."
                else:
                    explanation = (
                        f"{definition.label} is unavailable because {row.evidence_count} evidence rows "
                        f"are below the required {definition.minimum_evidence}."
                    )
                signals.append(
                    RiskSignal(
                        id=f"risk:missing:{row.entity_id}:{row.metric_key}",
                        kind=RiskKind.missing_evidence,
                        severity=RiskSeverity.info,
                        entity_id=row.entity_id,
                        entity_label=row.entity_label,
                        metric_key=row.metric_key,
                        observed_value=row.value,
                        threshold=float(definition.minimum_evidence),
                        evidence_count=row.evidence_count,
                        explanation=explanation,
                    )
                )
            continue
        severity = threshold_severity(
            row.value,
            higher_is_better=definition.higher_is_better,
            warning_threshold=definition.resolved_warning_threshold,
            critical_threshold=definition.resolved_critical_threshold,
        )
        if severity:
            threshold = (
                definition.resolved_critical_threshold
                if severity == "critical"
                else definition.resolved_warning_threshold
            )
            relation = "below" if definition.higher_is_better else "above"
            signals.append(
                RiskSignal(
                    id=f"risk:level:{row.entity_id}:{row.metric_key}",
                    kind=RiskKind.low_metric,
                    severity=RiskSeverity(severity),
                    entity_id=row.entity_id,
                    entity_label=row.entity_label,
                    metric_key=row.metric_key,
                    observed_value=row.value,
                    threshold=threshold,
                    evidence_count=row.evidence_count,
                    explanation=f"{definition.label} is {row.value:.2f}, {relation} the {severity} threshold of {threshold:.2f}.",
                )
            )
        prior = previous.get((row.entity_id, row.metric_key))
        prior_usable = prior and prior.value is not None and prior.evidence_count >= definition.minimum_evidence
        if prior_usable:
            comparison = compare_values(
                row.value,
                prior.value,
                higher_is_better=definition.higher_is_better,
            )
            decline = -(comparison.performance_change_points or 0)
            if decline >= request.risk_policy.decline_points:
                signals.append(
                    RiskSignal(
                        id=f"risk:decline:{row.entity_id}:{row.metric_key}",
                        kind=RiskKind.decline,
                        severity=RiskSeverity.critical if decline >= request.risk_policy.decline_points * 2 else RiskSeverity.watch,
                        entity_id=row.entity_id,
                        entity_label=row.entity_label,
                        metric_key=row.metric_key,
                        observed_value=row.value,
                        threshold=request.risk_policy.decline_points,
                        evidence_count=row.evidence_count,
                        explanation=f"{definition.label} declined by {decline:.2f} performance points from the previous period.",
                    )
                )
    signals.sort(key=lambda item: (SEVERITY_ORDER[item.severity], item.entity_id, item.metric_key, item.kind.value))
    truncated = len(signals) > request.risk_policy.max_signals
    return signals[: request.risk_policy.max_signals], truncated


def _insights(
    request: AnalyzeRequest,
    analyses: list[MetricAnalysis],
    risk_signals: list[RiskSignal],
) -> list[ExplainableInsight]:
    candidates: list[tuple[int, str, ExplainableInsight]] = []
    risky_entities: dict[str, set[str]] = defaultdict(set)
    for signal in risk_signals:
        if signal.kind != RiskKind.missing_evidence:
            risky_entities[signal.metric_key].add(signal.entity_id)
    for analysis in analyses:
        confidence = analysis.confidence
        risky = risky_entities.get(analysis.metric_key, set())
        if risky:
            candidates.append((
                0,
                analysis.metric_key,
                ExplainableInsight(
                    id=f"insight:risk:{analysis.metric_key}",
                    kind=InsightKind.risk_concentration,
                    title=f"{analysis.label} has students needing attention",
                    summary=f"{len(risky)} students triggered an evidence-backed level or decline signal for {analysis.label}.",
                    confidence=confidence,
                    metric_keys=[analysis.metric_key],
                    entity_ids=sorted(risky),
                    evidence={"at_risk_students": len(risky), "current_value": analysis.current.value, "coverage_percent": analysis.current.coverage_percent},
                ),
            ))
        if analysis.comparison.direction == ComparisonDirection.declined:
            candidates.append((
                1,
                analysis.metric_key,
                ExplainableInsight(
                    id=f"insight:decline:{analysis.metric_key}",
                    kind=InsightKind.decline,
                    title=f"{analysis.label} declined",
                    summary=f"Cohort {analysis.label} changed by {analysis.comparison.performance_change_points:.2f} performance points.",
                    confidence=confidence,
                    metric_keys=[analysis.metric_key],
                    entity_ids=[],
                    evidence={"current_value": analysis.current.value, "previous_value": analysis.previous.value if analysis.previous else None, "performance_change_points": analysis.comparison.performance_change_points},
                ),
            ))
        if analysis.current.value is not None:
            oriented_value = analysis.current.value if analysis.higher_is_better else 100 - analysis.current.value
            if oriented_value >= 80:
                candidates.append((
                    2,
                    analysis.metric_key,
                    ExplainableInsight(
                        id=f"insight:strength:{analysis.metric_key}",
                        kind=InsightKind.strength,
                        title=f"{analysis.label} is a current strength",
                        summary=f"The current cohort value is {analysis.current.value:.2f} with {analysis.current.coverage_percent or 0:.2f}% row coverage.",
                        confidence=confidence,
                        metric_keys=[analysis.metric_key],
                        entity_ids=[],
                        evidence={"current_value": analysis.current.value, "coverage_percent": analysis.current.coverage_percent, "usable_rows": analysis.current.usable_rows},
                    ),
                ))
        if analysis.current.coverage_percent is None or analysis.current.coverage_percent < 50:
            candidates.append((
                3,
                analysis.metric_key,
                ExplainableInsight(
                    id=f"insight:evidence:{analysis.metric_key}",
                    kind=InsightKind.evidence_gap,
                    title=f"{analysis.label} has limited evidence",
                    summary=f"Only {analysis.current.usable_rows} of {analysis.current.input_rows} current rows meet the evidence rule.",
                    confidence=ConfidenceLevel.low if analysis.current.input_rows else ConfidenceLevel.unavailable,
                    metric_keys=[analysis.metric_key],
                    entity_ids=[],
                    evidence={"usable_rows": analysis.current.usable_rows, "input_rows": analysis.current.input_rows, "coverage_percent": analysis.current.coverage_percent},
                ),
            ))
    candidates.sort(key=lambda item: (item[0], item[1]))
    return [item[2] for item in candidates[: request.max_insights]]


def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """Run deterministic analytics over a validated request."""

    frame = _frame(request)
    analyses = _metric_analyses(request, frame)
    risk_signals, risk_signals_truncated = _risk_signals(request)
    usable_rows = sum(analysis.current.usable_rows + (analysis.previous.usable_rows if analysis.previous else 0) for analysis in analyses)
    return AnalyzeResponse(
        analysis_id=request.analysis_id,
        generated_at=datetime.now(timezone.utc),
        formula=FormulaMetadata(
            version=FORMULA_VERSION,
            aggregation="equal_row_mean",
            missing_evidence="Rows with null values or evidence below the metric minimum are excluded, never converted to zero.",
            zero_semantics="A numeric zero is an observed value and remains in every formula.",
            comparison="Performance direction respects each metric's higher_is_better setting; relative change is unavailable from a zero baseline.",
        ),
        current_period=request.current_period,
        previous_period=request.previous_period,
        metrics=analyses,
        risk_signals=risk_signals,
        insights=_insights(request, analyses, risk_signals),
        meta=AnalysisMeta(
            input_rows=len(request.rows),
            usable_rows=usable_rows,
            excluded_rows=len(request.rows) - usable_rows,
            entity_count=len({row.entity_id for row in request.rows}),
            metric_count=len(request.metrics),
            risk_signals_truncated=risk_signals_truncated,
        ),
    )
