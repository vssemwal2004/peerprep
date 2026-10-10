import { HttpError } from '../../utils/errors.js';
import { executeAnalyticsQuery, estimateAnalyticsQuery, getAnalyticsOptions } from './adminAnalytics.service.js';
import { validateAnalyticsQuery, validateOptionsQuery } from './adminAnalytics.validation.js';
import { validateExportRequest } from './exports/export.validation.js';
import { createAnalyticsExport } from './exports/export.service.js';
import { executeGraphDetails, validateGraphDetailsRequest } from './adminAnalytics.details.js';

const analyticsSourcePermission = { coding: 'questions', assessment: 'assessments', learning: 'learning' };
const analyticsOptionPermission = {
  assessments: 'assessments', assessmentTypes: 'assessments', questionTypes: 'assessments', sections: 'assessments',
  assessmentTopics: 'assessments', setNumbers: 'assessments',
  problems: 'questions', 'coding-topics': 'questions', languages: 'questions', verdicts: 'questions',
  'learning-subjects': 'learning', 'learning-chapters': 'learning', 'learning-topics': 'learning',
};

export function scopeAdminAnalyticsQuery(query, permissions) {
  if (!permissions) return query;
  const allowed = query.sources.filter((source) => permissions[analyticsSourcePermission[source]] === true);
  if (!allowed.length) throw new HttpError(403, 'No enabled module provides this analysis.');
  const selected = analyticsSourcePermission[query.analysisType];
  if (selected && permissions[selected] !== true) throw new HttpError(403, `${selected} analysis is disabled for this university.`);
  const audienceSource = { 'coding-active': 'coding', 'assessment-active': 'assessment', 'learning-active': 'learning' }[query.population?.selectionMode];
  if (audienceSource && permissions[analyticsSourcePermission[audienceSource]] !== true) {
    throw new HttpError(403, 'The selected audience uses a disabled module.');
  }
  const rankSource = query.population?.rank?.metric;
  if (analyticsSourcePermission[rankSource] && permissions[analyticsSourcePermission[rankSource]] !== true) {
    throw new HttpError(403, 'The selected ranking uses a disabled module.');
  }
  query.sources = allowed;
  return query;
}

function scopeOptions(options, permissions) {
  const moduleName = analyticsOptionPermission[options.type];
  if (permissions && moduleName && permissions[moduleName] !== true) {
    throw new HttpError(403, `${moduleName} analysis is disabled for this university.`);
  }
  return options;
}

export async function queryAdminAnalytics(req, res) {
  const query = scopeAdminAnalyticsQuery(validateAnalyticsQuery(req.body), req.platformPermissions);
  const cacheControl = String(req.headers['cache-control'] || '').toLowerCase();
  if (cacheControl.includes('no-cache') || String(req.headers['x-peerprep-cache-bypass'] || '').toLowerCase() === 'true') {
    query.cache.bypass = true;
  }
  res.set('Cache-Control', 'private, no-store');
  const result = await executeAnalyticsQuery({ user: req.user, query });
  res.set('X-PeerPrep-Cache', result.meta?.cache?.status || 'miss');
  return res.json(result);
}

export async function estimateAdminAnalytics(req, res) {
  const query = scopeAdminAnalyticsQuery(validateAnalyticsQuery(req.body, { estimate: true }), req.platformPermissions);
  res.set('Cache-Control', 'private, max-age=15');
  return res.json(await estimateAnalyticsQuery({ user: req.user, query }));
}

export async function listAdminAnalyticsOptions(req, res) {
  const options = scopeOptions(validateOptionsQuery(req.query), req.platformPermissions);
  res.set('Cache-Control', 'private, max-age=30');
  return res.json(await getAnalyticsOptions({ user: req.user, options }));
}

export async function getAdminAnalyticsGraphDetails(req, res) {
  const options = validateGraphDetailsRequest(String(req.params.graphId || ''), req.body);
  scopeAdminAnalyticsQuery(options.query, req.platformPermissions);
  const cacheControl = String(req.headers['cache-control'] || '').toLowerCase();
  if (cacheControl.includes('no-cache') || String(req.headers['x-peerprep-cache-bypass'] || '').toLowerCase() === 'true') {
    options.query.cache.bypass = true;
  }
  const result = await executeGraphDetails({ user: req.user, graphId: req.params.graphId, options });
  res.set({ 'Cache-Control': 'private, no-store', 'X-PeerPrep-Cache': result.meta?.cache?.status || 'miss' });
  return res.json(result);
}

export async function createAdminAnalyticsExport(req, res) {
  const query = scopeAdminAnalyticsQuery(validateAnalyticsQuery(req.body?.query || {}), req.platformPermissions);
  const exportOptions = validateExportRequest(req.body);
  const result = await createAnalyticsExport({ user: req.user, query, exportOptions });
  res.set({
    'Cache-Control': 'private, no-store',
    'Content-Type': result.mimeType,
    'Content-Disposition': `attachment; filename="${result.filename}"`,
    'Content-Length': String(result.buffer.length),
    'X-Analytics-Row-Count': String(result.rowCount),
    'Access-Control-Expose-Headers': 'Content-Disposition, X-Analytics-Row-Count',
  });
  return res.status(200).send(result.buffer);
}

export async function getAdminAnalyticsExport() {
  throw new HttpError(404, 'Analytics exports are returned directly by POST /admin/analytics/exports and are not stored.');
}
