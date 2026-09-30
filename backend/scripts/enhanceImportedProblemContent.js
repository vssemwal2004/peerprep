import '../src/setup.js';

import fs from 'node:fs';
import mongoose from 'mongoose';

import Problem from '../src/models/Problem.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import TestCase from '../src/models/TestCase.js';
import { closeDb, connectDb } from '../src/utils/db.js';

const BATCH_SIZE = 150;

function parseArgs(argv) {
  const detailsArg = argv.find((arg) => arg.startsWith('--details-json='));
  const detailsJson = detailsArg?.slice('--details-json='.length) || '';
  if (detailsJson && !fs.existsSync(detailsJson)) throw new Error(`Details JSON not found: ${detailsJson}`);
  return { detailsJson };
}

const normalizeTitle = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const normalizeCaseInput = (value) => String(value || '').replace(/\s+/g, '').replace(/\bnull\b/gi, 'None');

function cleanStatement(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^(?:examples?(?:\s+\d+)?|constraints?)\s*:?\s*$/i.test(line))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function repairMathNotation(value) {
  return String(value || '')
    .replace(/(^|[^\d])(-?)10([2-9])(?=$|[^\d])/g, (_, prefix, sign, exponent) => `${prefix}${sign}10^${exponent}`)
    .replace(/\s+/g, ' ')
    .trim();
}

function splitTopLevel(value) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const character of String(value || '')) {
    if ('[({'.includes(character)) depth += 1;
    if ('])}'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parsePythonSignature(source) {
  const normalizedSource = String(source || '');
  const solutionClasses = [...normalizedSource.matchAll(/^class\s+Solution\s*:/gm)];
  const scopedSource = solutionClasses.length
    ? normalizedSource.slice(solutionClasses[solutionClasses.length - 1].index)
    : normalizedSource;
  const match = scopedSource.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^\n]*)\)\s*(?:->\s*([^:\n]+))?\s*:/m);
  if (!match) return null;
  const parameters = splitTopLevel(match[2]).filter((entry) => entry && !/^self(?:\s*:.*)?$/.test(entry)).map((entry) => {
    const withoutDefault = entry.replace(/\s*=.*$/, '').trim();
    const separator = withoutDefault.indexOf(':');
    return separator < 0
      ? { name: withoutDefault.trim(), type: 'value' }
      : { name: withoutDefault.slice(0, separator).trim(), type: withoutDefault.slice(separator + 1).trim() };
  }).filter((entry) => entry.name);
  return { method: match[1], parameters, returnType: String(match[3] || 'value').trim() };
}

function humanType(value) {
  const type = String(value || '').replace(/^typing\./, '').trim();
  const simple = {
    int: 'integer', float: 'number', str: 'string', bool: 'boolean', value: 'value',
    TreeNode: 'binary-tree node', 'Optional[TreeNode]': 'binary-tree root (or empty tree)',
    ListNode: 'linked-list node', 'Optional[ListNode]': 'linked-list head (or empty list)',
    None: 'no return value', 'NoneType': 'no return value',
  };
  if (simple[type]) return simple[type];
  if (/^List\[List\[/.test(type)) return 'two-dimensional array';
  if (/^(?:List|Sequence)\[int\]/.test(type)) return 'integer array';
  if (/^(?:List|Sequence)\[str\]/.test(type)) return 'string array';
  if (/^(?:List|Sequence)\[/.test(type)) return 'array';
  if (/^Optional\[/.test(type)) return `${humanType(type.slice(9, -1))} or null`;
  return type.replaceAll('_', ' ').toLowerCase();
}

function buildFormats(signature) {
  if (!signature) return {
    inputFormat: 'Use the function signature shown in the editor. PeerPrep passes the test-case arguments directly to your function; do not read from standard input.',
    outputFormat: 'Return the value requested by the problem statement. Do not print extra text.',
  };
  const inputLines = signature.parameters.length
    ? signature.parameters.map((parameter) => `- \`${parameter.name}\` — ${humanType(parameter.type)}.`)
    : ['- This function does not receive any arguments.'];
  const returnsNothing = /^(?:None|NoneType|void)$/i.test(signature.returnType);
  return {
    inputFormat: [
      `Implement \`${signature.method}\` using the function signature provided in the editor.`,
      '',
      ...inputLines,
      '',
      'PeerPrep passes these arguments directly to your function. Do not read from standard input.',
    ].join('\n'),
    outputFormat: returnsNothing
      ? 'Modify the supplied data in place as required. Do not print extra text.'
      : `Return ${humanType(signature.returnType)} from \`${signature.method}\`. Do not print extra text.`,
  };
}

function parseExample(example) {
  const text = String(example?.example_text || '').replace(/\r\n/g, '\n');
  const input = text.match(/Input:\s*([\s\S]*?)(?=\nOutput:|$)/i)?.[1]?.trim() || '';
  const output = text.match(/Output:\s*([\s\S]*?)(?=\nExplanation:|$)/i)?.[1]?.trim() || '';
  const explanation = text.match(/Explanation:\s*([\s\S]*)$/i)?.[1]?.trim() || '';
  return { input, output, explanation };
}

async function main() {
  const { detailsJson } = parseArgs(process.argv.slice(2));
  const parsed = detailsJson ? JSON.parse(fs.readFileSync(detailsJson, 'utf8')) : [];
  const details = Array.isArray(parsed) ? parsed : Object.values(parsed.questions || {});
  const detailBySlug = new Map(details.map((row) => [String(row.problem_slug || '').toLowerCase(), row]));
  const detailByTitle = new Map(details.map((row) => [normalizeTitle(row.title), row]).filter(([title]) => title));

  await connectDb();
  const registry = mongoose.connection.collection('question_import_registry');
  const imported = await registry.find({ provider: 'leetcode-dataset' }).project({ problemId: 1, externalSlug: 1 }).toArray();
  let enhanced = 0;
  let explanationsAdded = 0;

  for (let offset = 0; offset < imported.length; offset += BATCH_SIZE) {
    const batch = imported.slice(offset, offset + BATCH_SIZE);
    const ids = batch.map((item) => item.problemId);
    const [problems, samples] = await Promise.all([
      Problem.find({ _id: { $in: ids } }).select('title description constraints codeTemplates inputFormat outputFormat').lean(),
      TestCase.find({ problem: { $in: ids }, kind: 'sample' }).select('problem input output explanation').lean(),
    ]);
    const registryById = new Map(batch.map((item) => [String(item.problemId), item]));
    const samplesByProblem = new Map();
    samples.forEach((sample) => {
      const key = String(sample.problem);
      if (!samplesByProblem.has(key)) samplesByProblem.set(key, []);
      samplesByProblem.get(key).push(sample);
    });
    const problemOps = [];
    const libraryOps = [];
    const sampleOps = [];

    for (const problem of problems) {
      const registryItem = registryById.get(String(problem._id));
      const detail = detailBySlug.get(String(registryItem?.externalSlug || '').toLowerCase())
        || detailByTitle.get(normalizeTitle(problem.title));
      const signature = parsePythonSignature(problem.codeTemplates?.python);
      const formats = buildFormats(signature);
      const sourceDescription = cleanStatement(detail?.description || problem.description);
      const description = sourceDescription || (signature
        ? `Implement \`${signature.method}\` to solve **${problem.title}**. Follow the function contract, examples, and constraints below.`
        : `Solve **${problem.title}** using the provided editor template. Follow the examples and required output format below.`);
      const sourceConstraints = (detail?.constraints?.length ? detail.constraints : String(problem.constraints || '').split(/\r?\n/))
        .map(repairMathNotation).filter(Boolean).join('\n');
      const constraints = sourceConstraints || 'Inputs conform to the types and structural requirements shown in the function signature.';
      const set = { description, constraints, ...formats };
      problemOps.push({ updateOne: { filter: { _id: problem._id }, update: { $set: set } } });
      libraryOps.push({ updateOne: { filter: { sourceType: 'compiler', sourceProblemId: problem._id }, update: { $set: {
        questionText: problem.title,
        'questionData.description': description,
        'questionData.constraints': constraints,
        'questionData.inputFormat': formats.inputFormat,
        'questionData.outputFormat': formats.outputFormat,
      } } } });

      const detailedExamples = (detail?.examples || []).map(parseExample);
      for (const sample of samplesByProblem.get(String(problem._id)) || []) {
        const matching = detailedExamples.find((example) => normalizeCaseInput(example.input) === normalizeCaseInput(sample.input));
        const explanation = matching?.explanation
          || `For the given input, the required function returns \`${String(sample.output || '').trim()}\`.`;
        if (explanation !== String(sample.explanation || '').trim()) {
          sampleOps.push({ updateOne: { filter: { _id: sample._id }, update: { $set: { explanation } } } });
          explanationsAdded += 1;
        }
      }
    }

    if (problemOps.length) await Problem.bulkWrite(problemOps, { ordered: false });
    if (libraryOps.length) await QuestionLibrary.bulkWrite(libraryOps, { ordered: false });
    if (sampleOps.length) await TestCase.bulkWrite(sampleOps, { ordered: false });
    enhanced += problemOps.length;
    console.log(`Enhanced ${enhanced}/${imported.length} imported problems.`);
  }

  console.log(JSON.stringify({ imported: imported.length, enhanced, explanationsAdded }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
