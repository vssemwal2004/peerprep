import { CHARTS, DEFAULT_LAYOUT, DEFAULT_LAYOUT_VERSION, DEFAULT_SIZES, GROUP_BY, SECTIONS } from './charts.js';
import { drillFor } from './drill.js';
import { publicFieldCatalog } from './fields.js';
import { COMPARE_DIMENSIONS, COMPARE_LIMITS, validateCompareBy, validateCompareValue } from './compare.js';
import {
  comparePrepAnalysis, comparePrepAnalysisStudents, exportPrepAnalysisComparison, validateComparisonExport,
  countPrepAnalysis, drillPrepAnalysis, exportPrepAnalysis, exportPrepAnalysisChart, exportStudentReport, getStudentProfile, listFieldOptions, matchingStudentIds, runPrepAnalysis,
  scopeFromQueryString, validateDrill, validatePrepAnalysisQuery,
} from './prepAnalysis.service.js';
import { STUDENT_MAIL_LIMITS, listStudentMailTemplates, previewStudentMail, sendStudentMail, sendStudentTestMail } from './prepAnalysis.email.js';
import {
  DEFAULT_EXPORT_COLUMNS, EXPORT_LIMITS, publicExportColumns, validateChartExportOptions, validateExportOptions,
} from './prepAnalysis.export.js';
import { FILTER_LIMITS } from './filterEngine.js';
import { createView, deleteView, listViews, updateView } from './prepAnalysis.views.js';

// req.platformPermissions is set by platform/enforcePolicy.js on university
// deployments; it is undefined on the central/standalone platform (all modules).

export async function getPrepAnalysisCatalog(req, res) {
  const catalog = publicFieldCatalog(req.platformPermissions);
  const modules = new Set(catalog.modules.map((module) => module.key));
  const licensedChart = (id) => modules.has(CHARTS.find((chart) => chart.id === id)?.module);
  // Always fresh: the feature list changes with licences and deployments.
  res.set('Cache-Control', 'private, no-cache');
  res.json({
    ...catalog,
    limits: FILTER_LIMITS,
    groupBy: Object.entries(GROUP_BY).map(([key, value]) => ({ key, label: value.label })),
    compareDimensions: Object.entries(COMPARE_DIMENSIONS).map(([key, value]) => ({ key, label: value.label, options: value.options, field: value.field })),
    compareLimits: { minValues: COMPARE_LIMITS.minValues, maxValues: COMPARE_LIMITS.maxValues },
    charts: CHARTS.filter((chart) => modules.has(chart.module) && !chart.retiredBy).map(({ build, ...chart }) => ({ ...chart, drillable: Boolean(drillFor(chart.id)) })),
    // Old chart id → the chart that replaced it: every saved layout and view shows the new one.
    replacedCharts: Object.fromEntries(CHARTS.filter((chart) => chart.retiredBy).map((chart) => [chart.id, chart.retiredBy])),
    sections: Object.entries(SECTIONS).filter(([, section]) => modules.has(section.module)).map(([key, section]) => ({ key, ...section })),
    defaultLayout: Object.fromEntries(catalog.areas.map((area) => [area.key, (DEFAULT_LAYOUT[area.key] || []).filter(licensedChart)])),
    // A layout saved under an older version of an area's default is replaced by the new default once.
    defaultLayoutVersion: DEFAULT_LAYOUT_VERSION,
    // Card widths the default layouts set where they differ from a chart's own size.
    defaultSizes: DEFAULT_SIZES,
    exportColumns: publicExportColumns(req.platformPermissions),
    exportDefaults: DEFAULT_EXPORT_COLUMNS,
    exportLimits: EXPORT_LIMITS,
  });
}

export async function queryPrepAnalysis(req, res) {
  const query = validatePrepAnalysisQuery(req.body, req.platformPermissions);
  if (String(req.headers['cache-control'] || '').toLowerCase().includes('no-cache')) query.refresh = true;
  res.set('Cache-Control', 'private, no-store');
  res.json(await runPrepAnalysis({ user: req.user, query }));
}

export async function exportPrepAnalysisFile(req, res) {
  let file;
  // `scope: 'chart'` picks a one-chart download; the assessments for that request go in `assessmentScope`.
  if (req.body?.scope === 'chart') {
    // One chart (or one part of it): its own filter and options come with it in `charts`.
    const query = validatePrepAnalysisQuery({ ...req.body, table: undefined }, req.platformPermissions);
    file = await exportPrepAnalysisChart({ user: req.user, query, drill: validateDrill(req.body), options: validateChartExportOptions(req.body) });
  } else {
    const query = validatePrepAnalysisQuery({ ...req.body, charts: [] }, req.platformPermissions);
    const options = validateExportOptions(req.body, req.platformPermissions, query.module);
    file = await exportPrepAnalysis({ user: req.user, query, options });
  }
  res.set({
    'Content-Type': file.contentType,
    'Content-Disposition': `attachment; filename="${file.filename}"`,
    'Cache-Control': 'private, no-store',
    'X-Row-Count': String(file.rowCount),
    'Access-Control-Expose-Headers': 'Content-Disposition, X-Row-Count',
  });
  res.send(file.buffer);
}

// ---------------------------------------------------------------- select students, send email

/** "Select all N matching": the ids behind the student table (body.table.search) or a chart part (body.drill). */
export async function listMatchingStudentIds(req, res) {
  const drill = req.body?.drill ? validateDrill(req.body) : null;
  // A chart part needs that chart's own filter and options (in `charts`), as /drill does.
  const query = validatePrepAnalysisQuery({ ...req.body, ...(drill ? { table: undefined } : { charts: [] }) }, req.platformPermissions);
  const ids = await matchingStudentIds({ user: req.user, query, drill });
  res.set('Cache-Control', 'private, no-store');
  res.json({ ids: ids.slice(0, STUDENT_MAIL_LIMITS.maxRecipients), total: ids.length, limit: STUDENT_MAIL_LIMITS.maxRecipients });
}

export async function listEmailTemplatesForStudents(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json(await listStudentMailTemplates({ stage: String(req.query.stage || '').slice(0, 20) }));
}

// `draft` ({ subject, html }): the template as edited in the dialog, for this send only.
export async function previewEmailToStudent(req, res) {
  const query = validatePrepAnalysisQuery({ ...req.body, charts: [], table: undefined }, req.platformPermissions);
  res.set('Cache-Control', 'private, no-store');
  res.json(await previewStudentMail({ user: req.user, query, templateId: req.body?.templateId, studentId: req.body?.studentId, draft: req.body?.draft }));
}

export async function sendTestEmailToMe(req, res) {
  const query = validatePrepAnalysisQuery({ ...req.body, charts: [], table: undefined }, req.platformPermissions);
  res.status(202).json(await sendStudentTestMail({ user: req.user, query, templateId: req.body?.templateId, studentId: req.body?.studentId, draft: req.body?.draft }));
}

export async function sendEmailToStudents(req, res) {
  const query = validatePrepAnalysisQuery({ ...req.body, charts: [], table: undefined }, req.platformPermissions);
  res.status(202).json(await sendStudentMail({ user: req.user, query, templateId: req.body?.templateId, studentIds: req.body?.studentIds, draft: req.body?.draft }));
}

export async function drillPrepAnalysisChart(req, res) {
  const query = validatePrepAnalysisQuery({ ...req.body, table: undefined }, req.platformPermissions);
  res.set('Cache-Control', 'private, no-store');
  res.json(await drillPrepAnalysis({ user: req.user, query, drill: validateDrill(req.body) }));
}

// Compare classes: the /query body (area, period, filters) plus `compareBy`. Same access rules
// as /query: the coordinator's own students and the university's licensed features only.
export async function comparePrepAnalysisClasses(req, res) {
  const query = validatePrepAnalysisQuery({ ...req.body, charts: [], compare: undefined }, req.platformPermissions);
  if (String(req.headers['cache-control'] || '').toLowerCase().includes('no-cache')) query.refresh = true;
  const compareBy = validateCompareBy(req.body?.compareBy);
  res.set('Cache-Control', 'private, no-store');
  res.json(await comparePrepAnalysis({ user: req.user, query, compareBy }));
}

export async function comparePrepAnalysisClassStudents(req, res) {
  const query = validatePrepAnalysisQuery({ ...req.body, charts: [], compare: undefined }, req.platformPermissions);
  const { dimension, value } = validateCompareValue(req.body?.compareBy);
  res.set('Cache-Control', 'private, no-store');
  res.json(await comparePrepAnalysisStudents({ user: req.user, query, compareBy: { dimension }, value }));
}

export async function exportPrepAnalysisClassComparison(req, res) {
  const query = validatePrepAnalysisQuery({ ...req.body, charts: [], compare: undefined }, req.platformPermissions);
  const compareBy = validateCompareBy(req.body?.compareBy);
  const file = await exportPrepAnalysisComparison({ user: req.user, query, compareBy, options: validateComparisonExport(req.body) });
  res.set({
    'Content-Type': file.contentType,
    'Content-Disposition': `attachment; filename="${file.filename}"`,
    'Cache-Control': 'private, no-store',
    'X-Row-Count': String(file.rowCount),
    'Access-Control-Expose-Headers': 'Content-Disposition, X-Row-Count',
  });
  res.send(file.buffer);
}

export async function countPrepAnalysisMatches(req, res) {
  const query = validatePrepAnalysisQuery({ ...req.body, charts: [] }, req.platformPermissions);
  res.set('Cache-Control', 'private, no-store');
  res.json(await countPrepAnalysis({ user: req.user, query }));
}

// ?range=<preset>, or ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD.
const studentRange = (query) => (query.range === 'custom'
  ? { preset: 'custom', from: query.from ? String(query.from) : undefined, to: query.to ? String(query.to) : undefined }
  : { preset: String(query.range || 'all') });

export async function getPrepAnalysisStudent(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json(await getStudentProfile({
    user: req.user,
    permissions: req.platformPermissions,
    studentId: req.params.studentId,
    range: studentRange(req.query),
    scope: scopeFromQueryString(req.query.assessmentIds, req.query.kind),
  }));
}

export async function exportPrepAnalysisStudent(req, res) {
  const file = await exportStudentReport({
    user: req.user,
    permissions: req.platformPermissions,
    studentId: req.params.studentId,
    range: studentRange(req.query),
    scope: scopeFromQueryString(req.query.assessmentIds, req.query.kind),
    format: String(req.query.format || ''),
  });
  res.set({
    'Content-Type': file.contentType,
    'Content-Disposition': `attachment; filename="${file.filename}"`,
    'Cache-Control': 'private, no-store',
    'Access-Control-Expose-Headers': 'Content-Disposition',
  });
  res.send(file.buffer);
}

export async function listPrepAnalysisViews(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json(await listViews({ user: req.user }));
}

export async function createPrepAnalysisView(req, res) {
  res.status(201).json(await createView({ user: req.user, permissions: req.platformPermissions, body: req.body }));
}

export async function updatePrepAnalysisView(req, res) {
  res.json(await updateView({ user: req.user, permissions: req.platformPermissions, id: req.params.viewId, body: req.body }));
}

export async function deletePrepAnalysisView(req, res) {
  res.json(await deleteView({ user: req.user, id: req.params.viewId }));
}

export async function listPrepAnalysisOptions(req, res) {
  res.set('Cache-Control', 'private, max-age=30');
  res.json(await listFieldOptions({
    user: req.user,
    permissions: req.platformPermissions,
    optionsKey: String(req.query.list || ''),
    q: req.query.q,
    scope: scopeFromQueryString(req.query.assessmentIds, req.query.kind),
  }));
}
