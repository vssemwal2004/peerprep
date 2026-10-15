import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, pickPracticeLanguage, rememberPracticeLanguage, api;
const saved = [];

before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ api } = await server.ssrLoadModule('/src/utils/api.js'));
  api.savePracticeLanguage = async (language) => { saved.push(language); return { practiceLanguage: language }; };
  ({ pickPracticeLanguage, rememberPracticeLanguage } = await server.ssrLoadModule('/src/student/practiceLanguage.js'));
});
after(async () => { await server?.close(); });

const ALL = ['c', 'cpp', 'java', 'javascript', 'python', 'typescript'];

test('a problem opens in the stored language when it offers it, else keeps the current one, else its first', () => {
  const student = { _id: 'stored', role: 'student', practiceLanguage: 'java' };
  assert.equal(pickPracticeLanguage(student, ALL, 'python'), 'java');
  assert.equal(pickPracticeLanguage(student, ['python', 'cpp'], 'cpp'), 'cpp');
  assert.equal(pickPracticeLanguage(student, ['sql']), 'sql');
  assert.equal(pickPracticeLanguage(null, [], ''), 'python');
});

test('the language last used by a student becomes the default for the next question, without reloading', () => {
  const student = { _id: 'solver', role: 'student', practiceLanguage: '' };
  assert.equal(pickPracticeLanguage(student, ALL, 'python'), 'python');
  rememberPracticeLanguage(student, 'c');
  assert.equal(pickPracticeLanguage(student, ALL, 'python'), 'c', 'The cached /auth/me user has no language yet; the session copy fills in');
  assert.deepEqual(saved, ['c']);
  rememberPracticeLanguage(student, 'c');
  rememberPracticeLanguage(student, 'sql');
  assert.deepEqual(saved, ['c'], 'Unchanged and SQL-only choices are not saved');
  assert.equal(pickPracticeLanguage({ _id: 'someone-else', role: 'student' }, ALL, 'python'), 'python', 'Each student keeps their own');
  rememberPracticeLanguage({ _id: 'coordinator', role: 'coordinator' }, 'java');
  assert.deepEqual(saved, ['c'], 'Only students have a practice language');
});
