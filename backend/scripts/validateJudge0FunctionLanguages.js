import '../src/setup.js';

import Problem from '../src/models/Problem.js';
import TestCase from '../src/models/TestCase.js';
import { KEY_TO_LANGUAGE_ID, evaluateSubmissionResult, runJudge0 } from '../src/services/executionService.js';
import { prepareFunctionSourceForExecution } from '../src/services/functionProblemAdapterService.js';
import { buildFunctionInputPayload } from '../src/services/functionTestInputService.js';
import { syncProblemToLibrary } from '../src/services/questionLibraryService.js';
import { closeDb, connectDb } from '../src/utils/db.js';

function codeMap(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return typeof value === 'object' ? value : {};
}

function parseArgs(argv) {
  const languageArgument = argv.find((argument) => argument.startsWith('--language='));
  const language = String(languageArgument?.split('=')[1] || '').trim().toLowerCase();
  if (!KEY_TO_LANGUAGE_ID[language]) throw new Error('Pass a Judge0 language with --language=<id>.');
  const limitArgument = argv.find((argument) => argument.startsWith('--limit='));
  const problemArgument = argv.find((argument) => argument.startsWith('--problem-id='));
  const concurrencyArgument = argv.find((argument) => argument.startsWith('--concurrency='));
  const requireArgument = argv.find((argument) => argument.startsWith('--require-validated='));
  return {
    apply: argv.includes('--apply'),
    publishComplete: argv.includes('--publish-complete'),
    onlyUnvalidated: argv.includes('--only-unvalidated'),
    language,
    limit: Math.max(0, Number(limitArgument?.split('=')[1]) || 0),
    problemId: String(problemArgument?.split('=')[1] || '').trim(),
    concurrency: Math.min(12, Math.max(1, Number(concurrencyArgument?.split('=')[1]) || 4)),
    requiredLanguages: String(requireArgument?.split('=')[1] || '').split(',').map((entry) => entry.trim()).filter(Boolean),
  };
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

function parseArrayOutput(value) {
  const normalized = String(value || '').trim().replace(/\bNone\b/g, 'null').replace(/'/g, '"');
  try { return JSON.parse(normalized); } catch { return null; }
}

function canonicalUnordered(value, nested = false) {
  if (!Array.isArray(value)) return value;
  const entries = value.map((entry) => canonicalUnordered(entry, true));
  if (nested) entries.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return entries.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function acceptsEquivalentOutput(problem, testCase, actualOutput) {
  const expected = String(testCase.output || '').trim();
  const actual = String(actualOutput || '').trim();
  const returnType = String(problem.functionContract?.returnType || '').toLowerCase();
  if (returnType.endsWith('[]') && expected === 'None' && actual === '[]') return true;
  const methodName = String(problem.functionContract?.methodName || '').toLowerCase();
  const args = buildFunctionInputPayload(testCase.input || '', problem.functionContract).args;
  const unorderedMethods = new Set([
    'findrepeateddnasequences', 'subsets', 'subsetswithdup', 'permute', 'permuteunique',
    'majorityelement', 'findwords', 'palindromepairs', 'groupanagrams', 'intersection',
    'topkfrequent', 'findkpairswithsmallestsums', 'pacificatlantic', 'accountsmerge',
  ]);
  if (unorderedMethods.has(methodName)) {
    const actualValue = parseArrayOutput(actual);
    const expectedValue = parseArrayOutput(expected);
    if (Array.isArray(actualValue) && Array.isArray(expectedValue)) {
      return JSON.stringify(canonicalUnordered(actualValue)) === JSON.stringify(canonicalUnordered(expectedValue));
    }
  }
  if (methodName === 'wigglesort' || methodName === 'wigglesortii') {
    const values = parseArrayOutput(actual);
    const input = Array.isArray(args[0]) ? args[0] : [];
    if (!Array.isArray(values) || values.length !== input.length) return false;
    const sameValues = [...values].sort((a, b) => a - b).every((value, index) => value === [...input].sort((a, b) => a - b)[index]);
    return sameValues && values.every((value, index) => index === 0
      || (index % 2 === 1 ? value > values[index - 1] : value < values[index - 1]));
  }
  if (methodName === 'longestpalindrome') {
    const source = String(args[0] || '');
    return actual.length === expected.length && source.includes(actual) && actual === [...actual].reverse().join('');
  }
  if (methodName === 'twosum') {
    const values = Array.isArray(args[0]) ? args[0] : [];
    const target = Number(args[1]);
    const indices = parseArrayOutput(actual);
    if (!Array.isArray(indices)) return false;
    if (indices.length === 0 && expected === 'None') return true;
    return indices.length === 2
      && indices[0] !== indices[1]
      && indices.every((index) => Number.isInteger(index) && index >= 0 && index < values.length)
      && Number(values[indices[0]]) + Number(values[indices[1]]) === target;
  }
  return false;
}

function judgeOptions(problem) {
  const timeLimit = Number(problem.timeLimitSeconds || 2);
  return {
    cpuTimeLimitSeconds: timeLimit,
    wallTimeLimitSeconds: Math.max(5, timeLimit * 2),
    memoryLimitKb: Math.trunc(Number(problem.memoryLimitMb || 256) * 1024),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await connectDb();
  const query = {
    supportedLanguages: options.language,
    [`referenceSolutions.${options.language}`]: { $exists: true, $ne: '' },
    [`executionHarnesses.${options.language}`]: { $exists: true, $ne: '' },
    ...(options.onlyUnvalidated ? { validatedLanguages: { $ne: options.language } } : {}),
    ...(options.requiredLanguages.length ? { $and: options.requiredLanguages.map((entry) => ({ validatedLanguages: entry })) } : {}),
    ...(options.problemId ? { _id: options.problemId } : {}),
  };
  const problems = await Problem.find(query)
    .select('+executionHarnesses')
    .sort({ _id: 1 }).limit(options.limit);
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];
  let processed = 0;
  await mapConcurrent(problems, options.concurrency, async (problem) => {
    const reference = String(codeMap(problem.referenceSolutions)[options.language] || '');
    const runner = String(codeMap(problem.executionHarnesses)[options.language] || '');
    if (!reference.trim() || (problem.executionMode === 'function' && !runner.trim())) {
      skipped += 1;
      processed += 1;
      return;
    }
    const testCases = await TestCase.find({ problem: problem._id })
      .select('kind position input output').sort({ kind: -1, position: 1 }).lean();
    let failure = null;
    for (let caseIndex = 0; caseIndex < testCases.length; caseIndex += 1) {
      const testCase = testCases[caseIndex];
      try {
        const sourceCode = prepareFunctionSourceForExecution(
          problem,
          options.language,
          reference,
          testCase.input || '',
        );
        const result = await runJudge0(
          sourceCode,
          KEY_TO_LANGUAGE_ID[options.language],
          testCase.input || '',
          judgeOptions(problem),
        );
        const evaluation = evaluateSubmissionResult(result, testCase.output || '');
        if (evaluation.internalStatus !== 'AC'
          && !(evaluation.internalStatus === 'WA' && acceptsEquivalentOutput(problem, testCase, result.stdout))) {
          failure = {
            case: caseIndex + 1,
            kind: testCase.kind,
            status: evaluation.internalStatus,
            error: String(evaluation.error || result.compile_output || result.stderr || '').slice(0, 500),
            actual: String(result.stdout || '').slice(0, 500),
            expected: String(testCase.output || '').slice(0, 500),
          };
          break;
        }
      } catch (error) {
        failure = { case: caseIndex + 1, kind: testCase.kind, status: 'ERROR', error: error.message };
        break;
      }
    }
    if (failure || !testCases.length) {
      failed += 1;
      failures.push({ id: problem._id, title: problem.title, ...(failure || { status: 'NO_TESTS' }) });
      if (options.apply) {
        await Problem.updateOne({ _id: problem._id }, {
          $set: { previewValidated: false, previewTested: false, status: 'draft' },
          $pull: { validatedLanguages: options.language },
        });
        await syncProblemToLibrary(await Problem.findById(problem._id).select('+executionHarnesses').lean());
      }
    } else {
      passed += 1;
      if (options.apply) {
        await Problem.updateOne({ _id: problem._id }, {
          $addToSet: { validatedLanguages: options.language },
        });
        const updated = await Problem.findById(problem._id).select('+executionHarnesses');
        const complete = updated.supportedLanguages.every((language) => updated.validatedLanguages.includes(language));
        updated.previewValidated = complete;
        updated.previewTested = complete;
        if (complete && options.publishComplete) {
          updated.status = 'published';
          updated.visibility = 'public';
          updated.publishedAt = new Date();
        }
        await updated.save();
        if (complete) await syncProblemToLibrary(updated.toObject());
      }
    }
    processed += 1;
    if (processed % 25 === 0 || processed === problems.length || failure) {
      console.log(`[judge0:${options.language}] ${processed}/${problems.length} ${failure ? failure.status : 'AC'} ${problem.title}`);
    }
  });
  console.log(JSON.stringify({
    apply: options.apply,
    language: options.language,
    concurrency: options.concurrency,
    scanned: problems.length,
    passed,
    failed,
    skipped,
    firstFailures: failures.slice(0, 20),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
