import { CHARTS, DEFAULT_LAYOUT, GROUP_BY, SECTIONS } from './charts.js';
import { drillFor } from './drill.js';
import { publicFieldCatalog } from './fields.js';
import {
  countPrepAnalysis, drillPrepAnalysis, exportPrepAnalysis, exportPrepAnalysisChart, exportStudentReport, getStudentProfile, listFieldOptions, runPrepAnalysis,
  validateDrill, validatePrepAnalysisQuery,
} from './prepAnalysis.service.js';
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
    charts: CHARTS.filter((chart) => modules.has(chart.module)).map(({ build, ...chart }) => ({ ...chart, drillable: Boolean(drillFor(chart.id)) })),
    sections: Object.entries(SECTIONS).filter(([, section]) => modules.has(section.module)).map(([key, section]) => ({ key, ...section })),
    defaultLayout: Object.fromEntries(catalog.areas.map((area) => [area.key, (DEFAULT_LAYOUT[area.key] || []).filter(licensedChart)])),
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

export async function drillPrepAnalysisChart(req, res) {
  const query = validatePrepAnalysisQuery({ ...req.body, table: undefined }, req.platformPermissions);
  res.set('Cache-Control', 'private, no-store');
  res.json(await drillPrepAnalysis({ user: req.user, query, drill: validateDrill(req.body) }));
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
  }));
}

export async function exportPrepAnalysisStudent(req, res) {
  const file = await exportStudentReport({
    user: req.user,
    permissions: req.platformPermissions,
    studentId: req.params.studentId,
    range: studentRange(req.query),
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
  }));
}
