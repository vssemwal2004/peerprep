import { isUniversity } from './deployment.js';
import { universityPolicy } from './client.js';

export function routeModule(path, { assessmentId, kind, scope } = {}) {
  if (/^\/(?:learning|subjects)(?:\/|$)/.test(path)) return 'learning';
  if (/^\/admin\/library\/questions(?:\/|$)/.test(path) && scope === 'mock') return 'prepmock';
  if (/^\/admin\/library(?:\/|$)/.test(path)) return 'questions';
  if (/^\/student\/questions(?:\/|$)/.test(path)) return 'questions';
  if (/^\/(?:compiler|execute)(?:\/|$)/.test(path)) return assessmentId ? 'assessments' : 'questions';
  if (/^\/problem-lists(?:\/|$)/.test(path)) return 'questions';
  if (/^\/(?:quests|engagement|auth\/engagement)(?:\/|$)/.test(path)) return 'quickprep';
  if (/^\/student\/assessment-dashboard(?:\/|$)/.test(path) && kind === 'mock') return 'prepmock';
  if (/^\/admin\/assessment\/mock-/.test(path)) return 'prepmock';
  if (/^\/admin\/assessment\/(?:create|list|reports)(?:\/|$)/.test(path) && kind === 'mock') return 'prepmock';
  if (/^\/(?:admin\/assessment(?:\/|-|$)|student\/assessments?(?:\/|-|$)|assessment-feedback(?:\/|$))/.test(path)) return 'assessments';
  if (/^\/(?:events|schedule|pairing|feedback)(?:\/|$)/.test(path)) return 'events';
  if (/^\/(?:ai-interviews|student\/ai-interviews)(?:\/|$)/.test(path)) return 'interviews';
  if (/^\/resume(?:\/|$)/.test(path)) return 'resumes';
  return null;
}

function hasAnalysisAccess(path, permissions = {}) {
  // Prep Analysis also covers mock interviews (events) and AI interviews.
  const modules = path.startsWith('/admin/prep-analysis')
    ? ['questions', 'quickprep', 'assessments', 'prepmock', 'learning', 'events', 'interviews']
    : path.startsWith('/admin/')
      ? ['questions', 'quickprep', 'assessments', 'prepmock', 'learning']
      // A student's analysis covers coding, tests, lessons, mock interviews (events) and AI interviews.
      : ['questions', 'quickprep', 'assessments', 'prepmock', 'interviews', 'events', 'learning'];
  return modules.some((name) => permissionAllowed(permissions, name));
}

export function permissionAllowed(permissions = {}, name) {
  if (name === 'quickprep') return permissions.questions === true && permissions.quickprep !== false;
  if (name === 'prepmock') return permissions.assessments === true && permissions.prepmock !== false;
  return permissions[name] === true;
}

export async function enforceUniversityPolicy(req, res, next) {
  if (!isUniversity()) return next();
  const moduleName = routeModule(req.path, { assessmentId: req.body?.assessmentId || req.query?.assessmentId, kind: req.body?.kind || req.query?.kind, scope: req.query?.scope });
  const analysisRoute = /^\/(?:admin\/analytics|admin\/prep-analysis|student\/analysis)(?:\/|$)/.test(req.path);
  if (!moduleName && !analysisRoute) return next();
  try {
    const policy = await universityPolicy();
    if (analysisRoute) {
      if (!hasAnalysisAccess(req.path, policy.permissions)) return res.status(403).json({ error: 'Analysis is disabled for this university' });
      req.platformPermissions = policy.permissions;
      return next();
    }
    if (!permissionAllowed(policy.permissions, moduleName)) return res.status(403).json({ error: `${moduleName} is disabled for this university` });
    next();
  } catch (error) { next(error); }
}
