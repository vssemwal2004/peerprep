// Pure workload helpers. Use delivery origin coordinates rather than shuffled positions.
export function buildAnswerCatalog(assessment = {}) {
  const catalog = [];
  (assessment.sections || []).forEach((section, sectionIndex) => {
    (section.questions || []).forEach((question, questionIndex) => {
      const type = question.type || section.type;
      if (!['mcq', 'short', 'one_line'].includes(type)) return;
      if (type === 'mcq' && !question.options?.length) return;
      catalog.push({ sectionIndex: Number(question.__originSectionIndex ?? sectionIndex),
        questionIndex: Number(question.__originQuestionIndex ?? questionIndex), type,
        optionCount: question.options?.length || 0, multiple: Boolean(question.allowMultipleAnswers) });
    });
  });
  return catalog;
}
export function changedAnswerBatch(catalog, cycle, runId, count = 3) {
  return Array.from({ length: Math.min(count, catalog.length) }, (_, offset) => {
    const question = catalog[(cycle * 3 + offset) % catalog.length];
    const selected = (cycle + question.sectionIndex + question.questionIndex) % Math.max(1, question.optionCount);
    return { sectionIndex: question.sectionIndex, questionIndex: question.questionIndex,
      answer: question.type === 'mcq' ? (question.multiple ? [selected] : selected) : `${runId}: answer ${cycle}:${offset}` };
  });
}
export function answersMatch(expected, actual) {
  const lookup = new Map(actual.map((entry) => [`${entry.sectionIndex}-${entry.questionIndex}`, entry]));
  return expected.length > 0 && expected.every((entry) => {
    const stored = lookup.get(`${entry.sectionIndex}-${entry.questionIndex}`);
    const normalize = (value) => Array.isArray(value) ? JSON.stringify(value.map(String).sort()) : String(value ?? '');
    return stored && normalize(stored.answer) === normalize(entry.answer)
      && String(stored.code || '') === String(entry.code || '') && String(stored.language || '') === String(entry.language || '');
  });
}
