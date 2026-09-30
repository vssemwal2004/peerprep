import '../src/setup.js';

import mongoose from 'mongoose';

import Problem from '../src/models/Problem.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import { closeDb, connectDb } from '../src/utils/db.js';
import {
  cleanImportedProblemDescription,
  getVisibleCodeTemplate,
  hasPythonFunctionAdapter,
} from '../src/services/functionProblemAdapterService.js';

const BATCH_SIZE = 200;

async function main() {
  await connectDb();
  const registry = mongoose.connection.collection('question_import_registry');
  const importedIds = await registry.distinct('problemId', { provider: 'leetcode-dataset' });
  let migrated = 0;

  for (let offset = 0; offset < importedIds.length; offset += BATCH_SIZE) {
    const ids = importedIds.slice(offset, offset + BATCH_SIZE);
    const problems = await Problem.find({ _id: { $in: ids } }).select('+executionHarnesses').lean();
    const problemOps = [];
    const libraryOps = [];

    for (const problem of problems) {
      const python = String(problem.codeTemplates?.python || '');
      const storedHarness = String(problem.executionHarnesses?.python || '');
      const harness = hasPythonFunctionAdapter(storedHarness) ? storedHarness : python;
      if (!hasPythonFunctionAdapter(harness)) continue;

      const visiblePython = getVisibleCodeTemplate('python', harness);
      const description = cleanImportedProblemDescription(problem.description, { python: harness });
      problemOps.push({
        updateOne: {
          filter: { _id: problem._id },
          update: {
            $set: {
              description,
              'codeTemplates.python': visiblePython,
              'executionHarnesses.python': harness,
            },
          },
        },
      });
      libraryOps.push({
        updateOne: {
          filter: { sourceType: 'compiler', sourceProblemId: problem._id },
          update: {
            $set: {
              questionText: description,
              'questionData.description': description,
              'questionData.codeTemplates.python': visiblePython,
              lastSyncedAt: new Date(),
            },
          },
        },
      });
    }

    if (problemOps.length) await Problem.bulkWrite(problemOps, { ordered: false });
    if (libraryOps.length) await QuestionLibrary.bulkWrite(libraryOps, { ordered: false });
    migrated += problemOps.length;
    console.log(`Migrated ${migrated}/${importedIds.length} imported problems.`);
  }

  console.log(JSON.stringify({ imported: importedIds.length, migrated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
