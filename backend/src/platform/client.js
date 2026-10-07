import { isUniversity } from './deployment.js';

export async function controlRequest(path, { method = 'GET', body } = {}) {
  if (!isUniversity()) throw new Error('Central API is only available in university deployments');
  const url = new URL(`/api/platform/tenant/${path.replace(/^\//, '')}`, process.env.PEERPREP_CONTROL_URL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'X-PeerPrep-University': process.env.PEERPREP_UNIVERSITY_ID,
        'X-PeerPrep-Key': process.env.PEERPREP_SHARED_API_KEY,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Central service unavailable');
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (!error.status) {
      const unavailable = new Error('Central service unavailable');
      unavailable.status = 503;
      throw unavailable;
    }
    throw error;
  } finally { clearTimeout(timer); }
}

export async function universityPolicy() {
  return controlRequest('policy');
}
