import '../src/setup.js';

import ts from 'typescript';

import Problem from '../src/models/Problem.js';
import { closeDb, connectDb } from '../src/utils/db.js';

async function main() {
  const apply = process.argv.includes('--apply');
  const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
  const limit = Math.max(0, Number(limitArgument?.split('=')[1]) || 0);
  await connectDb();
  const problems = await Problem.find({
    supportedLanguages: 'typescript',
    'referenceSolutions.typescript': { $exists: true, $ne: '' },
  }).select('_id referenceSolutions').sort({ _id: 1 }).limit(limit);
  const operations = [];
  let changed = 0;
  for (const problem of problems) {
    const source = String(problem.referenceSolutions.get('typescript') || '');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.None,
        removeComments: false,
        downlevelIteration: false,
      },
      reportDiagnostics: false,
    }).outputText.replace(/^['"]use strict['"];?\s*/m, '').trim();
    if (!output || output === source.trim()) continue;
    changed += 1;
    operations.push({ updateOne: {
      filter: { _id: problem._id },
      update: {
        $set: { 'referenceSolutions.typescript': output, status: 'draft', previewValidated: false, previewTested: false },
        $pull: { validatedLanguages: 'typescript' },
      },
    } });
  }
  if (apply) {
    for (let offset = 0; offset < operations.length; offset += 100) {
      await Problem.bulkWrite(operations.slice(offset, offset + 100), { ordered: false });
      console.log(`[typescript-downlevel] ${Math.min(offset + 100, operations.length)}/${operations.length}`);
    }
  }
  console.log(JSON.stringify({ apply, scanned: problems.length, changed }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
