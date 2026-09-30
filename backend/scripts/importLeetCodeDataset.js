import '../src/setup.js';

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { parse as parseCsv } from 'csv-parse/sync';
import mongoose from 'mongoose';

import CodingTag from '../src/models/CodingTag.js';
import CodingTopic from '../src/models/CodingTopic.js';
import Problem from '../src/models/Problem.js';
import TestCase from '../src/models/TestCase.js';
import User from '../src/models/User.js';
import { syncProblemToLibrary } from '../src/services/questionLibraryService.js';
import { closeDb, connectDb } from '../src/utils/db.js';

const DATASET_VERSION = 'v0.3.1';
const PROVIDER = 'leetcode-dataset';
const SAMPLE_COUNT = 3;
const VALIDATOR_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'validateFunctionProblem.py');
const SNIPPET_LANGUAGE_MAP = {
  c: 'c', cpp: 'cpp', java: 'java', python3: 'python', javascript: 'javascript',
  typescript: 'typescript', csharp: 'csharp', php: 'php', golang: 'go', rust: 'rust',
  kotlin: 'kotlin', ruby: 'ruby', swift: 'swift',
};

// Kept in a separate collection so the application schemas/source remain untouched.
const registrySchema = new mongoose.Schema({
  provider: { type: String, required: true },
  externalId: { type: String, required: true },
  externalSlug: { type: String, required: true },
  datasetVersion: { type: String, required: true },
  sourceUrl: { type: String, default: '' },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  importedAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'question_import_registry' });
registrySchema.index({ provider: 1, externalId: 1 }, { unique: true });
const ImportRegistry = mongoose.models.QuestionImportRegistry
  || mongoose.model('QuestionImportRegistry', registrySchema);

function parseArgs(argv) {
  const options = {
    commit: false, publish: false, validate: true, updateExisting: true,
    datasetDir: '', titlesCsv: '', detailsJson: '', hiddenCases: 10, limit: Infinity, concurrency: 4,
  };
  for (const arg of argv) {
    if (arg === '--commit') options.commit = true;
    else if (arg === '--publish') options.publish = true;
    else if (arg === '--no-validate') options.validate = false;
    else if (arg === '--skip-existing') options.updateExisting = false;
    else if (arg.startsWith('--dataset-dir=')) options.datasetDir = arg.slice(14);
    else if (arg.startsWith('--titles-csv=')) options.titlesCsv = arg.slice(13);
    else if (arg.startsWith('--details-json=')) options.detailsJson = arg.slice(15);
    else if (arg.startsWith('--limit=')) options.limit = Math.max(1, Number(arg.slice(8)) || 1);
    else if (arg.startsWith('--hidden-cases=')) options.hiddenCases = Math.min(15, Math.max(10, Number(arg.slice(15)) || 10));
    else if (arg.startsWith('--concurrency=')) options.concurrency = Math.min(10, Math.max(1, Number(arg.slice(14)) || 4));
  }
  if (!options.datasetDir) throw new Error('Pass --dataset-dir=<LeetCodeDataset repository path>.');
  return options;
}

const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const slugify = (value) => String(value || '').trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'item';
const titleFromSlug = (slug) => String(slug || '').split('-').filter(Boolean)
  .map((word) => word[0].toUpperCase() + word.slice(1)).join(' ').slice(0, 200);

function loadTitleMap(csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) return new Map();
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true, bom: true });
  return new Map(rows.map((row) => {
    const url = String(row.Question_Link || '').trim().replace(/\/+$/, '');
    return [url.split('/').pop()?.toLowerCase(), String(row.Question || '').trim()];
  }).filter(([slug, title]) => slug && title));
}

function loadDetailMap(jsonPath) {
  if (!jsonPath || !fs.existsSync(jsonPath)) return new Map();
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const rows = Array.isArray(parsed) ? parsed : Object.values(parsed.questions || {});
  return new Map(rows.map((row) => [String(row.problem_slug || '').trim().toLowerCase(), row]).filter(([slug]) => slug));
}

function stripHtml(value) {
  return cleanUtf8(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

function parseDetailedExample(example) {
  const text = stripHtml(example?.example_text || '');
  const inputMatch = text.match(/Input:\s*([\s\S]*?)(?=\nOutput:|$)/i);
  const outputMatch = text.match(/Output:\s*([\s\S]*?)(?=\nExplanation:|$)/i);
  const explanationMatch = text.match(/Explanation:\s*([\s\S]*)$/i);
  if (!inputMatch || !outputMatch) return null;
  return {
    input: inputMatch[1].trim(),
    output: outputMatch[1].trim(),
    explanation: explanationMatch?.[1]?.trim() || '',
  };
}

const comparableInput = (value) => String(value || '').replace(/\s+/g, '').replace(/\bnull\b/gi, 'None');

async function* readJsonLines(filePath) {
  const source = fs.createReadStream(filePath);
  const input = filePath.endsWith('.gz') ? source.pipe(zlib.createGunzip()) : source;
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}

async function readDataset(datasetDir, limit) {
  const dataDir = path.join(path.resolve(datasetDir), 'data');
  const files = ['train', 'test'].map((split) => path.join(dataDir, `LeetCodeDataset-${DATASET_VERSION}-${split}.jsonl.gz`));
  files.forEach((file) => { if (!fs.existsSync(file)) throw new Error(`Dataset file not found: ${file}`); });
  const rows = [];
  for (const file of files) {
    for await (const row of readJsonLines(file)) {
      rows.push(row);
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}

function usableCases(row) {
  const seen = new Set();
  return (Array.isArray(row.input_output) ? row.input_output : [])
    .map((item) => ({ input: String(item?.input ?? '').trim(), output: String(item?.output ?? '').trim() }))
    .filter((item) => item.input && item.output && !/^(?:Error|Execution Error):/i.test(item.output))
    .filter((item) => {
      const key = `${item.input}\u0000${item.output}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
}

function evenlySelect(values, count) {
  if (values.length <= count) return values.slice();
  const indexes = new Set();
  for (let i = 0; i < count; i += 1) indexes.add(Math.round((i * (values.length - 1)) / Math.max(1, count - 1)));
  for (let i = 0; indexes.size < count && i < values.length; i += 1) indexes.add(i);
  return [...indexes].slice(0, count).map((index) => values[index]);
}

const cleanUtf8 = (value) => Buffer.from(String(value || ''), 'utf8').toString('utf8');

function pythonAdapter(entryPoint) {
  const method = String(entryPoint || '').split('.').pop();
  return `
# PeerPrep generated function adapter. Keep this section unchanged.
import ast as _pp_ast
import contextlib as _pp_contextlib
import inspect as _pp_inspect
import io as _pp_io
import re as _pp_re
import sys as _pp_sys

def _pp_parse(raw):
    raw = _pp_re.sub(r'\\bnull\\b', 'None', raw)
    raw = _pp_re.sub(r'\\btrue\\b', 'True', raw, flags=_pp_re.I)
    raw = _pp_re.sub(r'\\bfalse\\b', 'False', raw, flags=_pp_re.I)
    matches = list(_pp_re.finditer(r'(\\w+)\\s*=\\s*(.+?)(?=,\\s*\\w+\\s*=|$)', raw))
    if matches:
        return {m.group(1): _pp_ast.literal_eval(m.group(2).strip()) for m in matches}, []
    return {}, [_pp_ast.literal_eval(raw.strip())]

def _pp_tree(values):
    if not values: return None
    root = TreeNode(values[0]); queue = [root]; index = 1
    while queue and index < len(values):
        node = queue.pop(0)
        if index < len(values) and values[index] is not None:
            node.left = TreeNode(values[index]); queue.append(node.left)
        index += 1
        if index < len(values) and values[index] is not None:
            node.right = TreeNode(values[index]); queue.append(node.right)
        index += 1
    return root

def _pp_list(values):
    if not values: return None
    head = ListNode(values[0]); current = head
    for value in values[1:]: current.next = ListNode(value); current = current.next
    return head

def _pp_serialize(value):
    if value is None: return 'None'
    if hasattr(value, 'left') and hasattr(value, 'right'):
        result, queue = [], [value]
        while queue:
            node = queue.pop(0)
            if node is None: result.append(None); continue
            result.append(node.val); queue.extend([node.left, node.right])
        while result and result[-1] is None: result.pop()
        return str(result)
    if hasattr(value, 'val') and hasattr(value, 'next'):
        result, seen = [], set()
        while value is not None and id(value) not in seen:
            seen.add(id(value)); result.append(value.val); value = value.next
        return str(result)
    return str(value)

def _pp_execute(raw):
    kwargs, args = _pp_parse(raw)
    method = getattr(Solution(), ${JSON.stringify(method)})
    signature = _pp_inspect.signature(method)
    for name, value in list(kwargs.items()):
        parameter = signature.parameters.get(name)
        annotation = str(parameter.annotation) if parameter else ''
        if isinstance(value, list) and 'TreeNode' in annotation: kwargs[name] = _pp_tree(value)
        elif isinstance(value, list) and 'ListNode' in annotation: kwargs[name] = _pp_list(value)
    with _pp_contextlib.redirect_stdout(_pp_io.StringIO()): result = method(*args, **kwargs)
    return _pp_serialize(result)

if __name__ == '__main__': print(_pp_execute(_pp_sys.stdin.read()))
`;
}

function buildPythonSource(row, implementation) {
  const prompt = cleanUtf8(row.prompt)
    .replace(/^\s*(?:from\s+sortedcontainers\s+import|import\s+sortedcontainers).*$/gm, '');
  return `${prompt.trim()}\n\n${cleanUtf8(implementation).trim()}\n${pythonAdapter(row.entry_point)}`;
}

function cleanImportedDescription(value) {
  return cleanUtf8(value)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*(?:examples?(?:\s+\d+)?|constraints?)\s*:?\s*$/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function validateReference(row, cases) {
  const payload = JSON.stringify({ source: buildPythonSource(row, row.completion), inputs: cases.map((item) => item.input) });
  return new Promise((resolve) => {
    const child = spawn(process.env.PYTHON_BIN || 'python', [VALIDATOR_PATH], { windowsHide: true });
    const stdout = []; const stderr = []; let settled = false;
    const finish = (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => { child.kill(); finish({ ok: false, reason: 'validation timed out' }); }, 15_000);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => finish({ ok: false, reason: error.message }));
    child.on('close', (status) => {
      if (status !== 0) return finish({ ok: false, reason: Buffer.concat(stderr).toString('utf8').trim().slice(0, 400) || `Python exited ${status}` });
      try {
        const outputs = JSON.parse(Buffer.concat(stdout).toString('utf8'));
        const failed = cases.findIndex((item, index) => String(outputs[index] ?? '').trim() !== item.output.trim());
        return finish(failed < 0 ? { ok: true } : { ok: false, reason: `output mismatch at selected case ${failed + 1}` });
      } catch (error) { return finish({ ok: false, reason: `invalid validator output: ${error.message}` }); }
    });
    child.stdin.end(payload);
  });
}

async function prepareRow(row, options, titleMap, detailMap) {
  const cases = usableCases(row);
  const required = SAMPLE_COUNT + options.hiddenCases;
  if (cases.length < required) return { skip: `only ${cases.length} usable cases; needs ${required}` };
  const slug = String(row.task_id || '').trim().toLowerCase();
  const detail = detailMap.get(slug) || null;
  const detailedExamples = (detail?.examples || []).map(parseDetailedExample).filter(Boolean);
  const samples = [];
  const usedCaseIndexes = new Set();
  for (const example of detailedExamples) {
    const caseIndex = cases.findIndex((item, index) => !usedCaseIndexes.has(index)
      && comparableInput(item.input) === comparableInput(example.input));
    if (caseIndex < 0) continue;
    usedCaseIndexes.add(caseIndex);
    samples.push({ ...cases[caseIndex], explanation: example.explanation });
    if (samples.length === SAMPLE_COUNT) break;
  }
  for (let index = 0; samples.length < SAMPLE_COUNT && index < cases.length; index += 1) {
    if (usedCaseIndexes.has(index)) continue;
    usedCaseIndexes.add(index);
    samples.push({ ...cases[index], explanation: '' });
  }
  const hiddenPool = cases.filter((_, index) => !usedCaseIndexes.has(index));
  const hidden = evenlySelect(hiddenPool, options.hiddenCases);
  if (options.validate) {
    const validation = await validateReference(row, [...samples, ...hidden]);
    if (!validation.ok) return { skip: validation.reason };
  }
  const snippets = detail?.code_snippets || {};
  const pythonHarness = buildPythonSource(row, row.starter_code);
  const templates = { python: cleanUtf8(snippets.python3 || row.starter_code).trim() };
  Object.entries(SNIPPET_LANGUAGE_MAP).forEach(([sourceKey, languageKey]) => {
    if (languageKey === 'python') return;
    if (String(snippets[sourceKey] || '').trim()) templates[languageKey] = cleanUtf8(snippets[sourceKey]).trim();
  });
  return {
    row, detail, slug, samples, hidden, templates, pythonHarness,
    title: cleanUtf8(detail?.title || titleMap.get(slug) || titleFromSlug(slug)).slice(0, 200),
    tags: (() => {
      const values = [...new Set((detail?.topics || row.tags || []).map((tag) => String(tag || '').trim()).filter(Boolean))];
      return values.length ? values : ['General Programming'];
    })(),
    referenceSolution: buildPythonSource(row, row.completion),
  };
}

async function uniqueSlug(Model, base) {
  let value = base; let suffix = 2;
  while (await Model.exists({ slug: value })) value = `${base}-${suffix++}`.slice(0, 120);
  return value;
}

async function ensureClassifications(names, adminId) {
  const topics = new Map(); const tags = new Map();
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const normalizedName = normalizeName(name);
    let topic = await CodingTopic.findOne({ parentId: null, normalizedName });
    if (!topic) topic = await CodingTopic.create({
      name, normalizedName, slug: await uniqueSlug(CodingTopic, slugify(name)), parentId: null,
      ancestorIds: [], depth: 0, legacyTag: name, status: 'active', createdBy: adminId, updatedBy: adminId,
    });
    topics.set(normalizedName, topic);
    let tag = await CodingTag.findOne({ normalizedName });
    if (!tag) tag = await CodingTag.create({ name, normalizedName, slug: await uniqueSlug(CodingTag, slugify(name)), status: 'active', createdBy: adminId });
    tags.set(normalizedName, tag);
  }
  return { topics, tags };
}

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function persist(item, context) {
  const { adminId, options, topics, tags } = context;
  const externalId = String(item.row.question_id);
  const registry = await ImportRegistry.findOne({ provider: PROVIDER, externalId });
  let problem = registry?.problemId ? await Problem.findById(registry.problemId) : null;
  if (problem && !options.updateExisting) return 'existing';
  const wasNew = !problem;
  if (!problem) {
    const titleMatch = await Problem.exists({ title: { $regex: `^${escapeRegex(item.title)}$`, $options: 'i' } });
    if (titleMatch) return 'duplicate-title';
    problem = new Problem({ createdBy: adminId });
  }
  const now = new Date();
  Object.assign(problem, {
    title: item.title, description: cleanImportedDescription(item.detail?.description || item.row.problem_description),
    difficulty: ['Easy', 'Medium', 'Hard'].includes(item.row.difficulty) ? item.row.difficulty : 'Easy',
    tags: item.tags,
    topicIds: item.tags.map((name) => topics.get(normalizeName(name))?._id).filter(Boolean),
    topicAncestorIds: [],
    codingTagIds: item.tags.map((name) => tags.get(normalizeName(name))?._id).filter(Boolean),
    companyTags: [], supportedLanguages: Object.keys(item.templates),
    codeTemplates: new Map(Object.entries(item.templates)),
    executionHarnesses: new Map([['python', item.pythonHarness]]),
    referenceSolutions: new Map([['python', item.referenceSolution]]),
    inputFormat: 'Provide Python-style named arguments separated by commas, for example: nums = [1, 2], target = 3.',
    outputFormat: 'The result printed by the required function.',
    constraints: (item.detail?.constraints || []).map(stripHtml).filter(Boolean).join('\n'),
    category: 'DSA', editorial: '',
    hints: (item.detail?.hints || []).map(stripHtml).filter(Boolean).slice(0, 20), faqs: [],
    timeLimitSeconds: 5, memoryLimitMb: 256, totalMarks: item.hidden.length,
    status: options.publish ? 'published' : 'draft', visibility: 'public',
    previewValidated: options.publish, previewTested: options.publish,
    publishedAt: options.publish ? (problem.publishedAt || now) : undefined,
    updatedBy: adminId,
    hiddenTestSource: { provider: 'db', inputObjectKey: '', outputObjectKey: '', delimiter: '###CASE###', caseCount: item.hidden.length },
  });
  await problem.save();
  await TestCase.deleteMany({ problem: problem._id });
  await TestCase.insertMany([
    ...item.samples.map((test, i) => ({ problem: problem._id, kind: 'sample', position: i + 1, input: test.input, output: test.output, explanation: test.explanation || '', marks: 1, createdBy: adminId })),
    ...item.hidden.map((test, i) => ({ problem: problem._id, kind: 'hidden', position: i + 1, input: test.input, output: test.output, marks: 1, createdBy: adminId })),
  ]);
  await syncProblemToLibrary(problem.toObject());
  await ImportRegistry.findOneAndUpdate(
    { provider: PROVIDER, externalId },
    { $set: { externalSlug: item.slug, datasetVersion: DATASET_VERSION, sourceUrl: `https://leetcode.com/problems/${item.slug}/`, problemId: problem._id, importedAt: now } },
    { upsert: true, new: true },
  );
  return wasNew ? 'created' : 'updated';
}

async function mapConcurrent(items, concurrency, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; await worker(items[index], index); }
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = await readDataset(options.datasetDir, options.limit);
  const titleMap = loadTitleMap(options.titlesCsv);
  const detailMap = loadDetailMap(options.detailsJson);
  const ready = []; const rejected = []; let checked = 0;
  await mapConcurrent(rows, options.concurrency, async (row) => {
    const result = await prepareRow(row, options, titleMap, detailMap);
    if (result.skip) rejected.push({ id: row.question_id, slug: row.task_id, reason: result.skip }); else ready.push(result);
    checked += 1;
    if (checked % 100 === 0 || checked === rows.length) console.log(`[validate] ${checked}/${rows.length}; ready=${ready.length}; rejected=${rejected.length}`);
  });
  const languageCoverage = ready.reduce((counts, item) => {
    Object.keys(item.templates).forEach((language) => { counts[language] = (counts[language] || 0) + 1; });
    return counts;
  }, {});
  console.log(JSON.stringify({ mode: options.commit ? 'commit' : 'dry-run', publish: options.publish, datasetRows: rows.length, ready: ready.length, rejected: rejected.length, samples: 3, hidden: options.hiddenCases, languageCoverage, firstRejections: rejected.slice(0, 15) }, null, 2));
  if (!options.commit) return;
  if (!process.env.MONGODB_URI || String(process.env.MONGODB_URI).toLowerCase() === 'memory') throw new Error('A persistent MONGODB_URI is required.');
  await connectDb();
  await ImportRegistry.createIndexes();
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const admin = (adminEmail && await User.findOne({ role: 'admin', email: adminEmail })) || await User.findOne({ role: 'admin' });
  if (!admin) throw new Error('No admin account exists.');
  const classification = await ensureClassifications(new Set(ready.flatMap((item) => item.tags)), admin._id);
  const counts = { created: 0, updated: 0, existing: 0, 'duplicate-title': 0, failed: 0 }; let stored = 0;
  await mapConcurrent(ready, options.concurrency, async (item) => {
    try { const result = await persist(item, { adminId: admin._id, options, ...classification }); counts[result] += 1; }
    catch (error) { counts.failed += 1; rejected.push({ id: item.row.question_id, slug: item.slug, reason: error.message }); }
    stored += 1;
    if (stored % 100 === 0 || stored === ready.length) console.log(`[database] ${stored}/${ready.length}; ${JSON.stringify(counts)}`);
  });
  const ids = await ImportRegistry.distinct('problemId', { provider: PROVIDER });
  const testCases = await TestCase.countDocuments({ problem: { $in: ids } });
  console.log(JSON.stringify({ complete: counts.failed === 0, counts, importedProblems: ids.length, importedTestCases: testCases, lastFailures: rejected.slice(-15) }, null, 2));
  if (counts.failed) process.exitCode = 2;
}

try { await main(); }
catch (error) { console.error(`[LeetCode import] ${error.stack || error.message}`); process.exitCode = 1; }
finally { if (mongoose.connection.readyState !== 0) await closeDb(); }
