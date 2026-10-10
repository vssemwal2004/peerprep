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
  return null;
}

function hasAnalysisAccess(path, permissions = {}) {
  const modules = path.startsWith('/admin/')
    ? ['questions', 'assessments', 'learning']
    : ['questions', 'assessments', 'interviews', 'learning'];
  return modules.some((name) => permissions[name] === true);
}

export async function enforceUniversityPolicy(req, res, next) {
  if (!isUniversity()) return next();
  const moduleName = routeModule(req.path);
  const analysisRoute = /^\/(?:admin\/analytics|student\/analysis)(?:\/|$)/.test(req.path);
  if (!moduleName && !analysisRoute) return next();
  try {
    const policy = await universityPolicy();
    if (analysisRoute) {
      if (!hasAnalysisAccess(req.path, policy.permissions)) return res.status(403).json({ error: 'Analysis is disabled for this university' });
      req.platformPermissions = policy.permissions;
      return next();
    }
    if (!policy.permissions?.[moduleName]) return res.status(403).json({ error: `${moduleName} is disabled for this university` });
    next();
  } catch (error) { next(error); }
}
