import { currentTenant } from '../platform/tenantContext.js';
import { deploymentRole } from '../platform/deployment.js';

export function interviewServiceUrl() {
  return deploymentRole() === 'shared' && currentTenant()
    ? currentTenant().interviewServiceUrl || '' : process.env.INTERVIEW_SERVICE_URL || '';
}

export function interviewServiceSecret() {
  return deploymentRole() === 'shared' && currentTenant()
    ? currentTenant().interviewServiceSecret || '' : process.env.INTERVIEW_SERVICE_SECRET || '';
}
