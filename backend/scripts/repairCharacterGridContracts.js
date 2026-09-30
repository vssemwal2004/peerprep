import '../src/setup.js';

import Problem from '../src/models/Problem.js';
import { generateFunctionRunnerTemplate } from '../src/services/functionRunnerTemplateService.js';
import { closeDb, connectDb } from '../src/utils/db.js';

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDb();
  const problems = await Problem.find({
    executionMode: 'function',
    'functionContract.parameters.type': { $in: ['string[][]', 'character[][]'] },
  }).select('+executionHarnesses');
  const changes = [];
  for (const problem of problems) {
    const cpp = String(problem.codeTemplates?.get?.('cpp') || '');
    if (!/vector\s*<\s*vector\s*<\s*char\s*>\s*>/.test(cpp)) continue;
    const parameters = (problem.functionContract.parameters || []).map((parameter) => {
      const value = parameter.toObject?.() || parameter;
      return value.type === 'string[][]' ? { ...value, type: 'character[][]' } : value;
    });
    changes.push({ id: String(problem._id), title: problem.title });
    if (apply) {
      problem.functionContract.parameters = parameters;
      for (const language of ['python', 'c', 'cpp', 'java', 'javascript', 'typescript']) {
        if (!(problem.supportedLanguages || []).includes(language)) continue;
        const runner = generateFunctionRunnerTemplate(language, problem.functionContract, problem.codeTemplates?.get?.(language));
        if (runner) problem.executionHarnesses.set(language, runner);
      }
      problem.status = 'draft';
      problem.previewValidated = false;
      problem.previewTested = false;
      problem.validatedLanguages = [];
      await problem.save();
    }
  }
  console.log(JSON.stringify({ apply, repaired: changes.length, changes }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
