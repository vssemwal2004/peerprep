import mongoose from 'mongoose';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import { loadHiddenExecutionTestCases } from '../controllers/problemController.js';
import { runJudge0, KEY_TO_LANGUAGE_ID, normalizeComparableOutput } from '../services/executionService.js';
import { prepareFunctionSourceForExecution } from '../services/functionProblemAdapterService.js';
import { compilerExecutionLimiter } from '../middleware/rateLimiter.js';
import { sharedQuestions } from './sharedContent.js';
import { isUniversity } from './deployment.js';
import { universityPolicy, controlRequest } from './client.js';
import { serializeProblem } from '../controllers/compilerHelpers.js';

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

async function visibleQuestions() {
  const [localResult, centralResult] = await Promise.allSettled([QuestionLibrary.find(published).lean(), sharedQuestions()]);
  if (localResult.status === 'rejected') throw localResult.reason;
  const local = localResult.value;
  const central = centralResult.status === 'fulfilled' ? centralResult.value : [];
  if (centralResult.status === 'rejected' && !local.length) throw centralResult.reason;
  return { warning: centralResult.status === 'rejected' ? 'Shared questions are temporarily unavailable.' : '', questions: [
    ...local.map((question) => ({ question, source: 'university' })),
    ...(central || []).map((question) => ({ question, source: 'shared' })),
  ] };
}

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
  const search = String(req.query.search || '').trim().toLowerCase().slice(0, 100);
  const type = String(req.query.type || '').trim().toLowerCase();
  const difficulty = String(req.query.difficulty || '').trim().toLowerCase();
  const tags = String(req.query.tags || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const companies = String(req.query.companies || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const ids = req.query.ids === undefined ? null : new Set(String(req.query.ids).split(',').filter(Boolean));
  const sortBy = String(req.query.sortBy || 'displayOrder');
  const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 20));
  const visible = await visibleQuestions();
  const available = visible.questions;
  const all = available.filter(({ question }) => {
    const questionTags = (question.tags || []).map((value) => String(value).toLowerCase());
    const questionCompanies = (question.keywords || question.questionData?.problemDataSnapshot?.companyTags || []).map((value) => String(value).toLowerCase());
    return (!type || question.questionType === type)
      && (!difficulty || String(question.difficulty || '').toLowerCase() === difficulty)
      && (!tags.length || tags.some((value) => questionTags.includes(value)))
      && (!companies.length || companies.some((value) => questionCompanies.includes(value)))
      && (!ids || ids.has(String(question._id)) || ids.has(String(question.sourceProblemId || '')))
      && (!search || [question.questionText, ...questionTags, ...questionCompanies].some((value) => String(value || '').toLowerCase().includes(search)));
  });
  all.sort((left, right) => {
    const a = left.question;
    const b = right.question;
    if (sortBy === 'title') return sortOrder * String(a.questionText || '').localeCompare(String(b.questionText || ''));
    if (sortBy === 'difficulty') {
      const rank = { easy: 1, medium: 2, hard: 3 };
      return sortOrder * ((rank[String(a.difficulty || '').toLowerCase()] || 4) - (rank[String(b.difficulty || '').toLowerCase()] || 4));
    }
    if (sortBy === 'createdAt' || sortBy === 'updatedAt') return sortOrder * (new Date(a[sortBy] || 0) - new Date(b[sortBy] || 0));
    return sortOrder * ((Number(a.displayOrder) || 2147483647) - (Number(b.displayOrder) || 2147483647))
      || String(a._id).localeCompare(String(b._id));
  });
  const selected = all.slice((page - 1) * limit, page * limit);
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
  attempts.forEach((attempt) => {
    const key = `${attempt.source}:${attempt.questionId}`;
    if (!latest.has(key)) latest.set(key, attempt.result);
  });
  res.json({ warning: visible.warning, questions: selected.map(({ question, source }) => ({ ...publicShape(question, source),
    result: solvedProblems.has(String(question.sourceProblemId)) ? 'correct' : latest.get(`${source}:${question._id}`) || null })),
    pagination: { page, limit, total: all.length, pages: Math.max(1, Math.ceil(all.length / limit)) },
    filters: { totalProblems: available.length,
      availableTags: [...new Set(available.flatMap(({ question }) => question.tags || []))].sort(),
      tagCounts: Object.entries(available.flatMap(({ question }) => question.tags || []).reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1; return acc;
      }, {})).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
      companyCounts: Object.entries(available.flatMap(({ question }) => question.keywords || question.questionData?.problemDataSnapshot?.companyTags || []).reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1; return acc;
      }, {})).map(([company, count]) => ({ company, count })).sort((a, b) => b.count - a.count),
    } });
}));

router.get('/:source/:id', asyncRoute(async (req, res) => {
  const found = await findVisible(req.params.source, req.params.id);
  res.json({ question: publicShape(found, req.params.source) });
}));

router.get('/shared/:id/problem', asyncRoute(async (req, res) => {
  const question = await findVisible('shared', req.params.id);
  if (question.questionType !== 'coding') throw new HttpError(404, 'Coding problem not found');
  const snapshot = question.questionData?.problemDataSnapshot || question.questionData?.coding?.problemData;
  if (!snapshot) throw new HttpError(404, 'Coding problem details unavailable');
  res.json({ ...serializeProblem({ ...snapshot, _id: question._id, status: 'published', visibility: 'public' },
    { sampleTestCases: snapshot.sampleTestCases || [] }), platformShared: true });
}));

router.get('/shared/:id/submissions', asyncRoute(async (req, res) => {
  await findVisible('shared', req.params.id);
  const attempts = await QuestionPracticeAttempt.find({ studentId: req.user._id, source: 'shared', questionId: req.params.id, questionType: 'coding' })
    .sort({ createdAt: -1 }).limit(50).lean();
  res.json({ submissions: attempts.map((item) => ({ _id: item._id, problemId: item.questionId,
    mode: 'submit', status: item.result === 'correct' ? 'AC' : item.result === 'incorrect' ? 'WA' : 'PENDING',
    language: item.language, sourceCode: item.answer, createdAt: item.createdAt,
    totalTestCases: 0, passedTestCases: item.result === 'correct' ? 1 : 0 })) });
}));

router.post('/shared/:id/run', compilerExecutionLimiter, asyncRoute(async (req, res) => {
  const question = await findVisible('shared', req.params.id);
  if (question.questionType !== 'coding') throw new HttpError(404, 'Coding problem not found');
  const { problem } = await controlRequest(`questions/${encodeURIComponent(String(question._id))}/judge-data`);
  const language = String(req.body?.language || '').toLowerCase();
  const sourceCode = String(req.body?.sourceCode || '');
  if (!sourceCode.trim() || sourceCode.length > 50000 || !KEY_TO_LANGUAGE_ID[language]
    || (problem.supportedLanguages?.length && !problem.supportedLanguages.includes(language))) throw new HttpError(400, 'Valid source code and language are required');
  const input = String(req.body?.customInput || '').slice(0, 65536);
  const result = await runJudge0(prepareFunctionSourceForExecution(problem, language, sourceCode, input),
    KEY_TO_LANGUAGE_ID[language], input, { cpuTimeLimitSeconds: problem.timeLimitSeconds || 2,
      memoryLimitKb: Number(problem.memoryLimitMb || 256) * 1024,
      sqlSetupCode: [problem.sqlConfig?.schemaSql, problem.sqlConfig?.seedDataSql].filter(Boolean).join('\n') });
  const sample = (question.questionData?.problemDataSnapshot?.sampleTestCases || []).find((item) => item.input === input);
  res.json({ status: result.compile_output ? 'Compilation Error' : result.stderr ? 'Runtime Error'
    : result.status?.id !== 3 ? result.status?.description || 'Run failed'
      : sample && normalizeComparableOutput(result.stdout) !== normalizeComparableOutput(sample.output) ? 'Wrong Answer'
        : sample ? 'Accepted' : 'Run completed',
  output: result.stdout || '', stdout: result.stdout || '', stderr: result.stderr || '',
  compileOutput: result.compile_output || '', input, language, sourceCode });
}));

async function judgeCodingQuestion(question, source, answer, language) {
  const problemId = question.sourceProblemId || question.questionData?.problemId || question.questionData?.coding?.problemId;
  if (!mongoose.isValidObjectId(problemId)) return { result: 'submitted', feedback: 'Code saved. This question has no linked judge.' };
  const { problem, testCases } = source === 'shared'
    ? await controlRequest(`questions/${encodeURIComponent(String(question._id))}/judge-data`)
    : await (async () => {
      const localProblem = await Problem.findById(problemId).select('+executionHarnesses').lean();
      if (!localProblem) throw new HttpError(404, 'Linked coding problem not found');
      return { problem: localProblem, testCases: await loadHiddenExecutionTestCases(localProblem) };
    })();
  const languageId = KEY_TO_LANGUAGE_ID[language];
  if (!languageId || (problem.supportedLanguages?.length && !problem.supportedLanguages.includes(language))) throw new HttpError(400, 'Choose a supported language');
  if (!Array.isArray(testCases) || !testCases.length) throw new HttpError(503, 'Coding judge has no test cases');
  for (const testCase of testCases) {
    const output = await runJudge0(
      prepareFunctionSourceForExecution(problem, language, answer, testCase.input || ''),
      languageId, testCase.input || '', {
        cpuTimeLimitSeconds: Number(problem.timeLimitSeconds || 2),
        memoryLimitKb: Math.trunc(Number(problem.memoryLimitMb || 256) * 1024),
        sqlSetupCode: [problem.sqlConfig?.schemaSql, problem.sqlConfig?.seedDataSql].filter(Boolean).join('\n'),
      },
    );
    if (output.compile_output || output.stderr || output.status?.id !== 3
      || normalizeComparableOutput(output.stdout) !== normalizeComparableOutput(testCase.output)) {
      return { result: 'incorrect', feedback: output.compile_output ? 'Compilation failed' : output.stderr ? 'Runtime error' : 'A test case failed' };
    }
  }
  return { result: 'correct', feedback: 'All test cases passed' };
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
    source: req.params.source, questionType: question.questionType, answer, language, result: graded.result });
  res.status(201).json(graded);
}));

export default router;
