import { InterviewEngagementReceipt } from '../models/AdaptiveEngagement.js';
import { engagementTenant, engagementPermissions } from './engagementPolicyService.js';
import { writeVerifiedActivities } from './engagementEvidenceService.js';

// Only the authenticated upstream response enters this adapter, never the student's answer body.
export async function observeVerifiedInterview(req, payload) {
  if (!payload?.id || !(await engagementPermissions(req.user)).interviews) return;
  const scope = { tenantKey: engagementTenant(req.user), studentId: req.user._id };
  const start = /^\/([^/]+)\/start$/.exec(req.path);
  if (start && req.method === 'POST') {
    try { await InterviewEngagementReceipt.updateOne({ ...scope, sessionId: String(payload.id) }, { $setOnInsert: { interviewId: start[1] } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
  }
  if (payload.status !== 'completed') return;
  const receipt = await InterviewEngagementReceipt.findOneAndUpdate({ ...scope, sessionId: String(payload.id), completedAt: null }, { $set: { completedAt: new Date() } }, { new: true }).lean()
    || await InterviewEngagementReceipt.findOne({ ...scope, sessionId: String(payload.id) }).lean();
  if (!receipt?.interviewId || !receipt.completedAt) return;
  await writeVerifiedActivities(scope, [{ sourceKey: `interviews:${receipt.interviewId}`, contentKey: `interviews:${receipt.interviewId}`, domain: 'interviews', occurredAt: receipt.completedAt }]);
}
