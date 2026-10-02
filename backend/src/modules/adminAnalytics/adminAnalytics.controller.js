import { HttpError } from '../../utils/errors.js';
import { executeAnalyticsQuery, estimateAnalyticsQuery, getAnalyticsOptions } from './adminAnalytics.service.js';
import { validateAnalyticsQuery, validateOptionsQuery } from './adminAnalytics.validation.js';
import { validateExportRequest } from './exports/export.validation.js';
import { createAnalyticsExport } from './exports/export.service.js';
import { executeGraphDetails, validateGraphDetailsRequest } from './adminAnalytics.details.js';

export async function queryAdminAnalytics(req, res) {
  const query = validateAnalyticsQuery(req.body);
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
  const query = validateAnalyticsQuery(req.body, { estimate: true });
  res.set('Cache-Control', 'private, max-age=15');
  return res.json(await estimateAnalyticsQuery({ user: req.user, query }));
}

export async function listAdminAnalyticsOptions(req, res) {
  const options = validateOptionsQuery(req.query);
  res.set('Cache-Control', 'private, max-age=30');
  return res.json(await getAnalyticsOptions({ user: req.user, options }));
}

export async function getAdminAnalyticsGraphDetails(req, res) {
  const options = validateGraphDetailsRequest(String(req.params.graphId || ''), req.body);
  const cacheControl = String(req.headers['cache-control'] || '').toLowerCase();
  if (cacheControl.includes('no-cache') || String(req.headers['x-peerprep-cache-bypass'] || '').toLowerCase() === 'true') {
    options.query.cache.bypass = true;
  }
  const result = await executeGraphDetails({ user: req.user, graphId: req.params.graphId, options });
  res.set({ 'Cache-Control': 'private, no-store', 'X-PeerPrep-Cache': result.meta?.cache?.status || 'miss' });
  return res.json(result);
}

export async function createAdminAnalyticsExport(req, res) {
  const query = validateAnalyticsQuery(req.body?.query || {});
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
