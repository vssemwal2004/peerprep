import '../src/setup.js';

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

import Problem from '../src/models/Problem.js';
import { closeDb, connectDb } from '../src/utils/db.js';

const PROVIDER = 'openleetcode-public-domain';
const LANGUAGE_FILES = {
  cpp: 'sol.cpp',
  csharp: 'sol.cs',
  go: 'sol.go',
  java: 'sol.java',
  kotlin: 'sol.kt',
  python: 'sol.py',
  ruby: 'sol.rb',
  rust: 'sol.rs',
  swift: 'sol.swift',
  typescript: 'sol.ts',
};
const BATCH_SIZE = 150;

function parseArgs(argv) {
  const sourceArg = argv.find((arg) => arg.startsWith('--source-dir='));
  if (!sourceArg) throw new Error('Pass --source-dir=<openleetcode repository path>.');
  const sourceDir = path.resolve(sourceArg.slice('--source-dir='.length));
  if (!fs.existsSync(path.join(sourceDir, 'LICENSE'))) throw new Error('Source LICENSE file is required.');
  if (!fs.existsSync(path.join(sourceDir, 'tests'))) throw new Error('Source tests directory was not found.');
  return { sourceDir, apply: argv.includes('--apply'), replace: argv.includes('--replace') };
}

function walkManifests(directory) {
  const manifests = [];
  const visit = (current) => {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name === 'manifest.yaml') manifests.push(target);
    });
  };
  visit(directory);
  return manifests;
}

function slugFromDirectory(directory) {
  return path.basename(directory).replace(/^\d+\.\s*/, '').trim().toLowerCase();
}

function codeMap(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return typeof value === 'object' ? value : {};
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifests = walkManifests(path.join(options.sourceDir, 'tests'));
  const sources = new Map(manifests.map((manifestPath) => {
    const directory = path.dirname(manifestPath);
    const solutions = {};
    Object.entries(LANGUAGE_FILES).forEach(([language, filename]) => {
      const filePath = path.join(directory, filename);
      if (!fs.existsSync(filePath)) return;
      const code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').trim();
      if (code) solutions[language] = code;
    });
    return [slugFromDirectory(directory), { directory, solutions }];
  }));

  await connectDb();
  const registryRows = await mongoose.connection.collection('question_import_registry')
    .find({ problemId: { $exists: true } })
    .project({ problemId: 1, externalSlug: 1 })
    .toArray();
  const problems = await Problem.find({ _id: { $in: registryRows.map((row) => row.problemId) } })
    .select('_id supportedLanguages referenceSolutions')
    .lean();
  const problemById = new Map(problems.map((problem) => [String(problem._id), problem]));
  const stats = {
    apply: options.apply,
    manifests: manifests.length,
    databaseProblems: registryRows.length,
    matchedProblems: 0,
    updatedProblems: 0,
    importedSolutions: 0,
    coverage: Object.fromEntries(Object.keys(LANGUAGE_FILES).map((language) => [language, 0])),
  };
  const provenance = mongoose.connection.collection('question_solution_import_registry');
  let operations = [];
  let provenanceOperations = [];

  const flush = async () => {
    if (!options.apply || !operations.length) {
      operations = [];
      provenanceOperations = [];
      return;
    }
    await Problem.bulkWrite(operations, { ordered: false });
    await provenance.bulkWrite(provenanceOperations, { ordered: false });
    operations = [];
    provenanceOperations = [];
  };

  for (const registry of registryRows) {
    const source = sources.get(String(registry.externalSlug || '').toLowerCase());
    const problem = problemById.get(String(registry.problemId));
    if (!source || !problem) continue;
    stats.matchedProblems += 1;
    const existing = codeMap(problem.referenceSolutions);
    const next = { ...existing };
    const importedLanguages = [];
    problem.supportedLanguages.forEach((language) => {
      const solution = source.solutions[language];
      if (!solution || (!options.replace && String(existing[language] || '').trim())) return;
      next[language] = solution;
      importedLanguages.push(language);
      stats.coverage[language] += 1;
    });
    if (!importedLanguages.length) continue;
    stats.updatedProblems += 1;
    stats.importedSolutions += importedLanguages.length;
    operations.push({ updateOne: { filter: { _id: problem._id }, update: { $set: {
      referenceSolutions: next,
      executionMode: 'function',
    } } } });
    provenanceOperations.push({ updateOne: {
      filter: { provider: PROVIDER, problemId: problem._id },
      update: { $set: {
        provider: PROVIDER,
        problemId: problem._id,
        externalSlug: registry.externalSlug,
        languages: importedLanguages,
        sourceDirectory: path.relative(options.sourceDir, source.directory),
        importedAt: new Date(),
      } },
      upsert: true,
    } });
    if (operations.length >= BATCH_SIZE) await flush();
  }
  await flush();
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
