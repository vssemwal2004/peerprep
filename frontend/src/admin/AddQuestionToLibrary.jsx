import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Library, Code2, ArrowLeft, Download, Upload, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import QuestionBuilder from './assessment/components/QuestionBuilder';
import { useToast } from '../components/CustomToast';
import { api } from '../utils/api';

const QUESTION_TYPES = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'short', label: 'Short Answer / Long Answer' },
  { value: 'one_line', label: 'One Word' },
  { value: 'coding', label: 'Coding Question' },
];

const createQuestionId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const emptyQuestion = (type) => {
  if (type === 'mcq') {
    return {
      questionId: createQuestionId(),
      type: 'mcq',
      questionText: '',
      options: ['', '', '', ''],
      correctOptionIndex: 0,
      points: 1,
    };
  }
  return {
    questionId: createQuestionId(),
    type,
    questionText: '',
    expectedAnswer: '',
    keywords: [],
    points: 1,
  };
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

export default function AddQuestionToLibrary() {
  const navigate = useNavigate();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [type, setType] = useState('mcq');
  const [questions, setQuestions] = useState([emptyQuestion('mcq')]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importState, setImportState] = useState({ status: 'idle', message: '', imported: 0, errors: [] });

  const handleTypeChange = (newType) => {
    if (newType === 'coding') {
      const rolePrefix = window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
      navigate(`${rolePrefix}/compiler/create`);
      return;
    }
    setType(newType);
    setQuestions([emptyQuestion(newType)]);
    setImportState({ status: 'idle', message: '', imported: 0, errors: [] });
  };

  const addQuestion = () => setQuestions([...questions, emptyQuestion(type)]);

  const updateQuestion = (index, updates) => {
    setQuestions(questions.map((q, idx) => (idx === index ? { ...q, ...updates } : q)));
  };

  const removeQuestion = (index) => {
    const next = questions.filter((_, idx) => idx !== index);
    setQuestions(next.length ? next : [emptyQuestion(type)]);
  };

  const downloadTemplate = async () => {
    const isMcq = type === 'mcq';
    const filename = isMcq ? 'mcq-import-template.xlsx' : 'short-answer-import-template.xlsx';
    const rows = isMcq
      ? [
        ['Question', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Correct Answer'],
        ['What is 2 + 2?', '3', '4', '5', '6', 'B'],
      ]
      : [
        ['Heading (optional)', 'Question', 'Answer'],
        ['Arrays', 'Explain what an array is.', 'An array is a collection of elements stored contiguously.'],
      ];

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Questions');
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error(err);
    }
  };

  const parseImportFile = async (file) => {
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

    if (type === 'mcq') {
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
        const questionText = String(row[questionIdx] || '').trim();
        const optA = String(row[aIdx] || '').trim();
        const optB = String(row[bIdx] || '').trim();
        const optC = String(row[cIdx] || '').trim();
        const optD = String(row[dIdx] || '').trim();
        const correctRaw = String(row[correctIdx] || '').trim();

        if (!questionText && !optA && !optB && !optC && !optD && !correctRaw) continue;

        if (!questionText || ![optA, optB, optC, optD].every(Boolean)) {
          errors.push(`Row ${r + 1}: Question and all 4 options are required.`);
          continue;
        }

        const correct = correctRaw.toUpperCase().replace(/^OPTION\s*/i, '').trim();
        const map = { A: 0, B: 1, C: 2, D: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
        const correctOptionIndex = map[correct];
        if (typeof correctOptionIndex !== 'number') {
          errors.push(`Row ${r + 1}: Correct Answer must be A/B/C/D or 1/2/3/4.`);
          continue;
        }

        results.push({ questionText, options: [optA, optB, optC, optD], correctOptionIndex });
      }
      return { rows: results, errors };
    }

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
      const questionText = String(row[questionIdx] || '').trim();
      const answer = String(row[answerIdx] || '').trim();

      if (!heading && !questionText && !answer) continue;

      if (!questionText || !answer) {
        errors.push(`Row ${r + 1}: Question and Answer are required.`);
        continue;
      }

      results.push({ heading, questionText, expectedAnswer: answer });
    }

    return { rows: results, errors };
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportState({ status: 'importing', message: 'Uploading…', imported: 0, errors: [] });

    try {
      const { rows, errors } = await parseImportFile(file);
      if (errors.length) {
        setImportState({ status: 'error', message: 'Some rows could not be imported.', imported: rows.length, errors: errors.slice(0, 8) });
      }

      if (!rows.length) {
        throw new Error('No valid questions found in the uploaded file.');
      }

      const importedQuestions = rows.map((row) => {
        const prefixedQuestion = (type !== 'mcq' && row.heading)
          ? `${row.heading}\n${row.questionText}`
          : row.questionText;

        if (type === 'mcq') {
          return {
            questionId: createQuestionId(),
            type,
            questionText: prefixedQuestion,
            options: row.options,
            correctOptionIndex: row.correctOptionIndex,
            points: 1,
          };
        }
        return {
          questionId: createQuestionId(),
          type,
          questionText: prefixedQuestion,
          expectedAnswer: row.expectedAnswer,
          keywords: [],
          points: 1,
        };
      });

      // Filter out empty initial question if it wasn't touched
      const currentValid = questions.filter(q => q.questionText.trim());
      setQuestions([...currentValid, ...importedQuestions]);

      setImportState({
        status: errors.length ? 'warning' : 'success',
        message: `Imported ${importedQuestions.length} questions.`,
        imported: importedQuestions.length,
        errors: errors.slice(0, 8),
      });

      if (errors.length) {
        toast.error(`Imported ${importedQuestions.length} questions with some errors.`);
      } else {
        toast.success(`Imported ${importedQuestions.length} questions successfully!`);
      }
    } catch (err) {
      setImportState({ status: 'error', message: err?.message || 'Import failed.', imported: 0, errors: [] });
      toast.error(err?.message || 'Import failed.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveAll = async () => {
    const validQuestions = questions.filter(q => q.questionText?.trim());
    if (!validQuestions.length) {
      toast.error('Please enter at least one valid question.');
      return;
    }

    // Validate
    for (const q of validQuestions) {
      if (q.type === 'mcq' && !q.options.every(opt => opt.trim())) {
        toast.error('All options are required for MCQs.');
        return;
      }
      if ((q.type === 'short' || q.type === 'one_line') && !q.expectedAnswer?.trim()) {
        toast.error('Expected answer is required for all questions.');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      await api.createLibraryQuestionsBulk(validQuestions);
      toast.success(`Successfully saved ${validQuestions.length} questions to the library.`);
      const rolePrefix = window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
      navigate(`${rolePrefix}/library`);
    } catch (err) {
      toast.error(err.message || 'Failed to add questions to library.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 pt-20">
      <div className="mx-auto max-w-5xl px-4 py-8">
        
        {/* Header Section */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const rolePrefix = window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
                navigate(`${rolePrefix}/library`);
              }}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Add Questions to Library</h1>
              <p className="text-sm text-slate-500 dark:text-gray-400">
                Create or bulk import questions directly to your library.
              </p>
            </div>
          </div>
          
          <button
            onClick={handleSaveAll}
            disabled={isSubmitting || !questions.length}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSubmitting ? 'Saving All...' : `Save ${questions.length} Question${questions.length > 1 ? 's' : ''}`}
          </button>
        </div>

        {/* Content Area */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-6">
          
          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-gray-200 block mb-2">Question Type</label>
            <div className="flex flex-wrap items-center gap-2">
              {QUESTION_TYPES.map((qt) => {
                const isActive = type === qt.value;
                return (
                  <button
                    key={qt.value}
                    onClick={() => handleTypeChange(qt.value)}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                      isActive
                        ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    {qt.value === 'coding' ? (
                      <span className="flex items-center gap-2"><Code2 className="h-3.5 w-3.5" /> {qt.label}</span>
                    ) : (
                      qt.label
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-gray-200">
              <FileSpreadsheet className="h-4 w-4 text-slate-500" />
              Bulk Import
              <span className="text-[11px] font-normal text-slate-500 dark:text-gray-400">(Excel)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Download className="h-3.5 w-3.5" />
                Download Template
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
              >
                <Upload className="h-3.5 w-3.5" />
                Import via Excel
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
          </div>

          {importState.status !== 'idle' && (
            <div className={`rounded-2xl border px-4 py-3 text-xs ${
              importState.status === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200'
                : importState.status === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200'
                  : importState.status === 'importing'
                    ? 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-200'
                    : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{importState.status === 'importing' ? 'Importing…' : importState.message}</div>
                {importState.status === 'importing' && <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />}
              </div>
              {!!importState.errors?.length && (
                <div className="mt-2 space-y-1">
                  {importState.errors.map((msg) => <div key={msg} className="text-[11px] opacity-90">{msg}</div>)}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            {questions.map((question, index) => (
              <QuestionBuilder
                key={question.questionId || index}
                type={type}
                value={question}
                onChange={(updates) => updateQuestion(index, updates)}
                onRemove={() => removeQuestion(index)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addQuestion}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300 dark:hover:bg-gray-800 w-full justify-center"
          >
            <Plus className="h-4 w-4" />
            Add Another Question
          </button>
        </div>
      </div>
    </div>
  );
}
