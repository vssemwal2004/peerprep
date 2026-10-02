import { buildFormulaMetadata, FORMULA_VERSION, percentage } from '../analyticsFormulas.js';
import { buildAnalyticsGraphs } from '../analyticsRegistry.js';
import {
  buildAnalyticsSummary, collectAnalyticsContext, fingerprintQuery,
} from '../adminAnalytics.service.js';
import { renderAnalyticsXlsx } from './excel.renderer.js';
import { renderAnalyticsPdf } from './pdf.renderer.js';

const COLUMN_DEFINITIONS = Object.freeze({
  studentName: { label: 'Student name', width: 24 }, studentId: { label: 'Student ID', width: 16 }, email: { label: 'Email', width: 30 },
  semester: { label: 'Semester', width: 11 }, group: { label: 'Group', width: 12 }, branch: { label: 'Branch', width: 16 }, course: { label: 'Course', width: 16 }, college: { label: 'Campus', width: 20 },
  codingScore: { label: 'Coding score (%)', width: 17 }, attempts: { label: 'Coding attempts', width: 16 }, solved: { label: 'Problems solved', width: 16 }, acceptance: { label: 'Acceptance (%)', width: 16 },
  assessmentScore: { label: 'Assessment score (%)', width: 20 }, assessmentParticipation: { label: 'Assessment participation (%)', width: 24 },
  learningCompletion: { label: 'Learning completion (%)', width: 21 }, learningEngagement: { label: 'Learning engagement (%)', width: 22 },
  overallScore: { label: 'Overall score (%)', width: 18 }, consistency: { label: 'Consistency (%)', width: 16 }, rank: { label: 'Rank', width: 10 },
  evidenceCoverage: { label: 'Evidence coverage (%)', width: 20 }, eligibility: { label: 'Evidence eligibility', width: 30 }, warnings: { label: 'Evidence warnings', width: 42 },
});

const REPORT_TITLES = Object.freeze({
  executive: 'Executive Analytics Summary', students: 'Student Performance Report', topics: 'Topic Performance Report',
  assessments: 'Assessment Analysis Report', learning: 'Learning Progress Report', coding: 'Coding Performance Report', full: 'Full Analytics Report',
});

const REPORT_GRAPHS = Object.freeze({
  executive: ['activity-trend', 'student-ranking', 'performance-distribution', 'cohort-comparison', 'source-mix'],
  students: ['student-ranking', 'performance-distribution', 'engagement-calendar', 'score-effort-scatter', 'topic-student-heatmap'],
  topics: ['topic-performance', 'difficulty-analysis', 'topic-student-heatmap', 'assessment-topic-analysis', 'skill-radar', 'mastery-funnel'],
  assessments: ['assessment-score-trend', 'assessment-topic-analysis', 'performance-distribution', 'student-ranking'],
  learning: ['learning-hierarchy', 'activity-trend', 'topic-performance', 'topic-student-heatmap'],
  coding: ['question-conversion', 'difficulty-analysis', 'topic-performance', 'activity-trend', 'student-ranking'],
  full: null,
});

function assessmentParticipation(studentId, assessment, studentsCount) {
  if (!assessment) return null;
  const eligible = assessment.definitions.filter((definition) => definition.targetType !== 'selected' || (definition.assignedStudents || []).map(String).includes(studentId)).length;
  const attempted = new Set((assessment.perStudent.get(studentId)?.attempts || []).map((row) => row.assessmentId)).size;
  void studentsCount;
  return percentage(attempted, eligible);
}

function buildRows(context, query) {
  const { students, studentMetrics, assessment } = context;
  const rows = students.map((student) => {
    const id = String(student._id);
    const metrics = studentMetrics.get(id);
    const selectedSources = query.sources;
    const eligibleCount = selectedSources.filter((source) => metrics.evidence[source] === true).length;
    const coverage = percentage(eligibleCount, selectedSources.length);
    const evidenceWarnings = selectedSources.filter((source) => metrics.evidence[source] !== true).map((source) => `Insufficient ${source} evidence`);
    return {
      studentName: student.name || 'Student', studentId: student.studentId || '', email: student.email || '',
      semester: student.semester ?? '', group: student.group || '', branch: student.branch || '', course: student.course || '', college: student.college || '',
      codingScore: metrics.coding.mastery ?? metrics.coding.acceptanceRate, attempts: metrics.coding.attempts, solved: metrics.coding.solvedProblems, acceptance: metrics.coding.acceptanceRate,
      assessmentScore: metrics.assessment.normalizedScore, assessmentParticipation: assessmentParticipation(id, assessment, students.length),
      learningCompletion: metrics.learning.completionRate, learningEngagement: percentage(metrics.learning.engagedTopics, metrics.learning.eligibleTopics),
      overallScore: metrics.overall.value, consistency: metrics.consistency, rank: null,
      evidenceCoverage: coverage, eligibility: selectedSources.map((source) => `${source}: ${metrics.evidence[source] === true ? 'eligible' : 'insufficient'}`).join(' | '),
      warnings: evidenceWarnings.join(' | '), _id: id,
    };
  });
  [...rows].sort((left, right) => (right.overallScore ?? -Infinity) - (left.overallScore ?? -Infinity) || left.studentName.localeCompare(right.studentName) || left._id.localeCompare(right._id)).forEach((row, index) => { row.rank = index + 1; });
  return rows;
}

function sortRows(rows, sort) {
  const multiplier = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = left[sort.by]; const b = right[sort.by];
    if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '' ? left._id.localeCompare(right._id) : 1;
    if (b === null || b === undefined || b === '') return -1;
    const compared = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    return compared * multiplier || left.studentName.localeCompare(right.studentName) || left._id.localeCompare(right._id);
  });
}

function evidenceCount(data) {
  if (Array.isArray(data)) return data.length;
  if (Array.isArray(data?.rows)) return data.rows.length;
  if (Array.isArray(data?.items)) return data.items.length;
  if (Array.isArray(data?.points)) return data.points.length;
  return data && typeof data === 'object' ? Object.keys(data).length : 0;
}

function summarizeChart(graph) {
  const data = Array.isArray(graph.data) ? graph.data.slice(0, 5) : graph.data?.rows ? { ...graph.data, rows: graph.data.rows.slice(0, 3) } : graph.data;
  return {
    id: graph.id, title: graph.title, status: graph.status, count: evidenceCount(graph.data),
    summary: JSON.stringify(data ?? []).slice(0, 3500),
  };
}

function exportWarnings(context, query) {
  const warnings = [];
  if (context.cohort.truncated) warnings.push('Student rows were capped at 5,000.');
  const truncated = [context.coding, context.assessment, context.learning].filter((source) => source?.truncated).map((source) => source.source);
  if (truncated.length) warnings.push(`${truncated.join(', ')} evidence reached the 100,000-row processing cap; results use the most recent bounded evidence.`);
  if (query.sources.length > 1) warnings.push('Cross-source charts without a canonical topic mapping were not included.');
  return warnings;
}

export async function createAnalyticsExport({ user, query, exportOptions }) {
  const context = await collectAnalyticsContext({ user, query });
  const rows = sortRows(buildRows(context, query), exportOptions.sort).slice(0, 5000);
  const allGraphs = buildAnalyticsGraphs({ ...context, query }, exportOptions.graphIds);
  const reportAllowList = REPORT_GRAPHS[exportOptions.reportType];
  const requested = new Set(exportOptions.graphIds);
  const charts = exportOptions.includeCharts
    ? allGraphs.filter((graph) => requested.has(graph.id) && (!reportAllowList || reportAllowList.includes(graph.id)) && ['ready', 'partial'].includes(graph.status)).map(summarizeChart)
    : [];
  const generatedAt = new Date().toISOString();
  const report = {
    reportTitle: REPORT_TITLES[exportOptions.reportType], reportType: exportOptions.reportType,
    generatedAt, timezone: 'UTC', formulaVersion: FORMULA_VERSION, formula: buildFormulaMetadata(),
    queryFingerprint: fingerprintQuery(query, user), filters: query, warnings: exportWarnings(context, query),
    includeSummary: exportOptions.includeSummary, includeCharts: exportOptions.includeCharts,
    summary: buildAnalyticsSummary(context.students, context.studentMetrics, context.coding, context.assessment, context.learning),
    columns: exportOptions.columns.map((key) => ({ key, ...COLUMN_DEFINITIONS[key] })), rows, charts,
  };
  const buffer = exportOptions.format === 'xlsx' ? await renderAnalyticsXlsx(report) : await renderAnalyticsPdf(report);
  const stamp = generatedAt.slice(0, 10);
  return {
    buffer,
    mimeType: exportOptions.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
    filename: `peerprep-${exportOptions.reportType}-analytics-${stamp}.${exportOptions.format}`,
    rowCount: rows.length,
  };
}

export { COLUMN_DEFINITIONS };
