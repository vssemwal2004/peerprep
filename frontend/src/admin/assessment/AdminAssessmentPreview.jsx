import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Pencil, RotateCcw } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import CodeEditor from '../../student/CodeEditor';
import AssessmentCodingProblemPanel from '../../student/assessment/AssessmentCodingProblemPanel';
import AssessmentLanguagePicker from '../../student/assessment/AssessmentLanguagePicker';
import AssessmentMcqOptions from '../../student/assessment/AssessmentMcqOptions';
import AssessmentQuestionPalette from '../../student/assessment/AssessmentQuestionPalette';
import { loadAssessmentDraft } from './assessmentDraftStore';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../coordinatorPermissions';

const getCodingData = (question) => (
  question?.problemDataSnapshot
  || question?.problemData
  || question?.coding?.problemData
  || question?.coding
  || {}
);

const getCodingLanguages = (codingData) => {
  const configured = Array.isArray(codingData?.supportedLanguages)
    ? codingData.supportedLanguages.filter(Boolean)
    : [];
  if (configured.length) return configured;
  const templateLanguages = Object.keys(codingData?.codeTemplates || {});
  return templateLanguages.length ? templateLanguages : ['python'];
};

const formatTime = (minutes) => {
  const totalSeconds = Math.max(0, Number(minutes || 0) * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, mins, seconds].map((value) => String(value).padStart(2, '0')).join(':');
};

const answerKey = (sectionIndex, questionIndex) => `${sectionIndex}-${questionIndex}`;

const buildSampleTestCases = (codingData = {}) => {
  const source = Array.isArray(codingData.sampleTestCases) && codingData.sampleTestCases.length
    ? codingData.sampleTestCases
    : (Array.isArray(codingData.examples) && codingData.examples.length
      ? codingData.examples
      : (Array.isArray(codingData.testCases)
        ? codingData.testCases.filter((testCase) => testCase?.hidden !== true)
        : []));
  return source.map((testCase, index) => ({
    id: testCase?.id || `sample-${index + 1}`,
    kind: 'sample',
    input: testCase?.input ?? '',
    expectedOutput: testCase?.output ?? testCase?.expectedOutput ?? '',
    images: Array.isArray(testCase?.images) ? testCase.images : [],
  }));
};

export default function AdminAssessmentPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user } = useAuth();
  const rolePrefix = location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const canExecutePreview = Boolean(user) && hasPermission(user, 'coordinator.compiler.manage');
  const previewParams = new URLSearchParams(location.search);
  const draftKey = previewParams.get('draftKey');
  const requestedReturnTo = previewParams.get('return');
  const returnTo = requestedReturnTo?.startsWith(`${rolePrefix}/assessment/`)
    ? requestedReturnTo : `${rolePrefix}/assessment/${id}/edit`;
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [previewAnswers, setPreviewAnswers] = useState({});
  const [previewLanguages, setPreviewLanguages] = useState({});
  const [codeValueVersion, setCodeValueVersion] = useState(0);
  const [activeTestCases, setActiveTestCases] = useState({});
  const [executionResults, setExecutionResults] = useState({});
  const [executionState, setExecutionState] = useState({});
  const [activeConsoleTab, setActiveConsoleTab] = useState('testcase');
  const previewCodeDraftsRef = useRef(new Map());

  useEffect(() => {
    let mounted = true;
    previewCodeDraftsRef.current.clear();
    const loadAssessment = async () => {
      setLoading(true);
      try {
        if (draftKey) {
          const draft = loadAssessmentDraft(draftKey);
          if (draft?.sections?.length) {
            if (mounted) setAssessment({ ...draft.form, _id: id === 'draft' ? undefined : id, sections: draft.sections });
            return;
          }
        }
        const data = await api.getAssessmentById(id);
        if (mounted) setAssessment(data.assessment);
      } catch (error) {
        toast.error(error.message || 'Failed to load assessment preview.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadAssessment();
    return () => { mounted = false; };
  }, [draftKey, id, toast]);

  const flatQuestions = useMemo(() => {
    const items = [];
    let mcqNumber = 0;
    let codingNumber = 0;
    (assessment?.sections || []).forEach((section, sectionIndex) => {
      (section.questions || []).forEach((question, questionIndex) => {
        const kind = section.type === 'coding' ? 'coding' : 'mcq';
        if (kind === 'coding') codingNumber += 1;
        else mcqNumber += 1;
        items.push({
          sectionIndex,
          questionIndex,
          section,
          question,
          kind,
          number: items.length + 1,
          typeNumber: kind === 'coding' ? codingNumber : mcqNumber,
        });
      });
    });
    return items;
  }, [assessment]);

  const currentFlatIndex = useMemo(() => flatQuestions.findIndex(
    (item) => item.sectionIndex === activeSection && item.questionIndex === activeQuestion,
  ), [flatQuestions, activeQuestion, activeSection]);

  const navigateToQuestion = useCallback((sectionIndex, questionIndex) => {
    setActiveSection(sectionIndex);
    setActiveQuestion(questionIndex);
  }, []);
  const canNavigate = useCallback(() => true, []);
  const exitPreview = useCallback(() => {
    navigate(returnTo);
  }, [navigate, returnTo]);
  const editCurrentQuestion = () => {
    navigate(id === 'draft' ? returnTo : `${rolePrefix}/assessment/${id}/edit`, { state: { editQuestion: { sectionIndex: activeSection, questionIndex: activeQuestion } } });
  };

  const questionStatus = useCallback((sectionIndex, questionIndex) => {
    const response = previewAnswers[answerKey(sectionIndex, questionIndex)];
    const section = assessment?.sections?.[sectionIndex];
    if (!section || response === undefined || response === null) return 'unanswered';
    if (section.type === 'coding') return response.codeChanged ? 'answered' : 'unanswered';
    if (Array.isArray(response)) return response.length ? 'answered' : 'unanswered';
    return String(response).trim() ? 'answered' : 'unanswered';
  }, [assessment, previewAnswers]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500 dark:bg-gray-950">Loading student preview...</div>;
  }

  if (!assessment || !flatQuestions.length) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 text-sm text-slate-500 dark:bg-gray-950">
        <p>{assessment ? 'This assessment has no questions to preview.' : 'Assessment not found.'}</p>
        <button type="button" onClick={exitPreview} className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700">Back to assessment</button>
      </div>
    );
  }

  const currentItem = flatQuestions[currentFlatIndex >= 0 ? currentFlatIndex : 0];
  const section = currentItem.section;
  const question = currentItem.question;
  const isCoding = currentItem.kind === 'coding';
  const questionKey = answerKey(currentItem.sectionIndex, currentItem.questionIndex);
  const currentTypeTotal = flatQuestions.filter((item) => item.kind === currentItem.kind).length;
  const currentTypeLabel = isCoding ? 'Coding' : 'MCQ / Short';
  const sectionLabel = section.sectionName || `Section ${currentItem.sectionIndex + 1}`;
  const marks = question.marks ?? question.points ?? section.marksPerQuestion ?? 0;
  const hasPrevious = currentFlatIndex > 0;
  const hasNext = currentFlatIndex < flatQuestions.length - 1;

  const moveBy = (offset) => {
    const target = flatQuestions[currentFlatIndex + offset];
    if (target) navigateToQuestion(target.sectionIndex, target.questionIndex);
  };

  const setAnswer = (answer) => {
    setPreviewAnswers((previous) => ({ ...previous, [questionKey]: answer }));
  };

  const codingData = getCodingData(question);
  const codingLanguages = getCodingLanguages(codingData);
  const previewLanguage = codingLanguages.includes(previewLanguages[questionKey])
    ? previewLanguages[questionKey]
    : codingLanguages[0];
  const templateCode = String(codingData.codeTemplates?.[previewLanguage] || '');
  const previewModelKey = `${questionKey}:${previewLanguage}`;
  const previewCode = previewCodeDraftsRef.current.has(previewModelKey)
    ? previewCodeDraftsRef.current.get(previewModelKey)
    : templateCode;

  const updatePreviewCode = (nextCode) => {
    previewCodeDraftsRef.current.set(previewModelKey, nextCode);
    setPreviewAnswers((previous) => ({
      ...previous,
      [questionKey]: { codeChanged: String(nextCode).trim() !== templateCode.trim() },
    }));
  };

  const resetPreviewCode = () => {
    previewCodeDraftsRef.current.set(previewModelKey, templateCode);
    setPreviewAnswers((previous) => ({ ...previous, [questionKey]: { codeChanged: false } }));
    setCodeValueVersion((current) => current + 1);
  };

  const sampleTestCases = buildSampleTestCases(codingData);
  const activeTestCaseId = activeTestCases[questionKey] || sampleTestCases[0]?.id || null;
  const activeTestCase = sampleTestCases.find((entry) => String(entry.id) === String(activeTestCaseId))
    || sampleTestCases[0]
    || null;
  const problemId = question?.problemId || question?.coding?.problemId || codingData?._id || codingData?.id;
  const isRunning = executionState[questionKey] === 'run';
  const isSubmitting = executionState[questionKey] === 'submit';

  const executePreviewCode = async (mode, sourceOverride) => {
    if (!problemId) {
      toast.info('Save this coding question before running it from candidate preview.');
      return;
    }
    if (!canExecutePreview) {
      toast.error('Your coordinator access allows assessment preview but not compiler execution.');
      return;
    }
    const sourceCode = typeof sourceOverride === 'string'
      ? sourceOverride
      : (previewCodeDraftsRef.current.get(previewModelKey) ?? previewCode);
    if (!String(sourceCode).trim()) {
      toast.error('Add solution code before running the preview.');
      return;
    }
    setExecutionState((previous) => ({ ...previous, [questionKey]: mode }));
    try {
      const response = mode === 'submit'
        ? await api.submitCompilerProblem(problemId, { language: previewLanguage, sourceCode })
        : await api.runCompilerProblem(problemId, {
          language: previewLanguage,
          sourceCode,
          customInput: activeTestCase?.input || '',
        });
      setExecutionResults((previous) => ({
        ...previous,
        [questionKey]: { ...response, mode },
      }));
      setActiveConsoleTab('result');
    } catch (error) {
      setExecutionResults((previous) => ({
        ...previous,
        [questionKey]: {
          mode,
          status: 'System Error',
          stderr: error.message || 'Preview execution failed.',
          error: error.message || 'Preview execution failed.',
          input: activeTestCase?.input || '',
        },
      }));
      setActiveConsoleTab('result');
    } finally {
      setExecutionState((previous) => ({ ...previous, [questionKey]: '' }));
    }
  };

  const palette = (
    <AssessmentQuestionPalette
      assessmentTitle={assessment.title || 'Assessment'}
      questions={flatQuestions}
      activeSection={activeSection}
      activeQuestion={activeQuestion}
      questionStatus={questionStatus}
      canNavigate={canNavigate}
      onNavigate={navigateToQuestion}
      onSubmit={exitPreview}
      submitLabel="Exit Preview"
      saving={false}
      dockable={isCoding}
    />
  );

  return (
    <div className="relative min-h-screen bg-[#f2f2f2] font-sans text-slate-900 dark:bg-[#1a1a1a] dark:text-gray-100 lg:h-screen lg:overflow-hidden">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-white/[0.07] dark:bg-[#202022]/95">
        <div className="flex min-h-[56px] w-full flex-wrap items-center gap-3 px-3 py-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => moveBy(-1)} disabled={!hasPrevious} className="inline-flex h-9 items-center gap-1 rounded-lg text-zinc-600 hover:bg-zinc-200 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-700">
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <div>
              <div className="max-w-[220px] truncate text-xs font-semibold text-slate-900 dark:text-white">{assessment.title}</div>
              <div className="text-[10px] text-slate-500 dark:text-gray-400">{sectionLabel} / {currentTypeLabel} {currentItem.typeNumber}</div>
            </div>
          </div>
          <div className="rounded-full bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-100 dark:bg-sky-900/20 dark:text-sky-200 dark:ring-sky-900/40">
            {rolePrefix === '/coordinator' ? 'Coordinator' : 'Admin'} preview · {currentTypeLabel} {currentItem.typeNumber}/{currentTypeTotal}
          </div>
          <div className="flex flex-1 items-center justify-end gap-2">
            <button type="button" onClick={() => moveBy(1)} disabled={!hasNext} className="inline-flex h-9 items-center gap-1 rounded-lg text-zinc-600 hover:bg-zinc-200 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-700">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <div className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-slate-950 px-3 text-white shadow-sm dark:border-gray-700">
              <Clock className="h-3.5 w-3.5 text-sky-300" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Duration</span>
              <span className="text-xs font-bold tabular-nums">{formatTime(assessment.duration)}</span>
            </div>
            {isCoding ? <>
              <AssessmentLanguagePicker
                languages={codingLanguages}
                value={previewLanguage}
                onChange={(language) => setPreviewLanguages((previous) => ({ ...previous, [questionKey]: language }))}
                disabled={isRunning || isSubmitting}
              />
              <button type="button" onClick={resetPreviewCode} disabled={isRunning || isSubmitting} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-200 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-700" aria-label="Reset preview code" title="Reset code">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </> : null}
            <button type="button" onClick={exitPreview} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-[#282828] dark:text-zinc-300">
              <ArrowLeft className="h-3.5 w-3.5" /> Exit Preview
            </button>
            <button type="button" onClick={editCurrentQuestion} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-[11px] font-bold text-white hover:bg-sky-500"><Pencil className="h-3.5 w-3.5" /> Edit question</button>
          </div>
        </div>
      </header>

      {isCoding ? (
        <div className="w-full bg-[#f2f2f2] p-2 dark:bg-[#1a1a1a] lg:h-[calc(100vh-56px)] lg:overflow-hidden">
          <div className="mx-auto flex h-full max-w-[1800px] flex-col gap-2 lg:min-h-0 lg:flex-row lg:overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:overflow-hidden">
              <section className="min-h-[520px] min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white lg:h-full lg:min-h-0 lg:w-[40%] dark:border-zinc-700 dark:bg-[#282828]">
                <AssessmentCodingProblemPanel question={question} codingData={codingData} language={previewLanguage} marks={marks} sectionLabel={sectionLabel} />
              </section>
              <section className="flex min-h-[520px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-[#282828] lg:min-h-0">
                <CodeEditor
                  supportedLanguages={codingLanguages}
                  language={previewLanguage}
                  code={previewCode}
                  onLanguageChange={(language) => setPreviewLanguages((previous) => ({ ...previous, [questionKey]: language }))}
                  onCodeChange={updatePreviewCode}
                  onLiveCodeChange={updatePreviewCode}
                  customInput=""
                  testCases={sampleTestCases}
                  activeTestCaseId={activeTestCaseId}
                  onActiveTestCaseChange={(testCaseId) => setActiveTestCases((previous) => ({ ...previous, [questionKey]: testCaseId }))}
                  expectedOutputForRun={activeTestCase?.expectedOutput ?? null}
                  runInputUsed={activeTestCase?.input ?? null}
                  activeConsoleTab={activeConsoleTab}
                  onConsoleTabChange={setActiveConsoleTab}
                  result={executionResults[questionKey] || null}
                  isRunning={isRunning}
                  isSubmitting={isSubmitting}
                  executionDisabled={!canExecutePreview}
                  onRun={(code) => executePreviewCode('run', code)}
                  onSubmit={(code) => executePreviewCode('submit', code)}
                  onReset={resetPreviewCode}
                  showToolbar={false}
                   consoleActions
                  internalClipboardOnly={false}
                  blockContextMenu={false}
                  editorKey={`assessment-preview:${previewModelKey}`}
                  valueVersion={codeValueVersion}
                  executionMode={codingData?.category === 'SQL' ? 'sql' : 'code'}
                />
              </section>
            </div>
            {palette}
          </div>
        </div>
      ) : (
        <div className="w-full bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,0.98)_40%,rgba(248,250,252,1)_100%)] px-3 py-3 dark:bg-none dark:bg-gray-950 md:px-4 lg:h-[calc(100vh-68px)] lg:overflow-hidden">
          <div className="flex h-full flex-col gap-3 lg:min-h-0 lg:flex-row lg:overflow-hidden">
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-cyan-100 bg-white shadow-[0_18px_48px_-36px_rgba(8,145,178,0.22)] dark:border-gray-700 dark:bg-gray-900 lg:overflow-y-auto">
              <div className="border-b border-cyan-100 bg-[linear-gradient(180deg,#f2fbff_0%,#ffffff_100%)] px-6 py-4 dark:border-gray-700 dark:bg-none dark:bg-gray-900">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                  <span className="rounded-md bg-cyan-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">{currentTypeLabel} {currentItem.typeNumber}/{currentTypeTotal}</span>
                  <span className="rounded-md border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-900/20 dark:text-cyan-300">Marks: {marks}</span>
                  <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">{section.type === 'mcq' ? 'MCQ' : 'Short Answer'}</span>
                </div>
              </div>
              {question.passage?.text ? (
                <div className="mx-5 mt-4 rounded-xl border border-cyan-100 bg-cyan-50/50 p-4 dark:border-cyan-900/40 dark:bg-cyan-950/20 md:mx-6">
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-cyan-700">{question.passage.title || 'Reading passage'}</p>
                  {question.passage.image?.url ? <img src={question.passage.image.url} alt={question.passage.image.alt || ''} className="mt-3 max-h-64 w-full rounded-lg bg-white object-contain p-2" /> : null}
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-200">{question.passage.text}</p>
                </div>
              ) : null}
              <div className="px-5 pt-5 md:px-6">
                <h1 className="text-lg font-bold leading-snug text-slate-900 dark:text-white md:text-[1.15rem]">{question.questionText || 'Question'}</h1>
                {question.questionImage?.url ? <img src={question.questionImage.url} alt={question.questionImage.alt || ''} className="mt-4 max-h-72 w-full rounded-xl border border-slate-200 bg-white object-contain p-2 dark:border-gray-700 dark:bg-gray-800" /> : null}
              </div>
              {section.type === 'mcq' ? (
                <div className="px-5 pb-5 md:px-6"><AssessmentMcqOptions question={question} answer={previewAnswers[questionKey]} onChange={(_sectionIndex, _questionIndex, answer) => setAnswer(answer)} /></div>
              ) : (
                <div className="px-6 pb-5 pt-4"><textarea value={previewAnswers[questionKey] || ''} onChange={(event) => setAnswer(event.target.value)} rows={section.type === 'one_line' ? 3 : 7} className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-[0.94rem] leading-relaxed text-slate-800 shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" placeholder="Type your response here..." /></div>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-cyan-100 bg-[linear-gradient(180deg,#ffffff_0%,#f6fbfd_100%)] px-5 py-4 dark:border-gray-700 dark:bg-none dark:bg-gray-900 md:px-6">
                <button type="button" onClick={() => moveBy(-1)} disabled={!hasPrevious} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
                <button type="button" onClick={() => setAnswer(section.type === 'mcq' && question.allowMultipleAnswers ? [] : '')} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">Clear response</button>
                <button type="button" onClick={() => moveBy(1)} disabled={!hasNext} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-cyan-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-cyan-500 disabled:opacity-40">Save &amp; Next <ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </section>
            {palette}
          </div>
        </div>
      )}
    </div>
  );
}
