import mongoose from 'mongoose';
import CodingTag from '../models/CodingTag.js';
import Problem from '../models/Problem.js';
import QuestionLibrary from '../models/QuestionLibrary.js';

const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const slugBase = (value) => normalize(value).toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'topic';

async function uniqueSlug(name) {
  const base = slugBase(name);
  let slug = base;
  let suffix = 2;
  while (await CodingTag.exists({ slug })) slug = `${base}-${suffix++}`;
  return slug;
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const tags = (await Problem.distinct('tags')).map(normalize).filter(Boolean);
  const tagsByName = new Map();
  for (const name of tags) {
    const normalizedName = name.toLowerCase();
    let tag = await CodingTag.findOne({ normalizedName });
    if (!tag) tag = await CodingTag.create({ name, normalizedName, slug: await uniqueSlug(name) });
    tagsByName.set(normalizedName, tag);
  }

  let updated = 0;
  const cursor = Problem.find({ tags: { $exists: true, $ne: [] } }).cursor();
  for await (const problem of cursor) {
    const merged = new Map((problem.codingTagIds || []).map((id) => [String(id), id]));
    (problem.tags || []).forEach((tag) => {
      const controlledTag = tagsByName.get(normalize(tag).toLowerCase());
      if (controlledTag) merged.set(String(controlledTag._id), controlledTag._id);
    });
    problem.codingTagIds = Array.from(merged.values());
    await problem.save();
    await QuestionLibrary.updateMany({ sourceProblemId: problem._id }, { $set: { codingTagIds: problem.codingTagIds } });
    updated += 1;
  }
  console.log(`Controlled coding-tag backfill complete: ${tagsByName.size} tags, ${updated} problems updated. Existing questions remain uncategorized until an admin selects their required primary topic.`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
