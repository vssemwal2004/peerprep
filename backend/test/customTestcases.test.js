import assert from 'node:assert/strict';
import test from 'node:test';

for (const key of ['QUEUE_VALKEY_URL', 'VALKEY_URL', 'REDIS_URL', 'VALKEY_HOST', 'REDIS_HOST']) delete process.env[key];
process.env.JUDGE0_URL = 'http://judge-custom.test';
const {
  clearCustomTestcaseCache,
  limitRunTestCases,
  MAX_CUSTOM_TESTCASES,
  pickExpectedOutputReference,
  resolveRunCaseExpectations,
} = await import('../src/services/customTestcaseService.js');

const decode = (value) => Buffer.from(String(value || ''), 'base64').toString();
const encode = (value) => Buffer.from(String(value)).toString('base64');

const problem = {
  _id: 'problem-1',
  executionMode: 'full_program',
  referenceSolutions: { python: 'print(int(input()) * 2)' },
  validatedLanguages: ['python'],
  timeLimitSeconds: 2,
};

// Judge0 stand-in for the reference: doubles the number, fails on non-numeric input.
function mockJudge(calls) {
  return async (_url, options) => {
    const body = JSON.parse(options.body);
    const stdin = decode(body.stdin);
    calls.push({ source: decode(body.source_code), stdin });
    if (!/^-?\d+$/.test(stdin.trim())) {
      return new Response(JSON.stringify({ status: { id: 11, description: 'Runtime Error (NZEC)' }, stderr: encode('ValueError') }));
    }
    return new Response(JSON.stringify({ status: { id: 3, description: 'Accepted' }, stdout: encode(`${Number(stdin) * 2}\n`), time: '0.01', memory: 1000 }));
  };
}

test('reference choice prefers a validated solution, then the student language', () => {
  const choice = pickExpectedOutputReference({
    referenceSolutions: { java: 'class Main {}', cpp: 'int main() {}', python: 'print(1)' },
    validatedLanguages: ['cpp', 'python'],
  }, 'java');
  assert.equal(choice.languageKey, 'cpp');
  assert.equal(pickExpectedOutputReference({ referenceSolutions: { cpp: 'x', python: 'y' }, validatedLanguages: ['cpp', 'python'] }, 'python').languageKey, 'python');
  assert.equal(pickExpectedOutputReference({ referenceSolutions: {} }, 'python'), null);
});

test('run case limit keeps every custom case and trims samples to the shared budget', () => {
  const samples = Array.from({ length: 12 }, (_, index) => ({ id: `s${index}`, kind: 'sample' }));
  const customs = Array.from({ length: 3 }, (_, index) => ({ id: `c${index}`, kind: 'custom' }));
  const limited = limitRunTestCases([...samples, ...customs]);
  assert.equal(limited.length, 12);
  assert.equal(limited.filter((entry) => entry.kind === 'custom').length, 3);
  assert.throws(
    () => limitRunTestCases(Array.from({ length: MAX_CUSTOM_TESTCASES + 1 }, () => ({ kind: 'custom' }))),
    (error) => error.status === 400,
  );
});

test('custom cases get reference output, keep typed output, and report unreadable input', async () => {
  clearCustomTestcaseCache();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = mockJudge(calls);
  try {
    const resolved = await resolveRunCaseExpectations(problem, [
      { id: 'sample-1', kind: 'sample', input: '1', expectedOutput: '2' },
      { id: 'custom-a', kind: 'custom', input: '21' },
      { id: 'custom-b', kind: 'custom', input: '5', expectedOutput: '11' },
      { id: 'custom-c', kind: 'custom', input: 'abc' },
      { id: 'custom-d', kind: 'custom', input: '7', expectedOutput: '   ' },
    ], { languageKey: 'python' });

    assert.deepEqual(resolved.map((entry) => entry.expectedSource), ['sample', 'reference', 'student', null, 'reference']);
    assert.equal(resolved[0].expectedOutput, '2');
    assert.equal(resolved[1].expectedOutput.trim(), '42');
    assert.equal(resolved[2].expectedOutput, '11');
    assert.equal(resolved[3].expectedOutput, undefined);
    assert.match(resolved[3].expectedNote, /could not process this input/);
    assert.equal(resolved[4].expectedOutput.trim(), '14');
    // Only cases without a typed expected output reach the judge, with the reference source.
    assert.deepEqual(calls.map((call) => call.stdin), ['21', 'abc', '7']);
    assert.ok(calls.every((call) => call.source.includes('print(int(input()) * 2)')));

    calls.length = 0;
    const again = await resolveRunCaseExpectations(problem, [{ id: 'x', kind: 'custom', input: '21' }], { languageKey: 'python' });
    assert.equal(again[0].expectedOutput.trim(), '42');
    assert.equal(calls.length, 0, 'repeat input is served from cache');
  } finally {
    globalThis.fetch = originalFetch;
    clearCustomTestcaseCache();
  }
});

test('problems without a reference solution explain that expected output is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('judge must not be called'); };
  try {
    const [entry] = await resolveRunCaseExpectations({ ...problem, referenceSolutions: {} }, [
      { id: 'c', kind: 'custom', input: '3' },
    ]);
    assert.equal(entry.expectedOutput, undefined);
    assert.match(entry.expectedNote, /no reference solution/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
