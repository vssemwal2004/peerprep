import crypto from 'node:crypto';
import { createCaseExecutor } from './batchExecutionService.js';
import { buildJudge0Options, KEY_TO_LANGUAGE_ID, mapRunStatusCode } from './executionService.js';
import { prepareFunctionSourceForExecution } from './functionProblemAdapterService.js';
import { HttpError } from '../utils/errors.js';

// Student-written testcases on Run. Expected output comes from the student when they type one,
// otherwise from the problem's reference solution, run through the same function harness that
// wraps student code, so function-style problems get the exact stdout format the checker expects.
export const MAX_CUSTOM_TESTCASES = 6;
export const MAX_RUN_TESTCASES = 12;

const CACHE_LIMIT = 1000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const expectedOutputCache = new Map();

const NOTE_NO_REFERENCE = 'This problem has no reference solution, so expected output is not available. Type your own expected output to compare.';
const NOTE_REFERENCE_FAILED = 'The reference solution could not process this input. Check that it follows the input format and constraints.';
const NOTE_REFERENCE_TLE = 'The reference solution ran out of time on this input. Check that it is within the problem constraints.';
const NOTE_UNAVAILABLE = 'Expected output could not be generated right now. Run again in a moment.';

function hash(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function asObject(value) {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return value && typeof value === 'object' ? value : {};
}

export function isCustomRunCase(entry) {
  return String(entry?.kind || '') === 'custom';
}

export function hasStudentExpectedOutput(entry) {
  return entry?.expectedOutput !== undefined
    && entry?.expectedOutput !== null
    && String(entry.expectedOutput).trim() !== '';
}

/**
 * Keeps every custom case (up to MAX_CUSTOM_TESTCASES) and fills the rest of the
 * MAX_RUN_TESTCASES budget with sample cases, preserving the original order.
 */
export function limitRunTestCases(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  const customCount = list.filter(isCustomRunCase).length;
  if (customCount > MAX_CUSTOM_TESTCASES) {
    throw new HttpError(400, `You can run at most ${MAX_CUSTOM_TESTCASES} custom testcases at a time.`);
  }
  let sampleBudget = MAX_RUN_TESTCASES - customCount;
  return list.filter((entry) => {
    if (isCustomRunCase(entry)) return true;
    if (sampleBudget <= 0) return false;
    sampleBudget -= 1;
    return true;
  });
}

/**
 * Picks the reference solution used to generate expected output. A language whose
 * reference passed preview validation wins over an unvalidated one; within that, the
 * student's language wins so the output format matches theirs as closely as possible.
 */
export function pickExpectedOutputReference(problem, preferredLanguageKey = '') {
  const preferred = String(preferredLanguageKey || '').trim().toLowerCase();
  const validated = new Set((Array.isArray(problem?.validatedLanguages) ? problem.validatedLanguages : [])
    .map((entry) => String(entry || '').toLowerCase()));
  const candidates = Object.entries(asObject(problem?.referenceSolutions))
    .map(([languageKey, sourceCode]) => ({
      languageKey: String(languageKey || '').trim().toLowerCase(),
      sourceCode: String(sourceCode ?? ''),
    }))
    .filter((entry) => entry.languageKey && entry.sourceCode.trim() && KEY_TO_LANGUAGE_ID[entry.languageKey]);
  if (!candidates.length) return null;

  const rank = (entry) => (validated.size && !validated.has(entry.languageKey) ? 2 : 0)
    + (entry.languageKey === preferred ? 0 : 1);
  return candidates
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => rank(left.entry) - rank(right.entry) || left.index - right.index)[0].entry;
}

function readCache(key) {
  const hit = expectedOutputCache.get(key);
  if (!hit) return null;
  if (hit.until < Date.now()) {
    expectedOutputCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key, value) {
  if (expectedOutputCache.size >= CACHE_LIMIT) {
    expectedOutputCache.delete(expectedOutputCache.keys().next().value);
  }
  expectedOutputCache.set(key, { value, until: Date.now() + CACHE_TTL_MS });
}

export function clearCustomTestcaseCache() {
  expectedOutputCache.clear();
}

/**
 * Generates expected output for each input with the problem's reference solution.
 * Returns one { expectedOutput: string|null, note: string, source: 'reference'|null } per input,
 * in order. Never throws for a single bad input; a Judge0 outage marks the affected cases unavailable.
 */
export async function generateReferenceExpectedOutputs(problem, inputs = [], { languageKey = '' } = {}) {
  const list = Array.isArray(inputs) ? inputs.map((value) => String(value ?? '')) : [];
  if (!list.length) return [];

  const reference = pickExpectedOutputReference(problem, languageKey);
  if (!reference) return list.map(() => ({ expectedOutput: null, note: NOTE_NO_REFERENCE, source: null }));

  const referenceLanguageId = KEY_TO_LANGUAGE_ID[reference.languageKey];
  const judge0Options = buildJudge0Options(problem);
  const optionsKey = hash(JSON.stringify(judge0Options));
  const results = new Array(list.length).fill(null);
  const pending = [];

  list.forEach((input, index) => {
    let source;
    try {
      source = prepareFunctionSourceForExecution(problem, reference.languageKey, reference.sourceCode, input);
    } catch {
      results[index] = { expectedOutput: null, note: NOTE_REFERENCE_FAILED, source: null };
      return;
    }
    const cacheKey = hash([String(problem?._id || ''), reference.languageKey, hash(source), hash(input), optionsKey].join('\u0000'));
    const cached = readCache(cacheKey);
    if (cached) {
      results[index] = cached;
      return;
    }
    pending.push({ index, cacheKey, source, stdin: input });
  });

  if (pending.length) {
    const executor = createCaseExecutor({
      languageId: referenceLanguageId,
      cases: pending.map(({ source, stdin }) => ({ source, stdin })),
      judge0Options,
    });
    for (let position = 0; position < pending.length; position += 1) {
      const { index, cacheKey } = pending[position];
      let judgeResult;
      try {
        judgeResult = await executor.run(position);
      } catch {
        results[index] = { expectedOutput: null, note: NOTE_UNAVAILABLE, source: null };
        continue;
      }
      const status = mapRunStatusCode(judgeResult);
      if (status === 'AC') {
        const value = { expectedOutput: String(judgeResult.stdout ?? ''), note: '', source: 'reference' };
        writeCache(cacheKey, value);
        results[index] = value;
      } else if (status === 'TLE') {
        // Not cached: a time limit can be load-dependent.
        results[index] = { expectedOutput: null, note: NOTE_REFERENCE_TLE, source: null };
      } else if (status === 'IE') {
        results[index] = { expectedOutput: null, note: NOTE_UNAVAILABLE, source: null };
      } else {
        const value = { expectedOutput: null, note: NOTE_REFERENCE_FAILED, source: null };
        writeCache(cacheKey, value);
        results[index] = value;
      }
    }
  }

  return results;
}

/**
 * Fills expectedOutput on run cases. Sample cases keep theirs; a custom case keeps the
 * student's typed expected output, otherwise gets the reference output (or null + a note).
 */
export async function resolveRunCaseExpectations(problem, runTestCases = [], { languageKey = '' } = {}) {
  const cases = Array.isArray(runTestCases) ? runTestCases : [];
  const needsReference = [];
  const resolved = cases.map((entry, index) => {
    if (!isCustomRunCase(entry)) {
      const hasExpected = entry.expectedOutput !== undefined && entry.expectedOutput !== null;
      return { ...entry, expectedSource: hasExpected ? 'sample' : null, expectedNote: '' };
    }
    if (hasStudentExpectedOutput(entry)) {
      return { ...entry, expectedSource: 'student', expectedNote: '' };
    }
    needsReference.push(index);
    return { ...entry, expectedOutput: undefined, expectedSource: null, expectedNote: '' };
  });

  if (!needsReference.length || !problem) {
    needsReference.forEach((index) => { resolved[index].expectedNote = problem ? '' : NOTE_NO_REFERENCE; });
    return resolved;
  }

  const generated = await generateReferenceExpectedOutputs(
    problem,
    needsReference.map((index) => resolved[index].input ?? ''),
    { languageKey },
  );
  needsReference.forEach((caseIndex, position) => {
    const outcome = generated[position];
    resolved[caseIndex] = {
      ...resolved[caseIndex],
      expectedOutput: outcome?.expectedOutput ?? undefined,
      expectedSource: outcome?.source || null,
      expectedNote: outcome?.note || '',
    };
  });
  return resolved;
}
