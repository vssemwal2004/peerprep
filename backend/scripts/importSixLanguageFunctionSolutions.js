import '../src/setup.js';

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

import Problem from '../src/models/Problem.js';
import { closeDb, connectDb } from '../src/utils/db.js';

const LANGUAGES = ['python', 'c', 'cpp', 'java', 'javascript', 'typescript'];
const REMOVED_LANGUAGES = ['csharp', 'php', 'go', 'rust', 'kotlin', 'ruby', 'swift', 'dart', 'scala', 'racket', 'erlang', 'elixir'];
const SECTION_NAMES = {
  Cpp: 'cpp',
  Java: 'java',
  Python3: 'python',
  C: 'c',
  Javascript: 'javascript',
  Typescript: 'typescript',
};
const PROVIDER = 'peerprep-user-provided-multilang';

function parseArgs(argv) {
  const sourceArgument = argv.find((argument) => argument.startsWith('--source-dir='));
  if (!sourceArgument) throw new Error('Pass --source-dir=<multilingual solution repository>.');
  const sourceDir = path.resolve(sourceArgument.slice('--source-dir='.length));
  if (!fs.existsSync(sourceDir)) throw new Error(`Source directory not found: ${sourceDir}`);
  const externalIdArgument = argv.find((argument) => argument.startsWith('--external-id='));
  return {
    sourceDir,
    apply: argv.includes('--apply'),
    replace: argv.includes('--replace'),
    externalId: String(externalIdArgument?.slice('--external-id='.length) || '').trim(),
  };
}

function walkMarkdown(directory) {
  const files = [];
  if (!fs.existsSync(directory)) return files;
  const visit = (current) => fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) visit(target);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(target);
  });
  visit(directory);
  return files;
}

function parseSolutions(markdown) {
  const source = String(markdown || '').replace(/\r\n/g, '\n');
  const heading = /^##\s+([A-Za-z0-9+#]+)\s*$/gm;
  const matches = [...source.matchAll(heading)];
  const solutions = {};
  matches.forEach((match, index) => {
    const language = SECTION_NAMES[match[1]];
    if (!language) return;
    const section = source.slice(match.index + match[0].length, matches[index + 1]?.index ?? source.length);
    const fence = section.match(/```[^\n]*\n([\s\S]*?)```/);
    const code = String(fence?.[1] || '').trim();
    if (code) solutions[language] = code;
  });
  return solutions;
}

function loadSources(sourceDir) {
  const roots = ['Leetcode-Easy', 'Leetcode-Medium', 'Leetcode-Hard'];
  const sources = new Map();
  roots.flatMap((name) => walkMarkdown(path.join(sourceDir, name))).forEach((filePath) => {
    const match = path.basename(filePath).match(/^(\d+)-/);
    if (!match) return;
    const externalId = String(Number(match[1]));
    const solutions = parseSolutions(fs.readFileSync(filePath, 'utf8'));
    const previous = sources.get(externalId) || { solutions: {}, files: [] };
    sources.set(externalId, {
      solutions: { ...previous.solutions, ...solutions },
      files: [...previous.files, filePath],
    });
  });
  return sources;
}

function codeMap(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return typeof value === 'object' ? { ...value } : {};
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sources = loadSources(options.sourceDir);
  await connectDb();
  const registryRows = await mongoose.connection.collection('question_import_registry')
    .find({
      provider: 'leetcode-dataset',
      problemId: { $exists: true },
      ...(options.externalId ? { externalId: options.externalId } : {}),
    })
    .project({ problemId: 1, externalId: 1, externalSlug: 1 })
    .toArray();
  const problems = await Problem.find({ _id: { $in: registryRows.map((row) => row.problemId) } })
    .select('_id referenceSolutions codeTemplates supportedLanguages validatedLanguages')
    .lean();
  const problemsById = new Map(problems.map((problem) => [String(problem._id), problem]));
  const stats = {
    apply: options.apply,
    sourceProblems: sources.size,
    databaseProblems: registryRows.length,
    matched: 0,
    completeSolutions: 0,
    missingByLanguage: Object.fromEntries(LANGUAGES.map((language) => [language, 0])),
    templateMissingByLanguage: Object.fromEntries(LANGUAGES.map((language) => [language, 0])),
    firstIncomplete: [],
    updated: 0,
  };
  const operations = [];
  const provenance = [];

  for (const registry of registryRows) {
    const problem = problemsById.get(String(registry.problemId));
    const source = sources.get(String(Number(registry.externalId)));
    if (!problem || !source) {
      if (stats.firstIncomplete.length < 20) stats.firstIncomplete.push({
        id: registry.externalId,
        slug: registry.externalSlug,
        reason: 'source problem not found',
      });
      continue;
    }
    stats.matched += 1;
    const references = codeMap(problem.referenceSolutions);
    const templates = codeMap(problem.codeTemplates);
    const nextReferences = {};
    const missing = [];
    LANGUAGES.forEach((language) => {
      const candidate = language === 'python'
        ? String(references.python || source.solutions.python || '').trim()
        : String(source.solutions[language] || references[language] || '').trim();
      if (!candidate) {
        stats.missingByLanguage[language] += 1;
        missing.push(language);
      } else {
        nextReferences[language] = options.replace && source.solutions[language]
          ? source.solutions[language]
          : candidate;
      }
      if (!String(templates[language] || '').trim()) stats.templateMissingByLanguage[language] += 1;
    });
    if (missing.length) {
      if (stats.firstIncomplete.length < 20) stats.firstIncomplete.push({
        id: registry.externalId,
        slug: registry.externalSlug,
        missing,
      });
      continue;
    }
    stats.completeSolutions += 1;
    const validatedLanguages = (problem.validatedLanguages || []).filter((language) => (
      language === 'python' && LANGUAGES.includes(language)
    ));
    operations.push({ updateOne: {
      filter: { _id: problem._id },
      update: {
        $set: {
          supportedLanguages: LANGUAGES,
          codeTemplates: Object.fromEntries(LANGUAGES.map((language) => [language, templates[language]])),
          referenceSolutions: nextReferences,
          validatedLanguages,
          executionMode: 'function',
          showExecutionHarness: false,
          previewValidated: false,
          previewTested: false,
          status: 'draft',
          visibility: 'private',
        },
        $unset: Object.fromEntries(REMOVED_LANGUAGES.map((language) => [`executionHarnesses.${language}`, ''])),
      },
    } });
    provenance.push({ updateOne: {
      filter: { provider: PROVIDER, problemId: problem._id },
      update: { $set: {
        provider: PROVIDER,
        problemId: problem._id,
        externalId: String(registry.externalId),
        externalSlug: registry.externalSlug,
        languages: LANGUAGES,
        sourceFiles: source.files.map((file) => path.relative(options.sourceDir, file)),
        importedAt: new Date(),
      } },
      upsert: true,
    } });
  }

  if (options.apply) {
    const registry = mongoose.connection.collection('question_solution_import_registry');
    for (let offset = 0; offset < operations.length; offset += 100) {
      await Problem.bulkWrite(operations.slice(offset, offset + 100), { ordered: false });
      await registry.bulkWrite(provenance.slice(offset, offset + 100), { ordered: false });
      console.log(`[six-language-import] ${Math.min(offset + 100, operations.length)}/${operations.length}`);
    }
  }
  stats.updated = options.apply ? operations.length : 0;
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
