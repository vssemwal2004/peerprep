import '../src/setup.js';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Problem from '../src/models/Problem.js';
import TestCase from '../src/models/TestCase.js';
import { prepareFunctionSourceForExecution } from '../src/services/functionProblemAdapterService.js';
import { buildFunctionInputPayload } from '../src/services/functionTestInputService.js';
import { KEY_TO_LANGUAGE_ID, runJudge0, evaluateSubmissionResult, buildJudge0Options } from '../src/services/executionService.js';
import { syncProblemToLibrary } from '../src/services/questionLibraryService.js';

// Separate maintenance entrypoint. App source and testcase oracles are untouched.
const languages = ['python', 'c', 'cpp', 'java', 'javascript', 'typescript'];
const arg = (name, fallback) => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const apply = process.argv.includes('--apply');
const limit = Math.max(1, Number(arg('limit', 50)));
const concurrency = Math.min(12, Math.max(1, Number(arg('concurrency', 4))));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const map = value => value instanceof Map ? Object.fromEntries(value) : value || {};
const report = { problems: 0, passed: 0, failed: 0, cached: 0, published: 0, missing: 0 };
let engineHash;

function fingerprint(p, cases, language) {
  return hash({ engineHash, language, languageId: KEY_TO_LANGUAGE_ID[language],
    contract: p.functionContract, mode: p.executionMode,
    reference: map(p.referenceSolutions)[language], template: map(p.codeTemplates)[language],
    harness: map(p.executionHarnesses)[language], limits: buildJudge0Options(p),
    cases: cases.map(t => [String(t._id), t.kind, t.position, t.input, t.output]) });
}

async function inspectProblem(p, db) {
  const cases = await TestCase.find({ problem: p._id }).sort({ kind: -1, position: 1 }).lean();
  const ledger = db.collection('sixLanguageValidation');
  if (apply) await db.collection('sixLanguageBackups').updateOne({ _id: p._id }, {
    $setOnInsert: { problem: p, cases, capturedAt: new Date() },
  }, { upsert: true });
  let dataError = '';
  if (cases.filter(t => t.kind === 'sample').length < 3 || cases.filter(t => t.kind === 'hidden').length < 10) dataError = 'INSUFFICIENT_CASES';
  try {
    for (const t of cases) {
      const payload = buildFunctionInputPayload(t.input, p.functionContract);
      if (payload.args.length !== p.functionContract?.parameters?.length) throw new Error('Argument count mismatch');
    }
  } catch (e) { dataError = `INPUT_CONTRACT_ERROR: ${e.message}`; }
  const outcomes = [];
  // All language jobs share the bounded problem worker pool; each case gets a fresh process.
  for (const language of languages) {
    const digest = fingerprint(p, cases, language);
    const key = { problem: p._id, language, digest };
    const previous = await ledger.findOne(key);
    if (previous && (previous.status === 'passed' || !process.argv.includes('--retry-failed'))) {
      outcomes.push(previous); report.cached++; continue;
    }
    let failure = dataError ? { status: dataError } : null;
    const reference = map(p.referenceSolutions)[language];
    if (!reference || !map(p.codeTemplates)[language] || !map(p.executionHarnesses)[language]) {
      failure = { status: 'MISSING_ARTIFACT', reference: !!reference,
        template: !!map(p.codeTemplates)[language], harness: !!map(p.executionHarnesses)[language] };
      report.missing++;
    }
    let passedCases = 0;
    for (const t of failure ? [] : cases) {
      try {
        const source = prepareFunctionSourceForExecution(p, language, reference, t.input);
        const result = await runJudge0(source, KEY_TO_LANGUAGE_ID[language], t.input, buildJudge0Options(p));
        const evaluation = evaluateSubmissionResult(result, t.output);
        // Judge0 must explicitly report successful execution. Never infer success from matching empty output.
        if (Number(result.status?.id) !== 3 || evaluation.internalStatus !== 'AC') {
          failure = { status: evaluation.internalStatus === 'AC' ? 'JUDGE_ERROR' : evaluation.internalStatus,
            caseId: String(t._id), kind: t.kind, position: t.position,
            actual: String(result.stdout || '').slice(0, 3000), expected: t.output,
            error: String(evaluation.error || result.compile_output || result.stderr || '').slice(0, 3000) };
          break;
        }
        passedCases++;
      } catch (e) { failure = { status: 'EXECUTION_ERROR', caseId: String(t._id), error: e.message }; break; }
    }
    const record = { ...key, title: p.title, status: failure ? 'failed' : 'passed',
      passedCases, totalCases: cases.length, failure, checkedAt: new Date() };
    outcomes.push(record);
    report[failure ? 'failed' : 'passed']++;
    if (apply) await ledger.updateOne(key, { $set: record }, { upsert: true });
    console.log(JSON.stringify({ title: p.title, language, status: failure?.status || 'AC', passedCases, total: cases.length }));
  }
  const fresh = await Problem.findById(p._id).select('+executionHarnesses').lean();
  const freshCases = await TestCase.find({ problem: p._id }).sort({ kind: -1, position: 1 }).lean();
  const complete = languages.every(language => outcomes.some(v => v.language === language && v.status === 'passed'
    && v.digest === fingerprint(fresh, freshCases, language) && v.passedCases === freshCases.length));
  // Optimistic document-version guard prevents publishing a concurrently edited problem.
  if (apply && complete) {
    const result = await Problem.updateOne({ _id: p._id, updatedAt: fresh.updatedAt }, { $set: {
      supportedLanguages: languages, validatedLanguages: languages, status: 'published', visibility: 'public',
      previewValidated: true, previewTested: true, publishedAt: new Date(),
    } });
    if (result.modifiedCount) {
      await syncProblemToLibrary(await Problem.findById(p._id).select('+executionHarnesses').lean());
      report.published++;
    }
  }
  report.problems++;
  console.log(JSON.stringify({ progress: report }));
}

try {
  if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'memory') throw new Error('Persistent MongoDB URI required');
  // No in-memory fallback: this maintenance job must use the configured database.
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, autoIndex: false });
  const dependencies = ['validateSixLanguageQueue.js', '../src/services/executionService.js',
    '../src/services/functionProblemAdapterService.js', '../src/services/functionTestInputService.js'];
  engineHash = hash(await Promise.all(dependencies.map(f => readFile(new URL(f, import.meta.url), 'utf8'))));
  const db = mongoose.connection.db;
  if (apply) await db.collection('sixLanguageValidation').createIndex({ problem: 1, language: 1, digest: 1 }, { unique: true });
  const query = { category: { $ne: 'SQL' }, executionMode: 'function', status: { $ne: 'published' } };
  if (arg('problem-id', '')) query._id = new mongoose.Types.ObjectId(arg('problem-id', ''));
  const items = await Problem.find(query).select('+executionHarnesses').sort({ _id: 1 }).skip(Number(arg('offset', 0))).limit(limit).lean();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) await inspectProblem(items[cursor++], db);
  }));
  console.log(JSON.stringify({ final: report }));
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
