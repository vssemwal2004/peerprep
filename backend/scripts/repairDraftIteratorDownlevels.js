import '../src/setup.js';

import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import Problem from '../src/models/Problem.js';
import { closeDb, connectDb } from '../src/utils/db.js';

export function repair(source) {
  // ES5 array-loop lowering cannot enumerate Map/Set iterators. Restrict the
  // correction to generated indexed loops over known Map/Set declarations.
  const collections = new Set([...source.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:Map|Set)\s*\(/g)]
    .map((match) => match[1]));
  return source.replace(
    /(\bfor\s*\(\s*var\s+[A-Za-z_$][\w$]*\s*=\s*0\s*,\s*([A-Za-z_$][\w$]*)\s*=\s*)([A-Za-z_$][\w$]*)(\.(?:entries|keys|values)\(\))?(\s*;\s*[A-Za-z_$][\w$]*\s*<\s*\2\.length\s*;)/g,
    (full, before, alias, collection, iterator, after) => collections.has(collection)
      ? `${before}Array.from(${collection}${iterator || ''})${after}` : full,
  );
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'memory') throw new Error('A real MONGODB_URI is required.');
  process.env.NODE_ENV = 'production';
  await connectDb();
  const problems = await Problem.find({ status: 'draft', category: { $ne: 'SQL' },
    'referenceSolutions.typescript': { $exists: true, $ne: '' } }).select('_id title referenceSolutions.typescript').lean();
  const plans = problems.flatMap((problem) => {
    const previousSource = problem.referenceSolutions.typescript;
    const replacementSource = repair(previousSource);
    return replacementSource === previousSource ? [] : [{
      problemId: problem._id, title: problem.title, language: 'typescript', previousSource, replacementSource,
      beforeHash: createHash('sha256').update(previousSource).digest('hex'),
      afterHash: createHash('sha256').update(replacementSource).digest('hex'),
      reason: 'Generated indexed loop used .length on a Map/Set iterator. Materialize that exact loop iterable with Array.from.',
    }];
  });
  let modified = 0;
  if (apply && plans.length) {
    const audit = mongoose.connection.collection('sixLanguageReferenceRepairs');
    for (let offset = 0; offset < plans.length; offset += 100) {
      const batch = plans.slice(offset, offset + 100);
      const records = batch.map((plan) => ({ _id: new mongoose.Types.ObjectId(), ...plan,
        state: 'staged-pending-apply', validation: null, createdAt: new Date() }));
      await audit.insertMany(records);
      const result = await Problem.bulkWrite(batch.map((plan) => ({ updateOne: {
        filter: { _id: plan.problemId, status: 'draft', 'referenceSolutions.typescript': plan.previousSource },
        update: { $set: { 'referenceSolutions.typescript': plan.replacementSource, previewValidated: false, previewTested: false },
          $pull: { validatedLanguages: 'typescript' } },
      } })), { ordered: false });
      modified += result.modifiedCount;
      const current = await Problem.find({ _id: { $in: batch.map((plan) => plan.problemId) } })
        .select('_id referenceSolutions.typescript').lean();
      const currentById = new Map(current.map((problem) => [String(problem._id), problem]));
      await audit.bulkWrite(records.map((record) => ({ updateOne: { filter: { _id: record._id }, update: { $set: {
        state: currentById.get(String(record.problemId))?.referenceSolutions?.typescript === record.replacementSource
          ? 'applied-awaiting-full-six-language-validation' : 'skipped-or-concurrent-edit', appliedAt: new Date(),
      } } } })), { ordered: false });
    }
  }
  console.log(JSON.stringify({ apply, scanned: problems.length, proposed: plans.length, modified,
    changes: plans.map(({ problemId, title, language, beforeHash, afterHash }) => ({ problemId, title, language, beforeHash, afterHash })) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; }).finally(closeDb);
}
