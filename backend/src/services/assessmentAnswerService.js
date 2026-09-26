function answerKey(answer = {}) {
  const sectionIndex = Number(answer?.sectionIndex);
  const questionIndex = Number(answer?.questionIndex);
  if (!Number.isInteger(sectionIndex) || !Number.isInteger(questionIndex)) return '';
  return `${sectionIndex}-${questionIndex}`;
}

function toPlainAnswer(answer = {}) {
  return typeof answer?.toObject === 'function' ? answer.toObject() : { ...answer };
}

function preserveCodingEvaluation(previous, incoming) {
  const incomingCode = String(incoming?.code ?? '');
  const previousCode = String(previous?.code ?? '');
  const sameCodingSubmission = Boolean(
    previous
    && (Object.prototype.hasOwnProperty.call(incoming || {}, 'code')
      || Object.prototype.hasOwnProperty.call(previous || {}, 'code'))
    && incomingCode === previousCode
    && String(incoming?.language || '') === String(previous?.language || ''),
  );

  if (!sameCodingSubmission) return { ...incoming };
  return {
    ...incoming,
    jobId: previous.jobId,
    executionStatus: previous.executionStatus,
    executionVerdict: previous.executionVerdict,
    executionResult: previous.executionResult,
    submissionId: previous.submissionId,
    lastEvaluatedAt: previous.lastEvaluatedAt,
  };
}

/**
 * Merge a partial answer batch into the durable answer set.
 *
 * Clients deliberately send only dirty answers during autosave. Existing
 * answers that are absent from the batch must remain untouched.
 */
export function mergeAssessmentAnswers(existingAnswers = [], incomingAnswers = []) {
  const mergedByKey = new Map();

  (Array.isArray(existingAnswers) ? existingAnswers : []).forEach((answer) => {
    const plain = toPlainAnswer(answer);
    const key = answerKey(plain);
    if (key) mergedByKey.set(key, plain);
  });

  (Array.isArray(incomingAnswers) ? incomingAnswers : []).forEach((answer) => {
    const incoming = toPlainAnswer(answer);
    const key = answerKey(incoming);
    if (!key) return;
    mergedByKey.set(key, preserveCodingEvaluation(mergedByKey.get(key), incoming));
  });

  return [...mergedByKey.values()].sort((a, b) => (
    Number(a.sectionIndex) - Number(b.sectionIndex)
    || Number(a.questionIndex) - Number(b.questionIndex)
  ));
}

