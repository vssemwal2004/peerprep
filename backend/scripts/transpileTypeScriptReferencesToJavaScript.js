import '../src/setup.js';

import ts from 'typescript';

import Problem from '../src/models/Problem.js';
import { closeDb, connectDb } from '../src/utils/db.js';

function transpile(source, title) {
  const result = ts.transpileModule(String(source || ''), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2019,
      module: ts.ModuleKind.None,
      removeComments: false,
      downlevelIteration: true,
    },
    fileName: `${String(title || 'solution').replace(/[^a-z0-9_-]/gi, '_')}.ts`,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    const message = ts.flattenDiagnosticMessageText(errors[0].messageText, '\n');
    throw new Error(message);
  }
  return result.outputText.replace(/\r\n/g, '\n').trim();
}

async function main() {
  const apply = process.argv.includes('--apply');
  const replace = process.argv.includes('--replace');
  await connectDb();
  const problems = await Problem.find({
    supportedLanguages: { $all: ['typescript', 'javascript'] },
    'referenceSolutions.typescript': { $exists: true, $ne: '' },
  }).select('_id title referenceSolutions');
  const operations = [];
  let generated = 0;
  let preserved = 0;
  const failures = [];
  for (const problem of problems) {
    if (!replace && String(problem.referenceSolutions?.get('javascript') || '').trim()) {
      preserved += 1;
      continue;
    }
    try {
      const source = transpile(problem.referenceSolutions.get('typescript'), problem.title);
      if (!source) throw new Error('Transpiler returned empty JavaScript.');
      generated += 1;
      operations.push({ updateOne: {
        filter: { _id: problem._id },
        update: { $set: { 'referenceSolutions.javascript': source } },
      } });
    } catch (error) {
      failures.push({ id: problem._id, title: problem.title, error: error.message });
    }
  }
  if (apply) {
    for (let offset = 0; offset < operations.length; offset += 100) {
      await Problem.bulkWrite(operations.slice(offset, offset + 100), { ordered: false });
      console.log(`[typescript->javascript] ${Math.min(offset + 100, operations.length)}/${operations.length}`);
    }
  }
  console.log(JSON.stringify({
    apply,
    scanned: problems.length,
    generated,
    preserved,
    failed: failures.length,
    firstFailures: failures.slice(0, 20),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);

