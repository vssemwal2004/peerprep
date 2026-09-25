export function createAssessmentOnlyQuestionSelections(items = []) {
  return (items || []).map((item) => ({
    assessmentSetHint: item.assessmentSetHint,
    questionType: item.type,
    questionText: item.questionText,
    assessmentOnly: true,
    questionData: {
      ...item,
      saveToLibrary: false,
      questions: Array.isArray(item.questions)
        ? item.questions.map((question) => ({ ...question, saveToLibrary: false }))
        : item.questions,
    },
  }));
}
