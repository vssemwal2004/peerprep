import mongoose from 'mongoose';
import CodingTopic from '../models/CodingTopic.js';
import CodingTag from '../models/CodingTag.js';
import Problem from '../models/Problem.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import { HttpError } from '../utils/errors.js';

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  return cleanName(value).toLocaleLowerCase('en');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listIds(value, field) {
  if (!value) return [];
  return Array.from(new Set(String(value).split(',').map((entry) => entry.trim()).filter(Boolean)))
    .map((id) => objectId(id, field));
}

function slugBase(value) {
  return normalizeName(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'topic';
}

function uniqueStrings(values, limit = 30) {
  const source = Array.isArray(values) ? values : String(values || '').split(',');
  return Array.from(new Map(source
    .map((entry) => cleanName(entry))
    .filter(Boolean)
    .map((entry) => [entry.toLocaleLowerCase('en'), entry])).values()).slice(0, limit);
}

function objectId(value, field = 'Topic') {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new HttpError(400, `${field} is invalid.`);
  return new mongoose.Types.ObjectId(value);
}

async function uniqueSlug(name, excludeId = null) {
  const base = slugBase(name);
  let slug = base;
  let suffix = 2;
  while (await CodingTopic.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

async function parentContext(parentId, topicId = null) {
  if (!parentId) return { parent: null, ancestorIds: [], depth: 0 };
  const parent = await CodingTopic.findById(objectId(parentId, 'Parent topic')).lean();
  if (!parent || parent.status === 'archived') throw new HttpError(400, 'Parent topic is unavailable.');
  if (topicId && String(parent._id) === String(topicId)) throw new HttpError(400, 'A topic cannot be its own parent.');
  if (topicId && (parent.ancestorIds || []).some((id) => String(id) === String(topicId))) {
    throw new HttpError(400, 'A topic cannot be moved below one of its descendants.');
  }
  const ancestorIds = [...(parent.ancestorIds || []), parent._id];
  if (ancestorIds.length > 12) throw new HttpError(400, 'Topic hierarchy cannot exceed 12 levels.');
  return { parent, ancestorIds, depth: ancestorIds.length };
}

async function rebuildDescendants(topicId, nextAncestors) {
  const descendants = await CodingTopic.find({ ancestorIds: topicId }).sort({ depth: 1 });
  for (const descendant of descendants) {
    const ownTrailIndex = descendant.ancestorIds.findIndex((id) => String(id) === String(topicId));
    const tail = ownTrailIndex >= 0 ? descendant.ancestorIds.slice(ownTrailIndex + 1) : [];
    descendant.ancestorIds = [...nextAncestors, topicId, ...tail];
    descendant.depth = descendant.ancestorIds.length;
    await descendant.save();
  }

  const topicMap = new Map((await CodingTopic.find({ status: 'active' }).lean())
    .map((entry) => [String(entry._id), entry]));
  const affectedIds = [topicId, ...descendants.map((entry) => entry._id)];
  const problemIds = await Problem.find({ topicIds: { $in: affectedIds } }).select('_id topicIds').lean();
  for (const problem of problemIds) {
    const ancestorSet = new Map();
    (problem.topicIds || []).forEach((id) => {
      const topic = topicMap.get(String(id));
      (topic?.ancestorIds || []).forEach((ancestorId) => ancestorSet.set(String(ancestorId), ancestorId));
    });
    await Problem.updateOne({ _id: problem._id }, { $set: { topicAncestorIds: Array.from(ancestorSet.values()) } });
    await QuestionLibrary.updateMany({ sourceProblemId: problem._id }, {
      $set: { topicIds: problem.topicIds || [], topicAncestorIds: Array.from(ancestorSet.values()) },
    });
  }
}

async function uniqueTagSlug(name) {
  const base = slugBase(name);
  let slug = base;
  let suffix = 2;
  while (await CodingTag.exists({ slug })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function uniqueQuestionIdentityExpression() {
  return {
    $cond: [
      { $ne: [{ $ifNull: ['$sourceProblemId', null] }, null] },
      { $concat: ['problem:', { $toString: '$sourceProblemId' }] },
      { $concat: ['source:', { $toString: { $cond: [{ $ne: [{ $ifNull: ['$sourceKey', ''] }, ''] }, '$sourceKey', '$_id'] } }] },
    ],
  };
}

async function aggregateTopicCounts(questionQuery) {
  const [result = {}] = await QuestionLibrary.aggregate([
    { $match: questionQuery },
    { $project: { identity: uniqueQuestionIdentityExpression(), topicIds: 1, topicAncestorIds: 1 } },
    { $group: { _id: '$identity', topicIds: { $first: '$topicIds' }, topicAncestorIds: { $first: '$topicAncestorIds' } } },
    { $project: { topicIds: { $setUnion: [{ $ifNull: ['$topicIds', []] }, []] }, allTopicIds: { $setUnion: [{ $ifNull: ['$topicIds', []] }, { $ifNull: ['$topicAncestorIds', []] }] } } },
    { $facet: {
      direct: [{ $unwind: '$topicIds' }, { $group: { _id: '$topicIds', count: { $sum: 1 } } }],
      total: [{ $unwind: '$allTopicIds' }, { $group: { _id: '$allTopicIds', count: { $sum: 1 } } }],
      uncategorized: [{ $match: { $expr: { $eq: [{ $size: '$topicIds' }, 0] } } }, { $count: 'count' }],
    } },
  ]).allowDiskUse(true);
  return {
    direct: new Map((result.direct || []).map((entry) => [String(entry._id), entry.count])),
    total: new Map((result.total || []).map((entry) => [String(entry._id), entry.count])),
    uncategorized: Number(result.uncategorized?.[0]?.count || 0),
  };
}

async function aggregateTagCounts(questionQuery) {
  const rows = await QuestionLibrary.aggregate([
    { $match: questionQuery },
    { $project: { identity: uniqueQuestionIdentityExpression(), codingTagIds: 1 } },
    { $group: { _id: '$identity', codingTagIds: { $first: '$codingTagIds' } } },
    { $project: { codingTagIds: { $setUnion: [{ $ifNull: ['$codingTagIds', []] }, []] } } },
    { $unwind: '$codingTagIds' },
    { $group: { _id: '$codingTagIds', count: { $sum: 1 } } },
  ]).allowDiskUse(true);
  return new Map(rows.map((entry) => [String(entry._id), entry.count]));
}

export async function listCodingTopics(req, res) {
  const includeArchived = String(req.query?.includeArchived || '').toLowerCase() === 'true';
  const withQuestions = String(req.query?.withQuestions || '').toLowerCase() === 'true';
  const topicQuery = includeArchived ? {} : { status: 'active' };
  const search = cleanName(req.query?.search).slice(0, 100);
  const requestedIds = listIds(req.query?.ids, 'Topic');
  const questionQuery = { questionType: 'coding' };
  if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all') questionQuery.createdBy = req.user._id;
  const populatedIds = withQuestions ? await QuestionLibrary.distinct('topicIds', questionQuery) : [];
  const populatedIdSet = new Set(populatedIds.map(String));
  const visibleRequestedIds = withQuestions
    ? requestedIds.filter((id) => populatedIdSet.has(String(id)))
    : requestedIds;
  if (requestedIds.length) topicQuery._id = { $in: visibleRequestedIds };
  else if (withQuestions) topicQuery._id = { $in: populatedIds };
  if (search) topicQuery.$or = [
    { name: { $regex: escapeRegex(search), $options: 'i' } },
    { aliases: { $regex: escapeRegex(search), $options: 'i' } },
  ];
  const paginated = req.query?.limit !== undefined || req.query?.page !== undefined || req.query?.search !== undefined || requestedIds.length > 0;
  const page = Math.max(1, Number(req.query?.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 100));
  const topicCursor = CodingTopic.find(topicQuery).sort({ depth: 1, displayOrder: 1, name: 1 });
  if (paginated) topicCursor.skip((page - 1) * limit).limit(limit);
  const [topics, topicTotal, counts] = await Promise.all([
    topicCursor.lean(),
    CodingTopic.countDocuments(topicQuery),
    aggregateTopicCounts(questionQuery),
  ]);
  res.json({
    topics: topics.map((topic) => ({
      ...topic,
      directQuestionCount: counts.direct.get(String(topic._id)) || 0,
      totalQuestionCount: counts.total.get(String(topic._id)) || 0,
    })),
    uncategorizedCount: counts.uncategorized,
    pagination: { page, limit: paginated ? limit : topicTotal, total: topicTotal, pages: paginated ? Math.max(1, Math.ceil(topicTotal / limit)) : 1 },
  });
}

export async function createCodingTopic(req, res) {
  const name = cleanName(req.body?.name);
  if (!name) throw new HttpError(400, 'Topic name is required.');
  const context = await parentContext(req.body?.parentId || null);
  try {
    const topic = await CodingTopic.create({
      name,
      normalizedName: normalizeName(name),
      slug: await uniqueSlug(name),
      parentId: context.parent?._id || null,
      ancestorIds: context.ancestorIds,
      depth: context.depth,
      description: cleanName(req.body?.description),
      aliases: uniqueStrings(req.body?.aliases),
      legacyTag: cleanName(req.body?.legacyTag),
      displayOrder: Number.isFinite(Number(req.body?.displayOrder)) ? Number(req.body.displayOrder) : 0,
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });
    res.status(201).json({ topic });
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, 'A topic with this name already exists under the selected parent.');
    throw error;
  }
}

export async function listCodingTags(req, res) {
  const search = cleanName(req.query?.search).slice(0, 100);
  const withQuestions = String(req.query?.withQuestions || '').toLowerCase() === 'true';
  const requestedIds = listIds(req.query?.ids, 'Tag');
  const tagQuery = { status: 'active' };
  const questionQuery = { questionType: 'coding' };
  if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all') questionQuery.createdBy = req.user._id;
  const populatedIds = withQuestions ? await QuestionLibrary.distinct('codingTagIds', questionQuery) : [];
  const populatedIdSet = new Set(populatedIds.map(String));
  const visibleRequestedIds = withQuestions
    ? requestedIds.filter((id) => populatedIdSet.has(String(id)))
    : requestedIds;
  if (requestedIds.length) tagQuery._id = { $in: visibleRequestedIds };
  else if (withQuestions) tagQuery._id = { $in: populatedIds };
  if (search) tagQuery.name = { $regex: escapeRegex(search), $options: 'i' };
  const paginated = req.query?.limit !== undefined || req.query?.page !== undefined || req.query?.search !== undefined || requestedIds.length > 0;
  const page = Math.max(1, Number(req.query?.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 100));
  const tagCursor = CodingTag.find(tagQuery).sort({ name: 1 });
  if (paginated) tagCursor.skip((page - 1) * limit).limit(limit);
  const [tags, tagTotal, counts] = await Promise.all([
    tagCursor.lean(),
    CodingTag.countDocuments(tagQuery),
    aggregateTagCounts(questionQuery),
  ]);
  res.json({
    tags: tags.map((tag) => ({ ...tag, questionCount: counts.get(String(tag._id)) || 0 })),
    pagination: { page, limit: paginated ? limit : tagTotal, total: tagTotal, pages: paginated ? Math.max(1, Math.ceil(tagTotal / limit)) : 1 },
  });
}

export async function createCodingTag(req, res) {
  const name = cleanName(req.body?.name);
  if (!name) throw new HttpError(400, 'Tag name is required.');
  try {
    const tag = await CodingTag.create({
      name,
      normalizedName: normalizeName(name),
      slug: await uniqueTagSlug(name),
      createdBy: req.user?._id,
    });
    res.status(201).json({ tag });
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, 'A tag with this name already exists.');
    throw error;
  }
}

export async function updateCodingTopic(req, res) {
  const topic = await CodingTopic.findById(objectId(req.params.id));
  if (!topic) throw new HttpError(404, 'Topic not found.');
  const name = req.body?.name === undefined ? topic.name : cleanName(req.body.name);
  if (!name) throw new HttpError(400, 'Topic name is required.');
  const requestedParent = req.body?.parentId === undefined
    ? topic.parentId
    : (req.body.parentId || null);
  const oldAncestors = [...topic.ancestorIds];
  const context = await parentContext(requestedParent, topic._id);
  try {
    const nameChanged = name !== topic.name;
    topic.name = name;
    topic.normalizedName = normalizeName(name);
    if (nameChanged) topic.slug = await uniqueSlug(name, topic._id);
    topic.parentId = context.parent?._id || null;
    topic.ancestorIds = context.ancestorIds;
    topic.depth = context.depth;
    if (req.body?.description !== undefined) topic.description = cleanName(req.body.description);
    if (req.body?.aliases !== undefined) topic.aliases = uniqueStrings(req.body.aliases);
    if (req.body?.displayOrder !== undefined && Number.isFinite(Number(req.body.displayOrder))) topic.displayOrder = Number(req.body.displayOrder);
    if (['active', 'archived'].includes(req.body?.status)) topic.status = req.body.status;
    topic.updatedBy = req.user?._id;
    await topic.save();
    const hierarchyChanged = JSON.stringify(oldAncestors.map(String)) !== JSON.stringify(context.ancestorIds.map(String));
    if (hierarchyChanged) await rebuildDescendants(topic._id, context.ancestorIds);
    res.json({ topic });
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, 'A topic with this name already exists under the selected parent.');
    throw error;
  }
}

export async function archiveCodingTopic(req, res) {
  const topic = await CodingTopic.findById(objectId(req.params.id));
  if (!topic) throw new HttpError(404, 'Topic not found.');
  const assigned = await Problem.countDocuments({ topicIds: topic._id });
  const activeChildren = await CodingTopic.countDocuments({ parentId: topic._id, status: 'active' });
  if (assigned || activeChildren) {
    throw new HttpError(409, `Topic cannot be archived while it has ${assigned} direct question assignment(s) and ${activeChildren} active child topic(s).`);
  }
  topic.status = 'archived';
  topic.updatedBy = req.user?._id;
  await topic.save();
  res.json({ success: true, topic });
}

export async function assignCodingTopicsBulk(req, res) {
  const libraryIds = Array.isArray(req.body?.questionIds) ? req.body.questionIds : [];
  const topicIds = Array.isArray(req.body?.topicIds) ? req.body.topicIds : [];
  const mode = ['replace', 'remove'].includes(req.body?.mode) ? req.body.mode : 'add';
  if (!libraryIds.length) throw new HttpError(400, 'Select at least one coding question.');
  const validLibraryIds = libraryIds.map((id) => objectId(id, 'Question'));
  const validTopicIds = topicIds.map((id) => objectId(id));
  const topics = await CodingTopic.find({ _id: { $in: validTopicIds }, status: 'active' }).lean();
  if (topics.length !== validTopicIds.length) throw new HttpError(400, 'One or more selected topics are unavailable.');
  const libraryQuestions = await QuestionLibrary.find({ _id: { $in: validLibraryIds }, questionType: 'coding' })
    .select('sourceProblemId').lean();
  const problemIds = Array.from(new Set(libraryQuestions.map((entry) => String(entry.sourceProblemId || '')).filter(Boolean)));
  if (!problemIds.length) throw new HttpError(400, 'Selected questions are not linked to coding problems.');
  const problems = await Problem.find({ _id: { $in: problemIds } });
  const allTopics = new Map((await CodingTopic.find({ status: 'active' }).lean()).map((entry) => [String(entry._id), entry]));
  for (const problem of problems) {
    const current = new Map((problem.topicIds || []).map((id) => [String(id), id]));
    if (mode === 'replace') current.clear();
    validTopicIds.forEach((id) => mode === 'remove' ? current.delete(String(id)) : current.set(String(id), id));
    const nextIds = Array.from(current.values());
    const ancestors = new Map();
    nextIds.forEach((id) => (allTopics.get(String(id))?.ancestorIds || [])
      .forEach((ancestorId) => ancestors.set(String(ancestorId), ancestorId)));
    problem.topicIds = nextIds;
    problem.topicAncestorIds = Array.from(ancestors.values());
    problem.updatedBy = req.user?._id;
    await problem.save();
    await QuestionLibrary.updateMany({ sourceProblemId: problem._id }, {
      $set: { topicIds: problem.topicIds, topicAncestorIds: problem.topicAncestorIds },
    });
  }
  res.json({ success: true, updated: problems.length });
}
