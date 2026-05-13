import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Code2, Download, FileSpreadsheet, Plus, Trash2, Upload } from 'lucide-react';
import QuestionBuilder from './QuestionBuilder';

const questionTypes = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'short', label: 'Short Answer' },
  { value: 'one_line', label: 'One Line' },
  { value: 'coding', label: 'Coding' },
];

const typeLabelMap = Object.fromEntries(questionTypes.map((item) => [item.value, item.label]));

const createQuestionId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const emptyQuestion = (type, marksPerQuestion = 1, negativeMarksPerQuestion = 0) => {
  if (type === 'mcq') {
    return {
      questionId: createQuestionId(),
      type: 'mcq',
      questionText: '',
      options: ['', '', '', ''],
      correctOptionIndex: 0,
      points: marksPerQuestion,
      negativePoints: negativeMarksPerQuestion,
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
      negativePoints: negativeMarksPerQuestion,
    };
  }
  return {
    questionId: createQuestionId(),
    type,
    questionText: '',
    expectedAnswer: '',
    keywords: [],
    points: marksPerQuestion,
    negativePoints: negativeMarksPerQuestion,
  };
};

const emptySection = () => ({
  sectionName: '',
  type: 'mcq',
  marksPerQuestion: 1,
  negativeMarksPerQuestion: 0,
  questions: [emptyQuestion('mcq', 1, 0)],
});

const truncate = (value, max = 88) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
};

const getQuestionPreview = (sectionType, question = {}) => {
  if (sectionType === 'mcq') {
    const answer = (question.options || [])[Number(question.correctOptionIndex)];
    return answer ? `Answer: ${truncate(answer, 56)}` : 'Options not completed';
  }
  if (sectionType === 'coding') {
    const problemData = question.problemDataSnapshot || question.problemData || question.coding?.problemData || question.coding || {};
    const parts = [
      problemData.difficulty,
      problemData.supportedLanguages?.length ? `${problemData.supportedLanguages.length} languages` : '',
      problemData.sampleTestCases?.length ? `${problemData.sampleTestCases.length} examples` : '',
    ].filter(Boolean);
    return parts.join(' • ') || 'Coding prompt not configured';
  }
  if (question.expectedAnswer) {
    return `Expected: ${truncate(question.expectedAnswer, 56)}`;
  }
  if (question.keywords?.length) {
    return `Keywords: ${question.keywords.slice(0, 3).join(', ')}`;
  }
  return 'Answer details pending';
};

export default function SectionBuilder({ sections, onChange, onOpenCodingEditor, onOpenProblemLibrary, onNotify }) {
  const [collapsedSections, setCollapsedSections] = useState({});
  const [collapsedQuestions, setCollapsedQuestions] = useState({});
  const fileInputRefs = useRef({});
  const sectionRefs = useRef({});
  const [importState, setImportState] = useState({});

  const sectionsWithIds = useMemo(() => {
    return (sections || []).map((section, index) => ({
      ...section,
      __key: section.__key || `${index}-${section.sectionName || 'section'}`,
    }));
  }, [sections]);

  useEffect(() => {
    setCollapsedSections((prev) => {
      const next = { ...prev };
      let changed = false;
      sectionsWithIds.forEach((section) => {
        if (typeof next[section.__key] === 'undefined') {
          next[section.__key] = true;
          changed = true;
        }
      });
      Object.keys(next).forEach((key) => {
        if (!sectionsWithIds.some((section) => section.__key === key)) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [sectionsWithIds]);

  useEffect(() => {
    setCollapsedQuestions((prev) => {
      const next = { ...prev };
      let changed = false;
      sectionsWithIds.forEach((section) => {
        const questionMap = { ...(next[section.__key] || {}) };
        (section.questions || []).forEach((question, index) => {
          const questionKey = question.questionId || `${section.__key}-${index}`;
          if (typeof questionMap[questionKey] === 'undefined') {
            questionMap[questionKey] = true;
            changed = true;
          }
        });
        Object.keys(questionMap).forEach((questionKey) => {
          if (!(section.questions || []).some((question, index) => (question.questionId || `${section.__key}-${index}`) === questionKey)) {
            delete questionMap[questionKey];
            changed = true;
          }
        });
        next[section.__key] = questionMap;
      });
      Object.keys(next).forEach((key) => {
        if (!sectionsWithIds.some((section) => section.__key === key)) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [sectionsWithIds]);

  const addSection = useCallback(() => {
    onChange([...(sectionsWithIds || []), emptySection()]);
  }, [onChange, sectionsWithIds]);

  useEffect(() => {
    const handler = () => addSection();
    document.addEventListener('sectionbuilder:addsection', handler);
    return () => document.removeEventListener('sectionbuilder:addsection', handler);
  }, [addSection]);

  const updateSection = (index, updates) => {
    const next = sectionsWithIds.map((section, idx) => (idx === index ? { ...section, ...updates } : section));
    onChange(next);
  };

  const toggleSection = (sectionKey) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  const toggleQuestion = (sectionKey, questionKey) => {
    setCollapsedQuestions((prev) => ({
      ...prev,
      [sectionKey]: {
        ...(prev[sectionKey] || {}),
        [questionKey]: !prev[sectionKey]?.[questionKey],
      },
    }));
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
      rows[0][5] = 'Correct Answer';
    }

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Questions');
      XLSX.writeFile(wb, filename);
    } catch (err) {
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
      throw new Error('Invalid format: missing required column "Question". Download the template to see the expected format.');
    }

    if (sectionType === 'mcq') {
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
        const map = { A: 0, B: 1, C: 2, D: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
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

    const headingIdx = getHeaderIndex(normalizedHeaders, ['heading', 'category', 'title']);
    const answerIdx = getHeaderIndex(normalizedHeaders, ['answer', 'expectedanswer']);
    if (answerIdx === -1) {
      throw new Error('Invalid format: missing required column "Answer". Download the template to see the expected format.');
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
      [sectionKey]: { status: 'importing', message: 'Uploading...', imported: 0, errors: [] },
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
      const negativeMarks = Number(section.negativeMarksPerQuestion || 0) || 0;
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
            negativePoints: negativeMarks,
          };
        }
        return {
          questionId: createQuestionId(),
          type: section.type,
          questionText: prefixedQuestion,
          expectedAnswer: row.expectedAnswer,
          keywords: [],
          points: marks,
          negativePoints: negativeMarks,
        };
      });

      const nextQuestions = [...(section.questions || []), ...importedQuestions];
      updateSection(sectionIndex, { questions: nextQuestions });
      setCollapsedSections((prev) => ({ ...prev, [sectionKey]: false }));
      setCollapsedQuestions((prev) => ({
        ...prev,
        [sectionKey]: {
          ...(prev[sectionKey] || {}),
          ...Object.fromEntries(importedQuestions.map((question) => [question.questionId, true])),
        },
      }));
      requestAnimationFrame(() => {
        const el = sectionRefs.current?.[sectionKey];
        el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      });

      setImportState((prev) => ({
        ...prev,
        [sectionKey]: { status: errors.length ? 'warning' : 'success', message: `Imported ${importedQuestions.length} questions.`, imported: importedQuestions.length, errors: errors.slice(0, 8) },
      }));

      if (errors.length) onNotify?.error?.(`Imported ${importedQuestions.length} questions with some errors.`);
      else onNotify?.success?.(`Imported ${importedQuestions.length} questions.`);
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

  const removeSection = (index) => {
    onChange(sectionsWithIds.filter((_, idx) => idx !== index));
  };

  const addQuestion = (sectionIndex) => {
    const section = sectionsWithIds[sectionIndex];
    const marks = Number(section.marksPerQuestion || 1) || 1;
    const negativeMarks = Number(section.negativeMarksPerQuestion || 0) || 0;
    const newQuestion = emptyQuestion(section.type, marks, negativeMarks);
    const nextQuestions = [...(section.questions || []), newQuestion];
    updateSection(sectionIndex, { questions: nextQuestions });
    setCollapsedSections((prev) => ({ ...prev, [section.__key]: false }));
    setCollapsedQuestions((prev) => ({
      ...prev,
      [section.__key]: {
        ...(prev[section.__key] || {}),
        [newQuestion.questionId]: false,
      },
    }));
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
    updateSection(sectionIndex, {
      questions: filtered.length
        ? filtered
        : [emptyQuestion(section.type, Number(section.marksPerQuestion || 1) || 1, Number(section.negativeMarksPerQuestion || 0) || 0)],
    });
  };

  const handleTypeChange = (sectionIndex, nextType) => {
    const section = sectionsWithIds[sectionIndex];
    const marks = Number(section.marksPerQuestion || 1) || 1;
    const negativeMarks = Number(section.negativeMarksPerQuestion || 0) || 0;
    updateSection(sectionIndex, {
      type: nextType,
      sectionName: section.sectionName || `${typeLabelMap[nextType]} Section`,
      questions: [emptyQuestion(nextType, marks, negativeMarks)],
    });
  };

  const handleMarksChange = (sectionIndex, value) => {
    const marks = value === '' ? '' : Number(value);
    const section = sectionsWithIds[sectionIndex];
    if (value !== '' && !Number.isNaN(marks) && marks >= 0) {
      const nextQuestions = (section.questions || []).map((question) => ({ ...question, points: marks }));
      updateSection(sectionIndex, { marksPerQuestion: marks, questions: nextQuestions });
    } else if (value === '') {
      updateSection(sectionIndex, { marksPerQuestion: '' });
    }
  };

  const handleNegativeMarksChange = (sectionIndex, value) => {
    const negativeMarks = value === '' ? '' : Number(value);
    const section = sectionsWithIds[sectionIndex];
    if (value !== '' && !Number.isNaN(negativeMarks) && negativeMarks >= 0) {
      const nextQuestions = (section.questions || []).map((question) => ({ ...question, negativePoints: negativeMarks }));
      updateSection(sectionIndex, { negativeMarksPerQuestion: negativeMarks, questions: nextQuestions });
    } else if (value === '') {
      updateSection(sectionIndex, { negativeMarksPerQuestion: '' });
    }
  };

  const handleMarksBlur = (sectionIndex) => {
    const section = sectionsWithIds[sectionIndex];
    const currentValue = section.marksPerQuestion;
    if (currentValue === '' || currentValue === undefined || currentValue === null || Number(currentValue) < 1) {
      const marks = 1;
      const nextQuestions = (section.questions || []).map((question) => ({ ...question, points: marks }));
      updateSection(sectionIndex, { marksPerQuestion: marks, questions: nextQuestions });
    }
  };

  const handleNegativeMarksBlur = (sectionIndex) => {
    const section = sectionsWithIds[sectionIndex];
    const currentValue = section.negativeMarksPerQuestion;
    if (currentValue === '' || currentValue === undefined || currentValue === null || Number(currentValue) < 0) {
      const negativeMarks = 0;
      const nextQuestions = (section.questions || []).map((question) => ({ ...question, negativePoints: negativeMarks }));
      updateSection(sectionIndex, { negativeMarksPerQuestion: negativeMarks, questions: nextQuestions });
    }
  };

  const renderCodingCard = (sectionIndex, questionIndex, question, section) => {
    const problemData = question.problemDataSnapshot || question.problemData || question.coding?.problemData || question.coding || {};
    const previewValidated = Boolean(problemData.previewValidated ?? problemData.previewTested ?? question.coding?.previewValidated ?? question.coding?.previewTested);
    const languageCount = problemData.supportedLanguages?.length || 0;
    const sampleCount = problemData.sampleTestCases?.length || 0;
    const hiddenCount = problemData.hiddenTestCaseCount || problemData.hiddenTestCases?.length || 0;
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
              {[problemData.difficulty || 'Easy', `${languageCount} languages`, `${sampleCount} samples`, `${hiddenCount} hidden`].join(' • ')}
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

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Problem Statement</div>
            <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-200">
              {problemData.statement || problemData.description || question.questionText || 'Problem statement not configured yet.'}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Constraints</div>
            <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-200">
              {problemData.constraints || 'Constraints not added yet.'}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Examples</div>
            <div className="mt-2 space-y-2">
              {(problemData.sampleTestCases || []).length ? (
                (problemData.sampleTestCases || []).map((testCase, idx) => (
                  <div key={`${question.questionId}-sample-${idx}`} className="rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300">
                    <div>Input: {testCase.input || '-'}</div>
                    <div className="mt-1">Output: {testCase.output || '-'}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500 dark:text-gray-400">No examples added yet.</div>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Test Cases</div>
            <div className="mt-2 text-sm text-slate-700 dark:text-gray-200">
              Visible: {sampleCount} • Hidden: {hiddenCount}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-gray-400">
              {previewValidated ? 'Preview validated for this problem.' : 'Preview validation is still pending.'}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-3 md:grid-cols-[150px_150px_minmax(0,1fr)]">
            <div>
              <label className="text-[11px] text-slate-500 dark:text-gray-400">Positive Marks</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={question.points ?? section.marksPerQuestion ?? 1}
                onChange={(e) => updateQuestion(sectionIndex, questionIndex, { points: e.target.value === '' ? '' : Number(e.target.value) })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 dark:text-gray-400">Negative Marks</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={question.negativePoints ?? section.negativeMarksPerQuestion ?? 0}
                onChange={(e) => updateQuestion(sectionIndex, questionIndex, { negativePoints: e.target.value === '' ? '' : Number(e.target.value) })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 dark:text-gray-400">Add Tag</label>
              <input
                value={(question.tags || problemData.tags || []).join(', ')}
                onChange={(e) => updateQuestion(sectionIndex, questionIndex, {
                  tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean),
                })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                placeholder="Company, topic, pattern..."
              />
            </div>
          </div>
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
        const isCollapsed = collapsedSections[section.__key];
        const isCodingSection = section.type === 'coding';
        const questionCount = section.questions?.length || 0;
                    const totalMarks = (section.questions || []).reduce((sum, question) => sum + (Number(question.points || section.marksPerQuestion || 0) || 0), 0);
        const sectionTitle = section.sectionName || `${typeLabelMap[section.type] || 'Question'} Section`;

        return (
          <div
            key={section.__key}
            ref={(el) => {
              if (el) sectionRefs.current[section.__key] = el;
            }}
            className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_48px_-36px_rgba(15,23,42,0.32)] dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-sky-50/60 px-4 py-4 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-sky-950/20">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleSection(section.__key)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                        {typeLabelMap[section.type] || section.type}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        {questionCount} question{questionCount !== 1 ? 's' : ''}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        {totalMarks} marks
                      </span>
                    </div>
                    <div className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{sectionTitle}</div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                      {isCodingSection
                        ? truncate(section.questions?.[0]?.problemDataSnapshot?.title || section.questions?.[0]?.questionText || 'Coding section ready for curated problem selection', 120)
                        : `${typeLabelMap[section.type] || section.type} section with ${questionCount} question${questionCount !== 1 ? 's' : ''}, +${Number(section.marksPerQuestion || 1) || 1} per question, and -${Number(section.negativeMarksPerQuestion || 0) || 0} negative marking.`}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenProblemLibrary?.(section.type)}
                    className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300 dark:hover:bg-sky-900/40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add More
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSection(index)}
                    className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            </div>

            {!isCollapsed && (
              <div className="space-y-4 p-4">
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-4 dark:border-gray-700 dark:bg-gray-800/60">
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
                    <label className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">+ Marks per Question</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={section.marksPerQuestion ?? ''}
                      onChange={(e) => handleMarksChange(index, e.target.value)}
                      onBlur={() => handleMarksBlur(index)}
                      placeholder="1"
                      className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    />
                  </div>
                  <div>
                    <label className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">- Negative Marks per Question</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={section.negativeMarksPerQuestion ?? ''}
                      onChange={(e) => handleNegativeMarksChange(index, e.target.value)}
                      onBlur={() => handleNegativeMarksBlur(index)}
                      placeholder="0.25"
                      className="mt-1 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-rose-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    />
                  </div>
                </div>

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
                        <div className="font-semibold">{state.status === 'importing' ? 'Importing...' : state.message}</div>
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
                  {(section.questions || []).map((question, qIndex) => {
                    const questionKey = question.questionId || `${section.__key}-${qIndex}`;
                    const isQuestionCollapsed = collapsedQuestions[section.__key]?.[questionKey] ?? true;
                    const summaryTitle = truncate(
                      question.questionText
                      || question.problemDataSnapshot?.title
                      || question.problemData?.title
                      || question.coding?.problemData?.title
                      || `${typeLabelMap[section.type] || 'Question'} ${qIndex + 1}`,
                      110,
                    ) || `${typeLabelMap[section.type] || 'Question'} ${qIndex + 1}`;

                    return (
                      <div key={questionKey} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                        <button
                          type="button"
                          onClick={() => toggleQuestion(section.__key, questionKey)}
                          className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50/70 dark:hover:bg-gray-800/40"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                Q{qIndex + 1}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                +{Number(question.points || section.marksPerQuestion || 1) || 1}
                              </span>
                              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
                                -{Number(question.negativePoints ?? section.negativeMarksPerQuestion ?? 0) || 0}
                              </span>
                            </div>
                            <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-gray-100">{summaryTitle}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                              {getQuestionPreview(section.type, question)}
                            </div>
                          </div>
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                            {isQuestionCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                          </span>
                        </button>

                        {!isQuestionCollapsed && (
                          <div className="border-t border-slate-200 p-4 dark:border-gray-700">
                            {section.type === 'coding'
                              ? renderCodingCard(index, qIndex, question, section)
                              : (
                                <QuestionBuilder
                                  type={section.type}
                                  value={question}
                                  onChange={(updates) => updateQuestion(index, qIndex, updates)}
                                  onRemove={() => removeQuestion(index, qIndex)}
                                  groupName={`mcq-${index}-${qIndex}`}
                                  defaultPositiveMarks={section.marksPerQuestion ?? 1}
                                  defaultNegativeMarks={section.negativeMarksPerQuestion ?? 0}
                                />
                              )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => addQuestion(index)}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-sky-500 hover:shadow-md"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Question
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenProblemLibrary?.(section.type)}
                    className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 transition-all hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300 dark:hover:bg-sky-900/40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Questions from Library
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {sectionsWithIds.length > 0 && (
        <button
          type="button"
          onClick={addSection}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-sky-500 hover:shadow-md"
        >
          <Plus className="h-4 w-4" />
          Add Section
        </button>
      )}
    </div>
  );
}
