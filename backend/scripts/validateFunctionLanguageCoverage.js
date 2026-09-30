import '../src/setup.js';

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Problem from '../src/models/Problem.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import TestCase from '../src/models/TestCase.js';
import { closeDb, connectDb } from '../src/utils/db.js';

const VALIDATOR_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'validateFunctionProblem.py');
const BATCH_SIZE = 100;

function parseArgs(argv) {
  const concurrencyArg = argv.find((arg) => arg.startsWith('--concurrency='));
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const problemIdArg = argv.find((arg) => arg.startsWith('--problem-id='));
  const timeoutArg = argv.find((arg) => arg.startsWith('--timeout-ms='));
  return {
    apply: argv.includes('--apply'),
    publishComplete: argv.includes('--publish-complete'),
    concurrency: Math.min(12, Math.max(1, Number(concurrencyArg?.split('=')[1]) || 6)),
    limit: Math.max(0, Number(limitArg?.split('=')[1]) || 0),
    problemId: String(problemIdArg?.split('=')[1] || '').trim(),
    timeoutMs: Math.min(120_000, Math.max(5_000, Number(timeoutArg?.split('=')[1]) || 20_000)),
  };
}

function codeMap(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return typeof value === 'object' ? value : {};
}

function normalize(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function validatePythonSource(source, inputs, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    const child = spawn(process.env.PYTHON_BIN || 'python', [VALIDATOR_PATH], { windowsHide: true });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, reason: 'validation timed out' });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => finish({ ok: false, reason: error.message }));
    child.on('close', (status) => {
      if (status !== 0) {
        finish({
          ok: false,
          reason: Buffer.concat(stderr).toString('utf8').trim().slice(0, 500) || `Python exited ${status}`,
        });
        return;
      }
      try {
        finish({ ok: true, outputs: JSON.parse(Buffer.concat(stdout).toString('utf8')) });
      } catch (error) {
        finish({ ok: false, reason: `invalid validator output: ${error.message}` });
      }
    });
    child.stdin.end(JSON.stringify({ source, inputs }));
  });
}

async function mapConcurrent(items, concurrency, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await connectDb();
  const query = {
    'supportedLanguages.0': { $exists: true },
    ...(options.problemId ? { _id: options.problemId } : {}),
  };
  const problems = await Problem.find(query)
    .select('_id title supportedLanguages referenceSolutions validatedLanguages status')
    .sort({ _id: 1 })
    .limit(options.limit || 0)
    .lean();
  const testcaseRows = await TestCase.find({ problem: { $in: problems.map((problem) => problem._id) } })
    .select('problem kind position input output')
    .sort({ problem: 1, kind: 1, position: 1 })
    .lean();
  const casesByProblem = new Map();
  testcaseRows.forEach((testCase) => {
    const key = String(testCase.problem);
    if (!casesByProblem.has(key)) casesByProblem.set(key, []);
    casesByProblem.get(key).push(testCase);
  });

  const results = [];
  let checked = 0;
  await mapConcurrent(problems, options.concurrency, async (problem) => {
    const reference = String(codeMap(problem.referenceSolutions).python || '');
    const testCases = casesByProblem.get(String(problem._id)) || [];
    if (!problem.supportedLanguages.includes('python')) {
      results.push({ problem, status: 'skipped', reason: 'python is not enabled' });
    } else if (!reference.trim()) {
      results.push({ problem, status: 'failed', reason: 'missing Python reference solution' });
    } else if (!testCases.length) {
      results.push({ problem, status: 'failed', reason: 'missing testcases' });
    } else {
      const validation = await validatePythonSource(reference, testCases.map((testCase) => testCase.input), options.timeoutMs);
      if (!validation.ok) {
        results.push({ problem, status: 'failed', reason: validation.reason });
      } else {
        const mismatch = testCases.findIndex((testCase, index) => normalize(validation.outputs[index]) !== normalize(testCase.output));
        results.push(mismatch >= 0
          ? { problem, status: 'failed', reason: `output mismatch at testcase ${mismatch + 1}` }
          : { problem, status: 'passed', testCount: testCases.length });
      }
    }
    checked += 1;
    if (checked % 100 === 0 || checked === problems.length) {
      console.log(`[validate] ${checked}/${problems.length}`);
    }
  });

  if (options.apply) {
    for (let offset = 0; offset < results.length; offset += BATCH_SIZE) {
      const batch = results.slice(offset, offset + BATCH_SIZE);
      const problemOps = [];
      const libraryOps = [];
      batch.forEach((result) => {
        if (result.status !== 'passed') return;
        const existing = Array.isArray(result.problem.validatedLanguages) ? result.problem.validatedLanguages : [];
        const validatedLanguages = [...new Set([...existing, 'python'])]
          .filter((language) => result.problem.supportedLanguages.includes(language));
        const fullyValidated = result.problem.supportedLanguages.every((language) => validatedLanguages.includes(language));
        const publish = fullyValidated && options.publishComplete;
        const set = {
          executionMode: 'function',
          showExecutionHarness: false,
          validatedLanguages,
          previewValidated: fullyValidated,
          previewTested: fullyValidated,
          ...(publish ? { status: 'published', visibility: 'public', publishedAt: new Date() } : {}),
        };
        problemOps.push({ updateOne: { filter: { _id: result.problem._id }, update: { $set: set } } });
        libraryOps.push({ updateOne: { filter: { sourceType: 'compiler', sourceProblemId: result.problem._id }, update: { $set: {
          'questionData.problemDataSnapshot.executionMode': 'function',
          'questionData.problemDataSnapshot.showExecutionHarness': false,
          'questionData.problemDataSnapshot.validatedLanguages': validatedLanguages,
          'questionData.problemDataSnapshot.previewValidated': fullyValidated,
          ...(publish ? {
            status: 'published',
            'questionData.problemDataSnapshot.status': 'published',
            'questionData.problemDataSnapshot.visibility': 'public',
            'questionData.problemDataSnapshot.publishedAt': new Date(),
          } : {}),
          lastSyncedAt: new Date(),
        } } } });
      });
      if (problemOps.length) await Problem.bulkWrite(problemOps, { ordered: false });
      if (libraryOps.length) await QuestionLibrary.bulkWrite(libraryOps, { ordered: false });
    }
  }

  const passed = results.filter((result) => result.status === 'passed');
  const failed = results.filter((result) => result.status === 'failed');
  const fullyValidated = passed.filter((result) => result.problem.supportedLanguages.every((language) => language === 'python'));
  console.log(JSON.stringify({
    apply: options.apply,
    publishComplete: options.publishComplete,
    scanned: problems.length,
    passed: passed.length,
    failed: failed.length,
    skipped: results.length - passed.length - failed.length,
    fullyValidated: fullyValidated.length,
    firstFailures: failed.slice(0, 20).map((result) => ({
      id: result.problem._id,
      title: result.problem.title,
      reason: result.reason,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
