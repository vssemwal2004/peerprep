import '../src/setup.js';

import Problem from '../src/models/Problem.js';
import { buildHiddenPythonHarness } from '../src/services/functionProblemAdapterService.js';
import { closeDb, connectDb } from '../src/utils/db.js';

async function main() {
  const apply = process.argv.includes('--apply');
  const replace = process.argv.includes('--replace');
  await connectDb();
  const problems = await Problem.find({
    executionMode: 'function',
    supportedLanguages: 'python',
    'referenceSolutions.python': { $exists: true, $ne: '' },
  }).select('+executionHarnesses');
  const operations = [];
  let alreadyPresent = 0;
  let restored = 0;
  let unavailable = 0;
  for (const problem of problems) {
    if (!replace && String(problem.executionHarnesses?.get?.('python') || '').trim()) {
      alreadyPresent += 1;
      continue;
    }
    const harness = buildHiddenPythonHarness(problem.referenceSolutions?.get?.('python'));
    if (!harness) {
      unavailable += 1;
      continue;
    }
    restored += 1;
    operations.push({ updateOne: {
      filter: { _id: problem._id },
      update: { $set: { 'executionHarnesses.python': harness, showExecutionHarness: false } },
    } });
  }
  if (apply) {
    for (let offset = 0; offset < operations.length; offset += 100) {
      await Problem.bulkWrite(operations.slice(offset, offset + 100), { ordered: false });
      console.log(`[python-runners] ${Math.min(offset + 100, operations.length)}/${operations.length}`);
    }
  }
  console.log(JSON.stringify({ apply, scanned: problems.length, alreadyPresent, restored, unavailable }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
