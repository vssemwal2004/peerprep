const METRICS = Object.freeze({
  coding_mastery: { key: 'coding_mastery', label: 'Coding mastery', source: 'coding', minimum_evidence: 2, weight: 1, warning_threshold: 60, critical_threshold: 40 },
  coding_acceptance: { key: 'coding_acceptance', label: 'Coding acceptance', source: 'coding', minimum_evidence: 4, weight: 1, warning_threshold: 60, critical_threshold: 40 },
  assessment_score: { key: 'assessment_score', label: 'Assessment score', source: 'assessment', minimum_evidence: 1, weight: 1, warning_threshold: 60, critical_threshold: 40 },
  learning_completion: { key: 'learning_completion', label: 'Learning completion', source: 'learning', minimum_evidence: 3, weight: 1, warning_threshold: 60, critical_threshold: 40 },
  consistency: { key: 'consistency', label: 'Activity consistency', source: 'consistency', minimum_evidence: 1, weight: 1, warning_threshold: 50, critical_threshold: 25 },
  overall: { key: 'overall', label: 'Overall performance', source: 'overall', minimum_evidence: 2, weight: 1, warning_threshold: 60, critical_threshold: 40 },
});

function normalized(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Math.min(Math.max(Number(value), 0), 100);
}

function dateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function studentLabel(student) {
  const value = String(student?.name || '').trim();
  return value ? value.slice(0, 160) : undefined;
}

export function mapAnalyticsContextToPython({ students, studentMetrics, query, analysisId }) {
  if (!students?.length) return null;
  const metricKeys = [];
  if (query.sources.includes('coding')) metricKeys.push('coding_mastery', 'coding_acceptance');
  if (query.sources.includes('assessment')) metricKeys.push('assessment_score');
  if (query.sources.includes('learning')) metricKeys.push('learning_completion');
  metricKeys.push('consistency', 'overall');
  const rows = [];
  for (const student of students) {
    const entityId = String(student._id || student.id || '').slice(0, 128);
    if (!entityId) continue;
    const metric = studentMetrics.get(String(student._id || student.id));
    const label = studentLabel(student);
    const values = {
      coding_mastery: [metric?.coding?.mastery, metric?.coding?.distinctProblems || 0],
      coding_acceptance: [metric?.coding?.acceptanceRate, metric?.coding?.attempts || 0],
      assessment_score: [metric?.assessment?.normalizedScore, metric?.assessment?.completedAttempts || 0],
      learning_completion: [metric?.learning?.completionRate, metric?.learning?.eligibleTopics || 0],
      consistency: [metric?.consistency, metric?.activeDays || 0],
      overall: [metric?.overall?.isOverall ? metric.overall.value : null, metric?.overall?.sourceFamilies || 0],
    };
    for (const key of metricKeys) {
      const [value, evidence] = values[key];
      rows.push({
        entity_id: entityId, ...(label ? { entity_label: label } : {}), metric_key: key,
        period: 'current', value: normalized(value), evidence_count: Math.max(0, Math.floor(Number(evidence) || 0)),
      });
    }
  }
  if (!rows.length) return null;
  return {
    analysis_id: String(analysisId || 'admin-analytics').slice(0, 128),
    current_period: {
      label: 'Selected period', start_date: dateOnly(query.date.from), end_date: dateOnly(query.date.to),
    },
    metrics: metricKeys.map((key) => ({ ...METRICS[key], higher_is_better: true })),
    rows,
    risk_policy: { decline_points: 10, include_missing_evidence: false, max_signals: 500 },
    max_insights: 6,
  };
}

function snapshot(value) {
  if (!value) return null;
  return {
    value: value.value, inputRows: value.input_rows, usableRows: value.usable_rows,
    excludedRows: value.excluded_rows, evidenceCount: value.evidence_count, coveragePercent: value.coverage_percent,
  };
}

function mapReadyResponse(response) {
  return {
    status: 'ready', formulaVersion: response.formula.version,
    metrics: response.metrics.map((metric) => ({
      metricKey: metric.metric_key, label: metric.label, source: metric.source,
      higherIsBetter: metric.higher_is_better, current: snapshot(metric.current), previous: snapshot(metric.previous),
      comparison: {
        absoluteChange: metric.comparison?.absolute_change ?? null,
        relativeChangePercent: metric.comparison?.relative_change_percent ?? null,
        performanceChangePoints: metric.comparison?.performance_change_points ?? null,
        direction: metric.comparison?.direction || 'unavailable',
      },
      confidence: metric.confidence,
    })),
    insights: response.insights.map((insight) => ({
      id: insight.id, kind: insight.kind, title: insight.title, summary: insight.summary,
      confidence: insight.confidence, metricKeys: insight.metric_keys || [], studentIds: insight.entity_ids || [],
      evidence: insight.evidence || {},
    })),
    riskSignals: response.risk_signals.map((signal) => ({
      id: signal.id, kind: signal.kind, severity: signal.severity, studentId: signal.entity_id,
      studentName: signal.entity_label ?? null, metricKey: signal.metric_key,
      observedValue: signal.observed_value ?? null, threshold: signal.threshold ?? null,
      evidenceCount: signal.evidence_count, explanation: signal.explanation,
    })),
  };
}

export async function buildAnalyticsIntelligence({ students, studentMetrics, query, analysisId, client }) {
  try {
    const payload = mapAnalyticsContextToPython({ students, studentMetrics, query, analysisId });
    if (!payload) return { status: 'fallback', formulaVersion: null, metrics: [], insights: [], riskSignals: [], reason: 'no_eligible_rows' };
    const result = await client(payload);
    if (result.status === 'ready') return mapReadyResponse(result.response);
    return { status: result.status, formulaVersion: null, metrics: [], insights: [], riskSignals: [], reason: result.reason };
  } catch {
    return { status: 'fallback', formulaVersion: null, metrics: [], insights: [], riskSignals: [], reason: 'request_failed' };
  }
}
