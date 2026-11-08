// Which parts of a student's own analysis they may see. A part shows only when the university
// has the module (platform permissions; none on a standalone install) AND the admin has given
// this student the matching feature. Parts that fail either check are never loaded or sent.

import { studentHasFeature } from '../../services/studentFeatureAccess.js';

const platformAllows = (permissions, key) => !permissions || permissions[key] === true;

/** { coding, quickprep, learning, assessment, mock, ai, company, rankings } as booleans. */
export function studentInsightAccess(user, permissions) {
  const access = {
    coding: platformAllows(permissions, 'questions') && studentHasFeature(user, 'prep_coding'),
    quickprep: platformAllows(permissions, 'questions') && studentHasFeature(user, 'quickprep'),
    learning: platformAllows(permissions, 'learning') && studentHasFeature(user, 'learning'),
    assessment: platformAllows(permissions, 'assessments') && studentHasFeature(user, 'assessments'),
    // Mock (peer) interviews are the university's "events" module; AI interviews its "interviews" module.
    mock: platformAllows(permissions, 'events') && studentHasFeature(user, 'interviews'),
    ai: platformAllows(permissions, 'interviews') && studentHasFeature(user, 'ai_interviews'),
  };
  // Company readiness weighs coding, tests, mock interviews and lessons together.
  access.company = access.coding && access.assessment && access.mock && access.learning;
  access.rankings = studentHasFeature(user, 'rankings');
  return access;
}

export const anyInsightAccess = (access) => ['coding', 'quickprep', 'learning', 'assessment', 'mock', 'ai'].some((key) => access[key]);
