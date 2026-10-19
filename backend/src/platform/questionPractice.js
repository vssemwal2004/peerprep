import mongoose from 'mongoose';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import { loadHiddenExecutionTestCases } from '../controllers/problemController.js';
import {
  runJudge0,
  buildJudge0Options,
  KEY_TO_LANGUAGE_ID,
  MAX_STDIN_SIZE_BYTES,
  sanitizeExecutionText,
} from '../services/executionService.js';
import { evaluateProblemSubmissionResult } from '../services/problemSubmissionEvaluationService.js';
import { prepareFunctionSourceForExecution } from '../services/functionProblemAdapterService.js';
import { compilerExecutionLimiter } from '../middleware/rateLimiter.js';
import { sharedQuestions, sharedJudgeData } from './sharedContent.js';
import { isUniversity } from './deployment.js';
import { currentTenant } from './tenantContext.js';
import { universityPolicy, controlRequest } from './client.js';
import { problemUsedInAssessment, serializeProblem, studentFailedCase } from '../controllers/compilerHelpers.js';
import { interviewReportOptions, interviewReportSummaries, reporterKey, saveInterviewReport } from './interviewQuestionReports.js';
import { questionQuickPreps } from '../services/questService.js';
import { matchesSerialSearch, parseSerialSearch, serialSearchClause } from '../utils/problemSerial.js';

const router = Router();
const published = { status: 'published', visibility: { $ne: 'private' }, sourceType: { $ne: 'assessment' } };
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(requireAuth, asyncRoute(async (req, res, next) => {
  if (req.user?.role !== 'student') throw new HttpError(403, 'Student access required');
  if (isUniversity() && !(await universityPolicy()).permissions?.questions) throw new HttpError(403, 'Questions are disabled');
  next();
}));

export const publicShape = (question, source) => ({
  _id: question._id,
  source,
  questionType: question.questionType,
  sourceProblemId: question.sourceProblemId || question.questionData?.problemId || null,
  questionText: question.questionText,
  difficulty: question.difficulty,
  tags: question.tags || [],
  companyTags: question.keywords || question.questionData?.problemDataSnapshot?.companyTags || [],
  displayOrder: question.displayOrder || 2147483647,
  sourceNumber: Number(question.sourceNumber) > 0 ? Number(question.sourceNumber) : null,
  options: Array.isArray(question.questionData?.options)
    ? question.questionData.options.map((option) => typeof option === 'string' ? option : String(option?.text || option?.label || ''))
    : [],
  allowMultipleAnswers: Boolean(question.questionData?.allowMultipleAnswers),
  statement: question.questionType === 'coding'
    ? String(question.questionData?.coding?.statement || question.questionData?.problemDataSnapshot?.description || '')
    : '',
  supportedLanguages: question.questionType === 'coding'
    ? (question.questionData?.problemDataSnapshot?.supportedLanguages || question.questionData?.coding?.supportedLanguages || [])
    : [],
  passage: question.questionData?.libraryItemKind === 'passage_set'
    ? { title: question.questionData?.passage?.title || '', text: question.questionData?.passage?.text || '' }
    : null,
  subquestions: question.questionData?.libraryItemKind === 'passage_set'
    ? (question.questionData.questions || []).map((child) => ({
      questionText: child.questionText || '',
      options: (child.options || []).map((option) => typeof option === 'string' ? option : String(option?.text || option?.label || '')),
      allowMultipleAnswers: Boolean(child.allowMultipleAnswers),
    }))
    : [],
});

// The list reads only these fields of a page's questions; a full library row carries its whole problem snapshot.
const LIST_FIELDS = ['questionType', 'sourceProblemId', 'questionText', 'difficulty', 'tags', 'keywords', 'displayOrder', 'sourceNumber',
  'questionData.problemId', 'questionData.problemDataSnapshot.companyTags', 'questionData.problemDataSnapshot.description',
  'questionData.problemDataSnapshot.supportedLanguages', 'questionData.coding.statement', 'questionData.coding.supportedLanguages',
  'questionData.options', 'questionData.allowMultipleAnswers', 'questionData.libraryItemKind', 'questionData.passage',
  'questionData.questions'].join(' ');
const FACET_FIELDS = '_id tags keywords questionData.problemDataSnapshot.companyTags';
const NO_ORDER = 2147483647;
// The page offers 25, 50 or 100 rows; the coding workspace's problem navigator asks for 200.
export const PRACTICE_LIST_MAX_LIMIT = 200;
const FACET_CACHE_MS = 30_000;
const facetCaches = new Map();

export function resetPracticeListCache() { facetCaches.clear(); }

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactText = (value) => new RegExp(`^${escapeRegExp(value)}$`, 'i');
const tagPattern = (words) => new RegExp(`^${words.map(escapeRegExp).join('[-_\\s]*')}`, 'i');
const companyNames = (question) => question.keywords || question.questionData?.problemDataSnapshot?.companyTags || [];

/**
 * Reads the search box. '12' or '#12' matches either stored question number;
 * 'pp:12' and 'lc:12' can restrict diagnostic searches to one identifier;
 * '#two-pointers' matches a topic starting with "two pointers"; other words match title, topic or company text.
 */
export function parsePracticeSearch(raw) {
  const value = String(raw || '').trim().slice(0, 100);
  const serial = parseSerialSearch(value);
  if (serial) return { serial, tagTerms: [], text: '' };
  const tokens = value.split(/\s+/).filter((token) => token && !/^#+$/.test(token));
  return {
    serial: null,
    tagTerms: tokens.filter((token) => token.startsWith('#'))
      .map((token) => token.replace(/^#+/, '').toLowerCase().split(/[-_]+/).filter(Boolean)),
    text: tokens.filter((token) => !token.startsWith('#')).join(' ').toLowerCase(),
  };
}

/** The same rules as practiceListFilter, for shared questions that arrive as an in-memory list. */
export function matchesPracticeCriteria(question, reportedCompanies, criteria) {
  const tags = (question.tags || []).map((value) => String(value).toLowerCase());
  const companies = [...companyNames(question), ...reportedCompanies].map((value) => String(value).toLowerCase());
  const { search } = criteria;
  return (!criteria.type || question.questionType === criteria.type)
    && (!criteria.difficulty || String(question.difficulty || '').toLowerCase() === criteria.difficulty)
    && (!criteria.tags.length || criteria.tags.some((value) => tags.includes(value)))
    && (!criteria.companies.length || criteria.companies.some((value) => companies.includes(value)))
    && (!criteria.ids || criteria.ids.has(String(question._id)) || criteria.ids.has(String(question.sourceProblemId || '')))
    && matchesSerialSearch(question, search.serial)
    && search.tagTerms.every((words) => (question.tags || []).some((tag) => tagPattern(words).test(String(tag))))
    && (!search.text || [question.questionText, ...tags, ...companies].some((value) => String(value || '').toLowerCase().includes(search.text)));
}

/** A Mongo filter for the published local library. reportedIds(test) lists questions whose reported company passes test. */
export function practiceListFilter(criteria, reportedIds = () => []) {
  const clauses = [];
  const companyClause = (patterns, ids) => ({ $or: [
    { keywords: { $in: patterns } },
    { keywords: null, 'questionData.problemDataSnapshot.companyTags': { $in: patterns } },
    ...(ids.length ? [{ _id: { $in: ids } }] : []),
  ] });
  if (criteria.type) clauses.push({ questionType: criteria.type });
  if (criteria.difficulty) clauses.push({ difficulty: exactText(criteria.difficulty) });
  if (criteria.tags.length) clauses.push({ tags: { $in: criteria.tags.map(exactText) } });
  if (criteria.companies.length) {
    clauses.push(companyClause(criteria.companies.map(exactText), reportedIds((company) => criteria.companies.includes(company))));
  }
  if (criteria.ids) {
    const objectIds = [...criteria.ids].filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
    clauses.push({ $or: [{ _id: { $in: objectIds } }, { sourceProblemId: { $in: objectIds } }] });
  }
  const { search } = criteria;
  if (search.serial != null) clauses.push(serialSearchClause(search.serial));
  for (const words of search.tagTerms) clauses.push({ tags: tagPattern(words) });
  if (search.text) {
    const pattern = new RegExp(escapeRegExp(search.text), 'i');
    clauses.push({ $or: [{ questionText: pattern }, { tags: pattern },
      ...companyClause([pattern], reportedIds((company) => company.includes(search.text))).$or] });
  }
  return clauses.length ? { ...published, $and: clauses } : { ...published };
}

// Sorting happens on a few projected fields, so Mongo never sorts whole library rows.
const SORT_KEYS = {
  title: { key: { $toLower: { $ifNull: ['$questionText', ''] } } },
  difficulty: { key: { $switch: { branches: ['easy', 'medium', 'hard'].map((name, index) => ({
    case: { $eq: [{ $toLower: { $ifNull: ['$difficulty', ''] } }, name] }, then: index + 1 })), default: 4 } } },
  createdAt: { key: '$createdAt' },
  updatedAt: { key: '$updatedAt' },
};

async function localPage(filter, sortBy, sortOrder, skip, limit) {
  const sortKey = SORT_KEYS[sortBy];
  const [result = {}] = await QuestionLibrary.aggregate([
    { $match: filter },
    { $project: { order: { $ifNull: ['$displayOrder', NO_ORDER] }, ...(sortKey ? { key: sortKey.key } : {}) } },
    { $sort: sortKey ? { key: sortOrder, order: 1, _id: 1 } : { order: sortOrder, _id: 1 } },
    { $facet: { rows: [{ $skip: skip }, { $limit: limit }, { $project: { _id: 1 } }], total: [{ $count: 'count' }] } },
  ]);
  return { ids: (result.rows || []).map((row) => row._id), total: result.total?.[0]?.count || 0 };
}

async function questionsByIds(ids) {
  if (!ids.length) return [];
  const rows = await QuestionLibrary.find({ _id: { $in: ids } }).select(LIST_FIELDS).lean();
  const byId = new Map(rows.map((row) => [String(row._id), row]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

/** Topic and company counts read only tag fields, and are reused for a short while across students. */
async function localFacetRows() {
  const key = currentTenant()?.universityId || 'platform';
  const facetCache = facetCaches.get(key);
  if (facetCache && facetCache.until > Date.now()) return facetCache.rows;
  const rows = await QuestionLibrary.find(published).select(FACET_FIELDS).lean();
  facetCaches.set(key, { rows, until: Date.now() + FACET_CACHE_MS });
  return rows;
}

const scopeFor = (source) => isUniversity() && source === 'university'
  ? `university:${currentTenant()?.universityId || process.env.PEERPREP_UNIVERSITY_ID}` : 'control';

async function reportSummaries(questionId = null) {
  if (isUniversity()) {
    const query = questionId ? `?questionId=${encodeURIComponent(String(questionId))}` : '';
    return (await controlRequest(`question-interviews/summaries${query}`)).summaries || [];
  }
  return interviewReportSummaries(['control'], questionId && String(questionId));
}

router.get('/interview-options', asyncRoute(async (req, res) => {
  res.json(isUniversity() ? await controlRequest('question-interviews/options') : await interviewReportOptions());
}));

async function reportableQuestion(source, id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid question');
  return source === 'problem'
    ? QuestionLibrary.findOne({ ...published, sourceType: 'compiler', sourceProblemId: id }).lean()
    : findVisible(source, id);
}

// Verified companies only: the central summaries already apply the super admin's vote threshold.
router.get('/:source/:id/interview-companies', asyncRoute(async (req, res) => {
  const question = await reportableQuestion(req.params.source, req.params.id);
  if (!question) return res.json({ companies: [] });
  const scopeKey = scopeFor(req.params.source === 'shared' ? 'shared' : 'university');
  const companies = (await reportSummaries(question._id))
    .filter((row) => row.scopeKey === scopeKey && String(row.questionId) === String(question._id))
    .map(({ company, companyKey, voters, reports, latestDate }) => ({ company, companyKey, voters: voters ?? reports, latestDate }))
    .sort((a, b) => b.voters - a.voters || new Date(b.latestDate) - new Date(a.latestDate));
  res.json({ companies });
}));

router.post('/:source/:id/interview-reports', asyncRoute(async (req, res) => {
  const source = req.params.source;
  const question = await reportableQuestion(source, req.params.id);
  if (!question) throw new HttpError(404, 'Question not found');
  const practiceSource = source === 'shared' ? 'shared' : 'university';
  const [practiceSolved, codingSolved] = await Promise.all([
    QuestionPracticeAttempt.exists({ studentId: req.user._id, source: practiceSource, questionId: question._id, result: 'correct' }),
    source !== 'shared' && question.sourceProblemId ? Submission.exists({ user: req.user._id,
      problem: question.sourceProblemId, mode: 'submit', status: 'AC' }) : null,
  ]);
  if (!practiceSolved && !codingSolved) throw new HttpError(403, 'Solve this question before reporting an interview');
  const scopeKey = scopeFor(practiceSource);
  const reporter = reporterKey(isUniversity() ? currentTenant()?.universityId || process.env.PEERPREP_UNIVERSITY_ID : 'control', req.user._id);
  const payload = { ...req.body, scopeKey, questionId: String(question._id), reporterKey: reporter };
  const saved = isUniversity()
    ? await controlRequest('question-interviews', { method: 'POST', body: payload })
    : await saveInterviewReport({ scopeKey, questionId: question._id, reporter, body: req.body });
  res.status(201).json(saved);
}));

export function gradePracticeAnswer(question, answer) {
  const data = question.questionData || {};
  if (data.libraryItemKind === 'passage_set' && Array.isArray(data.questions)) {
    const results = data.questions.map((child, index) => gradePracticeAnswer({ questionType: 'mcq', questionData: child }, answer?.[index] || []));
    return results.every((item) => item === 'correct') ? 'correct' : results.includes('incorrect') ? 'incorrect' : 'submitted';
  }
  if (question.questionType === 'mcq') {
    if (data.correctOptionIndex == null && !(Array.isArray(data.correctOptionIndexes) && data.correctOptionIndexes.length)) return 'submitted';
    const selected = Array.isArray(answer) ? answer : [answer];
    const actual = [...new Set(selected.map(Number))].sort((a, b) => a - b);
    const correct = (data.allowMultipleAnswers ? (data.correctOptionIndexes || []) : [data.correctOptionIndex])
      .map(Number).sort((a, b) => a - b);
    if (!correct.length || correct.some((value) => !Number.isInteger(value))) return 'submitted';
    return JSON.stringify(actual) === JSON.stringify(correct) ? 'correct' : 'incorrect';
  }
  if (['short', 'one_line'].includes(question.questionType) && data.expectedAnswer) {
    return String(answer).trim().toLocaleLowerCase() === String(data.expectedAnswer).trim().toLocaleLowerCase()
      ? 'correct' : 'incorrect';
  }
  return 'submitted';
}

router.get('/', asyncRoute(async (req, res) => {
  const criteria = {
    search: parsePracticeSearch(req.query.search),
    type: String(req.query.type || '').trim().toLowerCase(),
    difficulty: String(req.query.difficulty || '').trim().toLowerCase(),
    tags: String(req.query.tags || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
    companies: String(req.query.companies || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
    ids: req.query.ids === undefined ? null : new Set(String(req.query.ids).split(',').filter(Boolean)),
  };
  const { companies } = criteria;
  const sortBy = String(req.query.sortBy || 'displayOrder');
  const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
  // Capped like the other list routes, so a huge or non-finite page is an empty page, not a $skip error.
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const limit = Math.min(PRACTICE_LIST_MAX_LIMIT, Math.max(1, Math.floor(Number(req.query.limit)) || 25));
  const [centralResult, summariesResult, facetRows] = await Promise.all([
    Promise.allSettled([sharedQuestions()]).then(([result]) => result),
    Promise.allSettled([reportSummaries()]).then(([result]) => result),
    localFacetRows(),
  ]);
  if (centralResult.status === 'rejected' && !facetRows.length) throw centralResult.reason;
  const central = centralResult.status === 'fulfilled' ? centralResult.value || [] : [];
  const summaries = summariesResult.status === 'fulfilled' ? summariesResult.value : [];
  const reportMap = new Map();
  for (const row of summaries) {
    const reportKey = `${row.scopeKey}:${row.questionId}`;
    if (!reportMap.has(reportKey)) reportMap.set(reportKey, []);
    reportMap.get(reportKey).push({ company: row.company, companyKey: row.companyKey,
      latestDate: row.latestDate, reports: row.reports });
  }
  const reportsFor = ({ question, source }) => reportMap.get(`${scopeFor(source)}:${question._id}`) || [];
  const localScope = `${scopeFor('university')}:`;
  const reportedIds = (test) => [...new Set(summaries
    .filter((row) => `${row.scopeKey}:` === localScope && test(String(row.company || '').toLowerCase()))
    .map((row) => String(row.questionId)))]
    .filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
  const filter = practiceListFilter(criteria, reportedIds);
  const sharedMatches = central.map((question) => ({ question, source: 'shared' }))
    .filter((item) => matchesPracticeCriteria(item.question, reportsFor(item).map((row) => row.company), criteria));
  let selected;
  let total;
  if (!sharedMatches.length && sortBy !== 'latestInterviewDate') {
    // Only local questions: Mongo filters, sorts and pages, and only this page's rows are read in full.
    const result = await localPage(filter, sortBy, sortOrder, (page - 1) * limit, limit);
    total = result.total;
    selected = (await questionsByIds(result.ids)).map((question) => ({ question, source: 'university' }));
  } else {
    // Shared questions or interview dates join the order, so the local matches are ordered here on a few fields.
    const localRefs = await QuestionLibrary.find(filter).select('_id displayOrder questionText difficulty createdAt updatedAt').lean();
    const all = [...localRefs.map((question) => ({ question, source: 'university' })), ...sharedMatches];
    sortPractice(all, sortBy, sortOrder, companies, reportsFor);
    total = all.length;
    const pageItems = all.slice((page - 1) * limit, page * limit);
    const localRows = new Map((await questionsByIds(pageItems.filter((item) => item.source === 'university')
      .map((item) => item.question._id))).map((question) => [String(question._id), question]));
    selected = pageItems.map((item) => item.source === 'university' ? { ...item, question: localRows.get(String(item.question._id)) } : item)
      .filter((item) => item.question);
  }
  const available = [...facetRows.map((question) => ({ question, source: 'university' })),
    ...central.map((question) => ({ question, source: 'shared' }))];
  const selectedIds = selected.map(({ question }) => question._id);
  const attempts = await QuestionPracticeAttempt.find({ studentId: req.user._id, questionId: { $in: selectedIds } })
    .sort({ createdAt: -1 }).lean();
  const localProblemIds = selected.filter(({ question, source }) => source === 'university'
    && question.questionType === 'coding' && mongoose.isValidObjectId(question.sourceProblemId))
    .map(({ question }) => question.sourceProblemId);
  const solvedProblemIds = localProblemIds.length ? await Submission.distinct('problem', {
    user: req.user._id, problem: { $in: localProblemIds }, mode: 'submit', status: 'AC',
  }) : [];
  const solvedProblems = new Set(solvedProblemIds.map(String));
  const latest = new Map();
  const solvedPractice = new Set();
  attempts.forEach((attempt) => {
    const key = `${attempt.source}:${attempt.questionId}`;
    if (attempt.result === 'correct') solvedPractice.add(key);
    if (!latest.has(key)) latest.set(key, attempt.result);
  });
  const warning = centralResult.status === 'rejected' ? 'Shared questions are temporarily unavailable.'
    : summariesResult.status === 'rejected' ? 'Interview history is temporarily unavailable.' : '';
  res.json({ warning, questions: selected.map(({ question, source }) => ({ ...publicShape(question, source),
    reportedCompanies: reportsFor({ question, source }),
    result: solvedProblems.has(String(question.sourceProblemId)) || solvedPractice.has(`${source}:${question._id}`)
      ? 'correct' : latest.get(`${source}:${question._id}`) || null })),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    filters: { totalProblems: available.length,
      availableTags: [...new Set(available.flatMap(({ question }) => question.tags || []))].sort(),
      tagCounts: Object.entries(available.flatMap(({ question }) => question.tags || []).reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1; return acc;
      }, {})).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
      companyCounts: Object.values(available.reduce((acc, item) => {
        const names = [...companyNames(item.question), ...reportsFor(item).map((row) => row.company)];
        for (const name of new Map(names.map((value) => [String(value).trim().toLowerCase(), value])).values()) {
          const companyKey = String(name).trim().toLowerCase();
          if (!companyKey) continue;
          if (!acc[companyKey]) acc[companyKey] = { company: String(name), count: 0 };
          acc[companyKey].count += 1;
        }
        return acc;
      }, {})).sort((a, b) => b.count - a.count),
    } });
}));

function sortPractice(all, sortBy, sortOrder, companies, reportsFor) {
  all.sort((left, right) => {
    const a = left.question;
    const b = right.question;
    if (sortBy === 'latestInterviewDate') {
      const latest = (item) => Math.max(0, ...reportsFor(item)
        .filter((row) => !companies.length || companies.includes(row.companyKey))
        .map((row) => new Date(row.latestDate).getTime()));
      return latest(right) - latest(left) || (Number(a.displayOrder) || 2147483647) - (Number(b.displayOrder) || 2147483647);
    }
    if (sortBy === 'title') return sortOrder * String(a.questionText || '').localeCompare(String(b.questionText || ''));
    if (sortBy === 'difficulty') {
      const rank = { easy: 1, medium: 2, hard: 3 };
      return sortOrder * ((rank[String(a.difficulty || '').toLowerCase()] || 4) - (rank[String(b.difficulty || '').toLowerCase()] || 4));
    }
    if (sortBy === 'createdAt' || sortBy === 'updatedAt') return sortOrder * (new Date(a[sortBy] || 0) - new Date(b[sortBy] || 0));
    return sortOrder * ((Number(a.displayOrder) || 2147483647) - (Number(b.displayOrder) || 2147483647))
      || String(a._id).localeCompare(String(b._id));
  });
}

router.get('/:source/:id', asyncRoute(async (req, res) => {
  const found = await findVisible(req.params.source, req.params.id);
  res.json({ question: publicShape(found, req.params.source) });
}));

// Shared snapshots come from the control catalog; only expose https sample images with display fields.
const sharedSampleImages = (images) => (Array.isArray(images) ? images : [])
  .filter((image) => /^https:\/\//i.test(String(image?.url || '').trim()))
  .slice(0, 10)
  .map((image, index) => {
    const width = Number(image.width);
    const height = Number(image.height);
    return { url: String(image.url).trim(), alt: String(image.alt || ''), caption: String(image.caption || ''),
      width: Number.isFinite(width) && width > 0 ? width : undefined,
      height: Number.isFinite(height) && height > 0 ? height : undefined,
      position: Math.max(0, Number(image.position) || index) };
  })
  .sort((a, b) => a.position - b.position);

router.get('/shared/:id/problem', asyncRoute(async (req, res) => {
  const question = await findVisible('shared', req.params.id);
  if (question.questionType !== 'coding') throw new HttpError(404, 'Coding problem not found');
  const snapshot = question.questionData?.problemDataSnapshot || question.questionData?.coding?.problemData;
  if (!snapshot) throw new HttpError(404, 'Coding problem details unavailable');
  const [totalSubmissions, acceptedSubmissions, solved, quickPreps] = await Promise.all([
    QuestionPracticeAttempt.countDocuments({ source: 'shared', questionId: question._id, questionType: 'coding' }),
    QuestionPracticeAttempt.countDocuments({ source: 'shared', questionId: question._id, questionType: 'coding', result: 'correct' }),
    QuestionPracticeAttempt.exists({ studentId: req.user._id, source: 'shared', questionId: question._id,
      questionType: 'coding', result: 'correct' }),
    questionQuickPreps(req.user, 'shared', question._id),
  ]);
  res.json({ ...serializeProblem({ ...snapshot, _id: question._id, status: 'published', visibility: 'public' },
    { sampleTestCases: (snapshot.sampleTestCases || []).map((item) => ({ ...item, images: sharedSampleImages(item?.images) })),
      includeEditorialSolutions: true }), platformShared: true,
  studentStatus: solved ? 'Solved' : 'Unsolved', totalSubmissions, acceptedSubmissions, quickPreps,
  acceptanceRate: totalSubmissions ? Number((acceptedSubmissions * 100 / totalSubmissions).toFixed(1)) : 0 });
}));

router.get('/shared/:id/submissions', asyncRoute(async (req, res) => {
  await findVisible('shared', req.params.id);
  const attempts = await QuestionPracticeAttempt.find({ studentId: req.user._id, source: 'shared', questionId: req.params.id, questionType: 'coding' })
    .sort({ createdAt: -1 }).limit(50).lean();
  res.json({ submissions: attempts.map((item) => ({ _id: item._id, problemId: item.questionId,
    mode: 'submit', status: item.result === 'correct' ? 'AC' : item.result === 'incorrect' ? item.failureStatus || 'WA' : 'PENDING',
    language: item.language, sourceCode: item.answer, createdAt: item.createdAt,
    totalTestCases: item.totalTestCases || 0, passedTestCases: item.passedTestCases || 0,
    executionTimeMs: item.executionTimeMs || 0, memoryUsedKb: item.memoryUsedKb || 0,
    testCaseResults: item.testCaseResults || [], failedCase: item.failedCase || null, compileOutput: item.compileOutput || '' })) });
}));

router.post('/shared/:id/run', compilerExecutionLimiter, asyncRoute(async (req, res) => {
  const question = await findVisible('shared', req.params.id);
  if (question.questionType !== 'coding') throw new HttpError(404, 'Coding problem not found');
  const { problem } = await sharedJudgeData(question);
  const language = String(req.body?.language || '').toLowerCase();
  const sourceCode = String(req.body?.sourceCode || '');
  if (!sourceCode.trim() || sourceCode.length > 50000 || !KEY_TO_LANGUAGE_ID[language]
    || (problem.supportedLanguages?.length && !problem.supportedLanguages.includes(language))) throw new HttpError(400, 'Valid source code and language are required');
  const samples = (question.questionData?.problemDataSnapshot?.sampleTestCases
    || question.questionData?.coding?.problemData?.sampleTestCases || problem.sampleTestCases || []).slice(0, 12);
  const cases = samples.length ? samples : [{
    input: sanitizeExecutionText(req.body?.customInput || '', MAX_STDIN_SIZE_BYTES, 'Input'),
  }];
  const options = buildJudge0Options(problem);
  const caseResults = [];
  let totalTime = 0;
  let peakMemory = 0;
  for (const [index, sample] of cases.entries()) {
    const input = String(sample.input || '');
    const output = await runJudge0(prepareFunctionSourceForExecution(problem, language, sourceCode, input),
      KEY_TO_LANGUAGE_ID[language], input, options);
    const evaluation = samples.length
      ? evaluateProblemSubmissionResult(problem, output, { input, output: sample.output || '' })
      : null;
    const status = evaluation?.internalStatus || (output.compile_output ? 'CE' : output.stderr ? 'RE'
      : output.status?.id === 5 ? 'TLE' : output.status?.id === 3 ? 'AC' : 'RE');
    const time = Number(output.time || 0);
    const memory = Number(output.memory || 0);
    totalTime += Number.isFinite(time) ? time : 0;
    peakMemory = Math.max(peakMemory, Number.isFinite(memory) ? memory : 0);
    caseResults.push({ id: `sample-${index + 1}`, label: `Case ${index + 1}`, status,
      input, ...(samples.length ? { expectedOutput: String(sample.output || '') } : {}),
      output: output.stdout || '', time, memory,
      stderr: output.stderr || evaluation?.error || '', compileOutput: output.compile_output || '' });
    if (status === 'CE') break;
  }
  const passed = caseResults.filter((item) => item.status === 'AC').length;
  res.json({ mode: 'run', status: passed === caseResults.length ? 'Passed' : 'Failed',
    passed, total: caseResults.length, time: totalTime, memory: peakMemory, caseResults });
}));

async function publicSampleCompileOutput(question, problem, language, answer) {
  const sample = (question.questionData?.problemDataSnapshot?.sampleTestCases
    || question.questionData?.coding?.problemData?.sampleTestCases || problem.sampleTestCases || [])[0];
  if (!sample) return 'Compilation failed on a private test case. Run the visible examples to inspect your code.';
  try {
    const input = String(sample.input || '');
    const output = await runJudge0(prepareFunctionSourceForExecution(problem, language, answer, input),
      KEY_TO_LANGUAGE_ID[language], input, buildJudge0Options(problem));
    const evaluation = evaluateProblemSubmissionResult(problem, output, sample);
    if (evaluation.internalStatus === 'CE') {
      return String(output.compile_output || output.message || evaluation.error || 'Compilation failed.').slice(0, 8192);
    }
  } catch {
    // The original verdict is still valid when a diagnostic replay is unavailable.
  }
  return 'Compilation failed on a private test case. Run the visible examples to inspect your code.';
}

async function judgeCodingQuestion(question, source, answer, language) {
  const problemId = question.sourceProblemId || question.questionData?.problemId || question.questionData?.coding?.problemId;
  if (!mongoose.isValidObjectId(problemId)) return { result: 'submitted', feedback: 'Code saved. This question has no linked judge.' };
  const { problem, testCases } = source === 'shared'
    ? await sharedJudgeData(question)
    : await (async () => {
      const localProblem = await Problem.findById(problemId).select('+executionHarnesses').lean();
      if (!localProblem) throw new HttpError(404, 'Linked coding problem not found');
      return { problem: localProblem, testCases: await loadHiddenExecutionTestCases(localProblem) };
    })();
  const languageId = KEY_TO_LANGUAGE_ID[language];
  if (!languageId || (problem.supportedLanguages?.length && !problem.supportedLanguages.includes(language))) throw new HttpError(400, 'Choose a supported language');
  if (!Array.isArray(testCases) || !testCases.length) throw new HttpError(503, 'Coding judge has no test cases');
  let passedTestCases = 0;
  let executionTimeMs = 0;
  let memoryUsedKb = 0;
  const testCaseResults = [];
  for (const [index, testCase] of testCases.entries()) {
    const output = await runJudge0(
      prepareFunctionSourceForExecution(problem, language, answer, testCase.input || ''),
      languageId, testCase.input || '', buildJudge0Options(problem),
    );
    const caseTimeMs = Number(output.time || 0) * 1000;
    const caseMemoryKb = Number(output.memory || 0);
    if (Number.isFinite(caseTimeMs)) executionTimeMs += Math.max(0, caseTimeMs);
    if (Number.isFinite(caseMemoryKb)) memoryUsedKb = Math.max(memoryUsedKb, caseMemoryKb);
    const evaluation = evaluateProblemSubmissionResult(problem, output, testCase);
    const failureStatus = evaluation.internalStatus === 'AC' ? null : evaluation.internalStatus;
    testCaseResults.push({ index: index + 1, status: failureStatus || 'AC',
      executionTimeMs: Number.isFinite(caseTimeMs) ? Math.max(0, caseTimeMs) : 0 });
    if (failureStatus) {
      // The failing case is shown only for a public practice problem no assessment grades on; otherwise its hidden
      // cases are assessment data and could be read one per submit, so the student gets the index alone.
      const publicProblem = source === 'shared'
        || (['published', 'active'].includes(String(problem.status || '').toLowerCase()) && (problem.visibility || 'public') === 'public');
      const reveal = publicProblem && !(await Promise.all([problemId, question._id].map(problemUsedInAssessment))).some(Boolean);
      const failedCase = reveal
        ? studentFailedCase({ index: index + 1, input: testCase.input || '', expectedOutput: testCase.output || '',
          actualOutput: evaluation.actualOutput || output.stdout || '' }, failureStatus)
        : { index: index + 1 };
      return { result: 'incorrect', feedback: failureStatus === 'CE' ? 'Compilation failed'
        : failureStatus === 'RE' ? 'Runtime error' : failureStatus === 'TLE' ? 'Time limit exceeded' : 'A test case failed',
        totalTestCases: testCases.length, passedTestCases, executionTimeMs, memoryUsedKb, testCaseResults, failedCase,
        failureStatus, ...(failureStatus === 'CE' ? { compileOutput: await publicSampleCompileOutput(question, problem, language, answer) } : {}) };
    }
    passedTestCases += 1;
  }
  return { result: 'correct', feedback: 'All test cases passed', totalTestCases: testCases.length,
    passedTestCases, executionTimeMs, memoryUsedKb, testCaseResults };
}

async function findVisible(source, id) {
  if (!['university', 'shared'].includes(source) || !mongoose.isValidObjectId(id)) throw new HttpError(404, 'Question not found');
  const question = source === 'university'
    ? await QuestionLibrary.findOne({ ...published, _id: id }).lean()
    : (await sharedQuestions() || []).find((item) => String(item._id) === id);
  if (!question) throw new HttpError(404, 'Question not found');
  return question;
}

router.post('/:source/:id/attempts', compilerExecutionLimiter, asyncRoute(async (req, res) => {
  const question = await findVisible(req.params.source, req.params.id);
  const answer = req.body?.answer;
  const passageSet = question.questionData?.libraryItemKind === 'passage_set';
  const valid = passageSet
    ? answer && typeof answer === 'object' && !Array.isArray(answer)
      && (question.questionData.questions || []).length > 0
      && (question.questionData.questions || []).every((child, index) => Array.isArray(answer[index])
        && answer[index].length > 0 && answer[index].length <= (child.options || []).length
        && answer[index].every((item) => Number.isInteger(Number(item)) && Number(item) >= 0 && Number(item) < (child.options || []).length))
    : Array.isArray(answer)
    ? answer.length > 0 && answer.length <= 20 && answer.every((item) => Number.isInteger(Number(item)) && Number(item) >= 0 && Number(item) < (question.questionData?.options || []).length)
    : typeof answer === 'string' && answer.trim().length > 0 && answer.length <= 20000;
  if (!valid) throw new HttpError(400, 'Enter an answer before submitting');
  if (question.questionType === 'mcq' && !passageSet && !Array.isArray(answer)) throw new HttpError(400, 'Select an option');
  const language = question.questionType === 'coding' ? String(req.body?.language || '').trim().toLowerCase() : '';
  const graded = question.questionType === 'coding'
    ? await judgeCodingQuestion(question, req.params.source, answer, language)
    : { result: gradePracticeAnswer(question, answer) };
  await QuestionPracticeAttempt.create({ studentId: req.user._id, questionId: question._id,
    source: req.params.source, questionType: question.questionType, answer, language, result: graded.result,
    totalTestCases: graded.totalTestCases || 0, passedTestCases: graded.passedTestCases || 0,
    executionTimeMs: graded.executionTimeMs || 0, memoryUsedKb: graded.memoryUsedKb || 0,
    failureStatus: graded.failureStatus, testCaseResults: graded.testCaseResults || [], failedCase: graded.failedCase || undefined,
    compileOutput: graded.compileOutput || '' });
  if (req.params.source === 'shared' && question.questionType === 'coding') {
    const [totalSubmissions, acceptedSubmissions] = await Promise.all([
      QuestionPracticeAttempt.countDocuments({ source: 'shared', questionId: question._id, questionType: 'coding' }),
      QuestionPracticeAttempt.countDocuments({ source: 'shared', questionId: question._id, questionType: 'coding', result: 'correct' }),
    ]);
    res.status(201).json({ ...graded, totalSubmissions, acceptedSubmissions,
      acceptanceRate: Number((acceptedSubmissions * 100 / totalSubmissions).toFixed(1)) });
    return;
  }
  res.status(201).json(graded);
}));

export default router;
