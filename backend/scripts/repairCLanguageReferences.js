import '../src/setup.js';

import Problem from '../src/models/Problem.js';
import { closeDb, connectDb } from '../src/utils/db.js';

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDb();
  const problems = await Problem.find({ 'referenceSolutions.c': { $exists: true, $ne: '' } })
    .select('title referenceSolutions');
  const operations = [];
  const changes = [];
  for (const problem of problems) {
    const original = String(problem.referenceSolutions?.get?.('c') || '');
    let repaired = original
      .replace(/int\s*\*\s*\*\s*\*\s*(returnColumnSizes|returnColSizes)\b/g, 'int** $1')
      .replace(/\*(returnColumnSizes|returnColSizes)\s*=\s*&\s*([A-Za-z_]\w*)\s*;/g, '*$1 = $2;');
    if (/^Palindrome Number$/i.test(problem.title)) {
      repaired = repaired.replace(
        /if\s*\(x\s*<\s*0\)\s*return\s+false\s*;/,
        'if (x < 0 || (x != 0 && x % 10 == 0)) return false;',
      );
    }
    if (repaired === original) continue;
    changes.push({ id: String(problem._id), title: problem.title });
    operations.push({ updateOne: {
      filter: { _id: problem._id },
      update: {
        $set: { 'referenceSolutions.c': repaired, status: 'draft', previewValidated: false, previewTested: false },
        $pull: { validatedLanguages: 'c' },
      },
    } });
  }
  if (apply && operations.length) await Problem.bulkWrite(operations, { ordered: false });
  console.log(JSON.stringify({ apply, scanned: problems.length, repaired: changes.length, changes: changes.slice(0, 20) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
