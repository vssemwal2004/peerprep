function numericValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCodingVerdict(answer = {}) {
  const resultStatus = String(answer?.executionResult?.status || '').trim();
  const verdict = String(answer?.executionVerdict || resultStatus || '').trim().toUpperCase();
  if (verdict === 'AC' || verdict === 'ACCEPTED' || resultStatus === 'Accepted') return 'AC';
  if (['WA', 'WRONG ANSWER'].includes(verdict)) return 'WA';
  if (['TLE', 'TIME LIMIT EXCEEDED'].includes(verdict)) return 'TLE';
  if (['RE', 'RUNTIME ERROR'].includes(verdict)) return 'RE';
  if (['CE', 'COMPILATION ERROR'].includes(verdict)) return 'CE';
  if (verdict === 'FAILED') return 'FAILED';
  return verdict || 'PENDING';
}

/**
 * Returns weighted progress for a coding answer. Legacy answers with only
 * passed/total continue to use equal weighting per test case.
 */
export function getCodingTestCaseProgress(answer = {}) {
  const executionResult = answer?.executionResult || {};
  const passedMarks = numericValue(
    executionResult.passedTestCaseMarks ?? answer?.passedTestCaseMarks,
  );
  const totalMarks = numericValue(
    executionResult.totalTestCaseMarks ?? answer?.totalTestCaseMarks,
  );

  if (totalMarks !== null && totalMarks > 0 && passedMarks !== null) {
    const earned = Math.max(0, Math.min(totalMarks, passedMarks));
    return {
      hasEvaluation: true,
      passed: numericValue(executionResult.passed ?? executionResult.passedTestCases) ?? 0,
      total: numericValue(executionResult.total ?? executionResult.totalTestCases) ?? 0,
      passedMarks: earned,
      totalMarks,
      ratio: earned / totalMarks,
    };
  }

  const passed = numericValue(executionResult.passed ?? executionResult.passedTestCases);
  const total = numericValue(executionResult.total ?? executionResult.totalTestCases);
  if (total !== null && total > 0 && passed !== null) {
    const earned = Math.max(0, Math.min(total, passed));
    return {
      hasEvaluation: true,
      passed: earned,
      total,
      passedMarks: earned,
      totalMarks: total,
      ratio: earned / total,
    };
  }

  const verdict = normalizeCodingVerdict(answer);
  if (verdict === 'AC') {
    return {
      hasEvaluation: true,
      passed: 1,
      total: 1,
      passedMarks: 1,
      totalMarks: 1,
      ratio: 1,
    };
  }

  const status = String(answer?.executionStatus || '').trim().toLowerCase();
  return {
    hasEvaluation: ['completed', 'failed'].includes(status) || verdict !== 'PENDING',
    passed: 0,
    total: 0,
    passedMarks: 0,
    totalMarks: 0,
    ratio: 0,
  };
}

export function getCodingQuestionScore(question = {}, answer = {}, section = {}) {
  const points = Number(question?.points ?? question?.marks ?? section?.marksPerQuestion ?? 0) || 0;
  const hasCode = String(answer?.code || '').trim().length > 0;
  const progress = getCodingTestCaseProgress(answer);

  if (!hasCode || !progress.hasEvaluation) {
    return {
      earnedMarks: 0,
      maxMarks: points,
      ...progress,
      fullyCorrect: false,
    };
  }

  const earnedMarks = Math.round(points * progress.ratio * 10000) / 10000;
  return {
    earnedMarks,
    maxMarks: points,
    ...progress,
    fullyCorrect: progress.ratio >= 1,
  };
}

export function scoreAssessmentWithTestCases(assessment = {}, answers = []) {
  const answerMap = new Map();
  (answers || []).forEach((answer) => {
    answerMap.set(`${answer.sectionIndex}-${answer.questionIndex}`, answer);
  });

  let score = 0;
  let maxMarks = 0;
  (assessment.sections || []).forEach((section, sectionIndex) => {
    (section.questions || []).forEach((question, questionIndex) => {
      const questionType = question.type || section.type;
      const points = Number(question.points ?? question.marks ?? section.marksPerQuestion ?? 0) || 0;
      const negativePoints = Math.max(0, Number(
        question.negativePoints ?? question.negativeMarks ?? section.negativeMarksPerQuestion ?? 0,
      ) || 0);
      maxMarks += points;

      const answer = answerMap.get(`${sectionIndex}-${questionIndex}`);
      if (!answer) return;

      if (questionType === 'mcq') {
        if (Number(answer.answer) === Number(question.correctOptionIndex)) score += points;
        else score -= negativePoints;
        return;
      }

      if (questionType === 'short' || questionType === 'one_line') {
        const expected = String(question.expectedAnswer || '').trim().toLowerCase();
        const actual = String(answer.answer || '').trim().toLowerCase();
        if (!expected) return;
        if (actual === expected) {
          score += points;
        } else if (Array.isArray(question.keywords) && question.keywords.length > 0) {
          const matched = question.keywords.every((keyword) => actual.includes(String(keyword).toLowerCase()));
          if (matched) score += points;
          else if (actual) score -= negativePoints;
        } else if (actual) {
          score -= negativePoints;
        }
        return;
      }

      if (questionType === 'coding') {
        const codingScore = getCodingQuestionScore(question, answer, section);
        score += codingScore.earnedMarks;
        if (codingScore.hasEvaluation && codingScore.earnedMarks === 0 && String(answer.code || '').trim()) {
          score -= negativePoints;
        }
      }
    });
  });

  const accuracy = maxMarks > 0 ? Math.round((score / maxMarks) * 10000) / 100 : 0;
  return { score, maxMarks, accuracy };
}

