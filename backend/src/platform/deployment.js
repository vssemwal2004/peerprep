export const deploymentRole = () => String(process.env.PEERPREP_DEPLOYMENT_ROLE || 'standalone').toLowerCase();
export const isControlPlane = () => deploymentRole() === 'control';
export const isUniversity = () => deploymentRole() === 'university';

export function validateDeploymentConfig() {
  const role = deploymentRole();
  if (!['standalone', 'control', 'university'].includes(role)) throw new Error('Invalid PEERPREP_DEPLOYMENT_ROLE');
  if (role === 'university') {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(process.env.PEERPREP_UNIVERSITY_ID || '')) throw new Error('PEERPREP_UNIVERSITY_ID is required');
    let centralUrl;
    try { centralUrl = new URL(process.env.PEERPREP_CONTROL_URL); }
    catch { throw new Error('PEERPREP_CONTROL_URL is required'); }
    if (centralUrl.username || centralUrl.password || centralUrl.search || centralUrl.hash || centralUrl.pathname !== '/') throw new Error('PEERPREP_CONTROL_URL must be a plain origin');
    if (process.env.NODE_ENV === 'production' && centralUrl.protocol !== 'https:') throw new Error('PEERPREP_CONTROL_URL must use HTTPS');
    if (process.env.NODE_ENV !== 'production' && !['https:', 'http:'].includes(centralUrl.protocol)) throw new Error('Invalid PEERPREP_CONTROL_URL protocol');
    if (centralUrl.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(centralUrl.hostname)) throw new Error('Insecure central URLs are allowed only on localhost');
    if (!process.env.PEERPREP_SHARED_API_KEY || process.env.PEERPREP_SHARED_API_KEY.length < 32) throw new Error('PEERPREP_SHARED_API_KEY must contain at least 32 characters');
    if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'memory') throw new Error('University deployments require their own persistent MONGODB_URI');
  }
  if (role === 'control' && (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'memory')) throw new Error('Control plane requires a persistent MONGODB_URI');
}
