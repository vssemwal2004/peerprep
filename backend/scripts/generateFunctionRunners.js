import '../src/setup.js';

import Problem from '../src/models/Problem.js';
import { AUTO_RUNNER_LANGUAGES, generateFunctionRunnerTemplate } from '../src/services/functionRunnerTemplateService.js';
import { closeDb, connectDb } from '../src/utils/db.js';

function codeMap(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return typeof value === 'object' ? value : {};
}

function parseArgs(argv) {
  const languageArgument = argv.find((argument) => argument.startsWith('--languages='));
  const requestedLanguages = String(languageArgument?.split('=')[1] || AUTO_RUNNER_LANGUAGES.join(','))
    .split(',').map((language) => language.trim().toLowerCase()).filter(Boolean);
  const unsupported = requestedLanguages.filter((language) => !AUTO_RUNNER_LANGUAGES.includes(language));
  if (unsupported.length) throw new Error(`Automatic runner generation is not implemented for: ${unsupported.join(', ')}`);
  const limitArgument = argv.find((argument) => argument.startsWith('--limit='));
  const problemArgument = argv.find((argument) => argument.startsWith('--problem-id='));
  return {
    apply: argv.includes('--apply'),
    replace: argv.includes('--replace'),
    preserveValidation: argv.includes('--preserve-validation'),
    languages: [...new Set(requestedLanguages)],
    limit: Math.max(0, Number(limitArgument?.split('=')[1]) || 0),
    problemId: String(problemArgument?.split('=')[1] || '').trim(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await connectDb();
  const problems = await Problem.find({
    category: { $ne: 'SQL' },
    executionMode: 'function',
    'functionContract.methodName': { $exists: true, $ne: '' },
    ...(options.problemId ? { _id: options.problemId } : {}),
  }).select('+executionHarnesses')
    .sort({ _id: 1 }).limit(options.limit);
  const stats = {
    apply: options.apply,
    replace: options.replace,
    scanned: problems.length,
    updatedProblems: 0,
    generatedRunners: 0,
    coverage: Object.fromEntries(options.languages.map((language) => [language, 0])),
  };
  const operations = [];
  for (const problem of problems) {
    const templates = codeMap(problem.codeTemplates);
    const harnesses = codeMap(problem.executionHarnesses);
    let changed = false;
    for (const language of options.languages) {
      if (!(problem.supportedLanguages || []).includes(language)) continue;
      if (!String(templates[language] || '').trim()) continue;
      if (!options.replace && String(harnesses[language] || '').trim()) continue;
      const runner = generateFunctionRunnerTemplate(language, problem.functionContract, templates[language]);
      if (!runner) continue;
      harnesses[language] = runner;
      stats.generatedRunners += 1;
      stats.coverage[language] += 1;
      changed = true;
    }
    if (!changed) continue;
    stats.updatedProblems += 1;
    const update = { $set: {
      executionHarnesses: harnesses,
      showExecutionHarness: false,
      ...(options.preserveValidation ? {} : { previewValidated: false, previewTested: false, status: 'draft' }),
    } };
    if (!options.preserveValidation) update.$pull = { validatedLanguages: { $in: options.languages } };
    operations.push({ updateOne: { filter: { _id: problem._id }, update } });
  }
  if (options.apply && operations.length) {
    const batchSize = 25;
    for (let offset = 0; offset < operations.length; offset += batchSize) {
      await Problem.bulkWrite(operations.slice(offset, offset + batchSize), { ordered: false });
      if ((offset + batchSize) % 250 === 0 || offset + batchSize >= operations.length) {
        console.log(`[runners] ${Math.min(offset + batchSize, operations.length)}/${operations.length}`);
      }
    }
  }
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
