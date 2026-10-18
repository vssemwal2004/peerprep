import { CHARTS, DEFAULT_LAYOUT, GROUP_BY, SECTIONS } from './charts.js';
import { publicFieldCatalog } from './fields.js';
import {
  countPrepAnalysis, exportPrepAnalysis, getStudentProfile, listFieldOptions, PREP_SCORE_FORMULA, runPrepAnalysis, validatePrepAnalysisQuery,
} from './prepAnalysis.service.js';
import { DEFAULT_EXPORT_COLUMNS, EXPORT_LIMITS, publicExportColumns, validateExportOptions } from './prepAnalysis.export.js';
import { FILTER_LIMITS } from './filterEngine.js';

// req.platformPermissions is set by platform/enforcePolicy.js on university
// deployments; it is undefined on the central/standalone platform (all modules).

export async function getPrepAnalysisCatalog(req, res) {
  const catalog = publicFieldCatalog(req.platformPermissions);
  const modules = new Set(catalog.modules.map((module) => module.key));
  const licensedChart = (id) => modules.has(CHARTS.find((chart) => chart.id === id)?.module);
<<<<<<< Updated upstream
  // Always fresh: the feature list changes with licences and deployments.
  res.set('Cache-Control', 'private, no-cache');
=======
  res.set('Cache-Control', 'private, max-age=60');
>>>>>>> Stashed changes
  res.json({
    ...catalog,
    limits: FILTER_LIMITS,
    groupBy: Object.entries(GROUP_BY).map(([key, value]) => ({ key, label: value.label })),
    charts: CHARTS.filter((chart) => modules.has(chart.module)).map(({ build, ...chart }) => chart),
    sections: Object.entries(SECTIONS).filter(([, section]) => modules.has(section.module)).map(([key, section]) => ({ key, ...section })),
    defaultLayout: Object.fromEntries(catalog.areas.map((area) => [area.key, (DEFAULT_LAYOUT[area.key] || []).filter(licensedChart)])),
    formula: PREP_SCORE_FORMULA,
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
  const query = validatePrepAnalysisQuery({ ...req.body, charts: [] }, req.platformPermissions);
  const options = validateExportOptions(req.body, req.platformPermissions, query.module);
  const file = await exportPrepAnalysis({ user: req.user, query, options });
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

export async function getPrepAnalysisStudent(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json(await getStudentProfile({
    user: req.user,
    permissions: req.platformPermissions,
    studentId: req.params.studentId,
    range: { preset: String(req.query.range || 'all') },
  }));
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
