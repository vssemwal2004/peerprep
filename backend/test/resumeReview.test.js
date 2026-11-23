import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { after, test } from 'node:test';
import PDFDocument from 'pdfkit';
import { createExtractor } from '../src/modules/resumeReview/resumeReview.extractor.js';
import { pendingResumeAction } from '../src/middleware/pendingResumeAction.js';
import { checkResumePdf, explainReview, sanitizeExplainInput } from '../src/modules/resumeReview/resumeReview.service.js';
import { rewriteBullet, explainWithAnvi } from '../src/modules/resumeReview/resumeReview.advice.js';

test('bullet rewriting keeps source numbers and reports provider failures without changing a draft', async () => {
  const body = { original: 'I built 2 mock exams.' };
  const model = suggestion => ({ configured: true, generateJson: async () => ({ suggestion }) });
  assert.deepEqual(await rewriteBullet(body, model('Built 2 mock exams.')), { suggestion: 'Built 2 mock exams.' });
  await assert.rejects(rewriteBullet(body, model('Built 20 mock exams.')), error => error.status === 422);
  await assert.rejects(rewriteBullet(body, model('Built mock exams.')), error => error.status === 422);
  await assert.rejects(rewriteBullet(body, { configured: false }), error => error.status === 503);
  await assert.rejects(rewriteBullet({ original: 'x'.repeat(1201) }, model('ok')), error => error.status === 400);
});

test('the explanation keeps the original locations and works when Gemini is unavailable', async () => {
  const data = { ats: { failedChecks: [{ title: 'Skills', section: 'skills', fix: 'Add a skills heading.', scoreImpact: 4 }] } };
  const expected = explainReview(data);
  assert.deepEqual(await explainWithAnvi(data, { configured: true, generateJson: async () => { throw Error(); } }), expected);
  const ai = await explainWithAnvi(data, { configured: true, generateJson: async () => ({ summary: 'Label the section containing your skills.' }) });
  assert.deepEqual(ai.fixes, expected.fixes);
  assert.equal(ai.summary, 'Label the section containing your skills.');
});

const extractor = createExtractor();
after(() => extractor.close());

function resumePdf(lines) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    lines.forEach((line) => doc.fontSize(line.startsWith('#') ? 13 : 10).text(line.replace(/^#\s*/, '')));
    doc.end();
  });
}

const RESUME = [
  '# Asha Verma', 'asha.verma@example.com | +91 98765 43210 | linkedin.com/in/asha-sample', '',
  '# EDUCATION', 'Northfield Institute of Technology, B.Tech Computer Science, 2022 - 2026, CGPA 8.4', '',
  '# EXPERIENCE', 'Software Engineering Intern, Brightline Software, May 2025 - Jul 2025',
  '• Built an admin dashboard in React used by 40 support staff.', '• Reduced report time from 9 s to 1.4 s with indexed SQL queries.', '',
  '# PROJECTS', 'CampusRide, Mar 2025', '• Designed a route-matching service in Node.js for 200 riders.', '• Shipped the MVP in 36 hours with Firebase.', '',
  '# SKILLS', 'Languages: Java, Python, JavaScript, SQL', 'Web: React, Node.js, Express',
];

test('a real exported PDF is read in the child process and scored by the engine', { timeout: 60000 }, async () => {
  const report = await checkResumePdf(await resumePdf(RESUME), { extractor, jobDescription: 'Requirements:\n- Java and React\n- Experience with Docker and Kubernetes\n- SQL' });
  assert.ok(report.readinessScore >= 0 && report.readinessScore <= 100);
  assert.equal(report.parsed.email, 'asha.verma@example.com');
  assert.ok(report.categories.length >= 5);
  assert.ok(report.text.includes('Brightline'));
  assert.ok(report.job && typeof report.job.score === 'number', 'job match is scored separately');
  assert.ok(report.job.missingKeywords.map((k) => k.toLowerCase()).some((k) => k.includes('kubernetes') || k.includes('docker')));
  for (let i = 1; i < report.failedChecks.length; i += 1) assert.ok(report.failedChecks[i - 1].scoreImpact >= report.failedChecks[i].scoreImpact, 'failed checks sorted by impact');
});

test('uploads that are not PDFs are refused before reaching the reader', async () => {
  await assert.rejects(checkResumePdf(Buffer.from('hello'), { extractor }), (error) => error.status === 400);
  await assert.rejects(checkResumePdf(Buffer.alloc(0), { extractor }), (error) => error.status === 400);
});

function fakeChild(behaviour, ready = true) {
  const child = new EventEmitter();
  child.connected = true;
  child.killed = false;
  child.kill = () => { child.killed = true; child.connected = false; setImmediate(() => child.emit('exit', null, 'SIGKILL')); };
  child.send = (message) => behaviour(child, message);
  if (ready) queueMicrotask(() => child.emit('message', { ready: true }));
  return child;
}

test('worker startup has its own deadline and binary PDF jobs run on separate workers', async () => {
  const children = [];
  const pool = createExtractor({
    concurrency: 2, timeoutMs: 30, startupTimeoutMs: 3000,
    spawn: () => {
      const child = fakeChild((self, { buffer, id }) => {
        assert.ok(Buffer.isBuffer(buffer));
        queueMicrotask(() => self.emit('message', { id, ok: true, text: buffer.toString() }));
      }, false);
      children.push(child);
      return child;
    },
  });
  try {
    const work = Promise.all(['one', 'two', 'three'].map((text) => pool.extractPdf(Buffer.from(text))));
    assert.equal(children.length, 2);
    await new Promise((resolve) => setTimeout(resolve, 75));
    for (const child of children) child.emit('message', { ready: true });
    assert.deepEqual((await work).map((item) => item.text), ['one', 'two', 'three']);
    assert.equal(pool.pending, 0);
  } finally { pool.close(); }
});

test('startup failures and shutdown release all queued callers, including prewarmed workers', async () => {
  const children = [];
  const pool = createExtractor({
    concurrency: 1, maxQueuedBytes: 4,
    spawn: () => { const child = fakeChild(() => {}, false); children.push(child); return child; },
  });
  pool.warm();
  const first = pool.extractPdf(Buffer.from('one'));
  const waiting = pool.extractPdf(Buffer.from('two'));
  await assert.rejects(pool.extractPdf(Buffer.from('three')), (error) => error.details.code === 'RESUME_READER_BUSY');
  children[0].emit('error', new Error('spawn failed'));
  await assert.rejects(first, (error) => error.details.code === 'RESUME_READER_UNAVAILABLE');
  pool.close();
  await assert.rejects(waiting, (error) => error.status === 503);
  await assert.rejects(pool.extractPdf(Buffer.from('new')), (error) => error.status === 503);
});

test('a stuck extraction is killed at the timeout and the next job gets a fresh child', async () => {
  const spawned = [];
  const stuckThenOk = createExtractor({
    timeoutMs: 50,
    spawn: () => {
      const child = fakeChild((self, message) => { if (spawned.length > 1) setImmediate(() => self.emit('message', { id: message.id, ok: true, text: 'ok' })); });
      spawned.push(child);
      return child;
    },
  });
  await assert.rejects(stuckThenOk.extractPdf(Buffer.from('%PDF-1')), (error) => error.status === 504);
  assert.equal(spawned[0].killed, true);
  assert.deepEqual(await stuckThenOk.extractPdf(Buffer.from('%PDF-1')), { text: 'ok', layout: undefined });
  assert.equal(spawned.length, 2);
});

test('a crashed reader fails only the running job; a full queue is refused politely', async () => {
  const crashing = createExtractor({ concurrency: 1, maxQueue: 1, spawn: () => fakeChild((self) => setImmediate(() => { self.connected = false; self.emit('exit', 1); })) });
  const first = crashing.extractPdf(Buffer.from('%PDF-1'));
  const second = crashing.extractPdf(Buffer.from('%PDF-1'));
  await assert.rejects(crashing.extractPdf(Buffer.from('%PDF-1')), (error) => error.status === 503 && error.details.code === 'RESUME_READER_BUSY');
  await assert.rejects(first, (error) => error.status === 503);
  await assert.rejects(second, (error) => error.status === 503);
});

const EXPLAIN_BODY = {
  outline: [
    { key: 'experience', label: 'Experience', entries: [{ title: 'Brightline Software', lines: ['Worked on dashboard that help students', 'Reduced report time from 9 s to 1.4 s'] }] },
    { key: 'skills', label: 'Skills', entries: [{ title: 'Languages', lines: ['Java, Python'] }] },
    { key: 'evil', label: 'Bad', entries: [] },
  ],
  ats: { failedChecks: [{ title: 'Strong bullet openers', evidence: 'Bullets such as "Worked on dashboard" open with a duty.', fix: 'Open with what you did.', scoreImpact: 2, section: 'experience' }], missingKeywords: ['Docker', 'Python'] },
  grammar: [{ section: 'experience', entryIndex: 0, bulletIndex: 0, message: 'Subject-verb agreement', original: 'Worked on dashboard that help students', suggestion: 'Worked on dashboard that helps students' }],
};

test('ANVI explanations rank scan fixes, link to matching bullets, and check job skills against the resume', () => {
  const input = sanitizeExplainInput(EXPLAIN_BODY);
  assert.deepEqual(input.outline.map((section) => section.key), ['experience', 'skills'], 'unknown section keys are dropped');
  const result = explainReview({
    ...EXPLAIN_BODY,
    ats: { ...EXPLAIN_BODY.ats, failedChecks: [...EXPLAIN_BODY.ats.failedChecks, { title: 'Text the ATS can read', evidence: 'PDF text is hard to read.', fix: 'Use a text-based PDF.', scoreImpact: 20, section: 'template' }] },
    grammar: [...EXPLAIN_BODY.grammar, { ...EXPLAIN_BODY.grammar[0], entryIndex: 99 }],
  });
  assert.equal(result.fixes.length, 3, 'at most three fixes');
  assert.deepEqual(result.fixes.map(({ title }) => title), ['Text the ATS can read', 'Strong bullet openers', 'Fix grammar']);
  assert.equal(result.fixes[0].action, 'Use a text-based PDF.');
  assert.deepEqual([result.fixes[2].section, result.fixes[2].entryIndex, result.fixes[2].bulletIndex, result.fixes[2].evidence], ['experience', 0, 0, EXPLAIN_BODY.grammar[0].original]);
  assert.deepEqual(result.skillNotes, [{ skill: 'Docker', foundInResume: false }, { skill: 'Python', foundInResume: true }]);
  const stemmed = explainReview({ ...EXPLAIN_BODY, outline: [{ key: 'experience', entries: [{ title: 'X', lines: ['Wrote 60+ unit tests in Java.'] }] }], ats: { missingKeywords: ['unit testing', 'Kubernetes'] } });
  assert.deepEqual(stemmed.skillNotes.map((note) => note.foundInResume), [true, false], '"unit testing" matches "unit tests"');
  assert.equal(stemmed.fixes[0].bulletIndex, null, 'a changed bullet is not linked as though it still matched');
});

test('a full explanation uses only the scan results without an outbound request', async (t) => {
  const outbound = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  const result = await explainReview(EXPLAIN_BODY);
  assert.equal(result.fixes[1].action, EXPLAIN_BODY.grammar[0].suggestion);
  assert.deepEqual(await explainReview(EXPLAIN_BODY), result);
  const jobOnly = await explainReview({ ats: { missingKeywords: ['Docker'] } });
  assert.equal(jobOnly.skillNotes[0].skill, 'Docker');
  assert.deepEqual((await explainReview({})).fixes, []);
  assert.equal(outbound.mock.callCount(), 0);
});

test('a student can repeat completed resume actions and a second click while pending is ignored', () => {
  const guard = pendingResumeAction();
  const req = { user: { _id: 'u1' } };
  const accepted = (error) => assert.equal(error, undefined);
  for (let i = 0; i < 40; i += 1) {
    const response = new EventEmitter();
    guard(req, response, accepted);
    guard(req, new EventEmitter(), (error) => assert.equal(error.status, 409));
    response.emit(i % 2 ? 'finish' : 'close');
  }
  guard(req, new EventEmitter(), accepted);
  guard({ user: { _id: 'u2' } }, new EventEmitter(), accepted);
});
