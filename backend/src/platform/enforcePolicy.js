import { isUniversity } from './deployment.js';
import { universityPolicy } from './client.js';
import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import mongoose from 'mongoose';

export function routeModule(path, { assessmentId, kind, scope } = {}) {
  if (/^\/(?:learning|subjects)(?:\/|$)/.test(path)) return 'learning';
  if (/^\/admin\/library\/questions(?:\/|$)/.test(path) && scope === 'mock') return 'prepmock';
  if (/^\/admin\/library(?:\/|$)/.test(path)) return 'questions';
  if (/^\/student\/questions(?:\/|$)/.test(path)) return 'questions';
  if (/^\/(?:compiler|execute)(?:\/|$)/.test(path)) return assessmentId ? 'assessment_or_mock' : 'questions';
  if (/^\/problem-lists(?:\/|$)/.test(path)) return 'questions';
  if (/^\/(?:quests|engagement|auth\/engagement)(?:\/|$)/.test(path)) return 'quickprep';
  if (/^\/student\/assessment-dashboard(?:\/|$)/.test(path) && kind === 'mock') return 'prepmock';
  if (/^\/admin\/assessment\/mock-/.test(path)) return 'prepmock';
  if (/^\/admin\/assessment\/(?:create|list|reports)(?:\/|$)/.test(path) && kind === 'mock') return 'prepmock';
  if (/^\/admin\/assessment\/(?:reports\/submissions|submissions\/[^/]+\/violations)(?:\/|$)/.test(path)) return 'assessment_or_mock';
  if (/^\/admin\/assessment\/[0-9a-f]{24}(?:\/|$)/i.test(path)
    || /^\/student\/assessment\/[^/]+(?:\/|$)/.test(path)) return 'assessment_or_mock';
  if (/^\/(?:admin\/assessment(?:\/|-|$)|student\/assessments?(?:\/|-|$)|assessment-feedback(?:\/|$))/.test(path)) return 'assessments';
  if (/^\/(?:events|schedule|pairing|feedback)(?:\/|$)/.test(path)) return 'events';
  if (/^\/(?:ai-interviews|student\/ai-interviews)(?:\/|$)/.test(path)) return 'interviews';
  if (/^\/resume(?:\/|$)/.test(path)) return 'resumes';
  return null;
}

function hasAnalysisAccess(path, permissions = {}) {
  // Prep Mates is granted per student, without a separate university module licence.
  if (path.startsWith('/admin/prep-analysis/peers')) return true;
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
  if (name === 'prepmock') return permissions.prepmock === true;
  if (name === 'assessment_or_mock') return permissions.assessments === true || permissions.prepmock === true;
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
    if (moduleName === 'assessment_or_mock' && policy.permissions.assessments !== true) {
      let id = req.body?.assessmentId || req.query?.assessmentId
        || req.path.match(/^\/admin\/assessment\/([0-9a-f]{24})(?:\/|$)/i)?.[1]
        || req.path.match(/^\/student\/assessment\/([^/]+)(?:\/|$)/)?.[1];
      if (!id) {
        const submissionId = req.path.match(/^\/admin\/assessment\/(?:reports\/submissions|submissions)\/([0-9a-f]{24})(?:\/|$)/i)?.[1];
        if (mongoose.isValidObjectId(submissionId)) {
          const submission = await AssessmentSubmission.findById(submissionId).select('assessmentId').lean();
          id = submission?.assessmentId;
        }
      }
      if (id && id !== 'submit') {
        const query = mongoose.isValidObjectId(id) ? { _id: id } : { assessmentId: String(id) };
        const local = await Assessment.findOne(query).select('kind').lean();
        if (local && local.kind !== 'mock') return res.status(403).json({ error: 'Assessments is disabled for this university' });
      }
    }
    next();
  } catch (error) { next(error); }
}
