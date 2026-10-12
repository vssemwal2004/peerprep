import mongoose from 'mongoose';
import { HttpError } from '../utils/errors.js';
import Problem from '../models/Problem.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import CompanyBenchmark from '../models/CompanyBenchmark.js';
import { CENTRAL_QUESTION_FILTER } from './centralQuestions.js';
import { InterviewQuestionReport } from './interviewQuestionReports.js';

// Super-admin decisions on student-typed company names. Catalog companies (problem tags, central library
// keywords, benchmarks) need no decision; a decision always overrides them.
const companySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  status: { type: String, enum: ['approved', 'rejected', 'merged'], required: true },
  mergedInto: { type: String, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
}, { timestamps: true });

const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'interview-companies' },
  voteThreshold: { type: Number, default: 20, min: 1, max: 1000 },
}, { timestamps: true });

export const InterviewCompany = mongoose.models.InterviewCompany || mongoose.model('InterviewCompany', companySchema);
export const InterviewCompanySettings = mongoose.models.InterviewCompanySettings
  || mongoose.model('InterviewCompanySettings', settingsSchema);

export const DEFAULT_VOTE_THRESHOLD = 20;
const SETTINGS_ID = 'interview-companies';
const CATALOG_TTL_MS = 30000;
const STATUSES = ['pending', 'approved', 'merged', 'rejected'];
const SUFFIXES = new Set(('inc incorporated ltd limited pvt private llc llp corp corporation co company technologies '
  + 'technology tech solutions services software systems labs india global group').split(' '));

const cleanName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const intIn = (value, min, max, fallback) => Math.min(max, Math.max(min, Math.floor(Number(value)) || fallback));
export const companyKeyOf = (name) => cleanName(name).toLocaleLowerCase('en-US');

export function similarityKey(name) {
  const words = String(name ?? '').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  const core = words.filter((word) => !SUFFIXES.has(word));
  return (core.length ? core : words).join('');
}

function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** 1 for the same name once corporate suffixes are ignored, the edit ratio for close spellings, else 0. */
export function similarityScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 4) return 0;
  // The edit distance is at least the length gap, so a gap over 20% can never reach the 0.8 ratio.
  if (Math.abs(a.length - b.length) > 0.2 * Math.max(a.length, b.length) + 1e-9) return 0;
  const ratio = 1 - editDistance(a, b) / Math.max(a.length, b.length);
  return ratio >= 0.8 - 1e-9 ? ratio : 0;
}

export function closestCompany(name, catalog, excludeKey = companyKeyOf(name)) {
  const target = similarityKey(name);
  let best = null;
  let bestScore = 0;
  for (const company of catalog.byKey.values()) {
    if (company.key === excludeKey) continue;
    const score = similarityScore(target, catalog.similar.get(company.key));
    if (score > bestScore) { best = company; bestScore = score; }
  }
  return best && { key: best.key, name: best.name };
}

// Same visibility rule as the student company list: drafts, private and assessment problems never leak a company name.
const PUBLIC_PROBLEM_FILTER = { status: { $in: ['published', 'Active', 'active'] },
  $or: [{ visibility: 'public' }, { visibility: { $exists: false } }] };

async function loadCatalog() {
  const [problemTags, keywords, snapshotTags, benchmarks, decisions] = await Promise.all([
    Problem.distinct('companyTags', PUBLIC_PROBLEM_FILTER),
    QuestionLibrary.distinct('keywords', CENTRAL_QUESTION_FILTER),
    QuestionLibrary.distinct('questionData.problemDataSnapshot.companyTags', CENTRAL_QUESTION_FILTER),
    CompanyBenchmark.distinct('companyName'),
    InterviewCompany.find().lean(),
  ]);
  const byKey = new Map();
  const aliases = new Map();
  const rejected = new Set();
  const sourceKeys = new Set();
  for (const value of [...problemTags, ...keywords, ...snapshotTags, ...benchmarks]) {
    const name = typeof value === 'string' ? cleanName(value) : '';
    if (name.length < 2 || name.length > 80) continue;
    const key = companyKeyOf(name);
    sourceKeys.add(key);
    if (!byKey.has(key)) byKey.set(key, { key, name });
  }
  const decided = new Set(decisions.map((decision) => decision.key));
  const nameAliases = new Set();
  for (const decision of decisions) {
    if (decision.status === 'approved') byKey.set(decision.key, { key: decision.key, name: decision.name });
    else byKey.delete(decision.key);
    if (decision.status === 'rejected') rejected.add(decision.key);
  }
  // A company approved under another name is found by that name too; if a catalog source later carries the
  // same name, the approved spelling counts toward that source instead of splitting the votes.
  for (const decision of decisions) {
    const nameKey = companyKeyOf(decision.name);
    if (decision.status !== 'approved' || nameKey === decision.key || decided.has(nameKey)) continue;
    if (byKey.has(nameKey)) { byKey.delete(decision.key); aliases.set(decision.key, nameKey); }
    else { aliases.set(nameKey, decision.key); nameAliases.add(nameKey); }
  }
  // One hop only: a merge target must itself be a listed company.
  for (const decision of decisions) {
    const into = byKey.has(decision.mergedInto) ? decision.mergedInto : aliases.get(decision.mergedInto);
    if (decision.status === 'merged' && byKey.has(into)) aliases.set(decision.key, into);
  }
  const similar = new Map([...byKey.values()].map((company) => [company.key, similarityKey(company.name)]));
  return { byKey, aliases, rejected, sourceKeys, nameAliases, similar };
}

let catalogCache = null;
let catalogLoad = null;
let catalogGeneration = 0;

export function resetCompanyCatalogCache() {
  catalogCache = null;
  catalogLoad = null;
  catalogGeneration += 1;
}

export function companyCatalog() {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return Promise.resolve(catalogCache.value);
  if (catalogLoad) return catalogLoad;
  const generation = catalogGeneration;
  const load = loadCatalog().then((value) => {
    if (generation === catalogGeneration) catalogCache = { at: Date.now(), value };
    return value;
  }).finally(() => { if (catalogLoad === load) catalogLoad = null; });
  catalogLoad = load;
  return load;
}

export const resolveCompany = (key, catalog) => catalog.byKey.get(key) || catalog.byKey.get(catalog.aliases.get(key)) || null;

export async function voteThreshold() {
  const settings = await InterviewCompanySettings.findById(SETTINGS_ID).lean();
  const value = settings?.voteThreshold;
  return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : DEFAULT_VOTE_THRESHOLD;
}

export async function setVoteThreshold(value) {
  const threshold = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 1000) {
    throw new HttpError(400, 'Vote threshold must be a whole number from 1 to 1000');
  }
  await InterviewCompanySettings.updateOne({ _id: SETTINGS_ID }, { $set: { voteThreshold: threshold } }, { upsert: true });
  return threshold;
}

/** Distinct reporters per (scope, question, listed company), with merged spellings counted under their target. */
export async function companyVoteGroups(match = {}) {
  const [groups, catalog] = await Promise.all([InterviewQuestionReport.aggregate([
    { $match: match },
    { $group: { _id: { scopeKey: '$scopeKey', questionId: '$questionId', companyKey: '$companyKey' },
      reporters: { $addToSet: '$reporterKey' }, latestDate: { $max: '$interviewDate' } } },
  ]).allowDiskUse(true), companyCatalog()]);
  const merged = new Map();
  for (const { _id, reporters, latestDate } of groups) {
    const company = resolveCompany(_id.companyKey, catalog);
    if (!company) continue;
    const id = `${_id.scopeKey}:${_id.questionId}:${company.key}`;
    if (!merged.has(id)) merged.set(id, { scopeKey: _id.scopeKey, questionId: _id.questionId, company, reporters: new Set(), latestDate });
    const row = merged.get(id);
    reporters.forEach((reporter) => row.reporters.add(reporter));
    if (latestDate > row.latestDate) row.latestDate = latestDate;
  }
  return [...merged.values()];
}

async function suggestionRows(catalog, threshold, groups, onlyKey) {
  const decisions = await InterviewCompany.find(onlyKey ? { key: onlyKey } : {}).lean();
  const decided = new Map(decisions.map((decision) => [decision.key, decision]));
  // Names that already resolve to a listed company (catalog sources, approved display names) are not requests.
  const match = onlyKey ? { companyKey: onlyKey }
    : { companyKey: { $nin: [...catalog.sourceKeys, ...catalog.nameAliases].filter((key) => !decided.has(key)) } };
  const [stats, titles, perQuestion] = await Promise.all([
    InterviewQuestionReport.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$companyKey', latestName: { $first: '$companyName' }, variants: { $addToSet: '$companyName' },
        reporters: { $addToSet: '$reporterKey' }, questions: { $addToSet: { scopeKey: '$scopeKey', questionId: '$questionId' } },
        // Reports saved before originKey existed fall back to their scope.
        origins: { $addToSet: { $ifNull: ['$originKey', '$scopeKey'] } },
        firstRequestedAt: { $min: '$createdAt' }, lastRequestedAt: { $max: '$createdAt' } } },
      { $project: { latestName: 1, variants: { $slice: ['$variants', 5] }, voters: { $size: '$reporters' },
        questions: { $size: '$questions' }, firstRequestedAt: 1, lastRequestedAt: 1,
        universities: { $size: { $filter: { input: '$origins', cond: { $regexMatch: { input: '$$this', regex: /^university:/ } } } } } } },
    ]).allowDiskUse(true),
    InterviewQuestionReport.aggregate([
      { $match: match },
      { $group: { _id: { companyKey: '$companyKey', jobTitleKey: '$jobTitleKey', reporterKey: '$reporterKey' }, jobTitle: { $first: '$jobTitle' } } },
      { $group: { _id: { companyKey: '$_id.companyKey', jobTitleKey: '$_id.jobTitleKey' }, jobTitle: { $first: '$jobTitle' }, voters: { $sum: 1 } } },
      { $sort: { voters: -1, '_id.jobTitleKey': 1 } },
    ]).allowDiskUse(true),
    InterviewQuestionReport.aggregate([
      { $match: match },
      { $group: { _id: { companyKey: '$companyKey', scopeKey: '$scopeKey', questionId: '$questionId' }, reporters: { $addToSet: '$reporterKey' } } },
      { $group: { _id: '$_id.companyKey', best: { $max: { $size: '$reporters' } } } },
    ]).allowDiskUse(true),
  ]);
  const statByKey = new Map(stats.map((stat) => [stat._id, stat]));
  const bestByKey = new Map(perQuestion.map(({ _id, best }) => [_id, best]));
  const titlesByKey = new Map();
  for (const { _id, jobTitle } of titles) {
    const list = titlesByKey.get(_id.companyKey) || titlesByKey.set(_id.companyKey, []).get(_id.companyKey);
    if (list.length < 3) list.push(jobTitle);
  }
  const verified = new Map();
  const bestListed = new Map();
  for (const group of groups) {
    const { key } = group.company;
    if (group.reporters.size >= threshold) verified.set(key, (verified.get(key) || 0) + 1);
    bestListed.set(key, Math.max(bestListed.get(key) || 0, group.reporters.size));
  }
  return [...new Set([...statByKey.keys(), ...decided.keys()])].map((key) => {
    const stat = statByKey.get(key);
    const decision = decided.get(key);
    const status = decision?.status || 'pending';
    const name = (status === 'approved' && decision.name) || stat?.latestName || decision?.name || key;
    const target = status === 'merged' ? resolveCompany(decision.mergedInto, catalog) : null;
    const listedKey = status === 'approved' ? resolveCompany(key, catalog)?.key || key : null;
    return { key, name, variants: stat?.variants || [], status, voters: stat?.voters || 0, questions: stat?.questions || 0,
      // The most distinct students on any one question, the number the per-question tag threshold is compared with.
      bestQuestionVoters: Math.max(bestByKey.get(key) || 0, listedKey ? bestListed.get(listedKey) || 0 : 0),
      universities: stat?.universities || 0, firstRequestedAt: stat?.firstRequestedAt || null, lastRequestedAt: stat?.lastRequestedAt || null,
      jobTitles: titlesByKey.get(key) || [],
      mergedInto: status === 'merged' ? { key: target?.key || decision.mergedInto, name: target?.name || decision.mergedInto } : null,
      suggestion: null,
      verifiedQuestions: listedKey ? verified.get(listedKey) || 0 : 0,
      reviewedAt: decision?.reviewedAt || null };
  });
}

// Edit-distance suggestions are computed only for rows that are actually returned.
const withSuggestion = (row, catalog) => (row.status === 'merged' ? row : { ...row, suggestion: closestCompany(row.name, catalog, row.key) });

export async function listCompanySuggestions(query = {}) {
  const status = [...STATUSES, 'all'].includes(query.status) ? query.status : 'pending';
  const search = companyKeyOf(String(query.search || '').slice(0, 80));
  const page = intIn(query.page, 1, 100000, 1);
  const limit = intIn(query.limit, 1, 100, 20);
  const [catalog, threshold, groups] = await Promise.all([companyCatalog(), voteThreshold(), companyVoteGroups()]);
  const rows = await suggestionRows(catalog, threshold, groups);
  const counts = { pending: 0, approved: 0, merged: 0, rejected: 0, all: rows.length };
  rows.forEach((row) => { counts[row.status] += 1; });
  const filtered = rows.filter((row) => (status === 'all' || row.status === status)
    && (!search || [row.key, row.name, ...row.variants].some((value) => companyKeyOf(value).includes(search))))
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.voters - a.voters
      || new Date(b.lastRequestedAt || 0) - new Date(a.lastRequestedAt || 0) || a.key.localeCompare(b.key));
  return {
    rows: filtered.slice((page - 1) * limit, page * limit).map((row) => withSuggestion(row, catalog)), counts, threshold,
    verifiedTags: groups.filter((group) => group.reporters.size >= threshold).length,
    catalog: [...catalog.byKey.values()].map(({ key, name }) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name)),
    pagination: { page, limit, total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / limit)) },
  };
}

const listedByName = (catalog, value) => {
  const key = companyKeyOf(value);
  return catalog.byKey.get(key) || [...catalog.byKey.values()].find((company) => companyKeyOf(company.name) === key) || null;
};

export async function decideCompany(admin, rawKey, body = {}) {
  const key = companyKeyOf(String(rawKey || '').slice(0, 200));
  const action = String(body?.action || '');
  if (!['approve', 'reject', 'merge', 'reset'].includes(action)) throw new HttpError(400, 'Choose approve, merge, reject or reset');
  resetCompanyCatalogCache();
  const [decision, latest, catalog] = await Promise.all([
    key ? InterviewCompany.findOne({ key }).lean() : null,
    key ? InterviewQuestionReport.findOne({ companyKey: key }).sort({ createdAt: -1 }).select('companyName').lean() : null,
    companyCatalog(),
  ]);
  if (!decision && !latest) throw new HttpError(404, 'Company suggestion not found');
  if (action === 'reset') await InterviewCompany.deleteOne({ key });
  else {
    const update = { name: latest?.companyName || decision?.name || key, mergedInto: null, reviewedAt: new Date(),
      status: { approve: 'approved', merge: 'merged', reject: 'rejected' }[action],
      ...(mongoose.isValidObjectId(admin?._id) ? { reviewedBy: admin._id } : {}) };
    if (action === 'approve') {
      if (body.name != null && String(body.name).trim()) update.name = cleanName(body.name);
      if (update.name.length < 2 || update.name.length > 80) throw new HttpError(400, 'Company name must be 2 to 80 characters');
      const owner = listedByName(catalog, update.name);
      if (owner && owner.key !== key) throw new HttpError(409, `${owner.name} is already listed. Merge into it instead.`);
    }
    let target = null;
    if (action === 'merge') {
      target = body.mergeInto ? listedByName(catalog, String(body.mergeInto).slice(0, 200)) : null;
      if (!target) throw new HttpError(400, 'Choose a listed company to merge into');
      if (target.key === key) throw new HttpError(400, 'A company cannot be merged into itself');
      update.mergedInto = target.key;
    }
    await InterviewCompany.updateOne({ key }, { $set: update }, { upsert: true });
    // Spellings that pointed at this company follow it, so resolution stays one hop.
    if (target) await InterviewCompany.updateMany({ status: 'merged', mergedInto: key }, { $set: { mergedInto: target.key } });
  }
  resetCompanyCatalogCache();
  const [fresh, threshold] = await Promise.all([companyCatalog(), voteThreshold()]);
  const listedKey = resolveCompany(key, fresh)?.key || key;
  const aliases = [...fresh.aliases].filter(([, into]) => into === listedKey).map(([alias]) => alias);
  const groups = await companyVoteGroups({ companyKey: { $in: [listedKey, ...aliases] } });
  const [row] = await suggestionRows(fresh, threshold, groups, key);
  return { row: row ? withSuggestion(row, fresh) : null };
}

const plainTitle = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || null;

export async function companyTagProgress(query = {}) {
  const status = ['verified', 'collecting'].includes(query.status) ? query.status : 'all';
  const search = companyKeyOf(String(query.search || '').slice(0, 80));
  const limit = intIn(query.limit, 1, 500, 100);
  const [threshold, groups] = await Promise.all([voteThreshold(), companyVoteGroups()]);
  const ids = [...new Set(groups.map((group) => String(group.questionId)))];
  const titles = new Map((ids.length ? await QuestionLibrary.find({ _id: { $in: ids } }).select('questionText').lean() : [])
    .map((question) => [String(question._id), plainTitle(question.questionText)]));
  const rows = groups.map((group) => {
    const voters = group.reporters.size;
    return { scopeKey: group.scopeKey,
      scopeLabel: group.scopeKey === 'control' ? 'Central library' : `University ${group.scopeKey.replace(/^university:/, '')}`,
      questionId: String(group.questionId), questionTitle: titles.get(String(group.questionId)) || null,
      companyKey: group.company.key, company: group.company.name, voters, threshold, verified: voters >= threshold,
      latestDate: group.latestDate };
  }).filter((row) => (status === 'all' || row.verified === (status === 'verified'))
    && (!search || [row.company, row.questionTitle].some((value) => companyKeyOf(value).includes(search))))
    .sort((a, b) => b.voters - a.voters || new Date(b.latestDate) - new Date(a.latestDate));
  return { rows: rows.slice(0, limit), threshold };
}
