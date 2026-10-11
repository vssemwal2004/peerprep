import mongoose from 'mongoose';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import { recordDailyChallengeCompletion } from '../services/codingStreakService.js';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import { loadHiddenExecutionTestCases } from '../controllers/problemController.js';
import { runJudge0, buildJudge0Options, KEY_TO_LANGUAGE_ID } from '../services/executionService.js';
import { evaluateProblemSubmissionResult } from '../services/problemSubmissionEvaluationService.js';
import { prepareFunctionSourceForExecution } from '../services/functionProblemAdapterService.js';
import { compilerExecutionLimiter } from '../middleware/rateLimiter.js';
import { sharedQuestions, sharedJudgeData } from './sharedContent.js';
import { isUniversity } from './deployment.js';
import { universityPolicy, controlRequest } from './client.js';
import { serializeProblem } from '../controllers/compilerHelpers.js';
import { interviewReportOptions, interviewReportSummaries, reporterKey, saveInterviewReport } from './interviewQuestionReports.js';

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

const scopeFor = (source) => isUniversity() && source === 'university'
  ? `university:${process.env.PEERPREP_UNIVERSITY_ID}` : 'control';

async function reportSummaries() {
  if (isUniversity()) return (await controlRequest('question-interviews/summaries')).summaries || [];
  return interviewReportSummaries(['control']);
}

router.get('/interview-options', asyncRoute(async (req, res) => {
  res.json(isUniversity() ? await controlRequest('question-interviews/options') : await interviewReportOptions());
}));

router.post('/:source/:id/interview-reports', asyncRoute(async (req, res) => {
  const source = req.params.source;
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid question');
  const question = source === 'problem'
    ? await QuestionLibrary.findOne({ ...published, sourceType: 'compiler', sourceProblemId: req.params.id }).lean()
    : await findVisible(source, req.params.id);
  if (!question) throw new HttpError(404, 'Question not found');
  const practiceSource = source === 'shared' ? 'shared' : 'university';
  const [practiceSolved, codingSolved] = await Promise.all([
    QuestionPracticeAttempt.exists({ studentId: req.user._id, source: practiceSource, questionId: question._id, result: 'correct' }),
    source !== 'shared' && question.sourceProblemId ? Submission.exists({ user: req.user._id,
      problem: question.sourceProblemId, mode: 'submit', status: 'AC' }) : null,
  ]);
  if (!practiceSolved && !codingSolved) throw new HttpError(403, 'Solve this question before reporting an interview');
  const scopeKey = scopeFor(practiceSource);
  const reporter = reporterKey(isUniversity() ? process.env.PEERPREP_UNIVERSITY_ID : 'control', req.user._id);
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
  const summariesResult = await Promise.allSettled([reportSummaries()]);
  const summaries = summariesResult[0].status === 'fulfilled' ? summariesResult[0].value : [];
  const reportMap = new Map();
  for (const row of summaries) {
    const reportKey = `${row.scopeKey}:${row.questionId}`;
    if (!reportMap.has(reportKey)) reportMap.set(reportKey, []);
    reportMap.get(reportKey).push({ company: row.company, companyKey: row.companyKey,
      latestDate: row.latestDate, reports: row.reports });
  }
  const reportsFor = ({ question, source }) => reportMap.get(`${scopeFor(source)}:${question._id}`) || [];
  const all = available.filter(({ question, source }) => {
    const questionTags = (question.tags || []).map((value) => String(value).toLowerCase());
    const questionCompanies = [...(question.keywords || question.questionData?.problemDataSnapshot?.companyTags || []),
      ...reportsFor({ question, source }).map((row) => row.company)].map((value) => String(value).toLowerCase());
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
  const solvedPractice = new Set();
  attempts.forEach((attempt) => {
    const key = `${attempt.source}:${attempt.questionId}`;
    if (attempt.result === 'correct') solvedPractice.add(key);
    if (!latest.has(key)) latest.set(key, attempt.result);
  });
  res.json({ warning: visible.warning || (summariesResult[0].status === 'rejected' ? 'Interview history is temporarily unavailable.' : ''), questions: selected.map(({ question, source }) => ({ ...publicShape(question, source),
    reportedCompanies: reportsFor({ question, source }),
    result: solvedProblems.has(String(question.sourceProblemId)) || solvedPractice.has(`${source}:${question._id}`)
      ? 'correct' : latest.get(`${source}:${question._id}`) || null })),
    pagination: { page, limit, total: all.length, pages: Math.max(1, Math.ceil(all.length / limit)) },
    filters: { totalProblems: available.length,
      availableTags: [...new Set(available.flatMap(({ question }) => question.tags || []))].sort(),
      tagCounts: Object.entries(available.flatMap(({ question }) => question.tags || []).reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1; return acc;
      }, {})).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
      companyCounts: Object.values(available.reduce((acc, item) => {
        const names = [...(item.question.keywords || item.question.questionData?.problemDataSnapshot?.companyTags || []),
          ...reportsFor(item).map((row) => row.company)];
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

router.get('/:source/:id', asyncRoute(async (req, res) => {
  const found = await findVisible(req.params.source, req.params.id);
  res.json({ question: publicShape(found, req.params.source) });
}));

router.get('/shared/:id/problem', asyncRoute(async (req, res) => {
  const question = await findVisible('shared', req.params.id);
  if (question.questionType !== 'coding') throw new HttpError(404, 'Coding problem not found');
  const snapshot = question.questionData?.problemDataSnapshot || question.questionData?.coding?.problemData;
  if (!snapshot) throw new HttpError(404, 'Coding problem details unavailable');
  const [totalSubmissions, acceptedSubmissions, solved] = await Promise.all([
    QuestionPracticeAttempt.countDocuments({ source: 'shared', questionId: question._id, questionType: 'coding' }),
    QuestionPracticeAttempt.countDocuments({ source: 'shared', questionId: question._id, questionType: 'coding', result: 'correct' }),
    QuestionPracticeAttempt.exists({ studentId: req.user._id, source: 'shared', questionId: question._id,
      questionType: 'coding', result: 'correct' }),
  ]);
  res.json({ ...serializeProblem({ ...snapshot, _id: question._id, status: 'published', visibility: 'public' },
    { sampleTestCases: snapshot.sampleTestCases || [] }), platformShared: true,
  studentStatus: solved ? 'Solved' : 'Unsolved', totalSubmissions, acceptedSubmissions,
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
    testCaseResults: item.testCaseResults || [], compileOutput: item.compileOutput || '' })) });
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
  const cases = samples.length ? samples : [{ input: String(req.body?.customInput || '').slice(0, 65536) }];
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
      return { result: 'incorrect', feedback: failureStatus === 'CE' ? 'Compilation failed'
        : failureStatus === 'RE' ? 'Runtime error' : failureStatus === 'TLE' ? 'Time limit exceeded' : 'A test case failed',
        totalTestCases: testCases.length, passedTestCases, executionTimeMs, memoryUsedKb, testCaseResults,
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
    failureStatus: graded.failureStatus, testCaseResults: graded.testCaseResults || [],
    compileOutput: graded.compileOutput || '' });
  if (req.params.source === 'shared' && question.questionType === 'coding' && graded.result === 'correct') {
    void recordDailyChallengeCompletion({ userId: req.user._id, problemId: question._id, source: 'shared' }).catch((error) => console.warn('[Daily challenge] Shared reward sync failed:', error.message));
  }
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
