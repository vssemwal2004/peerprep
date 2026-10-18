export const deploymentRole = () => String(process.env.PEERPREP_DEPLOYMENT_ROLE || 'standalone').toLowerCase();
import { currentTenant } from './tenantContext.js';

export const isControlPlane = () => deploymentRole() === 'control' || (deploymentRole() === 'shared' && !currentTenant());
export const isUniversity = () => deploymentRole() === 'university' || (deploymentRole() === 'shared' && Boolean(currentTenant()));

export function validateDeploymentConfig() {
  const role = deploymentRole();
  if (role !== 'shared') throw new Error('PeerPrep now runs as one shared deployment; set PEERPREP_DEPLOYMENT_ROLE=shared');
  if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'memory') throw new Error('Shared deployment requires the main database MONGODB_URI');
  if (Buffer.from(process.env.PEERPREP_TENANT_SECRET_KEY || '', 'base64').length !== 32) {
    throw new Error('Shared deployment requires a base64-encoded 32-byte PEERPREP_TENANT_SECRET_KEY');
  }
}
