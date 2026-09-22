import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAssessmentInvitationTemplate } from '../src/services/assessmentInvitationTemplate.js';
import { renderAssessmentInvitationEmail } from '../src/utils/mailer.js';

const input = {
  subject: 'Invitation: {{assessmentTitle}}',
  htmlContent: '<div style="color:#123456">Hello {{studentName}} {{credentialsSection}} {{passwordSection}}</div>',
};

test('invitation HTML remains markup and includes the rendered access sections', () => {
  const template = validateAssessmentInvitationTemplate(input);
  const email = renderAssessmentInvitationEmail({
    to: 'candidate@example.com',
    assessment: { title: 'Coding test', passwordEnabled: true },
    student: { name: 'Candidate' },
    password: 'exam-secret',
    accountPassword: 'login-secret',
    assessmentOnly: true,
    template,
  });
  assert.match(email.html, /^<div style="color:#123456">/);
  assert.match(email.html, /login-secret/);
  assert.match(email.html, /exam-secret/);
  assert.equal(email.subject, 'Invitation: Coding test');
});

test('previously escaped invitation markup is restored safely', () => {
  const template = validateAssessmentInvitationTemplate({
    ...input,
    htmlContent: '&lt;div style="color:red"&gt;{{credentialsSection}} {{passwordSection}}&lt;/div&gt;',
  });
  assert.match(template.htmlContent, /^<div style="color:red">/);
  assert.doesNotMatch(template.htmlContent, /&lt;div/);
});

test('unsafe HTML cannot be saved or sent', () => {
  assert.throws(() => validateAssessmentInvitationTemplate({
    ...input,
    htmlContent: '<div onclick="alert(1)">{{credentialsSection}} {{passwordSection}}</div>',
  }), /Remove scripts/);
});
