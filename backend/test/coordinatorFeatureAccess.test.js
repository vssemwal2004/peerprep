import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COORDINATOR_PERMISSIONS,
  normalizeCoordinatorPermissions,
} from '../src/services/coordinatorPermissions.js';
import {
  EMAIL_TEMPLATE_TYPES,
  getDefaultEmailTemplates,
} from '../src/services/emailTemplateService.js';

test('student promotion is available as an explicit coordinator permission', () => {
  assert.ok(DEFAULT_COORDINATOR_PERMISSIONS.includes('coordinator.students.promote'));
  assert.deepEqual(
    normalizeCoordinatorPermissions(['coordinator.students.promote', 'unknown.permission']),
    ['coordinator.students.promote'],
  );
});

test('assessment invitation and coordinator onboarding templates are seeded', () => {
  const templates = getDefaultEmailTemplates();
  const invitation = templates.find((template) => template.type === EMAIL_TEMPLATE_TYPES.ASSESSMENT_INVITATION);
  const coordinator = templates.find((template) => template.type === EMAIL_TEMPLATE_TYPES.COORDINATOR_ONBOARDING);

  assert.ok(invitation);
  assert.ok(invitation.variables.includes('passwordSection'));
  assert.match(invitation.htmlContent, /PeerPrep Assessment/);
  assert.ok(coordinator);
  assert.ok(coordinator.variables.includes('coordinatorId'));
  assert.match(coordinator.htmlContent, /Temporary password/i);
});
