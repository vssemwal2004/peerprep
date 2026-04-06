import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Code2, Plus, Trash2 } from 'lucide-react';
import QuestionBuilder from './QuestionBuilder';

const questionTypes = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'short', label: 'Short Answer' },
  { value: 'one_line', label: 'One Line' },
  { value: 'coding', label: 'Coding' },
];

const createQuestionId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const emptyQuestion = (type, marksPerQuestion = 1) => {
  if (type === 'mcq') {
    return {
      questionId: createQuestionId(),
      type: 'mcq',
      questionText: '',
      options: ['', '', '', ''],
      correctOptionIndex: 0,
      points: marksPerQuestion,
    };
  }
  if (type === 'coding') {
    return {
      questionId: createQuestionId(),
      type: 'coding',
      questionText: '',
      problemId: '',
      problemDataSnapshot: null,
      points: marksPerQuestion,
    };
  }
  return {
    questionId: createQuestionId(),
    type,
    questionText: '',
    expectedAnswer: '',
    keywords: [],
    points: marksPerQuestion,
  };
};

const emptySection = () => ({
  sectionName: '',
  type: 'mcq',
  marksPerQuestion: 1,
  questions: [emptyQuestion('mcq', 1)],
});

export default function SectionBuilder({ sections, onChange, onOpenCodingEditor, onOpenProblemLibrary }) {
  const [collapsedSections, setCollapsedSections] = useState({});

  const sectionsWithIds = useMemo(() => {
    return (sections || []).map((section, index) => ({
      ...section,
      __key: section.__key || `${index}-${section.sectionName || 'section'}`,
    }));
  }, [sections]);

  const updateSection = (index, updates) => {
    const next = sectionsWithIds.map((section, idx) => (idx === index ? { ...section, ...updates } : section));
    onChange(next);
  };

  const addSection = () => {
    onChange([...(sectionsWithIds || []), emptySection()]);
  };

  const removeSection = (index) => {
    onChange(sectionsWithIds.filter((_, idx) => idx !== index));
  };

  const addQuestion = (sectionIndex) => {
    const section = sectionsWithIds[sectionIndex];
    const marks = Number(section.marksPerQuestion || 1) || 1;
    const nextQuestions = [...(section.questions || []), emptyQuestion(section.type, marks)];
    updateSection(sectionIndex, { questions: nextQuestions });
  };

  const updateQuestion = (sectionIndex, questionIndex, updates) => {
    const section = sectionsWithIds[sectionIndex];
    const nextQuestions = (section.questions || []).map((question, idx) => (
      idx === questionIndex ? { ...question, ...updates } : question
    ));
    updateSection(sectionIndex, { questions: nextQuestions });
  };

  const removeQuestion = (sectionIndex, questionIndex) => {
    const section = sectionsWithIds[sectionIndex];
    const filtered = (section.questions || []).filter((_, idx) => idx !== questionIndex);
    updateSection(sectionIndex, { questions: filtered.length ? filtered : [emptyQuestion(section.type)] });
  };

  const handleTypeChange = (sectionIndex, nextType) => {
    const section = sectionsWithIds[sectionIndex];
    const marks = Number(section.marksPerQuestion || 1) || 1;
    updateSection(sectionIndex, { type: nextType, questions: [emptyQuestion(nextType, marks)] });
  };

  const handleMarksChange = (sectionIndex, value) => {
    const marks = Number(value) || 1;
    const section = sectionsWithIds[sectionIndex];
    const nextQuestions = (section.questions || []).map((question) => ({ ...question, points: marks }));
    updateSection(sectionIndex, { marksPerQuestion: marks, questions: nextQuestions });
  };

  const renderCodingCard = (sectionIndex, questionIndex, question) => {
    const problemData = question.problemDataSnapshot
      || question.problemData
      || question.coding?.problemData
      || question.coding
      || {};
    const previewValidated = Boolean(problemData.previewValidated ?? problemData.previewTested ?? question.coding?.previewValidated ?? question.coding?.previewTested);
    const languageCount = problemData.supportedLanguages?.length || 0;
    const sampleCount = problemData.sampleTestCases?.length || 0;
    const hiddenCount = problemData.hiddenTestCaseCount
      || problemData.hiddenTestCases?.length
      || 0;
    const hasTemplates = Object.values(problemData.codeTemplates || {}).some((value) => String(value || '').trim());
    const status = previewValidated && sampleCount > 0 && hiddenCount > 0 && hasTemplates
      ? 'Ready'
      : (previewValidated ? 'Validated' : 'Draft');

    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
              <Code2 className="h-3.5 w-3.5" />
              Coding Question
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-gray-100">
              {problemData.title || question.questionText || 'Untitled Coding Question'}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-gray-400">
              {problemData.difficulty || 'Easy'} - {languageCount} languages - {sampleCount} samples - {hiddenCount} hidden
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
            status === 'Ready'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
              : status === 'Validated'
                ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300'
                : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
          }`}>
            {status}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-gray-400">
            {previewValidated ? 'Preview validated. Ready to add.' : 'Preview validation required before adding.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenCodingEditor?.(sectionIndex, questionIndex)}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
            >
              Open Coding Editor
            </button>
            <button
              type="button"
              onClick={() => removeQuestion(sectionIndex, questionIndex)}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {sectionsWithIds.map((section, index) => {
        const isCollapsed = collapsedSections[index];
        const isCodingSection = section.type === 'coding';
        return (
          <div key={section.__key} className="rounded-2xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCollapsedSections((prev) => ({ ...prev, [index]: !prev[index] }))}
                  className="rounded-lg border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">
                    {section.sectionName || `Section ${index + 1}`}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">{section.type?.toUpperCase()} - {section.questions?.length || 0} questions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeSection(index)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove Section
              </button>
            </div>

            {!isCollapsed && (
              <div className="p-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-xs text-slate-500 dark:text-gray-400">Section Name</label>
                    <input
                      value={section.sectionName}
                      onChange={(e) => updateSection(index, { sectionName: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 dark:text-gray-400">Question Type</label>
                    <select
                      value={section.type}
                      onChange={(e) => handleTypeChange(index, e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    >
                      {questionTypes.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 dark:text-gray-400">Marks per Question</label>
                    <input
                      type="number"
                      min="1"
                      value={section.marksPerQuestion || 1}
                      onChange={(e) => handleMarksChange(index, e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {(section.questions || []).map((question, qIndex) => (
                    section.type === 'coding'
                      ? (
                        <div key={question.questionId || `q-${index}-${qIndex}`}>
                          {renderCodingCard(index, qIndex, question)}
                        </div>
                      )
                      : (
                        <QuestionBuilder
                          key={question.questionId || `q-${index}-${qIndex}`}
                          type={section.type}
                          value={question}
                          onChange={(updates) => updateQuestion(index, qIndex, updates)}
                          onRemove={() => removeQuestion(index, qIndex)}
                          groupName={`mcq-${index}-${qIndex}`}
                        />
                      )
                  ))}
                </div>

                {isCodingSection ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addQuestion(index)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create New Coding Question
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenProblemLibrary?.(index)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add From Existing Library
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => addQuestion(index)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Question
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addSection}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <Plus className="h-4 w-4" />
        Add Section
      </button>
    </div>
  );
}


