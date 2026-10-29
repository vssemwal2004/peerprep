import assert from 'node:assert/strict';
import test from 'node:test';

for (const key of ['QUEUE_VALKEY_URL', 'VALKEY_URL', 'REDIS_URL', 'VALKEY_HOST', 'REDIS_HOST']) delete process.env[key];
process.env.JUDGE0_URL = 'http://judge-batch.test';
const { buildStoredZip, createCaseExecutor, parseBatchOutput } = await import('../src/services/batchExecutionService.js');

const marker = (index, code, ms, out) => `\n@@PPCASE ${index} ${code} ${ms} ${Buffer.byteLength(out)}@@\n${out}`;

function readZip(base64) {
  const zip = Buffer.from(base64, 'base64');
  const files = {};
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength;
    files[name] = zip.subarray(start, start + size).toString();
    offset = start + size;
  }
  return files;
}

test('batch output is split by exact byte length, including multibyte and marker-like output', () => {
  const tricky = 'naïve\n@@PPCASE 9 0 1 1@@\nx';
  const parsed = parseBatchOutput(marker(0, 0, 12, '[0,1]') + marker(1, 0, 3, tricky) + marker(2, 137, 5000, ''));
  assert.equal(parsed.get(0).stdout, '[0,1]');
  assert.equal(parsed.get(1).stdout, tricky);
  assert.equal(parsed.get(2).exitCode, 137);
  assert.equal(parsed.has(9), false);
});

test('stored zip round-trips names and contents', () => {
  const files = readZip(buildStoredZip({ compile: 'g++ main.cpp\n', 'c0/Main.java': 'package c0;\nclass Main {}' }).toString('base64'));
  assert.deepEqual(files, { compile: 'g++ main.cpp\n', 'c0/Main.java': 'package c0;\nclass Main {}' });
});

test('one compile serves clean accepted cases; failing, slow or missing cases are re-judged one by one', async () => {
  const originalFetch = globalThis.fetch;
  const sources = [0, 1, 2, 3].map((index) => `#include <bits/stdc++.h>\nusing namespace std;\nint main() { cout << ${index}; }\n`);
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    if (body.language_id === 89) {
      const files = readZip(body.additional_files);
      assert.match(files['main.cpp'], /namespace __pp_case_3/);
      assert.equal((files['main.cpp'].match(/#include <bits\/stdc\+\+\.h>/g) || []).length, 1);
      // case 0 accepted, case 1 slow, case 2 wrong exit code; case 3 never ran
      const stdout = marker(0, 0, 10, '0') + marker(1, 0, 4000, '1') + marker(2, 1, 10, '');
      return new Response(JSON.stringify({ status: { id: 3 }, stdout: Buffer.from(stdout).toString('base64'), memory: 3000 }));
    }
    const source = Buffer.from(body.source_code, 'base64').toString();
    return new Response(JSON.stringify({ status: { id: 3 }, stdout: Buffer.from(source.match(/cout << (\d)/)[1]).toString('base64') }));
  };
  try {
    const executor = createCaseExecutor({
      languageId: 54,
      cases: sources.map((source, index) => ({ source, stdin: '', expectedOutput: String(index) })),
      judge0Options: { cpuTimeLimitSeconds: 5 },
      accept: (index, result) => result.stdout === String(index),
    });
    const results = [];
    for (let index = 0; index < 4; index += 1) results.push(await executor.run(index));
    assert.deepEqual(results.map((result) => result.stdout), ['0', '1', '2', '3']);
    assert.deepEqual(results.map((result) => Boolean(result.batched)), [true, false, false, false]);
    assert.equal(bodies.filter((body) => body.language_id === 89).length, 1);
    assert.equal(bodies.filter((body) => body.language_id === 54).length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a batch compile error falls back to per-case judging so the real diagnostics are reported', async () => {
  const originalFetch = globalThis.fetch;
  let single = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.language_id === 89) return new Response(JSON.stringify({ status: { id: 6 }, compile_output: Buffer.from('wrapped').toString('base64') }));
    single += 1;
    return new Response(JSON.stringify({ status: { id: 6, description: 'Compilation Error' }, compile_output: Buffer.from('real error').toString('base64') }));
  };
  try {
    const executor = createCaseExecutor({
      languageId: 62,
      cases: [1, 2].map(() => ({ source: 'public class Main { public static void main(String[] a) { x } }', stdin: '' })),
      judge0Options: { cpuTimeLimitSeconds: 2 },
    });
    const first = await executor.run(0);
    await executor.run(1);
    assert.equal(first.compile_output, 'real error');
    assert.equal(single, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('python and single-case jobs never use the batch path', async () => {
  const originalFetch = globalThis.fetch;
  const ids = [];
  globalThis.fetch = async (_url, options) => {
    ids.push(JSON.parse(options.body).language_id);
    return new Response(JSON.stringify({ status: { id: 3 }, stdout: '' }));
  };
  try {
    await createCaseExecutor({ languageId: 71, cases: [{ source: 'print(1)' }, { source: 'print(2)' }] }).run(0);
    await createCaseExecutor({ languageId: 54, cases: [{ source: 'int main(){}' }] }).run(0);
    assert.deepEqual(ids, [71, 54]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
