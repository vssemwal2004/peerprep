import { HttpError } from '../utils/errors.js';
import {
  buildRunResponse,
  checkJudge0Health,
  KEY_TO_LANGUAGE_ID,
  mapRunStatusCode,
  MAX_STDIN_SIZE_BYTES,
  runJudge0,
  sanitizeExecutionText,
} from '../services/executionService.js';
import {
  enqueueCompilerRunJob,
  enqueueCompilerSubmitJob,
  pickReferenceSolution,
  resolveActiveProblem,
} from '../services/compilerExecutionWorkflowService.js';
import { buildJudge0Options } from '../services/executionService.js';

export async function runCode(req, res) {
  const queuedJob = await enqueueCompilerRunJob({
    user: req.user,
    body: req.body,
  });
  res.status(202).json(queuedJob);
}

export async function submitCode(req, res) {
  const queuedJob = await enqueueCompilerSubmitJob({
    user: req.user,
    body: req.body,
  });
  res.status(202).json(queuedJob);
}

export async function getExpectedOutput(req, res) {
  const problemId = String(req.params.id || req.body.problemId || '').trim();
  const assessmentId = String(req.body.assessmentId || req.query.assessmentId || '').trim();
  const problem = await resolveActiveProblem(problemId, { userId: req.user?._id, assessmentId });

  const standardInput = sanitizeExecutionText(
    req.body.stdin ?? req.body.customInput ?? '',
    MAX_STDIN_SIZE_BYTES,
    'Input',
  );

  const preferredLanguageKey = String(req.body.language || '').trim().toLowerCase();
  const reference = pickReferenceSolution(problem, preferredLanguageKey);
  if (!reference) {
    throw new HttpError(409, 'Expected output is not available for this problem.');
  }

  const referenceLanguageId = KEY_TO_LANGUAGE_ID[reference.languageKey];
  if (!referenceLanguageId) {
    throw new HttpError(500, 'Reference solution is configured with an unsupported language.');
  }

  const judgeResult = await runJudge0(
    reference.sourceCode,
    referenceLanguageId,
    standardInput,
    buildJudge0Options(problem),
  );

  const statusCode = mapRunStatusCode(judgeResult);
  if (statusCode !== 'AC') {
    throw new HttpError(502, 'Expected output is currently unavailable.');
  }

  const responsePayload = buildRunResponse(judgeResult);
  res.json({
    expectedOutput: responsePayload.stdout || '',
    language: reference.languageKey,
  });
}

export async function getJudge0Health(req, res) {
  const payload = await checkJudge0Health();
  res.json(payload);
}
