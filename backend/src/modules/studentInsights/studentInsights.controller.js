import { exportStudentInsights, getStudentInsights, getStudentTopic } from './studentInsights.service.js';

const context = (req) => ({ user: req.user, permissions: req.platformPermissions });

export async function getInsights(req, res) {
  const refresh = String(req.query?.refresh || '') === '1';
  const insights = await getStudentInsights({ ...context(req), query: req.query, refresh });
  res.set('Cache-Control', 'private, no-store');
  res.json(insights);
}

export async function getInsightTopic(req, res) {
  const topic = await getStudentTopic({ ...context(req), key: req.params.key });
  res.set('Cache-Control', 'private, no-store');
  res.json(topic);
}

export async function downloadInsightsReport(req, res) {
  const file = await exportStudentInsights({ ...context(req), query: req.query });
  res.set({
    'Content-Type': file.contentType,
    'Content-Disposition': `attachment; filename="${file.filename}"`,
    'Cache-Control': 'private, no-store',
  });
  res.send(file.buffer);
}
