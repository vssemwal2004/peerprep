// The admin's edited email draft must reach Prep Analysis "Send email" as HTML, not escaped text;
// every other field (and every other route) is still XSS-escaped.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studentMailDraftOf, xssProtectionMiddleware } from '../src/middleware/sanitization.js';

const html = '<div style="padding:24px"><p>Hi {{firstName}}</p><a href="{{dashboardUrl}}">Open</a></div>';
const run = (req) => new Promise((resolve) => {
  const draft = studentMailDraftOf(req);
  xssProtectionMiddleware(req, {}, () => {
    if (draft) req.body.draft = draft;
    resolve(req.body);
  });
});

test('the draft HTML survives on the three email routes (main and university paths)', async () => {
  for (const path of ['/api/admin/prep-analysis/email/preview', '/api/u/geu-122/admin/prep-analysis/email/send', '/api/admin/prep-analysis/email/test']) {
    const body = await run({ method: 'POST', path, body: { draft: { subject: 'Hi {{firstName}} & co', html }, templateId: '<b>x</b>' }, query: {}, params: {} });
    assert.equal(body.draft.html, html, path);
    assert.equal(body.draft.subject, 'Hi {{firstName}} & co');
    assert.notEqual(body.templateId, '<b>x</b>', 'other fields are still escaped');
  }
});

test('anywhere else, or as a non-string, the draft is escaped as before', async () => {
  const other = await run({ method: 'POST', path: '/api/admin/prep-analysis/query', body: { draft: { html } }, query: {}, params: {} });
  assert.notEqual(other.draft.html, html);
  const weird = await run({ method: 'POST', path: '/api/admin/prep-analysis/email/send', body: { draft: { html: ['<script>x</script>'] } }, query: {}, params: {} });
  assert.equal(weird.draft.html, undefined, 'only strings are kept');
  assert.equal(studentMailDraftOf({ method: 'GET', path: '/api/admin/prep-analysis/email/preview', body: { draft: { html } } }), null);
});
