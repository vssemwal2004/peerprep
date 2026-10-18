import { isUniversity } from './deployment.js';
import { deploymentRole } from './deployment.js';
import { currentTenant } from './tenantContext.js';
import crypto from 'node:crypto';

function sharedHeaders() {
  const universityId = currentTenant()?.universityId;
  if (!universityId) throw new Error('University context is required');
  const timestamp = String(Date.now());
  const signature = crypto.createHmac('sha256', process.env.JWT_SECRET)
    .update(`${universityId}:${timestamp}`).digest('hex');
  return { 'X-PeerPrep-University': universityId, 'X-PeerPrep-Internal-Time': timestamp, 'X-PeerPrep-Internal-Signature': signature };
}

export async function controlRequest(path, { method = 'GET', body } = {}) {
  if (!isUniversity()) throw new Error('Central API is only available in university deployments');
  const shared = deploymentRole() === 'shared';
  const origin = shared ? (process.env.PEERPREP_SHARED_API_ORIGIN || `http://127.0.0.1:${process.env.PORT || 4000}`) : process.env.PEERPREP_CONTROL_URL;
  const url = new URL(`/api/platform/tenant/${path.replace(/^\//, '')}`, origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...(shared ? sharedHeaders() : { 'X-PeerPrep-University': process.env.PEERPREP_UNIVERSITY_ID, 'X-PeerPrep-Key': process.env.PEERPREP_SHARED_API_KEY }),
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
  if (deploymentRole() === 'shared' && currentTenant()) {
    const tenant = currentTenant();
    return { universityId: tenant.universityId, active: true, permissions: tenant.permissions, sources: tenant.sources };
  }
  return controlRequest('policy');
}
