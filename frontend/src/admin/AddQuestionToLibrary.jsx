import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Save, Code2, ArrowLeft, ArrowDown, ArrowUp, Copy, Download, Upload, FileSpreadsheet, MoreVertical, Pencil, Plus, BookOpenText, ListChecks, AlignLeft, CircleDot, Eye, Search, Trash2, CheckCircle2, ChevronLeft, ChevronRight, FileText, SlidersHorizontal, X } from 'lucide-react';
import QuestionBuilder, { QuestionImageUploader, RequiredLabel } from './assessment/components/QuestionBuilder';
import { useToast } from '../components/CustomToast';
import { api } from '../utils/api';
import AuthoringStepper from './library/AuthoringStepper';

const QUESTION_TYPES = [
  { value: 'mcq', label: 'MCQ', description: 'Single, multiple or passage based', Icon: ListChecks },
  { value: 'short', label: 'Written Answer', description: 'Short or descriptive response', Icon: AlignLeft },
  { value: 'one_line', label: 'One Word', description: 'Exact single-token response', Icon: CircleDot },
  { value: 'coding', label: 'Coding', description: 'Judge-ready programming problem', Icon: Code2 },
];

const AUTHORING_STEPS = [
  { key: 'content', label: 'Question content', shortLabel: 'Content', Icon: FileText },
  { key: 'answer', label: 'Answer setup', shortLabel: 'Answer', Icon: ListChecks },
  { key: 'settings', label: 'Scoring & settings', shortLabel: 'Settings', Icon: SlidersHorizontal },
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
      correctOptionIndex: null,
      correctOptionIndexes: [],
      allowMultipleAnswers: false,
      partialScoring: false,
      shuffleOptions: false,
      optionImages: [null, null, null, null],
      questionImage: null,
      answerExplanation: '',
      difficulty: 'Easy',
      timeLimitSeconds: '',
      points: 1,
      negativePoints: 0,
      tags: [],
      passage: null,
    };
  }
  return {
    questionId: createQuestionId(),
    type,
    questionText: '',
    expectedAnswer: '',
    keywords: [],
    points: 1,
    negativePoints: 0,
    difficulty: 'Easy',
    timeLimitSeconds: '',
    questionImage: null,
    tags: [],
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

const parseYesNo = (value) => ['yes', 'true', '1', 'y'].includes(String(value || '').trim().toLowerCase());
const parseOptionalNumber = (value, fallback = '') => {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const assetFromUrl = (value) => {
  const url = String(value || '').trim();
  return /^https:\/\//i.test(url) ? { url, alt: '' } : null;
};

const createPassage = () => ({
  passageId: createQuestionId(),
  title: '',
  text: '',
  image: null,
});

const getQuestionPassageId = (question) => question?.passage?.passageId || '';

const buildLibraryItems = (questions = []) => {
  const items = [];
  const passageItems = new Map();

  questions.forEach((question) => {
    const passageId = getQuestionPassageId(question);
    if (!passageId) {
      items.push({ ...question, passage: null });
      return;
    }

    let passageItem = passageItems.get(passageId);
    if (!passageItem) {
      passageItem = {
        type: 'mcq',
        libraryItemKind: 'passage_set',
        passage: { ...question.passage },
        questions: [],
      };
      passageItems.set(passageId, passageItem);
      items.push(passageItem);
    }
    passageItem.questions.push({ ...question, passage: { ...question.passage } });
  });

  return items.map((item) => {
    if (item.libraryItemKind !== 'passage_set') return item;
    const childQuestions = item.questions.map((question, index) => ({
      ...question,
      passageQuestionIndex: index,
      passageQuestionCount: item.questions.length,
    }));
    const tags = Array.from(new Set(childQuestions.flatMap((question) => question.tags || [])));
    const keywords = Array.from(new Set(childQuestions.flatMap((question) => question.keywords || [])));
    const difficulties = Array.from(new Set(childQuestions.map((question) => question.difficulty).filter(Boolean)));
    const title = item.passage.title?.trim() || 'Passage MCQ set';
    return {
      ...item,
      questionText: title,
      questionCount: childQuestions.length,
      questions: childQuestions,
      tags,
      keywords,
      difficulty: difficulties.length === 1 ? difficulties[0] : 'Mixed',
      points: childQuestions.reduce((total, question) => total + (Number(question.points) || 0), 0),
    };
  });
};

function AuthoringPreview({ type, questions, activeQuestionIndex, onQuestionChange }) {
  const units = [];
  const passageUnits = new Map();
  (questions || []).forEach((question, questionIndex) => {
    const passageId = type === 'mcq' ? getQuestionPassageId(question) : '';
    if (!passageId) {
      units.push({ key: question.questionId || `question-${questionIndex}`, entries: [{ question, questionIndex }], passage: null });
      return;
    }
    let unit = passageUnits.get(passageId);
    if (!unit) {
      unit = { key: passageId, entries: [], passage: question.passage };
      passageUnits.set(passageId, unit);
      units.push(unit);
    }
    unit.entries.push({ question, questionIndex });
  });
  const activeUnitIndex = Math.max(0, units.findIndex((unit) => unit.entries.some((entry) => entry.questionIndex === activeQuestionIndex)));
  const activeUnit = units[activeUnitIndex] || { entries: [], passage: null };
  const isPassageSet = Boolean(activeUnit.passage);

  const renderResponse = (question, questionIndex) => {
    const options = question?.options || [];
    const isMultiple = Boolean(question?.allowMultipleAnswers);
    if (type === 'mcq') {
      return <div className="mt-5"><p className="mb-3 text-xs font-medium text-slate-500 dark:text-gray-400">{isMultiple ? 'Select all answers that apply.' : 'Select one answer.'}</p><div className="space-y-2.5">{options.map((option, optionIndex) => <label key={`${question.questionId || questionIndex}-${optionIndex}`} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-sky-300 hover:bg-sky-50/40 dark:border-gray-700 dark:hover:border-sky-700 dark:hover:bg-sky-950/20"><input type={isMultiple ? 'checkbox' : 'radio'} name={`authoring-preview-${question.questionId || questionIndex}`} className="mt-0.5 h-4 w-4 shrink-0 border-slate-300 text-sky-600 focus:ring-sky-500" /><div className="min-w-0 flex-1">{question.optionImages?.[optionIndex]?.url && <img src={question.optionImages[optionIndex].url} alt={question.optionImages[optionIndex].alt || ''} className="mb-2 max-h-32 rounded-lg object-contain" />}<p className="text-xs leading-5 text-slate-700 dark:text-gray-200"><span className="mr-2 font-bold text-slate-400">{String.fromCharCode(65 + optionIndex)}.</span>{option || (question.optionImages?.[optionIndex]?.url ? 'Image option' : 'Empty option')}</p></div></label>)}</div></div>;
    }
    return type === 'one_line'
      ? <input type="text" placeholder="Type your answer" className="mt-5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
      : <textarea rows={6} placeholder="Write your answer" className="mt-5 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />;
  };

  return (
    <aside className="flex h-[min(88vh,780px)] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-gray-700 dark:bg-gray-950">
      <div className="hidden w-52 shrink-0 border-r border-slate-200 bg-white p-4 sm:block dark:border-gray-800 dark:bg-gray-900">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Assessment navigator</p>
        <div className="mt-4 max-h-[650px] space-y-2 overflow-y-auto pr-1">
          {units.map((unit, index) => {
            const isCurrent = index === activeUnitIndex;
            const first = unit.entries[0];
            return <button key={unit.key} type="button" onClick={() => onQuestionChange(first.questionIndex)} className={`w-full rounded-xl border p-3 text-left transition ${isCurrent ? 'border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30' : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-gray-700 dark:hover:bg-gray-800'}`}><div className="flex items-center justify-between"><span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${isCurrent ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300'}`}>{index + 1}</span>{unit.passage && <BookOpenText className="h-3.5 w-3.5 text-sky-600" />}</div><p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-700 dark:text-gray-200">{unit.passage?.title || first.question.questionText || 'Untitled question'}</p><p className="mt-1 text-[10px] text-slate-500">{unit.passage ? `${unit.entries.length} questions` : 'Independent MCQ'}</p></button>;
          })}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-5 dark:border-gray-800 dark:bg-gray-900"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white"><Eye className="h-4 w-4" /></span><div><p className="text-sm font-bold text-slate-950 dark:text-white">Candidate preview</p><p className="text-[11px] text-slate-500 dark:text-gray-400">Responses are not saved</p></div></div><span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">Preview mode</span></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="flex items-center justify-between gap-3"><span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">{isPassageSet ? `Passage MCQ · ${activeUnit.entries.length} questions` : type === 'mcq' ? 'Independent MCQ' : type === 'one_line' ? 'One word' : 'Written answer'}</span><span className="text-xs font-semibold text-slate-500 dark:text-gray-400">Item {activeUnitIndex + 1} of {units.length || 1}</span></div>
            {activeUnit.passage?.text && <section className="rounded-xl border border-sky-100 bg-sky-50/60 p-4 dark:border-sky-900/40 dark:bg-sky-950/20"><p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">{activeUnit.passage.title || 'Read the passage'}</p>{activeUnit.passage.image?.url && <img src={activeUnit.passage.image.url} alt={activeUnit.passage.image.alt || ''} className="mt-3 max-h-48 w-full rounded-lg object-contain" />}<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-200">{activeUnit.passage.text}</p></section>}
            {activeUnit.entries.map(({ question, questionIndex }, index) => {
              const points = Number(question?.points) || 0;
              return <section key={question.questionId || questionIndex} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-600">Question {isPassageSet ? index + 1 : questionIndex + 1}</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-900 dark:text-white">{question?.questionText || 'Your question will appear here.'}</p></div><span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">{points} mark{points === 1 ? '' : 's'}</span></div>{question?.questionImage?.url && <img src={question.questionImage.url} alt={question.questionImage.alt || ''} className="mt-4 max-h-56 w-full rounded-xl border border-slate-100 object-contain p-2 dark:border-gray-800" />}{renderResponse(question, questionIndex)}</section>;
            })}
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-5 dark:border-gray-800 dark:bg-gray-900"><button type="button" disabled={activeUnitIndex === 0} onClick={() => onQuestionChange(units[activeUnitIndex - 1]?.entries[0]?.questionIndex || 0)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"><ChevronLeft className="h-4 w-4" />Previous</button><span className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">Candidate assessment view</span><button type="button" disabled={activeUnitIndex >= units.length - 1} onClick={() => onQuestionChange(units[activeUnitIndex + 1]?.entries[0]?.questionIndex || activeQuestionIndex)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button></footer>
      </div>
    </aside>
  );
}

export default function AddQuestionToLibrary({ embedded = false, editQuestionId = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const fileInputRef = useRef(null);
  const activeQuestionItemRef = useRef(null);

  const initialType = ['mcq', 'short', 'one_line'].includes(searchParams.get('type')) ? searchParams.get('type') : 'mcq';
  const type = initialType;
  const [questions, setQuestions] = useState([emptyQuestion(initialType)]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [activeStage, setActiveStage] = useState('content');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [navigatorSearch, setNavigatorSearch] = useState('');
  const [questionMenuId, setQuestionMenuId] = useState('');
  const [deleteQuestionIndex, setDeleteQuestionIndex] = useState(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(Boolean(editQuestionId));
  const [libraryMeta, setLibraryMeta] = useState({ visibility: 'public', status: 'published' });
  const [importState, setImportState] = useState({ status: 'idle', message: '', imported: 0, errors: [] });

  useEffect(() => {
    activeQuestionItemRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeQuestionIndex, questions.length]);

  useEffect(() => {
    if (!editQuestionId) return undefined;
    let active = true;
    setIsLoadingQuestion(true);
    api.getLibraryQuestion(editQuestionId)
      .then((response) => {
        if (!active) return;
        const storedQuestion = response.question;
        const questionData = storedQuestion?.questionData || {};
        const normalizeDifficulty = (value) => {
          const normalized = String(value || '').trim().toLowerCase();
          return normalized === 'medium' ? 'Medium' : normalized === 'hard' ? 'Hard' : 'Easy';
        };
        const sharedPassage = questionData.passage?.text
          ? { ...questionData.passage, passageId: questionData.passage.passageId || createQuestionId() }
          : null;
        const storedChildren = questionData.libraryItemKind === 'passage_set' && Array.isArray(questionData.questions)
          ? questionData.questions
          : [questionData];
        const hydratedQuestions = storedChildren.map((child, index) => ({
          ...emptyQuestion(type),
          ...child,
          type,
          questionId: child.questionId || (index === 0 ? storedQuestion?.sourceQuestionId : '') || createQuestionId(),
          questionText: child.questionText || (index === 0 ? storedQuestion?.questionText : '') || '',
          tags: child.tags || storedQuestion?.tags || [],
          keywords: child.keywords || storedQuestion?.keywords || [],
          difficulty: normalizeDifficulty(child.difficulty || storedQuestion?.difficulty),
          passage: sharedPassage || (child.passage?.text ? { ...child.passage, passageId: child.passage.passageId || createQuestionId() } : null),
        }));
        setQuestions(hydratedQuestions);
        setActiveQuestionIndex(0);
        setLibraryMeta({
          visibility: storedQuestion?.visibility || 'public',
          status: storedQuestion?.status || 'published',
        });
      })
      .catch((error) => toast.error(error.message || 'Failed to load question.'))
      .finally(() => { if (active) setIsLoadingQuestion(false); });
    return () => { active = false; };
  }, [editQuestionId, toast, type]);

  const isUntouchedQuestion = (question) => !question?.questionText?.trim()
    && !(question?.options || []).some((option) => option?.trim())
    && !question?.expectedAnswer?.trim();

  const appendQuestion = (question, insertAfterIndex = questions.length - 1) => {
    const replaceEmptyInitial = questions.length === 1 && isUntouchedQuestion(questions[0]);
    const next = replaceEmptyInitial ? [question] : [...questions];
    const targetIndex = replaceEmptyInitial ? 0 : Math.min(insertAfterIndex + 1, next.length);
    if (!replaceEmptyInitial) next.splice(targetIndex, 0, question);
    setQuestions(next);
    setActiveQuestionIndex(targetIndex);
    setNavigatorSearch('');
    setQuestionMenuId('');
    setAddMenuOpen(false);
    setActiveStage('content');
  };

  const addQuestion = () => {
    appendQuestion(emptyQuestion(type));
  };

  const addPassageGroup = () => {
    const passage = createPassage();
    appendQuestion({ ...emptyQuestion('mcq'), passage });
  };

  const addQuestionToPassage = (passageId) => {
    const source = questions.find((question) => getQuestionPassageId(question) === passageId);
    if (!source?.passage) return;
    const lastGroupIndex = questions.reduce((lastIndex, question, index) => (
      getQuestionPassageId(question) === passageId ? index : lastIndex
    ), activeQuestionIndex);
    appendQuestion({ ...emptyQuestion('mcq'), passage: { ...source.passage } }, lastGroupIndex);
  };

  const updateActivePassage = (updates) => {
    const passageId = getQuestionPassageId(questions[activeQuestionIndex]);
    if (!passageId) return;
    setQuestions((current) => current.map((question) => (
      getQuestionPassageId(question) === passageId
        ? { ...question, passage: { ...question.passage, ...updates, passageId } }
        : question
    )));
  };

  const updateQuestion = (index, updates) => {
    setQuestions(questions.map((q, idx) => (idx === index ? { ...q, ...updates } : q)));
  };

  const removeQuestion = (index) => {
    const next = questions.filter((_, idx) => idx !== index);
    setQuestions(next.length ? next : [emptyQuestion(type)]);
    setActiveQuestionIndex((current) => Math.max(0, Math.min(current, Math.max(next.length - 1, 0))));
    setQuestionMenuId('');
  };

  const duplicateQuestion = (index) => {
    const source = questions[index];
    if (!source) return;
    const duplicate = {
      ...source,
      questionId: createQuestionId(),
      questionText: source.questionText?.trim() ? `${source.questionText} (copy)` : '',
      options: [...(source.options || [])],
      optionImages: (source.optionImages || []).map((image) => (image ? { ...image } : null)),
      correctOptionIndexes: [...(source.correctOptionIndexes || [])],
      tags: [...(source.tags || [])],
      keywords: [...(source.keywords || [])],
      questionImage: source.questionImage ? { ...source.questionImage } : null,
    };
    const next = [...questions];
    next.splice(index + 1, 0, duplicate);
    setQuestions(next);
    setActiveQuestionIndex(index + 1);
    setNavigatorSearch('');
    setQuestionMenuId('');
    toast.success('Question duplicated.');
  };

  const moveQuestion = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    const next = [...questions];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setQuestions(next);
    setActiveQuestionIndex(targetIndex);
    setQuestionMenuId('');
  };

  const downloadTemplate = async () => {
    const isMcq = type === 'mcq';
    const filename = isMcq ? 'mcq-import-template.xlsx' : 'short-answer-import-template.xlsx';
    const rows = isMcq
      ? [
        ['Passage Title (optional)', 'Passage (optional)', 'Question', 'Question Image URL (optional)', 'Option 1', 'Option 1 Image URL', 'Option 2', 'Option 2 Image URL', 'Option 3', 'Option 3 Image URL', 'Option 4', 'Option 4 Image URL', 'Correct Answers', 'Multiple Answers', 'Partial Scoring', 'Shuffle Options', 'Positive Score', 'Negative Score', 'Difficulty', 'Time in Seconds', 'Tags', 'Answer Explanation'],
        ['', '', 'What is 2 + 2?', '', '3', '', '4', '', '5', '', '6', '', '2', 'NO', 'NO', 'YES', '1', '0', 'Easy', '30', 'Arithmetic, Basics', '2 + 2 equals 4.'],
        ['Read the passage', 'Peer review improves software quality by detecting defects early.', 'What does peer review improve?', '', 'Software quality', '', 'Network speed', '', 'Battery life', '', 'Screen size', '', '1', 'NO', 'NO', 'NO', '2', '0.5', 'Medium', '45', 'Comprehension', 'The passage directly states software quality.'],
      ]
      : [
        ['Heading (optional)', 'Question', 'Question Image URL (optional)', 'Answer', 'Keywords (optional)', 'Positive Score', 'Negative Score', 'Difficulty', 'Time in Seconds', 'Tags'],
        ['Arrays', 'Explain what an array is.', '', 'An array is a collection of elements stored contiguously.', 'contiguous, elements', '2', '0', 'Easy', '120', 'Arrays, DSA'],
      ];

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = rows[0].map((header) => ({ wch: Math.min(Math.max(String(header).length + 3, 14), 42) }));
      XLSX.utils.book_append_sheet(wb, ws, 'Questions');
      const instructions = XLSX.utils.aoa_to_sheet([
        ['PeerPrep question import guide'],
        ['Required columns are Question, at least two options, and Correct Answers for MCQ; Question and Answer for written questions.'],
        ['Correct Answers accepts option numbers separated by commas, for example 1 or 1,3.'],
        ['Option 5 to Option 8 columns may be added using the same naming pattern.'],
        ['Image URLs must be HTTPS URLs. Images uploaded in the authoring UI are stored in Supabase automatically.'],
      ]);
      XLSX.utils.book_append_sheet(wb, instructions, 'Instructions');
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
      const optionColumns = normalizedHeaders.map((header, index) => {
        const match = header.match(/^option([1-8])$/);
        return match ? { optionNumber: Number(match[1]), index } : null;
      }).filter(Boolean).sort((a, b) => a.optionNumber - b.optionNumber);
      const optionImageColumns = normalizedHeaders.map((header, index) => {
        const match = header.match(/^option([1-8])image(?:url)?$/);
        return match ? { optionNumber: Number(match[1]), index } : null;
      }).filter(Boolean);
      const correctIdx = getHeaderIndex(normalizedHeaders, ['correctanswers', 'correctanswer', 'correctoption', 'correctoptionindex', 'correct']);
      const passageTitleIdx = getHeaderIndex(normalizedHeaders, ['passagetitle', 'paragraphheading']);
      const passageIdx = getHeaderIndex(normalizedHeaders, ['passage', 'paragraph', 'comprehension']);
      const questionImageIdx = getHeaderIndex(normalizedHeaders, ['questionimageurl', 'questionimage']);
      const multipleIdx = getHeaderIndex(normalizedHeaders, ['multipleanswers', 'allowmultipleanswers']);
      const partialIdx = getHeaderIndex(normalizedHeaders, ['partialscoring']);
      const shuffleIdx = getHeaderIndex(normalizedHeaders, ['shuffleoptions']);
      const pointsIdx = getHeaderIndex(normalizedHeaders, ['positivescore', 'correctscore', 'points', 'marks']);
      const negativeIdx = getHeaderIndex(normalizedHeaders, ['negativescore', 'negativemarking', 'negativepoints']);
      const difficultyIdx = getHeaderIndex(normalizedHeaders, ['difficulty', 'difficultylevel']);
      const timeIdx = getHeaderIndex(normalizedHeaders, ['timeinseconds', 'timelimit', 'time']);
      const tagsIdx = getHeaderIndex(normalizedHeaders, ['tags', 'skills', 'topics']);
      const explanationIdx = getHeaderIndex(normalizedHeaders, ['answerexplanation', 'explanation']);

      if (optionColumns.length < 2 || correctIdx === -1) {
        throw new Error('Invalid format: at least Option 1, Option 2, and Correct Answers are required. Download the template for the exact format.');
      }

      const results = [];
      const errors = [];
      for (let r = 1; r < aoa.length; r += 1) {
        const row = aoa[r] || [];
        const questionText = String(row[questionIdx] || '').trim();
        const options = optionColumns.map((column) => String(row[column.index] || '').trim());
        const optionImages = optionColumns.map((column) => {
          const imageColumn = optionImageColumns.find((entry) => entry.optionNumber === column.optionNumber);
          return imageColumn ? assetFromUrl(row[imageColumn.index]) : null;
        });
        const correctRaw = String(row[correctIdx] || '').trim();

        if (!questionText && !options.some(Boolean) && !correctRaw) continue;

        if (!questionText || options.filter(Boolean).length < 2) {
          errors.push(`Row ${r + 1}: Question and at least two options are required.`);
          continue;
        }

        const correctTokens = correctRaw.split(/[,;|]/).map((token) => token.trim()).filter(Boolean);
        const correctOptionIndexes = [...new Set(correctTokens.map((token) => {
          const normalized = token.toUpperCase().replace(/^OPTION\s*/i, '').trim();
          if (/^[A-H]$/.test(normalized)) return normalized.charCodeAt(0) - 65;
          if (/^[1-8]$/.test(normalized)) return Number(normalized) - 1;
          return options.findIndex((option) => option.toLowerCase() === token.toLowerCase());
        }).filter((index) => index >= 0 && index < options.length))];
        if (!correctOptionIndexes.length) {
          errors.push(`Row ${r + 1}: Correct Answers must reference valid option numbers, letters, or exact option text.`);
          continue;
        }

        const passageText = passageIdx >= 0 ? String(row[passageIdx] || '').trim() : '';
        results.push({
          questionText,
          questionImage: questionImageIdx >= 0 ? assetFromUrl(row[questionImageIdx]) : null,
          options,
          optionImages,
          correctOptionIndex: correctOptionIndexes[0],
          correctOptionIndexes,
          allowMultipleAnswers: correctOptionIndexes.length > 1 || (multipleIdx >= 0 && parseYesNo(row[multipleIdx])),
          partialScoring: partialIdx >= 0 && parseYesNo(row[partialIdx]),
          shuffleOptions: shuffleIdx >= 0 && parseYesNo(row[shuffleIdx]),
          points: pointsIdx >= 0 ? parseOptionalNumber(row[pointsIdx], 1) : 1,
          negativePoints: negativeIdx >= 0 ? parseOptionalNumber(row[negativeIdx], 0) : 0,
          difficulty: difficultyIdx >= 0 && ['Easy', 'Medium', 'Hard'].includes(String(row[difficultyIdx])) ? String(row[difficultyIdx]) : 'Easy',
          timeLimitSeconds: timeIdx >= 0 ? parseOptionalNumber(row[timeIdx], '') : '',
          tags: tagsIdx >= 0 ? String(row[tagsIdx] || '').split(',').map((tag) => tag.trim()).filter(Boolean) : [],
          answerExplanation: explanationIdx >= 0 ? String(row[explanationIdx] || '').trim() : '',
          passage: passageText ? { passageId: createQuestionId(), title: passageTitleIdx >= 0 ? String(row[passageTitleIdx] || '').trim() : '', text: passageText, image: null } : null,
        });
      }
      return { rows: results, errors };
    }

    const headingIdx = getHeaderIndex(normalizedHeaders, ['heading', 'category', 'title']);
    const answerIdx = getHeaderIndex(normalizedHeaders, ['answer', 'expectedanswer']);
    const questionImageIdx = getHeaderIndex(normalizedHeaders, ['questionimageurl', 'questionimage']);
    const keywordsIdx = getHeaderIndex(normalizedHeaders, ['keywords', 'acceptedkeywords']);
    const pointsIdx = getHeaderIndex(normalizedHeaders, ['positivescore', 'correctscore', 'points', 'marks']);
    const negativeIdx = getHeaderIndex(normalizedHeaders, ['negativescore', 'negativemarking', 'negativepoints']);
    const difficultyIdx = getHeaderIndex(normalizedHeaders, ['difficulty', 'difficultylevel']);
    const timeIdx = getHeaderIndex(normalizedHeaders, ['timeinseconds', 'timelimit', 'time']);
    const tagsIdx = getHeaderIndex(normalizedHeaders, ['tags', 'skills', 'topics']);
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

      results.push({
        heading,
        questionText,
        expectedAnswer: answer,
        questionImage: questionImageIdx >= 0 ? assetFromUrl(row[questionImageIdx]) : null,
        keywords: keywordsIdx >= 0 ? String(row[keywordsIdx] || '').split(',').map((keyword) => keyword.trim()).filter(Boolean) : [],
        points: pointsIdx >= 0 ? parseOptionalNumber(row[pointsIdx], 1) : 1,
        negativePoints: negativeIdx >= 0 ? parseOptionalNumber(row[negativeIdx], 0) : 0,
        difficulty: difficultyIdx >= 0 && ['Easy', 'Medium', 'Hard'].includes(String(row[difficultyIdx])) ? String(row[difficultyIdx]) : 'Easy',
        timeLimitSeconds: timeIdx >= 0 ? parseOptionalNumber(row[timeIdx], '') : '',
        tags: tagsIdx >= 0 ? String(row[tagsIdx] || '').split(',').map((tag) => tag.trim()).filter(Boolean) : [],
      });
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

      let importedQuestions = rows.map((row) => {
        const prefixedQuestion = (type !== 'mcq' && row.heading)
          ? `${row.heading}\n${row.questionText}`
          : row.questionText;

        if (type === 'mcq') {
          return {
            questionId: createQuestionId(),
            type,
            ...row,
            questionText: prefixedQuestion,
          };
        }
        return {
          questionId: createQuestionId(),
          type,
          ...row,
          questionText: prefixedQuestion,
        };
      });

      if (type === 'mcq') {
        const passageIds = new Map();
        importedQuestions = importedQuestions.map((question) => {
          if (!question.passage?.text) return { ...question, passage: null };
          const passageKey = `${question.passage.title || ''}::${question.passage.text}`;
          if (!passageIds.has(passageKey)) passageIds.set(passageKey, createQuestionId());
          return {
            ...question,
            passage: { ...question.passage, passageId: passageIds.get(passageKey) },
          };
        });
      }

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
      if (q.type === 'mcq' && (q.options || []).filter((option, index) => option?.trim() || q.optionImages?.[index]?.url).length < 2) {
        toast.error('Every MCQ needs at least two text or image options.');
        return;
      }
      if (q.type === 'mcq' && q.allowMultipleAnswers && !(q.correctOptionIndexes || []).length) {
        toast.error('Select at least one correct answer for every multiple-answer MCQ.');
        return;
      }
      if (q.type === 'mcq' && !q.allowMultipleAnswers && (q.correctOptionIndex === null || q.correctOptionIndex === undefined || !Number.isInteger(Number(q.correctOptionIndex)))) {
        toast.error('Select the correct answer for every MCQ.');
        return;
      }
      if ((q.type === 'short' || q.type === 'one_line') && !q.expectedAnswer?.trim()) {
        toast.error('Expected answer is required for all questions.');
        return;
      }
      if (q.type === 'one_line' && /\s/.test(q.expectedAnswer.trim())) {
        toast.error('One-word questions must contain exactly one answer token without spaces.');
        return;
      }
      if (!(Number(q.points) > 0)) {
        toast.error('Positive marks must be greater than zero for every question.');
        return;
      }
    }

    const incompletePassage = type === 'mcq' && validQuestions.find((question) => (
      getQuestionPassageId(question) && !question.passage?.text?.trim()
    ));
    if (incompletePassage) {
      toast.error('Add passage text before saving the paragraph question set.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = buildLibraryItems(validQuestions);

      const rolePrefix = window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
      if (editQuestionId) {
        const question = payload[0];
        await api.updateLibraryQuestion(editQuestionId, {
          questionData: question,
          questionText: question.questionText,
          tags: question.tags || [],
          keywords: question.keywords || [],
          difficulty: question.difficulty || '',
          visibility: libraryMeta.visibility,
          status: libraryMeta.status,
        });
        toast.success('Question updated successfully.');
        const requestedReturn = location.state?.returnTo;
        const returnTo = typeof requestedReturn === 'string' && requestedReturn.startsWith(`${rolePrefix}/library`)
          ? requestedReturn
          : `${rolePrefix}/library?type=${type}`;
        navigate(returnTo);
        return;
      }

      await api.createLibraryQuestionsBulk(payload);
      const passageSetCount = payload.filter((item) => item.libraryItemKind === 'passage_set').length;
      toast.success(`Saved ${validQuestions.length} questions as ${payload.length} library item${payload.length === 1 ? '' : 's'}${passageSetCount ? `, including ${passageSetCount} passage set${passageSetCount === 1 ? '' : 's'}` : ''}.`);
      navigate(`${rolePrefix}/library`);
    } catch (err) {
      toast.error(err.message || 'Failed to add questions to library.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeQuestion = questions[activeQuestionIndex] || questions[0];
  const activePassage = activeQuestion?.passage || null;
  const activePassageId = getQuestionPassageId(activeQuestion);
  const passageGroupIds = Array.from(new Set(questions.map(getQuestionPassageId).filter(Boolean)));
  const independentQuestionCount = questions.filter((question) => !getQuestionPassageId(question)).length;
  const activePassageQuestionCount = activePassageId
    ? questions.filter((question) => getQuestionPassageId(question) === activePassageId).length
    : 0;
  const showNavigator = !editQuestionId || Boolean(activePassageId);
  const isQuestionReady = (question) => {
    if (!question?.questionText?.trim() || !(Number(question.points) > 0) || !question.difficulty) return false;
    if (type !== 'mcq') return Boolean(question.expectedAnswer?.trim());
    const filledOptions = (question.options || []).filter((option, index) => option?.trim() || question.optionImages?.[index]?.url);
    const correctAnswers = question.correctOptionIndexes?.length
      ? question.correctOptionIndexes
      : (Number.isInteger(Number(question.correctOptionIndex)) ? [Number(question.correctOptionIndex)] : []);
    return filledOptions.length >= 2 && correctAnswers.length > 0;
  };
  const completedQuestions = questions.filter(isQuestionReady).length;
  const normalizedNavigatorSearch = navigatorSearch.trim().toLowerCase();
  const visibleQuestionEntries = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question, index }) => !normalizedNavigatorSearch
      || question.questionText?.toLowerCase().includes(normalizedNavigatorSearch)
      || question.passage?.title?.toLowerCase().includes(normalizedNavigatorSearch)
      || question.passage?.text?.toLowerCase().includes(normalizedNavigatorSearch)
      || String(index + 1) === normalizedNavigatorSearch);
  const selectedQuestionType = QUESTION_TYPES.find((questionType) => questionType.value === type) || QUESTION_TYPES[0];
  const editorTopRef = useRef(null);
  const contentComplete = questions.every((question) => question.questionText?.trim()
    && (!getQuestionPassageId(question) || question.passage?.text?.trim()));
  const answerComplete = questions.every((question) => {
    if (type !== 'mcq') return Boolean(question.expectedAnswer?.trim());
    const filledOptions = (question.options || []).filter((option, index) => option?.trim() || question.optionImages?.[index]?.url);
    const hasCorrectAnswer = question.allowMultipleAnswers
      ? (question.correctOptionIndexes || []).length > 0
      : Number.isInteger(Number(question.correctOptionIndex));
    return filledOptions.length >= 2 && hasCorrectAnswer;
  });
  const settingsComplete = questions.every((question) => Number(question.points) > 0 && Boolean(question.difficulty));
  const stageCompletion = { content: contentComplete, answer: answerComplete, settings: settingsComplete };
  const activeStageIndex = AUTHORING_STEPS.findIndex((step) => step.key === activeStage);
  const isFinalStage = activeStageIndex === AUTHORING_STEPS.length - 1;

  const changeStage = (nextStage) => {
    setActiveStage(nextStage);
    requestAnimationFrame(() => editorTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const moveStage = (direction) => {
    const next = AUTHORING_STEPS[activeStageIndex + direction];
    if (next) changeStage(next.key);
  };

  if (isLoadingQuestion) {
    return (
      <div className="flex min-h-[420px] items-center justify-center bg-slate-50 p-6 dark:bg-gray-950">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          Loading full question editor...
        </div>
      </div>
    );
  }

  return (
    <div ref={editorTopRef} className={embedded ? 'min-h-0 bg-slate-50 dark:bg-gray-950' : 'min-h-screen bg-slate-50 pt-20 dark:bg-gray-950'}>
      <div className={embedded ? 'mx-auto max-w-[1180px]' : 'mx-auto max-w-[1180px] px-4 py-8 pb-20'}>
        
        {/* Header Section */}
        <div className={embedded ? 'hidden' : 'mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'}>
          <div className="flex items-center gap-3">
            {!embedded && <button
              onClick={() => {
                const rolePrefix = window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
                navigate(`${rolePrefix}/library`);
              }}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>}
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white">
              <selectedQuestionType.Icon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-950 dark:text-white">{editQuestionId ? 'Edit' : 'Create'} {selectedQuestionType.label}</h1>
              <p className="text-sm text-slate-500 dark:text-gray-400">
                {selectedQuestionType.description}. Complete only the fields relevant to this format.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
          <span className="hidden text-xs font-semibold text-slate-500 sm:inline">{completedQuestions}/{questions.length} ready</span>
          <button
            onClick={handleSaveAll}
            disabled={isSubmitting || !questions.length}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSubmitting ? 'Saving...' : editQuestionId ? 'Save changes' : `Save ${questions.length} question${questions.length > 1 ? 's' : ''}`}
          </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5">
          
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white"><selectedQuestionType.Icon className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{editQuestionId ? `Edit ${selectedQuestionType.label}` : selectedQuestionType.label}</p>
                <p className="text-xs text-slate-500 dark:text-gray-400">{editQuestionId ? 'Update content, answers, scoring and library settings' : type === 'mcq' ? `${independentQuestionCount} independent · ${passageGroupIds.length} passage set${passageGroupIds.length === 1 ? '' : 's'} · ${completedQuestions}/${questions.length} ready` : `Question ${activeQuestionIndex + 1} of ${questions.length} · ${completedQuestions} ready`}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!editQuestionId && <button type="button" onClick={() => setImportOpen((open) => !open)} title="Bulk import questions" className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${importOpen ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                <FileSpreadsheet className="h-4 w-4" /><span className="hidden sm:inline">Import</span>
              </button>}
              <button type="button" onClick={() => setPreviewOpen(true)} title="Preview as candidate" className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                <Eye className="h-4 w-4" /><span className="hidden sm:inline">Preview</span>
              </button>
            </div>
          </div>

          <div className="mx-auto w-full max-w-3xl border-y border-slate-100 py-1 dark:border-gray-800">
            <AuthoringStepper steps={AUTHORING_STEPS} activeKey={activeStage} completed={stageCompletion} onChange={changeStage} />
          </div>

          {activeStage === 'content' && type === 'mcq' && activePassage && (
            <section className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white"><BookOpenText className="h-4 w-4" /></span><div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Shared passage</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">Shown once to candidates with all {activePassageQuestionCount} questions below it.</p></div></div>
                <button type="button" onClick={() => addQuestionToPassage(activePassageId)} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300"><Plus className="h-3.5 w-3.5" />Add question to this passage</button>
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                <div><RequiredLabel optional>Passage title</RequiredLabel><input value={activePassage.title || ''} onChange={(event) => updateActivePassage({ title: event.target.value })} placeholder="Example: Read the case study" className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" /><RequiredLabel>Passage</RequiredLabel><textarea value={activePassage.text || ''} onChange={(event) => updateActivePassage({ text: event.target.value })} rows={6} placeholder="Paste the shared paragraph, data set or case study..." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" /></div>
                <div><RequiredLabel optional>Passage image</RequiredLabel><QuestionImageUploader value={activePassage.image} onChange={(image) => updateActivePassage({ image })} label="Upload passage image" /></div>
              </div>
            </section>
          )}

          <div className={!editQuestionId && importOpen ? 'flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800' : 'hidden'}>
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

          <div className={`grid items-start gap-4 ${showNavigator ? 'lg:grid-cols-[260px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
            {showNavigator && <aside className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800/50 lg:sticky lg:top-0">
              <div className="flex items-center justify-between gap-2 px-1">
                <div><p className="text-xs font-bold text-slate-800 dark:text-gray-100">Questions</p><p className="mt-0.5 text-[10px] text-slate-500 dark:text-gray-400">{type === 'mcq' ? `${independentQuestionCount} independent · ${passageGroupIds.length} passage` : `${questions.length} in this set`}</p></div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600 shadow-sm dark:bg-gray-900 dark:text-gray-300">{completedQuestions}/{questions.length}</span>
              </div>
              <label className="mt-3 flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-slate-500 focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:focus-within:ring-sky-900/30">
                <Search className="h-3.5 w-3.5 shrink-0" />
                <input value={navigatorSearch} onChange={(event) => { setNavigatorSearch(event.target.value); setQuestionMenuId(''); }} placeholder="Search questions" className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400 dark:text-gray-200" />
                {navigatorSearch && <button type="button" onClick={() => setNavigatorSearch('')} title="Clear search" className="rounded p-0.5 hover:bg-slate-100 dark:hover:bg-gray-800"><X className="h-3 w-3" /></button>}
              </label>
              <div className="mt-3 flex gap-2 overflow-x-auto overscroll-contain lg:max-h-[min(52vh,520px)] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:pr-1">
                {visibleQuestionEntries.map(({ question, index }) => {
                  const optionCount = type === 'mcq' ? (question.options || []).filter((option, optionIndex) => option?.trim() || question.optionImages?.[optionIndex]?.url).length : 0;
                  const isActive = activeQuestionIndex === index;
                  const menuOpen = questionMenuId === question.questionId;
                  const passageId = getQuestionPassageId(question);
                  const passageQuestions = passageId ? questions.filter((item) => getQuestionPassageId(item) === passageId) : [];
                  const passageQuestionNumber = passageId ? passageQuestions.findIndex((item) => item.questionId === question.questionId) + 1 : 0;
                  return (
                    <div ref={isActive ? activeQuestionItemRef : null} key={question.questionId || index} className={`flex min-w-52 flex-wrap items-center gap-1 rounded-xl border p-1 transition lg:min-w-0 ${isActive ? 'border-sky-300 bg-white shadow-sm dark:border-sky-700 dark:bg-gray-900' : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-white dark:hover:border-gray-700 dark:hover:bg-gray-900'}`}>
                      <button type="button" onClick={() => { setActiveQuestionIndex(index); setQuestionMenuId(''); }} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left" title={`Edit question ${index + 1}`}>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${isActive ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-gray-700 dark:text-gray-300'}`}>{index + 1}</span>
                        <span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-800 dark:text-gray-100">{question.questionText?.trim() || 'Untitled question'}</span><span className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500 dark:text-gray-400">{passageId ? <><BookOpenText className="h-3 w-3 text-sky-600" />Passage {passageQuestionNumber}/{passageQuestions.length} · {optionCount} options</> : type === 'mcq' ? `Independent · ${optionCount} option${optionCount === 1 ? '' : 's'}` : (question.expectedAnswer?.trim() ? 'Answer added' : 'Answer pending')}{isQuestionReady(question) && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}</span></span>
                      </button>
                      <button type="button" onClick={() => { setActiveQuestionIndex(index); setPreviewOpen(true); }} title={`Preview question ${index + 1}`} aria-label={`Preview question ${index + 1}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-950/30 dark:hover:text-sky-300"><Eye className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => setQuestionMenuId((current) => current === question.questionId ? '' : question.questionId)} title={`Manage question ${index + 1}`} aria-label={`Manage question ${index + 1}`} aria-expanded={menuOpen} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"><MoreVertical className="h-3.5 w-3.5" /></button>
                      {menuOpen && <div className="grid w-full basis-full grid-cols-2 gap-1 border-t border-slate-100 p-1 pt-2 dark:border-gray-800">
                        <button type="button" onClick={() => { setActiveQuestionIndex(index); setQuestionMenuId(''); }} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-sky-50 hover:text-sky-700 dark:text-gray-300 dark:hover:bg-sky-950/30"><Pencil className="h-3 w-3" />Edit</button>
                        <button type="button" onClick={() => duplicateQuestion(index)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800"><Copy className="h-3 w-3" />Duplicate</button>
                        <button type="button" onClick={() => moveQuestion(index, -1)} disabled={index === 0} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-300 dark:hover:bg-gray-800"><ArrowUp className="h-3 w-3" />Move up</button>
                        <button type="button" onClick={() => moveQuestion(index, 1)} disabled={index === questions.length - 1} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-300 dark:hover:bg-gray-800"><ArrowDown className="h-3 w-3" />Move down</button>
                        <button type="button" onClick={() => { setDeleteQuestionIndex(index); setQuestionMenuId(''); }} className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/40"><Trash2 className="h-3 w-3" />Delete question</button>
                      </div>}
                    </div>
                  );
                })}
                {!visibleQuestionEntries.length && <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-[11px] text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">No questions match “{navigatorSearch}”.</div>}
              </div>
              {type === 'mcq' && editQuestionId && activePassageId ? (
                <button type="button" onClick={() => addQuestionToPassage(activePassageId)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-sky-300 bg-white px-3 py-2.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300"><Plus className="h-4 w-4" />Add to this passage</button>
              ) : type === 'mcq' ? <div className="relative mt-3">
                <button type="button" onClick={() => setAddMenuOpen((open) => !open)} aria-expanded={addMenuOpen} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-sky-300 bg-white px-3 py-2.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300"><Plus className="h-4 w-4" />Add MCQ</button>
                {addMenuOpen && <div className="absolute bottom-12 left-0 z-30 w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                  <button type="button" onClick={addQuestion} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800"><ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" /><span><span className="block text-xs font-semibold text-slate-800 dark:text-gray-100">Independent MCQ</span><span className="block text-[10px] leading-4 text-slate-500">A separate Library question</span></span></button>
                  <button type="button" onClick={addPassageGroup} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800"><BookOpenText className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" /><span><span className="block text-xs font-semibold text-slate-800 dark:text-gray-100">New passage set</span><span className="block text-[10px] leading-4 text-slate-500">One passage with multiple questions</span></span></button>
                  {activePassageId && <button type="button" onClick={() => addQuestionToPassage(activePassageId)} className="flex w-full items-start gap-2 rounded-lg bg-sky-50 px-2.5 py-2 text-left hover:bg-sky-100 dark:bg-sky-950/30 dark:hover:bg-sky-950/50"><Plus className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" /><span><span className="block text-xs font-semibold text-sky-800 dark:text-sky-200">Add to current passage</span><span className="block text-[10px] leading-4 text-sky-600 dark:text-sky-300">Keeps the same shared passage</span></span></button>}
                </div>}
              </div> : !editQuestionId ? <button type="button" onClick={addQuestion} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"><Plus className="h-4 w-4" />Add question</button> : null}
            </aside>}
            <main className="min-w-0">
              <QuestionBuilder type={type} value={activeQuestion} onChange={(updates) => updateQuestion(activeQuestionIndex, updates)} onRemove={() => removeQuestion(activeQuestionIndex)} selected onSelect={() => {}} enableMedia questionNumber={activeQuestionIndex + 1} stage={activeStage} hideRemove={Boolean(editQuestionId && (!activePassageId || activePassageQuestionCount === 1))} />
            </main>
          </div>

          {editQuestionId && (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Library settings</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">Control who can find this question and whether it is ready to use.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-200">
                  Visibility
                  <select value={libraryMeta.visibility} onChange={(event) => setLibraryMeta((current) => ({ ...current, visibility: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-sky-900/30">
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-200">
                  Status
                  <select value={libraryMeta.status} onChange={(event) => setLibraryMeta((current) => ({ ...current, status: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-sky-900/30">
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="hidden">Hidden</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>
            </section>
          )}

          <div className="sticky bottom-0 z-20 -mx-4 -mb-4 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.05)] backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:-mx-5 sm:-mb-5 sm:px-5">
            <button type="button" onClick={() => moveStage(-1)} disabled={activeStageIndex === 0} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Previous</span>
            </button>
            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400">Step {activeStageIndex + 1} of {AUTHORING_STEPS.length}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"><Eye className="h-4 w-4" /><span className="hidden sm:inline">Preview</span></button>
              {isFinalStage ? (
                <button type="button" onClick={handleSaveAll} disabled={isSubmitting || !questions.length} className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"><Save className="h-4 w-4" />{isSubmitting ? 'Saving...' : editQuestionId ? 'Save changes' : 'Save'}</button>
              ) : (
                <button type="button" onClick={() => moveStage(1)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500">Next<ChevronRight className="h-4 w-4" /></button>
              )}
            </div>
          </div>
        </div>
      </div>

      {deleteQuestionIndex !== null && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Delete question confirmation">
          <button type="button" aria-label="Cancel delete" className="absolute inset-0" onClick={() => setDeleteQuestionIndex(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300"><Trash2 className="h-4 w-4" /></span>
            <h3 className="mt-4 text-base font-bold text-slate-950 dark:text-white">Delete question {deleteQuestionIndex + 1}?</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-gray-400">This removes the question and its answer options from the current set. Other questions will be renumbered automatically.</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteQuestionIndex(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button><button type="button" onClick={() => { removeQuestion(deleteQuestionIndex); setDeleteQuestionIndex(null); toast.success('Question deleted.'); }} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500"><Trash2 className="h-3.5 w-3.5" />Delete</button></div>
          </div>
        </div>
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Candidate preview">
          <button type="button" aria-label="Close preview" className="absolute inset-0" onClick={() => setPreviewOpen(false)} />
          <div className="relative z-10 w-full max-w-3xl">
            <button type="button" onClick={() => setPreviewOpen(false)} title="Close preview" className="absolute -right-2 -top-12 flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white text-slate-600 shadow-lg hover:bg-slate-50"><X className="h-4 w-4" /></button>
            <AuthoringPreview type={type} questions={questions} activeQuestionIndex={activeQuestionIndex} onQuestionChange={setActiveQuestionIndex} />
          </div>
        </div>
      )}
    </div>
  );
}
