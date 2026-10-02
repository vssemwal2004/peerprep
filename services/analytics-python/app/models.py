"""Pydantic request and response contracts for the internal analytics API."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

MetricKey = Annotated[str, StringConstraints(pattern=r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$")]
Identifier = Annotated[str, StringConstraints(min_length=1, max_length=128)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MetricSource(str, Enum):
    coding = "coding"
    assessment = "assessment"
    learning = "learning"
    consistency = "consistency"
    overall = "overall"
    custom = "custom"


class PeriodName(str, Enum):
    current = "current"
    previous = "previous"


class ComparisonDirection(str, Enum):
    improved = "improved"
    declined = "declined"
    stable = "stable"
    unavailable = "unavailable"


class RiskSeverity(str, Enum):
    critical = "critical"
    watch = "watch"
    info = "info"


class RiskKind(str, Enum):
    low_metric = "low_metric"
    decline = "decline"
    missing_evidence = "missing_evidence"


class InsightKind(str, Enum):
    risk_concentration = "risk_concentration"
    decline = "decline"
    strength = "strength"
    evidence_gap = "evidence_gap"


class ConfidenceLevel(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"
    unavailable = "unavailable"


class PeriodWindow(StrictModel):
    label: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_window(self) -> "PeriodWindow":
        if self.start_date > self.end_date:
            raise ValueError("start_date must be on or before end_date")
        return self


class MetricDefinition(StrictModel):
    key: MetricKey
    label: Annotated[str, StringConstraints(min_length=1, max_length=120)]
    source: MetricSource
    higher_is_better: bool = True
    minimum_evidence: int = Field(default=1, ge=1, le=1_000_000_000)
    weight: float = Field(default=1.0, gt=0, le=1000)
    warning_threshold: float | None = Field(default=None, ge=0, le=100)
    critical_threshold: float | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def validate_threshold_order(self) -> "MetricDefinition":
        warning = self.resolved_warning_threshold
        critical = self.resolved_critical_threshold
        if self.higher_is_better and critical > warning:
            raise ValueError("critical_threshold must be <= warning_threshold when higher is better")
        if not self.higher_is_better and critical < warning:
            raise ValueError("critical_threshold must be >= warning_threshold when lower is better")
        return self

    @property
    def resolved_warning_threshold(self) -> float:
        if self.warning_threshold is not None:
            return self.warning_threshold
        return 60.0 if self.higher_is_better else 40.0

    @property
    def resolved_critical_threshold(self) -> float:
        if self.critical_threshold is not None:
            return self.critical_threshold
        return 40.0 if self.higher_is_better else 60.0


class NormalizedMetricRow(StrictModel):
    entity_id: Identifier
    entity_label: Annotated[str, StringConstraints(min_length=1, max_length=160)] | None = None
    metric_key: MetricKey
    period: PeriodName
    value: float | None = Field(default=None, ge=0, le=100)
    evidence_count: int = Field(default=0, ge=0, le=1_000_000_000)


class RiskPolicy(StrictModel):
    decline_points: float = Field(default=10.0, gt=0, le=100)
    include_missing_evidence: bool = True
    max_signals: int = Field(default=500, ge=1, le=5000)


class AnalyzeRequest(StrictModel):
    analysis_id: Identifier | None = None
    current_period: PeriodWindow
    previous_period: PeriodWindow | None = None
    metrics: list[MetricDefinition] = Field(min_length=1, max_length=100)
    rows: list[NormalizedMetricRow] = Field(min_length=1, max_length=50_000)
    risk_policy: RiskPolicy = Field(default_factory=RiskPolicy)
    max_insights: int = Field(default=6, ge=1, le=20)

    @model_validator(mode="after")
    def validate_contract(self) -> "AnalyzeRequest":
        definitions = [metric.key for metric in self.metrics]
        if len(definitions) != len(set(definitions)):
            raise ValueError("metric definition keys must be unique")
        known = set(definitions)
        unknown = sorted({row.metric_key for row in self.rows if row.metric_key not in known})
        if unknown:
            raise ValueError(f"rows reference unknown metric keys: {', '.join(unknown)}")
        if self.previous_period is None and any(row.period == PeriodName.previous for row in self.rows):
            raise ValueError("previous rows require previous_period")
        row_keys = [(row.entity_id, row.metric_key, row.period.value) for row in self.rows]
        if len(row_keys) != len(set(row_keys)):
            raise ValueError("entity_id, metric_key, and period must uniquely identify each row")
        return self


class MetricSnapshot(StrictModel):
    value: float | None
    input_rows: int
    usable_rows: int
    excluded_rows: int
    evidence_count: int
    coverage_percent: float | None


class PeriodComparison(StrictModel):
    absolute_change: float | None
    relative_change_percent: float | None
    performance_change_points: float | None
    direction: ComparisonDirection


class MetricAnalysis(StrictModel):
    metric_key: MetricKey
    label: str
    source: MetricSource
    higher_is_better: bool
    current: MetricSnapshot
    previous: MetricSnapshot | None
    comparison: PeriodComparison
    confidence: ConfidenceLevel


class RiskSignal(StrictModel):
    id: str
    kind: RiskKind
    severity: RiskSeverity
    entity_id: Identifier
    entity_label: str | None
    metric_key: MetricKey
    observed_value: float | None
    threshold: float | None
    evidence_count: int
    explanation: str


JsonScalar = str | int | float | bool | None


class ExplainableInsight(StrictModel):
    id: str
    kind: InsightKind
    title: str
    summary: str
    confidence: ConfidenceLevel
    metric_keys: list[MetricKey]
    entity_ids: list[Identifier]
    evidence: dict[str, JsonScalar]


class FormulaMetadata(StrictModel):
    version: str
    aggregation: Literal["equal_row_mean"]
    missing_evidence: str
    zero_semantics: str
    comparison: str


class AnalysisMeta(StrictModel):
    input_rows: int
    usable_rows: int
    excluded_rows: int
    entity_count: int
    metric_count: int
    risk_signals_truncated: bool


class AnalyzeResponse(StrictModel):
    api_version: Literal["v1"] = "v1"
    analysis_id: Identifier | None
    generated_at: datetime
    formula: FormulaMetadata
    current_period: PeriodWindow
    previous_period: PeriodWindow | None
    metrics: list[MetricAnalysis]
    risk_signals: list[RiskSignal]
    insights: list[ExplainableInsight]
    meta: AnalysisMeta


class HealthResponse(StrictModel):
    status: Literal["ok"] = "ok"
    service: Literal["peerprep-analytics-python"] = "peerprep-analytics-python"
    api_version: Literal["v1"] = "v1"
    formula_version: str
    readiness: Literal["ready", "not_ready"]
    auth_mode: Literal["jwt", "development_bypass", "unconfigured"]
    max_request_bytes: int


class ReadyResponse(StrictModel):
    status: Literal["ready", "not_ready"]
    service: Literal["peerprep-analytics-python"] = "peerprep-analytics-python"
    checks: dict[str, bool]
