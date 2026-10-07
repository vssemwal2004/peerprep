import { isUniversity } from './deployment.js';
import { universityPolicy } from './client.js';

function routeModule(path) {
  if (/^\/(?:learning|subjects)(?:\/|$)/.test(path)) return 'learning';
  if (/^\/admin\/library(?:\/|$)/.test(path)) return 'questions';
  if (/^\/student\/questions(?:\/|$)/.test(path)) return 'questions';
  if (/^\/(?:admin\/assessment|student\/assessments?|assessment-feedback)(?:\/|$)/.test(path)) return 'assessments';
  if (/^\/(?:events|schedule|pairing)(?:\/|$)/.test(path)) return 'events';
  if (/^\/(?:ai-interviews|student\/ai-interviews)(?:\/|$)/.test(path)) return 'interviews';
  if (/^\/resume(?:\/|$)/.test(path)) return 'resumes';
  if (/^\/(?:admin\/analytics|student\/analysis)(?:\/|$)/.test(path)) return 'analytics';
  return null;
}

export async function enforceUniversityPolicy(req, res, next) {
  if (!isUniversity()) return next();
  const moduleName = routeModule(req.path);
  if (!moduleName) return next();
  try {
    const policy = await universityPolicy();
    if (!policy.permissions?.[moduleName]) return res.status(403).json({ error: `${moduleName} is disabled for this university` });
    next();
  } catch (error) { next(error); }
}
