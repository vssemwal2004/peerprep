const asId = (value) => String(value || '').trim();
const asFingerprintText = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const contentIdentity = (type, text) => {
  const normalizedText = asFingerprintText(text);
  return normalizedText ? `content:${asId(type || 'other')}:${normalizedText}` : '';
};

export function getAssessmentQuestionIdentityKeys(question = {}) {
  return [
    question.librarySourceId && `library:${asId(question.librarySourceId)}`,
    question.librarySourceId && question.librarySourceChildId && `library-child:${asId(question.librarySourceId)}:${asId(question.librarySourceChildId)}`,
    question.librarySourceQuestionId && `source-question:${asId(question.librarySourceQuestionId)}`,
    (question.problemId || question.coding?.problemId || question.problemDataSnapshot?._id || question.coding?.problemData?._id)
      && `problem:${asId(question.problemId || question.coding?.problemId || question.problemDataSnapshot?._id || question.coding?.problemData?._id)}`,
    question.questionId && `source-question:${asId(question.questionId)}`,
    contentIdentity(
      question.type,
      question.questionText || question.problemDataSnapshot?.title || question.coding?.title || question.coding?.problemData?.title,
    ),
  ].filter(Boolean);
}

export function getLibraryQuestionIdentityKeys(question = {}) {
  return [
    question._id && `library:${asId(question._id)}`,
    question.sourceProblemId && `problem:${asId(question.sourceProblemId)}`,
    question.sourceQuestionId && `source-question:${asId(question.sourceQuestionId)}`,
    contentIdentity(question.questionType, question.questionText),
  ].filter(Boolean);
}

export function buildAssessmentQuestionIdentitySet(sections = []) {
  return new Set((sections || []).flatMap((section) => (
    (section.questions || []).flatMap(getAssessmentQuestionIdentityKeys)
  )));
}

export function isLibraryQuestionAlreadyAdded(question = {}, identitySet = new Set()) {
  return getLibraryQuestionIdentityKeys(question).some((key) => identitySet.has(key));
}
