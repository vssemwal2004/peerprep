import '../src/setup.js';

import fs from 'node:fs';
import mongoose from 'mongoose';

import Problem from '../src/models/Problem.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import { closeDb, connectDb } from '../src/utils/db.js';

const SNIPPET_LANGUAGE_MAP = {
  c: 'c', cpp: 'cpp', java: 'java', python3: 'python', javascript: 'javascript',
  typescript: 'typescript', csharp: 'csharp', php: 'php', golang: 'go', rust: 'rust',
  kotlin: 'kotlin', ruby: 'ruby', swift: 'swift',
};
const LANGUAGE_ORDER = Object.values(SNIPPET_LANGUAGE_MAP);
const BATCH_SIZE = 200;

function parseArgs(argv) {
  const detailsArg = argv.find((arg) => arg.startsWith('--details-json='));
  if (!detailsArg) throw new Error('Pass --details-json=<merged_problems.json path>.');
  const detailsJson = detailsArg.slice('--details-json='.length);
  if (!fs.existsSync(detailsJson)) throw new Error(`Details JSON not found: ${detailsJson}`);
  return { detailsJson };
}

function clean(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function normalizeTitle(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function main() {
  const { detailsJson } = parseArgs(process.argv.slice(2));
  const parsed = JSON.parse(fs.readFileSync(detailsJson, 'utf8'));
  const rows = Array.isArray(parsed) ? parsed : Object.values(parsed.questions || {});
  const detailsBySlug = new Map(rows.map((row) => [String(row.problem_slug || '').trim().toLowerCase(), row]));
  const detailsByTitle = new Map(rows.map((row) => [normalizeTitle(row.title), row]).filter(([title]) => title));

  await connectDb();
  const registry = mongoose.connection.collection('question_import_registry');
  const imported = await registry.find({ provider: 'leetcode-dataset' }).project({ problemId: 1, externalSlug: 1 }).toArray();
  const importedProblems = await Problem.find({ _id: { $in: imported.map((item) => item.problemId) } }).select('_id title').lean();
  const problemTitles = new Map(importedProblems.map((problem) => [String(problem._id), problem.title]));
  let updated = 0;
  const coverage = Object.fromEntries(LANGUAGE_ORDER.map((language) => [language, 0]));

  for (let offset = 0; offset < imported.length; offset += BATCH_SIZE) {
    const batch = imported.slice(offset, offset + BATCH_SIZE);
    const problemOps = [];
    const libraryOps = [];
    for (const item of batch) {
      const detail = detailsBySlug.get(String(item.externalSlug || '').toLowerCase())
        || detailsByTitle.get(normalizeTitle(problemTitles.get(String(item.problemId))));
      if (!detail) continue;
      const templates = {};
      Object.entries(SNIPPET_LANGUAGE_MAP).forEach(([snippetKey, languageKey]) => {
        const code = clean(detail.code_snippets?.[snippetKey]);
        if (code) templates[languageKey] = code;
      });
      const supportedLanguages = LANGUAGE_ORDER.filter((language) => templates[language]);
      if (!supportedLanguages.length) continue;
      supportedLanguages.forEach((language) => { coverage[language] += 1; });
      const set = { supportedLanguages };
      supportedLanguages.forEach((language) => { set[`codeTemplates.${language}`] = templates[language]; });
      problemOps.push({ updateOne: { filter: { _id: item.problemId }, update: { $set: set } } });
      const librarySet = { 'questionData.supportedLanguages': supportedLanguages };
      supportedLanguages.forEach((language) => { librarySet[`questionData.codeTemplates.${language}`] = templates[language]; });
      libraryOps.push({ updateOne: { filter: { sourceType: 'compiler', sourceProblemId: item.problemId }, update: { $set: librarySet } } });
    }
    if (problemOps.length) await Problem.bulkWrite(problemOps, { ordered: false });
    if (libraryOps.length) await QuestionLibrary.bulkWrite(libraryOps, { ordered: false });
    updated += problemOps.length;
    console.log(`Expanded ${updated}/${imported.length} imported problems.`);
  }

  console.log(JSON.stringify({ imported: imported.length, updated, coverage }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
