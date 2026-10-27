import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COORDINATOR_PERMISSIONS,
  normalizeCoordinatorPermissions,
} from '../src/services/coordinatorPermissions.js';
import {
  EMAIL_TEMPLATE_TYPES,
  getDefaultEmailTemplates,
  normalizeStudentOnboardingTemplate,
} from '../src/services/emailTemplateService.js';

test('student promotion is available as an explicit coordinator permission', () => {
  assert.ok(DEFAULT_COORDINATOR_PERMISSIONS.includes('coordinator.students.promote'));
  assert.deepEqual(
    normalizeCoordinatorPermissions(['coordinator.students.promote', 'unknown.permission']),
    ['coordinator.students.promote'],
  );
});

test('assessment-only candidate creation is independently permission controlled', () => {
  assert.ok(DEFAULT_COORDINATOR_PERMISSIONS.includes('coordinator.assessment.create'));
  assert.ok(DEFAULT_COORDINATOR_PERMISSIONS.includes('coordinator.assessment.candidates'));
  assert.deepEqual(
    normalizeCoordinatorPermissions(['coordinator.assessment.candidates', 'unknown.permission']),
    ['coordinator.assessment.candidates'],
  );
});

test('assessment invitation and coordinator onboarding templates are seeded', () => {
  const templates = getDefaultEmailTemplates();
  const invitation = templates.find((template) => template.type === EMAIL_TEMPLATE_TYPES.ASSESSMENT_INVITATION);
  const coordinator = templates.find((template) => template.type === EMAIL_TEMPLATE_TYPES.COORDINATOR_ONBOARDING);

  assert.ok(invitation);
  assert.ok(invitation.variables.includes('passwordSection'));
  assert.ok(invitation.variables.includes('credentialsSection'));
  assert.match(invitation.htmlContent, /credentialsSection/);
  assert.match(invitation.htmlContent, /PeerPrep Assessment/);
  assert.ok(coordinator);
  assert.ok(coordinator.variables.includes('coordinatorId'));
  assert.match(coordinator.htmlContent, /Temporary password/i);
});

test('student onboarding template uses email as the login identifier', () => {
  const onboarding = getDefaultEmailTemplates()
    .find((template) => template.type === EMAIL_TEMPLATE_TYPES.ONBOARDING);

  assert.ok(onboarding);
  assert.ok(onboarding.variables.includes('email'));
  assert.ok(!onboarding.variables.includes('studentId'));
  assert.match(onboarding.htmlContent, /<strong>Email:<\/strong>/i);
  assert.match(onboarding.htmlContent, /\{\{email\}\}/);
  assert.doesNotMatch(onboarding.htmlContent, /Student\s*ID|studentId/i);
});

test('legacy student onboarding templates are normalized before sending', () => {
  const normalized = normalizeStudentOnboardingTemplate({
    subject: 'Login details for Student ID {{studentId}}',
    variables: ['studentId', 'password'],
    htmlContent: '<p>Student ID: {{studentId}}</p>',
  });

  assert.deepEqual(normalized.variables, ['password', 'email']);
  assert.equal(normalized.subject, 'Login details for Email {{email}}');
  assert.equal(normalized.htmlContent, '<p>Email: {{email}}</p>');
});
