// What a student can really use: the university's licensed modules AND the student's own feature
// access (admin "Feature access"). Badges, badge targets and readiness follow this, so a student
// never sees a badge or target for a feature they cannot open (2026-11-23).
import User from '../models/User.js';
import { studentHasFeature } from './studentFeatureAccess.js';

/** Adaptive engagement domain -> effective access key. */
export const DOMAIN_ACCESS_KEY = Object.freeze({ coding: 'coding', learning: 'learning', assessments: 'assessments', interviews: 'aiInterviews', events: 'peerInterviews' });

/** The student's own feature switches only (sync; a user without featureAccess has "All access"). */
export function studentFeatureFlags(student) {
  const has = (feature) => studentHasFeature(student, feature);
  return {
    coding: has('prep_coding'), quickprep: has('quickprep'), learning: has('learning'), assessments: has('assessments'),
    aiInterviews: has('ai_interviews'), peerInterviews: has('interviews'),
  };
}

/** Engagement domains the university allows (already filtered) narrowed to the student's own features. */
export function studentDomains(student, domains = []) {
  const flags = studentFeatureFlags(student);
  return domains.filter((domain) => flags[DOMAIN_ACCESS_KEY[domain]] !== false);
}

/**
 * University permissions combined with the student's features:
 * { permissions, coding, quickprep, learning, assessments, aiInterviews, peerInterviews }.
 * Loads featureAccess when the caller passed a partial student ({ _id, role }).
 */
export async function effectiveStudentAccess(student) {
  let user = student || {};
  if (user._id && user.featureAccess === undefined && user.accessScope === undefined) {
    const stored = await User.findById(user._id).select('role featureAccess accessScope').lean();
    user = { ...user, ...(stored || {}) };
  }
  const { dashboardPermissions } = await import('./studentDashboardService.js');
  const permissions = await dashboardPermissions(user);
  const flags = studentFeatureFlags(user);
  const coding = permissions.questions === true && flags.coding;
  return {
    permissions,
    coding,
    // Quick Prep sheets are coding question sets: coding plus the university's Quick Prep switch.
    quickprep: coding && permissions.quickprep !== false && flags.quickprep,
    learning: permissions.learning === true && flags.learning,
    assessments: permissions.assessments === true && flags.assessments,
    aiInterviews: permissions.interviews === true && flags.aiInterviews,
    peerInterviews: permissions.events === true && flags.peerInterviews,
  };
}
