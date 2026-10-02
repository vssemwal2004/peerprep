import { HttpError } from '../../../utils/errors.js';
import { GRAPH_IDS } from '../adminAnalytics.validation.js';

export const EXPORT_FORMATS = Object.freeze(['xlsx', 'pdf']);
export const EXPORT_REPORT_TYPES = Object.freeze(['executive', 'students', 'topics', 'assessments', 'learning', 'coding', 'full']);
export const EXPORT_COLUMNS = Object.freeze([
  'studentName', 'studentId', 'email', 'semester', 'group', 'branch', 'course', 'college',
  'codingScore', 'attempts', 'solved', 'acceptance', 'assessmentScore', 'assessmentParticipation',
  'learningCompletion', 'learningEngagement', 'overallScore', 'consistency', 'rank',
  'evidenceCoverage', 'eligibility', 'warnings',
]);

export function validateExportRequest(input = {}) {
  const format = String(input.format || '').toLowerCase();
  if (!EXPORT_FORMATS.includes(format)) throw new HttpError(400, 'Export format must be xlsx or pdf.');
  const reportType = String(input.reportType || 'executive');
  if (!EXPORT_REPORT_TYPES.includes(reportType)) throw new HttpError(400, 'Unsupported analytics report type.');
  const columns = [...new Set((Array.isArray(input.columns) ? input.columns : []).map(String))];
  if (!columns.length) throw new HttpError(400, 'Select at least one export column.');
  if (columns.length > EXPORT_COLUMNS.length || columns.some((column) => !EXPORT_COLUMNS.includes(column))) {
    throw new HttpError(400, 'Unsupported analytics export column.');
  }
  const sortBy = String(input.sort?.by || 'overallScore');
  if (!EXPORT_COLUMNS.includes(sortBy)) throw new HttpError(400, 'Unsupported export sort column.');
  const sortDirection = String(input.sort?.direction || 'desc');
  if (!['asc', 'desc'].includes(sortDirection)) throw new HttpError(400, 'Export sort direction must be asc or desc.');
  const graphIds = [...new Set((Array.isArray(input.graphIds) ? input.graphIds : []).map(String))];
  if (graphIds.some((id) => !GRAPH_IDS.includes(id))) throw new HttpError(400, 'Unknown export graph selection.');
  return {
    format,
    reportType,
    columns,
    sort: { by: sortBy, direction: sortDirection },
    includeSummary: input.includeSummary !== false,
    includeCharts: input.includeCharts !== false,
    graphIds,
  };
}
