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
    assessment: { title: 'Coding test', passwordEnabled: true, settings: { candidateCredentialMode: 'student_id' } },
    student: { name: 'Candidate', studentId: 'STUDENT-101' },
    password: 'exam-secret',
    accountPassword: 'login-secret',
    assessmentOnly: true,
    template,
  });
  assert.match(email.html, /^<div style="color:#123456">/);
  assert.match(email.html, /login-secret/);
  assert.match(email.html, /exam-secret/);
  assert.match(email.html, /STUDENT-101/);
  assert.match(email.html, /sign in with either your email or Student ID/i);
  assert.match(email.html, /initial password is your Student ID/i);
  assert.equal(email.subject, 'Invitation: Coding test');
});

test('admins may leave out the access placeholders and the email is sent as written', () => {
  const template = validateAssessmentInvitationTemplate({
    subject: 'Reminder: {{assessmentTitle}}',
    htmlContent: '<p>Hi {{studentName}}, your test opens soon.</p>',
  });
  const email = renderAssessmentInvitationEmail({
    to: 'candidate@example.com',
    assessment: { title: 'Weekly test', passwordEnabled: true },
    student: { name: 'Candidate' },
    password: 'exam-secret',
    accountPassword: 'login-secret',
    template,
  });
  assert.equal(email.html, '<p>Hi Candidate, your test opens soon.</p>');
  assert.doesNotMatch(email.html, /login-secret|exam-secret/);
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
