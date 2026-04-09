import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Code2, Download, FileSpreadsheet, Plus, Trash2, Upload } from 'lucide-react';
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

export default function SectionBuilder({ sections, onChange, onOpenCodingEditor, onOpenProblemLibrary, onNotify }) {
  const [collapsedSections, setCollapsedSections] = useState({});
  const fileInputRefs = useRef({});
  const sectionRefs = useRef({});
  const [importState, setImportState] = useState({});

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

  const normalizeHeader = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

  const getHeaderIndex = (normalizedHeaders, candidates) => {
    const normalizedCandidates = candidates.map(normalizeHeader);
    return normalizedHeaders.findIndex((h) => (
      normalizedCandidates.some((c) => h === c || h.startsWith(c) || h.includes(c))
    ));
  };

  const downloadTemplate = async (sectionType) => {
    const isMcq = sectionType === 'mcq';
    const filename = isMcq ? 'mcq-import-template.xlsx' : 'short-answer-import-template.xlsx';
    const rows = isMcq
      ? [
        ['Question', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Correct Answer (A/B/C/D or 1/2/3/4)'],
        ['What is 2 + 2?', '3', '4', '5', '6', '2'],
      ]
      : [
        ['Heading (optional)', 'Question', 'Answer'],
        ['Arrays', 'Explain what an array is.', 'An array is a collection of elements stored contiguously and accessed by index.'],
      ];

    if (isMcq) {
      // Keep headers simple so uploaded templates always match.
      rows[0][5] = 'Correct Answer';
    }

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Questions');
      XLSX.writeFile(wb, filename);
    } catch (err) {
      // If XLSX isn't available for some reason, fail gracefully.
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  const parseImportFile = async (file, sectionType) => {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) throw new Error('No sheet found in the uploaded file.');
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!Array.isArray(aoa) || aoa.length < 2) throw new Error('The uploaded file is empty or missing rows.');

    const headerRow = aoa[0] || [];
    const normalizedHeaders = headerRow.map(normalizeHeader);
    const questionIdx = getHeaderIndex(normalizedHeaders, ['question', 'questiontext']);

    if (questionIdx === -1) {
      throw new Error('Invalid format: missing required column “Question”. Download the template to see the expected format.');
    }

    if (sectionType === 'mcq') {
      // Backward compatible: accept files that still have a Heading column, but do not require/use it.
      const legacyHeadingIdx = getHeaderIndex(normalizedHeaders, ['heading', 'category', 'title']);
      const aIdx = getHeaderIndex(normalizedHeaders, ['optiona', 'option1', 'option 1', 'a']);
      const bIdx = getHeaderIndex(normalizedHeaders, ['optionb', 'option2', 'option 2', 'b']);
      const cIdx = getHeaderIndex(normalizedHeaders, ['optionc', 'option3', 'option 3', 'c']);
      const dIdx = getHeaderIndex(normalizedHeaders, ['optiond', 'option4', 'option 4', 'd']);
      const correctIdx = getHeaderIndex(normalizedHeaders, ['correctanswer', 'correctoption', 'correctoptionindex', 'correct', 'answer']);
      if ([aIdx, bIdx, cIdx, dIdx, correctIdx].some((v) => v === -1)) {
        throw new Error('Invalid format: required columns are Option 1-4 (or Option A-D) and Correct Answer. Download the template for the exact format.');
      }

      const results = [];
      const errors = [];
      for (let r = 1; r < aoa.length; r += 1) {
        const row = aoa[r] || [];
        // Legacy heading ignored (do not include it in questionText).
        const legacyHeading = legacyHeadingIdx >= 0 ? String(row[legacyHeadingIdx] || '').trim() : '';
        const question = String(row[questionIdx] || '').trim();
        const optA = String(row[aIdx] || '').trim();
        const optB = String(row[bIdx] || '').trim();
        const optC = String(row[cIdx] || '').trim();
        const optD = String(row[dIdx] || '').trim();
        const correctRaw = String(row[correctIdx] || '').trim();

        const allEmpty = !legacyHeading && !question && !optA && !optB && !optC && !optD && !correctRaw;
        if (allEmpty) continue;

        if (!question) {
          errors.push(`Row ${r + 1}: Question is required.`);
          continue;
        }
        if (![optA, optB, optC, optD].every(Boolean)) {
          errors.push(`Row ${r + 1}: All four options (A-D) are required.`);
          continue;
        }

        const correct = correctRaw.toUpperCase().replace(/^OPTION\s*/i, '').trim();
        const map = {
          A: 0,
          B: 1,
          C: 2,
          D: 3,
          '1': 0,
          '2': 1,
          '3': 2,
          '4': 3,
        };
        const correctOptionIndex = map[correct];
        if (typeof correctOptionIndex !== 'number') {
          errors.push(`Row ${r + 1}: Correct Answer must be A/B/C/D or 1/2/3/4.`);
          continue;
        }

        results.push({
          questionText: question,
          options: [optA, optB, optC, optD],
          correctOptionIndex,
        });
      }
      return { rows: results, errors };
    }

    // short / one_line import
    const headingIdx = getHeaderIndex(normalizedHeaders, ['heading', 'category', 'title']);
    const answerIdx = getHeaderIndex(normalizedHeaders, ['answer', 'expectedanswer']);
    if (answerIdx === -1) {
      throw new Error('Invalid format: missing required column “Answer”. Download the template to see the expected format.');
    }

    const results = [];
    const errors = [];
    for (let r = 1; r < aoa.length; r += 1) {
      const row = aoa[r] || [];
      const heading = headingIdx >= 0 ? String(row[headingIdx] || '').trim() : '';
      const question = String(row[questionIdx] || '').trim();
      const answer = String(row[answerIdx] || '').trim();

      const allEmpty = !heading && !question && !answer;
      if (allEmpty) continue;

      if (!question) {
        errors.push(`Row ${r + 1}: Question is required.`);
        continue;
      }
      if (!answer) {
        errors.push(`Row ${r + 1}: Answer is required.`);
        continue;
      }

      results.push({ heading, questionText: question, expectedAnswer: answer });
    }

    return { rows: results, errors };
  };

  const handleImportClick = (sectionKey) => {
    fileInputRefs.current?.[sectionKey]?.click?.();
  };

  const handleImportFile = async (sectionIndex, section, file) => {
    const sectionKey = section.__key;
    if (!file) return;

    setImportState((prev) => ({
      ...prev,
      [sectionKey]: { status: 'importing', message: 'Uploading…', imported: 0, errors: [] },
    }));

    try {
      if (!['mcq', 'short', 'one_line'].includes(section.type)) {
        throw new Error('Import is supported only for MCQ, Short Answer, and One Line sections.');
      }

      const { rows, errors } = await parseImportFile(file, section.type);
      if (errors.length) {
        setImportState((prev) => ({
          ...prev,
          [sectionKey]: { status: 'error', message: 'Some rows could not be imported.', imported: rows.length, errors: errors.slice(0, 8) },
        }));
      }

      if (!rows.length) {
        throw new Error('No valid questions found in the uploaded file.');
      }

      const marks = Number(section.marksPerQuestion || 1) || 1;
      const importedQuestions = rows.map((row) => {
        const prefixedQuestion = (section.type !== 'mcq' && row.heading)
          ? `${row.heading}\n${row.questionText}`
          : row.questionText;
        if (section.type === 'mcq') {
          return {
            questionId: createQuestionId(),
            type: 'mcq',
            questionText: prefixedQuestion,
            options: row.options,
            correctOptionIndex: row.correctOptionIndex,
            points: marks,
          };
        }
        return {
          questionId: createQuestionId(),
          type: section.type,
          questionText: prefixedQuestion,
          expectedAnswer: row.expectedAnswer,
          keywords: [],
          points: marks,
        };
      });

      const nextQuestions = [...(section.questions || []), ...importedQuestions];
      updateSection(sectionIndex, { questions: nextQuestions });

      // Ensure admins can immediately see the imported questions.
      setCollapsedSections((prev) => ({ ...prev, [sectionIndex]: false }));
      requestAnimationFrame(() => {
        const el = sectionRefs.current?.[sectionKey];
        el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      });

      setImportState((prev) => ({
        ...prev,
        [sectionKey]: { status: errors.length ? 'warning' : 'success', message: `Imported ${importedQuestions.length} questions.`, imported: importedQuestions.length, errors: errors.slice(0, 8) },
      }));

      if (errors.length) {
        onNotify?.error?.(`Imported ${importedQuestions.length} questions with some errors.`);
      } else {
        onNotify?.success?.(`Imported ${importedQuestions.length} questions.`);
      }
    } catch (err) {
      setImportState((prev) => ({
        ...prev,
        [sectionKey]: { status: 'error', message: err?.message || 'Import failed.', imported: 0, errors: [] },
      }));
      onNotify?.error?.(err?.message || 'Import failed.');
    } finally {
      const input = fileInputRefs.current?.[sectionKey];
      if (input) input.value = '';
    }
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
          <div
            key={section.__key}
            ref={(el) => {
              if (el) sectionRefs.current[section.__key] = el;
            }}
            className="rounded-2xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900"
          >
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

                {/* Bulk Import */}
                {['mcq', 'short', 'one_line'].includes(section.type) && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-gray-200">
                      <FileSpreadsheet className="h-4 w-4 text-slate-500" />
                      Bulk Import
                      <span className="text-[11px] font-normal text-slate-500 dark:text-gray-400">(Excel)</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => downloadTemplate(section.type)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download Template
                      </button>
                      <button
                        type="button"
                        onClick={() => handleImportClick(section.__key)}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Import via Excel
                      </button>
                      <input
                        ref={(el) => {
                          if (el) fileInputRefs.current[section.__key] = el;
                        }}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => handleImportFile(index, section, e.target.files?.[0])}
                      />
                    </div>
                  </div>
                )}

                {(() => {
                  const state = importState?.[section.__key];
                  if (!state || state.status === 'idle') return null;
                  const tone = state.status === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200'
                    : state.status === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200'
                      : state.status === 'importing'
                        ? 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-200'
                        : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200';

                  return (
                    <div className={`rounded-2xl border px-4 py-3 text-xs ${tone}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">
                          {state.status === 'importing' ? 'Importing…' : state.message}
                        </div>
                        {state.status === 'importing' && (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
                        )}
                      </div>
                      {!!state.errors?.length && (
                        <div className="mt-2 space-y-1">
                          {state.errors.map((msg) => (
                            <div key={msg} className="text-[11px] opacity-90">{msg}</div>
                          ))}
                          {state.imported > 0 && (
                            <div className="mt-1 text-[11px] opacity-90">Imported {state.imported} valid questions.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

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


