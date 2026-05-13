
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { ArrowLeft, ClipboardList, Save, Send, AlertCircle, Plus, Eye, EyeOff, Hash, Lock, Shield, Globe, Copy, Camera, Volume2, Monitor, Shuffle, Droplet, Navigation, Layers, Timer, RotateCcw, CheckSquare, Clock, Unlock } from 'lucide-react';
import { SectionCard } from './compiler/CompilerUi';
import RichTextEditor from './compiler/RichTextEditor';
import { createDefaultProblemForm, createProblemFormFromProblem } from './compiler/compilerUtils';
import AssessmentCard from './assessment/components/AssessmentCard';
import CSVUploader from './assessment/components/CSVUploader';
import StudentSelector from './assessment/components/StudentSelector';
import SectionBuilder from './assessment/components/SectionBuilder';
import AssessmentPreview from './assessment/components/AssessmentPreview';
import { listCodingDrafts, loadCodingDraft, saveCodingDraft } from './assessment/assessmentCodingStore';
import { loadAssessmentDraft, saveAssessmentDraft, clearAssessmentDraft } from './assessment/assessmentDraftStore';
import { consumeProblemSelections, consumeQuestionSelections } from './assessment/assessmentProblemSelectionStore';
import DateTimePicker from '../components/DateTimePicker';

const PREDEFINED_TEST_TYPES = [
  'MCQ',
  'Coding',
  'Aptitude',
  'Technical',
  'Behavioral',
  'Other',
];

const DEFAULT_INSTRUCTIONS = [
  'Read all questions carefully before attempting.',
  'Do not refresh or close the browser window during the test.',
  'Each question carries the marks mentioned alongside it.',
  'For MCQ questions, only one option is correct unless stated otherwise.',
  'Negative marking (if applicable) will be mentioned in each section.',
  'You must complete the test within the given time duration.',
  'Coding submissions will be auto-evaluated against hidden test cases.',
  'You may use scratch paper for rough calculations; it will not be evaluated.',
  'Copying, sharing answers, or using external resources is strictly prohibited.',
  'Any suspicious activity may result in automatic disqualification.',
  'Ensure a stable internet connection throughout the assessment.',
  'Submit your test before the timer expires; auto-submit will trigger at the end.',
  'Contact support immediately if you face any technical issues.',
  'All answers are final once submitted; review carefully before submitting.',
  'Your webcam or screen may be recorded for proctoring purposes.',
];

const CUSTOM_TEST_TYPES_KEY = 'peerprep_custom_test_types';

function loadCustomTestTypes() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_TEST_TYPES_KEY) || '[]');
  } catch { return []; }
}

function saveCustomTestType(type) {
  const existing = loadCustomTestTypes();
  if (!existing.includes(type)) {
    const updated = [...existing, type];
    localStorage.setItem(CUSTOM_TEST_TYPES_KEY, JSON.stringify(updated));
  }
}

const ASSESSMENT_IDS_KEY = 'peerprep_used_assessment_ids';

function generateUniqueAssessmentId() {
  const used = JSON.parse(localStorage.getItem(ASSESSMENT_IDS_KEY) || '[]');
  let id;
  do {
    id = String(Math.floor(100000 + Math.random() * 900000));
  } while (used.includes(id));
  localStorage.setItem(ASSESSMENT_IDS_KEY, JSON.stringify([...used, id]));
  return id;
}

const steps = [
  { id: 'basic', label: 'Basic Info', description: 'Title, description, instructions.' },
  { id: 'schedule', label: 'Schedule', description: 'Timing, duration, limits.' },
  { id: 'sections', label: 'Sections & Questions', description: 'Build assessment sections.' },
  { id: 'target', label: 'Target Students', description: 'Choose audience and upload or select.' },
  { id: 'settings', label: 'Settings', description: 'Security, visibility, access control.' },
  { id: 'preview', label: 'Preview & Publish', description: 'Review and finalize.' },
];

const emptyCsvState = {
  file: null,
  rows: [],
  errors: [],
  summary: '',
};

const createEditorId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `coding-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const createQuestionId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const LIBRARY_SECTION_LABELS = {
  mcq: 'MCQ Questions',
  short: 'Short Questions',
  one_line: 'One-word Questions',
  coding: 'Coding Questions',
};

const toLocalIsoMinutes = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${value ? 'bg-sky-600' : 'bg-slate-300 dark:bg-gray-600'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function NumInput({ value, onChange, min = 0, max, placeholder, unit }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        placeholder={placeholder}
        className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
      />
      {unit && <span className="text-xs text-slate-400">{unit}</span>}
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-slate-600 dark:text-gray-300">{label}</span>
      {children}
    </div>
  );
}

function Row({
  icon,
  iconBg = 'bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400',
  title,
  desc,
  badge,
  children,
  toggleKey,
  settings,
  onSettingChange,
}) {
  const enabled = Boolean(settings?.[toggleKey]);
  return (
    <div className={`rounded-xl border px-4 py-3.5 transition-colors ${enabled || !toggleKey ? 'border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900' : 'border-slate-100 bg-slate-50/60 dark:border-gray-800 dark:bg-gray-800/40'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>{icon}</div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{title}</p>
              {badge && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge === 'recommended' ? 'bg-emerald-100 text-emerald-700' : badge === 'strict' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{badge}</span>}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">{desc}</p>
          </div>
        </div>
        {toggleKey && <Toggle value={enabled} onChange={(v) => onSettingChange?.(toggleKey, v)} />}
      </div>
      {(enabled || !toggleKey) && children && <div className="mt-3 border-t border-slate-100 pt-3 dark:border-gray-700">{children}</div>}
    </div>
  );
}

export default function CreateAssessment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const rolePrefix = location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';

  const [currentId, setCurrentId] = useState(id || null);
  const [activeStep, setActiveStep] = useState('basic');
  const [form, setForm] = useState({
    title: '',
    description: '',
    instructions: '',
    startTime: '',
    endTime: '',
    duration: 60,
    allowLateSubmission: false,
    targetMode: 'all',
    sendEmail: true,
    lifecycleStatus: 'draft',
    testType: '',
    assessmentId: generateUniqueAssessmentId(),
    isVisible: true,
    customInstructions: [],
    passwordEnabled: false,
    passwordValue: '',
    settings: {},
  });
  const [sections, setSections] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [csvState, setCsvState] = useState(emptyCsvState);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [version, setVersion] = useState(1);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [customTestTypes, setCustomTestTypes] = useState(loadCustomTestTypes);
  const [showCustomTypeInput, setShowCustomTypeInput] = useState(false);
  const [newCustomTypeInput, setNewCustomTypeInput] = useState('');
  const [newCustomInstruction, setNewCustomInstruction] = useState('');

  const draftLoadedRef = useRef(false);
  const isSavingRef = useRef(false);

  // Generate a unique session key for new assessments so drafts don't leak across sessions
  const sessionIdRef = useRef(null);
  if (!id && !sessionIdRef.current) {
    const stored = sessionStorage.getItem('peerprep_current_assessment_session');
    if (stored && stored.startsWith('new_')) {
      sessionIdRef.current = stored;
    } else {
      sessionIdRef.current = `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem('peerprep_current_assessment_session', sessionIdRef.current);
    }
  }
  const assessmentKey = currentId || sessionIdRef.current || 'new';

  const updateForm = (updates) => {
    setForm((prev) => ({ ...prev, ...updates }));
    setDirty(true);
  };

  const updateSections = (nextSections) => {
    setSections((prev) => (typeof nextSections === 'function' ? nextSections(prev) : nextSections));
    setDirty(true);
  };

  const updateCsvState = (next) => {
    setCsvState(next);
    setDirty(true);
  };

  const updateSelectedStudents = (next) => {
    setSelectedStudents(next);
    setDirty(true);
  };

  const ensureQuestionMeta = (question, fallbackType) => ({
    ...question,
    questionId: question.questionId || createQuestionId(),
    type: question.type || fallbackType,
    negativePoints: Number(question.negativePoints ?? question.negativeMarks ?? 0) || 0,
  });

  const applyCodingDrafts = (drafts, prevSections) => {
    if (!drafts.length) return prevSections;
    const nextSections = prevSections.map((section) => ({ ...section, questions: [...(section.questions || [])] }));
    drafts.forEach((draft) => {
      const section = nextSections[draft.sectionIndex];
      if (!section || !section.questions?.[draft.questionIndex]) return;
      const question = section.questions[draft.questionIndex];
      section.questions[draft.questionIndex] = ensureQuestionMeta({
        ...question,
        type: 'coding',
        questionText: draft.problemData?.title || question.questionText,
        codingEditorId: draft.tempId || question.codingEditorId,
        problemId: draft.problemData?._id || draft.problemId || question.problemId,
        problemDataSnapshot: draft.problemData || question.problemDataSnapshot,
        coding: {
          ...(question.coding || {}),
          problemId: draft.problemData?._id || draft.problemId || question.coding?.problemId,
          problemData: draft.problemData || question.coding?.problemData,
          previewValidated: draft.previewValidated ?? draft.previewTested ?? question.coding?.previewValidated ?? question.coding?.previewTested,
          status: draft.status || question.coding?.status,
        },
      }, 'coding');
    });
    return nextSections;
  };

  const addProblemsToSection = (prevSections, sectionIndex, problems = []) => {
    if (!Array.isArray(prevSections) || prevSections.length === 0) return prevSections;
    const nextSections = prevSections.map((section, idx) => {
      if (idx !== sectionIndex) return section;
      const baseQuestions = Array.isArray(section.questions) ? section.questions : [];
      const isSingleEmpty = baseQuestions.length === 1
        && section.type === 'coding'
        && !baseQuestions[0]?.problemId
        && !baseQuestions[0]?.problemDataSnapshot
        && !baseQuestions[0]?.questionText;
      const sectionMarks = Number(section.marksPerQuestion || 1) || 1;
      const incomingQuestions = problems.map((problem) => ensureQuestionMeta({
        type: 'coding',
        questionText: problem.title || '',
        problemId: problem._id,
        problemDataSnapshot: problem,
        points: sectionMarks,
      }, 'coding'));
      const mergedQuestions = isSingleEmpty ? incomingQuestions : [...baseQuestions, ...incomingQuestions];
      return { ...section, questions: mergedQuestions };
    });
    return nextSections;
  };

  const addLibraryQuestionsToSections = (prevSections, libraryQuestions = []) => {
    const nextSections = Array.isArray(prevSections)
      ? prevSections.map((section) => ({ ...section, questions: [...(section.questions || [])] }))
      : [];

    (libraryQuestions || []).forEach((libraryQuestion) => {
      const baseQuestion = libraryQuestion.questionData || libraryQuestion;
      const type = baseQuestion.type || libraryQuestion.questionType || 'mcq';
      const clonedQuestion = ensureQuestionMeta({
        ...baseQuestion,
        questionId: createQuestionId(),
        type,
      }, type);

      const existingSectionIndex = nextSections.findIndex((section) => section.type === type);
      if (existingSectionIndex >= 0) {
        nextSections[existingSectionIndex].questions = [
          ...(nextSections[existingSectionIndex].questions || []),
          clonedQuestion,
        ];
        return;
      }

      nextSections.push({
        sectionName: LIBRARY_SECTION_LABELS[type] || `${String(type).replace(/_/g, ' ')} Questions`,
        type,
        marksPerQuestion: Number(clonedQuestion.points || clonedQuestion.marks || 1) || 1,
        negativeMarksPerQuestion: Number(clonedQuestion.negativePoints ?? clonedQuestion.negativeMarks ?? 0) || 0,
        questions: [clonedQuestion],
      });
    });

    return nextSections;
  };

  const handleOpenCodingEditor = async (sectionIndex, questionIndex) => {
    const section = sections[sectionIndex];
    const question = section?.questions?.[questionIndex];
    if (!question) return;

    if (dirty) {
      saveAssessmentDraft(assessmentKey, { form, sections, selectedStudents, csvState, version, activeStep });
    }

    let editorId = question.codingEditorId
      || question.coding?.editorId
      || question.problemId
      || question.problemDataSnapshot?._id
      || question.coding?.problemId
      || question.coding?.problemData?._id;
    if (!editorId) {
      editorId = createEditorId();
      updateSections((prev) => {
        const next = prev.map((sectionItem, sIdx) => (
          sIdx === sectionIndex
            ? {
              ...sectionItem,
              questions: sectionItem.questions.map((q, qIdx) => (
                qIdx === questionIndex
                  ? { ...q, questionId: q.questionId || createQuestionId(), codingEditorId: editorId, type: 'coding' }
                  : q
              )),
            }
            : sectionItem
        ));
        return next;
      });
    }

    const existingDraft = loadCodingDraft(editorId);
    const problemData = question.problemDataSnapshot || question.problemData || question.coding?.problemData || question.coding || null;
    const draftForm = existingDraft?.form
      || (problemData ? createProblemFormFromProblem(problemData) : createDefaultProblemForm());

    saveCodingDraft(editorId, {
      assessmentKey,
      sectionIndex,
      questionIndex,
      problemId: problemData?._id || existingDraft?.problemId || question.problemId || '',
      form: draftForm,
      problemData: problemData || existingDraft?.problemData || question.problemDataSnapshot || null,
      previewValidated: existingDraft?.previewValidated || existingDraft?.previewTested || problemData?.previewValidated || problemData?.previewTested || false,
      status: existingDraft?.status || ((problemData?.previewValidated ?? problemData?.previewTested) ? 'Validated' : 'Draft'),
    });

    const returnTo = currentId ? `${rolePrefix}/assessment/${currentId}/edit` : `${rolePrefix}/assessment/create`;
    const query = new URLSearchParams({
      mode: 'assessment',
      assessment: assessmentKey,
      section: String(sectionIndex),
      question: String(questionIndex),
      return: returnTo,
    });
    navigate(`${rolePrefix}/compiler/create?${query.toString()}`);
  };

  const handleOpenProblemLibrary = async (sectionType = '') => {
    // Save current draft before navigating to library so data is preserved when returning
    if (dirty) {
      await saveAssessmentDraft(assessmentKey, { form, sections, selectedStudents, csvState, version, activeStep });
    }
    const returnTo = currentId ? `${rolePrefix}/assessment/${currentId}/edit` : `${rolePrefix}/assessment/create`;
    const query = new URLSearchParams({
      mode: 'select',
      assessment: assessmentKey,
      return: returnTo,
    });
    if (sectionType) {
      query.set('type', sectionType);
      query.set('lockType', sectionType);
    }
    navigate(`${rolePrefix}/library?${query.toString()}`);
  };

  useEffect(() => {
    if (!id) {
      // Creating new assessment - load existing draft for this session if available
      const draft = loadAssessmentDraft(assessmentKey);
      if (draft && !draftLoadedRef.current) {
        draftLoadedRef.current = true;
        // Only load draft if it has data (don't overwrite with empty draft)
        if (draft.form && Object.keys(draft.form).length > 0) {
          setForm((prev) => ({
            ...prev,
            ...draft.form,
            assessmentId: prev.assessmentId,
          }));
        }
        if (draft.sections && draft.sections.length > 0) {
          setSections(draft.sections);
        }
        if (draft.selectedStudents && draft.selectedStudents.length > 0) {
          setSelectedStudents(draft.selectedStudents);
        }
        if (draft.csvState && Object.keys(draft.csvState).length > 0) {
          setCsvState(draft.csvState);
        }
        if (draft.version) {
          setVersion(draft.version);
        }
        if (draft.activeStep && steps.some((s) => s.id === draft.activeStep)) {
          setActiveStep(draft.activeStep);
        }
      }
      return;
    }
    const loadAssessment = async () => {
      try {
        const data = await api.getAssessmentById(id);
        const assessment = data.assessment || {};
        const isDraft = assessment.lifecycleStatus === 'draft';
        const fallbackTargetMode = assessment.targetType === 'all' ? 'all' : 'individual';
        const resolvedTargetMode = isDraft
          ? ((assessment.draftTargetMode && assessment.draftTargetMode !== 'all') ? assessment.draftTargetMode : fallbackTargetMode)
          : fallbackTargetMode;
        const draftAssigned = Array.isArray(assessment.draftAssignedStudents) ? assessment.draftAssignedStudents : [];
        const sessionDraft = loadAssessmentDraft(assessmentKey);
        const draftForm = sessionDraft?.form && typeof sessionDraft.form === 'object' ? sessionDraft.form : null;
        const draftSections = Array.isArray(sessionDraft?.sections) ? sessionDraft.sections : null;
        const draftSelectedStudents = Array.isArray(sessionDraft?.selectedStudents) ? sessionDraft.selectedStudents : null;
        const draftCsvState = sessionDraft?.csvState && typeof sessionDraft.csvState === 'object' ? sessionDraft.csvState : null;
        const draftVersion = sessionDraft?.version;
        const draftStep = sessionDraft?.activeStep;
        const baseForm = {
          title: assessment.title || '',
          description: assessment.description || '',
          instructions: assessment.instructions || '',
          startTime: assessment.startTime ? toLocalIsoMinutes(assessment.startTime) : '',
          endTime: assessment.endTime ? toLocalIsoMinutes(assessment.endTime) : '',
          duration: assessment.duration || 60,
          allowLateSubmission: Boolean(assessment.allowLateSubmission),
          targetMode: resolvedTargetMode,
          lifecycleStatus: assessment.lifecycleStatus || 'draft',
          sendEmail: true,
          testType: assessment.testType || '',
          assessmentId: assessment.assessmentId || '',
          isVisible: assessment.isVisible !== false,
          customInstructions: Array.isArray(assessment.customInstructions) ? assessment.customInstructions : [],
          passwordEnabled: Boolean(assessment.passwordEnabled),
          passwordValue: '',
          settings: assessment.settings && typeof assessment.settings === 'object' ? assessment.settings : {},
        };
        const effectiveTargetMode = draftForm?.targetMode || resolvedTargetMode;

        setForm((prev) => ({
          ...prev,
          ...baseForm,
          ...(draftForm || {}),
          assessmentId: draftForm?.assessmentId || baseForm.assessmentId || prev.assessmentId,
        }));
        setVersion(draftVersion || assessment.version || 1);

        if (effectiveTargetMode === 'csv') {
          setCsvState(draftCsvState ? { ...emptyCsvState, ...draftCsvState } : {
            file: null,
            rows: draftAssigned,
            errors: [],
            summary: draftAssigned.length ? `Draft loaded with ${draftAssigned.length} row(s). Revalidate before publish.` : '',
          });
          setSelectedStudents(draftSelectedStudents || []);
        } else if (effectiveTargetMode === 'individual') {
          if (draftSelectedStudents) {
            setSelectedStudents(draftSelectedStudents);
          } else if (isDraft && draftAssigned.length) {
            setSelectedStudents(draftAssigned);
          } else {
            setSelectedStudents(Array.isArray(assessment.assignedStudents) ? assessment.assignedStudents : []);
          }
          setCsvState(draftCsvState ? { ...emptyCsvState, ...draftCsvState } : emptyCsvState);
        } else {
          setSelectedStudents(draftSelectedStudents || []);
          setCsvState(draftCsvState ? { ...emptyCsvState, ...draftCsvState } : emptyCsvState);
        }

        if (draftStep && steps.some((step) => step.id === draftStep)) {
          setActiveStep(draftStep);
        }

        const mappedSections = (assessment.sections || []).map((section, sectionIndex) => {
          const questions = (section.questions || []).map((question, questionIndex) => {
            if (section.type !== 'coding') {
              return ensureQuestionMeta(question, section.type);
            }
            const coding = question.coding || {};
            const snapshot = question.problemDataSnapshot || question.problemData || coding.problemData || coding;
            const problemData = snapshot;
            const editorId = question.codingEditorId
              || coding.editorId
              || question.problemId
              || problemData?._id
              || createEditorId();

            saveCodingDraft(editorId, {
              assessmentKey: assessment._id || assessmentKey,
              sectionIndex,
              questionIndex,
              problemId: question.problemId || problemData?._id || '',
              form: createProblemFormFromProblem(problemData || createDefaultProblemForm()),
              problemData,
              previewValidated: Boolean(problemData?.previewValidated ?? problemData?.previewTested),
              status: (problemData?.previewValidated ?? problemData?.previewTested) ? 'Validated' : 'Draft',
            });

            return ensureQuestionMeta({
              ...question,
              type: 'coding',
              questionText: question.questionText || problemData?.title || '',
              codingEditorId: editorId,
              problemId: question.problemId || problemData?._id || coding.problemId,
              problemDataSnapshot: question.problemDataSnapshot || problemData,
              coding: {
                ...coding,
                problemId: problemData?._id || coding.problemId,
                problemData,
              },
            }, 'coding');
          });
          return { ...section, questions };
        });
        const problemSelections = consumeProblemSelections(assessmentKey);
        const librarySelections = consumeQuestionSelections(assessmentKey);
        const sectionSource = draftSections && draftSections.length ? draftSections : mappedSections;
        let mergedSections = problemSelections.length
          ? problemSelections.reduce((acc, selection) => addProblemsToSection(acc, selection.sectionIndex, selection.problems || []), sectionSource)
          : sectionSource;
        if (librarySelections.length) {
          mergedSections = librarySelections.reduce(
            (acc, selection) => addLibraryQuestionsToSections(acc, selection.questions || []),
            mergedSections,
          );
        }
        setSections(mergedSections);
        setCurrentId(id);
      } catch (err) {
        toast.error(err.message || 'Failed to load assessment');
      }
    };
    loadAssessment();
  }, [id, toast]);

  useEffect(() => {
    const drafts = listCodingDrafts(assessmentKey);
    if (!drafts.length) return;
    setSections((prev) => applyCodingDrafts(drafts, prev));
    setDirty(true);
  }, [assessmentKey]);

  // Auto-save removed - drafts only save when user explicitly clicks Save Draft button

  useEffect(() => {
    if (id) return;
    const problemSelections = consumeProblemSelections(assessmentKey);
    const librarySelections = consumeQuestionSelections(assessmentKey);
    if (!problemSelections.length && !librarySelections.length) return;
    setSections((prev) => {
      let next = prev;
      problemSelections.forEach((selection) => {
        next = addProblemsToSection(next, selection.sectionIndex, selection.problems || []);
      });
      librarySelections.forEach((selection) => {
        next = addLibraryQuestionsToSections(next, selection.questions || []);
      });

      return next;
    });
    setDirty(true);
  }, [assessmentKey]);

  const assignedSummary = useMemo(() => {
    if (form.targetMode === 'all') {
      return { count: allStudents.length || 'All Students', newAccounts: 0 };
    }
    if (form.targetMode === 'individual') {
      return { count: selectedStudents.length, newAccounts: 0 };
    }
    if (!csvState.rows.length) {
      return { count: 0, newAccounts: 0 };
    }
    const emailSet = new Set(allStudents.map((s) => (s.email || '').toLowerCase()));
    const idSet = new Set(allStudents.map((s) => (s.studentId || '').toLowerCase()));
    const newAccounts = csvState.rows.filter((row) => {
      const email = (row.email || '').toLowerCase();
      const sid = (row.studentid || row.student_id || row.sid || '').toLowerCase();
      return !(emailSet.has(email) || idSet.has(sid));
    }).length;
    return { count: csvState.rows.length, newAccounts };
  }, [form.targetMode, selectedStudents, csvState.rows, allStudents]);

  const assessmentValidation = useMemo(() => {
    const sectionsArray = Array.isArray(sections) ? sections : [];
    const totalQuestions = sectionsArray.reduce((total, section) => total + (section.questions?.length || 0), 0);
    const emptySection = sectionsArray.find((section) => !section.questions || section.questions.length === 0);
    const codingQuestions = sectionsArray.flatMap((section) => {
      if (section.type !== 'coding') return [];
      return (section.questions || []);
    });
    const invalidCoding = codingQuestions.filter((question) => {
      const snapshot = question.problemDataSnapshot || question.problemData || question.coding?.problemData || question.coding || {};
      const normalizedStatus = String(snapshot.status || '').toLowerCase();
      const isPublished = normalizedStatus === 'published' || normalizedStatus === 'active';
      const isValidated = Boolean(snapshot.previewValidated ?? snapshot.previewTested);
      return !question.problemId || !isPublished || !isValidated;
    });
    return {
      totalQuestions,
      emptySection: Boolean(emptySection),
      codingQuestions: codingQuestions.length,
      invalidCodingCount: invalidCoding.length,
    };
  }, [sections]);

  const buildPayload = (statusOverride) => {
    const lifecycleStatus = statusOverride || form.lifecycleStatus || 'draft';
    const normalizedTargetType = form.targetMode === 'all' ? 'all' : 'selected';
    const assignedStudents = form.targetMode === 'csv'
      ? csvState.rows
      : selectedStudents;

    const normalizedSections = (sections || []).map((section) => {
      const questions = (section.questions || []).map((question) => {
        const questionType = question.type || section.type;
        if (questionType !== 'coding') {
          return { ...question, type: questionType };
        }
        const { codingEditorId, coding, problemDataSnapshot, problemId, ...restQuestion } = question;
        const snapshot = problemDataSnapshot || coding?.problemData || coding || null;
        const resolvedProblemId = problemId || coding?.problemId || snapshot?._id || '';
        return {
          ...restQuestion,
          type: 'coding',
          questionText: restQuestion.questionText || snapshot?.title || '',
          problemId: resolvedProblemId || undefined,
          problemDataSnapshot: snapshot || undefined,
        };
      });
      return { ...section, questions };
    });

    return {
      title: form.title,
      description: form.description,
      instructions: form.instructions,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      duration: form.duration,
      allowLateSubmission: form.allowLateSubmission,
      targetType: normalizedTargetType,
      draftTargetMode: form.targetMode,
      assignedStudents: form.targetMode === 'all' ? [] : assignedStudents,
      sections: normalizedSections,
      lifecycleStatus,
      sendEmail: form.sendEmail,
      testType: form.testType || '',
      assessmentId: form.assessmentId || '',
      isVisible: form.isVisible !== false,
      customInstructions: form.customInstructions || [],
      passwordEnabled: Boolean(form.passwordEnabled),
      password: form.passwordEnabled ? (form.passwordValue || '') : '',
      settings: form.settings || {},
    };
  };

  const saveDraft = async (silent = false) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setAutoSaveStatus('Saving draft...');
    const payload = buildPayload('draft');
    try {
      if (currentId) {
        await api.updateAssessment(currentId, payload);
        // Log update activity
        api.logActivity({
          actionType: 'UPDATE',
          targetType: 'ASSESSMENT',
          targetId: currentId,
          description: `Assessment draft updated: "${form.title || 'Untitled'}" (ID: ${form.assessmentId || currentId})`,
          metadata: { assessmentId: form.assessmentId, testType: form.testType, isVisible: form.isVisible },
        }).catch(() => { });
        if (!silent) toast.success('Draft updated');
      } else {
        const response = await api.createAssessment(payload);
        const newId = response.assessmentId;
        setCurrentId(newId);
        // Log create activity
        api.logActivity({
          actionType: 'CREATE',
          targetType: 'ASSESSMENT',
          targetId: newId,
          description: `New assessment draft created: "${form.title || 'Untitled'}" (ID: ${form.assessmentId || newId})`,
          metadata: { assessmentId: form.assessmentId, testType: form.testType, isVisible: form.isVisible },
        }).catch(() => { });
        if (!silent) toast.success('Draft created');
      }
      setDirty(false);
      setAutoSaveStatus('Draft saved');
      clearAssessmentDraft(assessmentKey);
      sessionStorage.removeItem('peerprep_current_assessment_session');
    } catch (err) {
      setAutoSaveStatus('Draft save failed');
      if (!silent) toast.error(err.message || 'Failed to save draft');
    } finally {
      isSavingRef.current = false;
    }
  };

  const publishAssessment = async () => {
    if (isSavingRef.current) return;
    if (!form.title || !form.startTime || !form.endTime || !form.duration) {
      toast.error('Please complete title, start/end time, and duration before publishing.');
      return false;
    }
    if (form.passwordEnabled && !currentId && !String(form.passwordValue || '').trim()) {
      toast.error('Enter an assessment password before publishing.');
      return false;
    }
    if (form.passwordEnabled && currentId && !String(form.passwordValue || '').trim()) {
      try {
        const existing = await api.getAssessmentById(currentId);
        if (!existing?.assessment?.passwordEnabled) {
          toast.error('Enter an assessment password before publishing.');
          return false;
        }
      } catch {
        toast.error('Unable to verify the existing password setup. Please enter a password.');
        return false;
      }
    }
    if (assessmentValidation.totalQuestions === 0 || assessmentValidation.emptySection) {
      toast.error('Add at least one question and ensure no sections are empty before publishing.');
      return false;
    }
    if (assessmentValidation.invalidCodingCount > 0) {
      toast.error('All coding questions must be published and validated before publishing the assessment.');
      return false;
    }
    if (form.targetMode === 'csv' && csvState.errors.length > 0) {
      toast.error('Fix CSV errors before publishing.');
      return false;
    }
    if (form.targetMode !== 'all' && assignedSummary.count === 0) {
      toast.error('Select at least one student before publishing.');
      return false;
    }
    isSavingRef.current = true;
    setLoading(true);
    try {
      const payload = buildPayload('published');
      let publishedId = currentId;
      if (currentId) {
        await api.updateAssessment(currentId, payload);
      } else {
        const res = await api.createAssessment(payload);
        publishedId = res.assessmentId;
      }
      // Log publish activity
      api.logActivity({
        actionType: 'UPDATE',
        targetType: 'ASSESSMENT',
        targetId: publishedId,
        description: `Assessment published: "${form.title}" (ID: ${form.assessmentId || publishedId}) — Type: ${form.testType || 'N/A'}, Visible: ${form.isVisible ? 'Yes' : 'No'}`,
        metadata: {
          assessmentId: form.assessmentId,
          testType: form.testType,
          isVisible: form.isVisible,
          totalQuestions: assessmentValidation.totalQuestions,
          targetMode: form.targetMode,
        },
      }).catch(() => { });
      toast.success('Assessment published');
      clearAssessmentDraft(assessmentKey);
      sessionStorage.removeItem('peerprep_current_assessment_session');
      navigate(`${rolePrefix}/assessment`);
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to publish assessment');
      return false;
    } finally {
      setLoading(false);
      isSavingRef.current = false;
    }
  };

  const handlePublishConfirm = async () => {
    const success = await publishAssessment();
    if (success) {
      setShowPublishModal(false);
    }
  };

  const handleDraftConfirm = async () => {
    await saveDraft(false);
    setShowPublishModal(false);
  };

  const stepIndex = steps.findIndex((step) => step.id === activeStep);
  const stepMeta = steps[stepIndex] || steps[0];

  const allTestTypes = [...PREDEFINED_TEST_TYPES.filter((t) => t !== 'Other'), ...customTestTypes, 'Other'];

  const handleTestTypeChange = (value) => {
    if (value === 'Other') {
      setShowCustomTypeInput(true);
      updateForm({ testType: 'Other' });
    } else {
      setShowCustomTypeInput(false);
      updateForm({ testType: value });
    }
  };

  const handleAddCustomType = () => {
    const trimmed = newCustomTypeInput.trim();
    if (!trimmed) return;
    saveCustomTestType(trimmed);
    const updated = loadCustomTestTypes();
    setCustomTestTypes(updated);
    updateForm({ testType: trimmed });
    setShowCustomTypeInput(false);
    setNewCustomTypeInput('');
  };

  const handleAddCustomInstruction = () => {
    const trimmed = newCustomInstruction.trim();
    if (!trimmed) return;
    const next = [...(form.customInstructions || []), trimmed];
    updateForm({ customInstructions: next });
    setNewCustomInstruction('');
  };

  const handleRemoveCustomInstruction = (idx) => {
    const next = (form.customInstructions || []).filter((_, i) => i !== idx);
    updateForm({ customInstructions: next });
  };

  const stepContent = {
    basic: (
      <div className="space-y-6">
        {/* Assessment ID + Visibility Row */}
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-sky-100 bg-sky-50/60 px-5 py-4 dark:border-sky-900/40 dark:bg-sky-900/10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
              <Hash className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-600 dark:text-sky-400">Assessment ID</p>
              <p className="text-lg font-bold text-slate-800 dark:text-white">{form.assessmentId}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-600 dark:text-gray-300">Visibility</span>
            <button
              type="button"
              onClick={() => updateForm({ isVisible: !form.isVisible })}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none ${form.isVisible ? 'bg-sky-600' : 'bg-slate-300 dark:bg-gray-600'
                }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.isVisible ? 'translate-x-8' : 'translate-x-1'
                  }`}
              />
            </button>
            <span className={`flex items-center gap-1 text-xs font-semibold ${form.isVisible ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-gray-500'
              }`}>
              {form.isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {form.isVisible ? 'Visible' : 'Hidden'}
            </span>
          </div>
        </div>

        <SectionCard title="Basic Information" subtitle="Define core details for the assessment.">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-gray-400">Test Name</label>
              <input
                value={form.title}
                onChange={(e) => updateForm({ title: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                placeholder="e.g. Java Developer Round 1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-gray-400">Test Type</label>
              <select
                value={form.testType}
                onChange={(e) => handleTestTypeChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              >
                <option value="">-- Select Test Type --</option>
                {allTestTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              {showCustomTypeInput && (
                <div className="mt-2 flex gap-2">
                  <input
                    value={newCustomTypeInput}
                    onChange={(e) => setNewCustomTypeInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomType()}
                    className="flex-1 rounded-xl border border-sky-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-500 dark:border-sky-600 dark:bg-gray-900 dark:text-gray-200"
                    placeholder="Enter custom test type…"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomType}
                    className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-500 dark:text-gray-400">Short Description</label>
              <input
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                placeholder="Brief summary for admins"
              />
            </div>
          </div>
        </SectionCard>

        {/* Instructions Section */}
        <SectionCard title="Instructions" subtitle="Default instructions are always shown. Add custom ones below.">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-gray-700 dark:bg-gray-800/60">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-gray-500">Default Instructions</p>
              <ol className="space-y-2">
                {DEFAULT_INSTRUCTIONS.map((instruction, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-700 dark:text-gray-300">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-600 dark:bg-sky-900/40 dark:text-sky-400">
                      {i + 1}
                    </span>
                    {instruction}
                  </li>
                ))}
              </ol>
            </div>

            {/* Custom Instructions */}
            {(form.customInstructions || []).length > 0 && (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/60 px-5 py-4 dark:border-sky-900/30 dark:bg-sky-900/10">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-600 dark:text-sky-400">Custom Instructions</p>
                <ol className="space-y-2">
                  {(form.customInstructions || []).map((instr, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-sm text-slate-700 dark:text-gray-300">
                      <span className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-600 dark:bg-sky-900/40 dark:text-sky-400">
                          {DEFAULT_INSTRUCTIONS.length + i + 1}
                        </span>
                        {instr}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomInstruction(i)}
                        className="shrink-0 text-xs text-rose-500 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={newCustomInstruction}
                onChange={(e) => setNewCustomInstruction(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustomInstruction()}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                placeholder="Add a custom instruction…"
              />
              <button
                type="button"
                onClick={handleAddCustomInstruction}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    ),
    target: (
      <SectionCard title="Target Students" subtitle="Choose how you want to assign this assessment.">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            {[
              { id: 'all', label: 'All Students' },
              { id: 'csv', label: 'Upload CSV' },
              { id: 'individual', label: 'Add Individual Students' },
            ].map((option) => (
              <label key={option.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${form.targetMode === option.id ? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400/60 dark:bg-sky-900/20 dark:text-sky-200' : 'border-slate-200 bg-white text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}>
                <input
                  type="radio"
                  checked={form.targetMode === option.id}
                  onChange={() => updateForm({ targetMode: option.id })}
                />
                {option.label}
              </label>
            ))}
          </div>

          {form.targetMode === 'csv' && (
            <CSVUploader csvState={csvState} onChange={updateCsvState} />
          )}

          {form.targetMode === 'individual' && (
            <StudentSelector
              students={allStudents}
              selected={selectedStudents}
              onChange={updateSelectedStudents}
            />
          )}

          {form.targetMode === 'all' && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              All active students in the system will be assigned once published.
            </div>
          )}
        </div>
      </SectionCard>
    ),
    schedule: (
      <SectionCard title="Schedule & Limits" subtitle="Define timing and duration.">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Start Date & Time</label>
            <div className="mt-1">
              <DateTimePicker
                value={form.startTime}
                onChange={(isoDateTime) => {
                  updateForm({ startTime: isoDateTime });
                  if (
                    form.endTime &&
                    isoDateTime &&
                    !Number.isNaN(new Date(isoDateTime).getTime()) &&
                    !Number.isNaN(new Date(form.endTime).getTime()) &&
                    new Date(isoDateTime).getTime() > new Date(form.endTime).getTime()
                  ) {
                    updateForm({ endTime: '' });
                  }
                }}
                placeholder="Select start date and time"
                className="text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">End Date & Time</label>
            <div className="mt-1">
              <DateTimePicker
                value={form.endTime}
                onChange={(isoDateTime) => updateForm({ endTime: isoDateTime })}
                min={form.startTime || undefined}
                disabled={!form.startTime}
                placeholder={form.startTime ? 'Select end date and time' : 'Select start time first'}
                className="text-sm"
                isEnd
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Duration (minutes)</label>
            <input
              type="number"
              min="1"
              value={form.duration}
              onChange={(e) => updateForm({ duration: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          <input
            type="checkbox"
            checked={form.allowLateSubmission}
            onChange={(e) => updateForm({ allowLateSubmission: e.target.checked })}
          />
          Allow late submission (after window closes)
        </div>
      </SectionCard>
    ),
    sections: (
      <div className="space-y-5">
        {/* 3-Box Action Bar */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Box 1: Add Section */}
          <button
            type="button"
            onClick={() => {
              const addSectionEvent = new CustomEvent('sectionbuilder:addsection');
              document.dispatchEvent(addSectionEvent);
            }}
            className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/60 px-5 py-6 text-center transition-all hover:border-sky-500 hover:bg-sky-100/70 dark:border-sky-700 dark:bg-sky-900/10 dark:hover:bg-sky-900/20"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm transition-transform group-hover:scale-110">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">Add Section</p>
              <p className="mt-0.5 text-[11px] text-sky-500 dark:text-sky-400">Create a new question section</p>
            </div>
          </button>

          {/* Box 2: Add Questions from Library */}
          <button
            type="button"
            onClick={() => handleOpenProblemLibrary()}
            className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-5 py-6 text-center transition-all hover:border-sky-400 hover:bg-sky-50/70 dark:border-gray-600 dark:bg-gray-800/40 dark:hover:border-sky-600 dark:hover:bg-sky-900/10"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-white text-sky-600 shadow-sm transition-transform group-hover:scale-110 dark:border-sky-800 dark:bg-gray-900">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">Question Library</p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-gray-400">Pick from saved questions</p>
            </div>
          </button>

          {/* Box 3: Quick Stats */}
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800 dark:text-white">
                {sections.reduce((t, s) => t + (s.questions?.length || 0), 0)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400">
                {sections.length} section{sections.length !== 1 ? 's' : ''} &middot; Questions total
              </p>
            </div>
          </div>
        </div>

        <SectionBuilder
          sections={sections}
          onChange={updateSections}
          onOpenCodingEditor={handleOpenCodingEditor}
          onOpenProblemLibrary={handleOpenProblemLibrary}
          onNotify={{
            success: (message) => toast.success(message),
            error: (message) => toast.error(message),
          }}
        />
      </div>
    ),
    settings: (() => {
      const s = form.settings || {};
      const upd = (key, val) => updateForm({ settings: { ...(form.settings || {}), [key]: val } });
      const rowProps = { settings: s, onSettingChange: upd };

      return (
        <div className="space-y-6">
          {/* Quick Summary Bar */}
          <div className="flex flex-wrap gap-2 rounded-2xl border border-sky-100 bg-sky-50/60 px-5 py-3 dark:border-sky-900/30 dark:bg-sky-900/10">
            {[
              { label: 'Password', active: form.passwordEnabled, icon: <Lock className="h-3 w-3" /> },
              { label: 'Fullscreen', active: s.enableFullscreen, icon: <Monitor className="h-3 w-3" /> },
              { label: 'Tab Guard', active: s.tabSwitchDetection, icon: <Shield className="h-3 w-3" /> },
              { label: 'Camera', active: s.cameraMonitoring, icon: <Camera className="h-3 w-3" /> },
              { label: 'Copy Block', active: s.disableCopyPaste, icon: <Copy className="h-3 w-3" /> },
              { label: 'Shot Guard', active: s.blockScreenshots, icon: <Monitor className="h-3 w-3" /> },
              { label: 'Shuffle', active: s.randomShuffle, icon: <Shuffle className="h-3 w-3" /> },
              { label: 'Auto-Submit', active: s.autoSubmitOnEnd, icon: <Timer className="h-3 w-3" /> },
            ].map(({ label, active, icon }) => (
              <span key={label} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${active ? 'border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-400 dark:border-gray-700 dark:bg-gray-900'}`}>
                {icon}{label}
              </span>
            ))}
            <span className="ml-auto text-[11px] text-sky-600 dark:text-sky-400">
              {[form.passwordEnabled, s.enableFullscreen, s.tabSwitchDetection, s.cameraMonitoring, s.disableCopyPaste, s.blockScreenshots, s.randomShuffle, s.autoSubmitOnEnd].filter(Boolean).length} / 8 active
            </span>
          </div>

          {/* ── PASSWORD PROTECTION ── */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-gray-500">
              <Lock className="h-3.5 w-3.5" /> Access Control
            </h3>
            <div className="space-y-3">
              <Row {...rowProps} icon={<Lock className="h-4 w-4" />} iconBg="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                title="Password Protection" desc="Candidates must enter a password to begin the test." badge="recommended"
              >
                {null}
              </Row>
              {/* Password outside Row since it binds to form not settings */}
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"><Lock className="h-4 w-4" /></div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Enable Password</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">{form.passwordEnabled ? 'Candidates must enter password before starting.' : 'Test is open — no password required.'}</p>
                    </div>
                  </div>
                  <Toggle value={Boolean(form.passwordEnabled)} onChange={(v) => updateForm({ passwordEnabled: v })} />
                </div>
                {form.passwordEnabled && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-gray-700">
                    <FieldRow label="Password">
                      <input type="text" value={form.passwordValue || ''} onChange={(e) => updateForm({ passwordValue: e.target.value })}
                        placeholder="e.g. Secure@2024"
                        className="w-48 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-amber-400 dark:border-amber-800 dark:bg-gray-900 dark:text-gray-200" />
                    </FieldRow>
                  </div>
                )}
              </div>
              <Row {...rowProps} icon={<Globe className="h-4 w-4" />} iconBg="bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-300"
                title="Test Visibility" desc={form.isVisible ? 'Test is visible to students on their dashboard.' : 'Test is hidden — only admins can see it.'}>
                <FieldRow label="Current Status">
                  <button type="button" onClick={() => updateForm({ isVisible: !form.isVisible })}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${form.isVisible ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {form.isVisible ? <><Eye className="h-3.5 w-3.5" /> Visible</> : <><EyeOff className="h-3.5 w-3.5" /> Hidden</>}
                  </button>
                </FieldRow>
              </Row>
            </div>
          </div>

          {/* ── PROCTORING ── */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-gray-500">
              <Shield className="h-3.5 w-3.5" /> Proctoring & Anti-Cheating
            </h3>
            <div className="space-y-3">
              <Row {...rowProps} icon={<Monitor className="h-4 w-4" />} title="Fullscreen Mode" desc="Forces browser into fullscreen. Exiting fullscreen triggers a warning." badge="recommended" toggleKey="enableFullscreen">
                <FieldRow label="Auto-exit if fullscreen abandoned for (seconds)">
                  <NumInput value={s.fullscreenTimeoutSec} onChange={(v) => upd('fullscreenTimeoutSec', v)} min={5} max={60} placeholder="30" unit="sec" />
                </FieldRow>
              </Row>

              <Row {...rowProps} icon={<Shield className="h-4 w-4" />} iconBg="bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
                title="Tab Switch / Focus Loss Detection" desc="Tracks every time a candidate switches tabs or leaves the test window." badge="strict" toggleKey="tabSwitchDetection">
                <div className="space-y-3">
                  <FieldRow label="Max allowed tab switches before auto-submit">
                    <NumInput value={s.tabSwitchLimit} onChange={(v) => upd('tabSwitchLimit', v)} min={1} max={20} placeholder="3" unit="times" />
                  </FieldRow>
                  <FieldRow label="Warn candidate at switch #">
                    <NumInput value={s.tabSwitchWarnAt} onChange={(v) => upd('tabSwitchWarnAt', v)} min={1} placeholder="1" unit="switch" />
                  </FieldRow>
                  <FieldRow label="Action on limit reached">
                    <select value={s.tabSwitchAction || 'warn'} onChange={(e) => upd('tabSwitchAction', e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      <option value="warn">Show warning only</option>
                      <option value="autosubmit">Auto-submit test</option>
                      <option value="terminate">Terminate & disqualify</option>
                    </select>
                  </FieldRow>
                </div>
              </Row>

              <Row {...rowProps} icon={<Copy className="h-4 w-4" />} title="Disable Copy-Paste" desc="Blocks Ctrl+C, Ctrl+V and right-click context menu inside the test." badge="recommended" toggleKey="disableCopyPaste">
                <FieldRow label="Block right-click context menu">
                  <Toggle value={Boolean(s.blockRightClick)} onChange={(v) => upd('blockRightClick', v)} />
                </FieldRow>
              </Row>

              <Row
                {...rowProps}
                icon={<Monitor className="h-4 w-4" />}
                title="Screenshot Shortcut Protection"
                desc="Shows an immediate warning popup when students try common screenshot shortcuts on Windows or macOS."
                badge="recommended"
                toggleKey="blockScreenshots"
              >
                <div className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-[11px] leading-5 text-slate-600 dark:border-sky-900/30 dark:bg-sky-900/10 dark:text-gray-300">
                  Browser limitation: this detects common shortcut attempts like Print Screen and Cmd+Shift+3/4/5, but cannot guarantee blocking every OS-level screenshot path.
                </div>
              </Row>

              <Row {...rowProps} icon={<Droplet className="h-4 w-4" />} iconBg="bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"
                title="Question Watermarking" desc="Overlays candidate name/ID on every question to deter screenshot sharing." toggleKey="questionWatermark">
                <div className="space-y-3">
                  <FieldRow label="Watermark text source">
                    <select value={s.watermarkTextType || 'platform'} onChange={(e) => upd('watermarkTextType', e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      <option value="platform">Platform Name</option>
                      <option value="candidate_name">Candidate Name</option>
                      <option value="candidate_email">Candidate Email</option>
                      <option value="candidate_id">Candidate ID</option>
                      <option value="custom">Custom Text</option>
                    </select>
                  </FieldRow>
                  {(s.watermarkTextType || 'platform') === 'custom' && (
                    <FieldRow label="Custom watermark text">
                      <input
                        type="text"
                        value={s.watermarkCustomText || ''}
                        onChange={(e) => upd('watermarkCustomText', e.target.value)}
                        placeholder="PeerPrep"
                        className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      />
                    </FieldRow>
                  )}
                  <FieldRow label="Watermark opacity (%)">
                    <NumInput value={s.watermarkOpacity} onChange={(v) => upd('watermarkOpacity', v)} min={5} max={40} placeholder="12" unit="%" />
                  </FieldRow>
                  <FieldRow label="Watermark angle">
                    <NumInput value={s.watermarkAngle} onChange={(v) => upd('watermarkAngle', v)} min={-75} max={75} placeholder="-45" unit="deg" />
                  </FieldRow>
                  <FieldRow label="Watermark spacing">
                    <NumInput value={s.watermarkSpacing} onChange={(v) => upd('watermarkSpacing', v)} min={120} max={360} placeholder="220" unit="px" />
                  </FieldRow>
                  <FieldRow label="Font size">
                    <NumInput value={s.watermarkFontSize} onChange={(v) => upd('watermarkFontSize', v)} min={14} max={42} placeholder="24" unit="px" />
                  </FieldRow>
                  <FieldRow label="Text color">
                    <input
                      type="color"
                      value={s.watermarkColor || '#cbd5e1'}
                      onChange={(e) => upd('watermarkColor', e.target.value)}
                      className="h-9 w-14 rounded-lg border border-slate-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800"
                    />
                  </FieldRow>
                </div>
              </Row>

              <Row {...rowProps} icon={<Shuffle className="h-4 w-4" />} title="Random Question Shuffle" desc="Randomizes question order uniquely per candidate on test start." toggleKey="randomShuffle">
                <FieldRow label="Also shuffle answer options (MCQ)">
                  <Toggle value={Boolean(s.shuffleOptions)} onChange={(v) => upd('shuffleOptions', v)} />
                </FieldRow>
              </Row>

              <Row {...rowProps} icon={<Camera className="h-4 w-4" />} iconBg="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
                title="Camera Monitoring" desc="Captures periodic snapshots via webcam for proctoring review." toggleKey="cameraMonitoring">
                <div className="space-y-3">
                  <FieldRow label="Snapshot interval">
                    <NumInput value={s.cameraSnapshotInterval} onChange={(v) => upd('cameraSnapshotInterval', v)} min={30} placeholder="120" unit="sec" />
                  </FieldRow>
                  <FieldRow label="Alert admin on face not detected">
                    <Toggle value={Boolean(s.cameraFaceAlert)} onChange={(v) => upd('cameraFaceAlert', v)} />
                  </FieldRow>
                </div>
              </Row>

              <Row {...rowProps} icon={<Volume2 className="h-4 w-4" />} iconBg="bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400"
                title="Audio Monitoring" desc="Records ambient audio during the session for suspicious sound detection." toggleKey="audioMonitoring">
                <FieldRow label="Flag if noise threshold exceeded (dB)">
                  <NumInput value={s.audioNoiseThreshold} onChange={(v) => upd('audioNoiseThreshold', v)} min={10} max={100} placeholder="60" unit="dB" />
                </FieldRow>
              </Row>
            </div>
          </div>

          {/* ── CANDIDATE BEHAVIOR ── */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-gray-500">
              <Navigation className="h-3.5 w-3.5" /> Candidate Behavior
            </h3>
            <div className="space-y-3">
              <Row {...rowProps} icon={<Timer className="h-4 w-4" />} iconBg="bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400"
                title="Auto-Submit on Timer End" desc="Automatically submits the test when the timer reaches zero." badge="recommended" toggleKey="autoSubmitOnEnd">
                <FieldRow label="Warn candidate before auto-submit (minutes)">
                  <NumInput value={s.autoSubmitWarnMin} onChange={(v) => upd('autoSubmitWarnMin', v)} min={1} max={30} placeholder="5" unit="min" />
                </FieldRow>
              </Row>

              <Row {...rowProps} icon={<Globe className="h-4 w-4" />} title="Prevent Multiple Tabs / Windows" desc="Detects and blocks attempts to open the test in multiple browser tabs." toggleKey="preventMultipleTabs" />

              <Row {...rowProps} icon={<Navigation className="h-4 w-4" />} title="Restrict Backward Navigation" desc="Prevents candidates from revisiting previously answered questions." toggleKey="restrictNavigation">
                <FieldRow label="Allow reviewing within same section">
                  <Toggle value={Boolean(s.allowSectionReview)} onChange={(v) => upd('allowSectionReview', v)} />
                </FieldRow>
              </Row>

              <Row {...rowProps} icon={<Layers className="h-4 w-4" />} iconBg="bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400"
                title="Section-wise Time Locking" desc="Each section has its own time limit; once time is up, that section locks automatically." toggleKey="sectionWiseLock">
                <FieldRow label="Grace period before lock (seconds)">
                  <NumInput value={s.sectionGraceSec} onChange={(v) => upd('sectionGraceSec', v)} min={0} max={120} placeholder="10" unit="sec" />
                </FieldRow>
              </Row>

              <Row {...rowProps} icon={<Clock className="h-4 w-4" />} iconBg="bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-300"
                title="Idle Candidate Detection" desc="Flags a candidate if no interaction is detected for a configurable period." toggleKey="idleDetection">
                <div className="space-y-3">
                  <FieldRow label="Idle threshold (minutes)">
                    <NumInput value={s.idleThresholdMin} onChange={(v) => upd('idleThresholdMin', v)} min={1} max={30} placeholder="5" unit="min" />
                  </FieldRow>
                  <FieldRow label="Action on idle">
                    <select value={s.idleAction || 'warn'} onChange={(e) => upd('idleAction', e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      <option value="warn">Show warning popup</option>
                      <option value="pause">Pause timer</option>
                      <option value="autosubmit">Auto-submit test</option>
                    </select>
                  </FieldRow>
                </div>
              </Row>
            </div>
          </div>

          {/* ── SCORING & RESULTS ── */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-gray-500">
              <CheckSquare className="h-3.5 w-3.5" /> Scoring & Results
            </h3>
            <div className="space-y-3">
              <Row {...rowProps} icon={<CheckSquare className="h-4 w-4" />} iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                title="Show Score After Submission" desc="Candidates see their total score immediately after submitting." toggleKey="showResultsAfterSubmit">
                {s.showResultsAfterSubmit && (
                  <div className="space-y-3">
                    <FieldRow label="Show correct answers">
                      <Toggle value={Boolean(s.showCorrectAnswers)} onChange={(v) => upd('showCorrectAnswers', v)} />
                    </FieldRow>
                    <FieldRow label="Show section-wise breakdown">
                      <Toggle value={Boolean(s.showSectionBreakdown)} onChange={(v) => upd('showSectionBreakdown', v)} />
                    </FieldRow>
                    <FieldRow label="Show percentile rank">
                      <Toggle value={Boolean(s.showPercentile)} onChange={(v) => upd('showPercentile', v)} />
                    </FieldRow>
                  </div>
                )}
              </Row>

              {!s.showResultsAfterSubmit && (
                <Row {...rowProps} icon={<Clock className="h-4 w-4" />} iconBg="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                  title="Delayed Result Release" desc="Hold results and release them manually or after a set delay.">
                  <FieldRow label="Release results after (hours)">
                    <NumInput value={s.resultDelayHours} onChange={(v) => upd('resultDelayHours', v)} min={0} placeholder="24" unit="hrs" />
                  </FieldRow>
                </Row>
              )}

              <Row {...rowProps} icon={<RotateCcw className="h-4 w-4" />} title="Allow Retake" desc="Permit candidates to re-attempt the test (respects attempt limit in Schedule)." toggleKey="allowRetake">
                <FieldRow label="Minimum gap between attempts (hours)">
                  <NumInput value={s.retakeGapHours} onChange={(v) => upd('retakeGapHours', v)} min={0} placeholder="0" unit="hrs" />
                </FieldRow>
              </Row>

            </div>
          </div>
        </div>
      );
    })(),
    preview: (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {currentId && (
            <button
              type="button"
              onClick={() => navigate(`${rolePrefix}/assessment/preview/${currentId}`)}
              className="mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Open Fullscreen Preview
            </button>
          )}
          <AssessmentPreview assessment={{ ...form, sections }} />
        </div>
        <div className="space-y-4">
          <AssessmentCard
            label="Assigned Students"
            value={assignedSummary.count}
            helper={form.targetMode === 'csv' ? `${assignedSummary.newAccounts} new accounts` : 'Existing students'}
          />
          <SectionCard title="Notification Settings" subtitle="Review email notification settings.">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-gray-200">
              <input
                type="checkbox"
                checked={form.sendEmail}
                onChange={(e) => updateForm({ sendEmail: e.target.checked })}
              />
              Send email notification on publish
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              Email preview will include assessment title, time window, and instructions.
            </div>
          </SectionCard>
          <SectionCard title="Version Control" subtitle="Track changes for auditability.">
            <div className="text-sm font-semibold text-slate-800 dark:text-gray-100">Version {version}</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Every publish/update increments the version counter.</p>
          </SectionCard>
        </div>
      </div>
    ),
  };

  const goPrev = () => {
    if (stepIndex > 0) setActiveStep(steps[stepIndex - 1].id);
  };

  const goNext = () => {
    if (stepIndex < steps.length - 1) setActiveStep(steps[stepIndex + 1].id);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-20">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto max-w-7xl px-4 py-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`${rolePrefix}/assessment`)}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Assessment Builder</h1>
              <p className="text-xs text-slate-500 dark:text-gray-400">Professional workflow for scalable assessments.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => saveDraft(false)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Save className="h-3.5 w-3.5" />
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => setShowPublishModal(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              Publish Assessment
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-slate-400" />
            {autoSaveStatus || (dirty ? 'Unsaved changes' : 'All changes saved')}
          </div>
          <div className="text-xs font-semibold">Status: {form.lifecycleStatus === 'published' ? 'Published' : 'Draft'}</div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveStep(step.id)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${activeStep === step.id
                  ? 'bg-sky-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
            >
              {step.label}
            </button>
          ))}
        </div>

        <div className="mt-2 text-xs text-slate-500 dark:text-gray-400">{stepMeta.description}</div>

        <div className="mt-6">
          {stepContent[activeStep]}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={stepIndex === 0}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={stepIndex === steps.length - 1}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Next
          </button>
        </div>

        {showPublishModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Publish Assessment</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Review summary and validation before publishing.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPublishModal(false)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Total Students</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-white">{assignedSummary.count}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{assignedSummary.newAccounts} new accounts</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Total Questions</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-white">{assessmentValidation.totalQuestions}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{assessmentValidation.codingQuestions} coding</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Coding Validation</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-white">
                    {assessmentValidation.codingQuestions - assessmentValidation.invalidCodingCount}/{assessmentValidation.codingQuestions} ready
                  </div>
                  {assessmentValidation.invalidCodingCount > 0 && (
                    <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-300">
                      {assessmentValidation.invalidCodingCount} not validated
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">New Accounts</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-white">{assignedSummary.newAccounts}</div>
                  <div className="mt-1 text-[11px] text-slate-500">Will be created on publish</div>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-xs text-slate-600 dark:text-gray-300">
                <div className={`rounded-lg border px-3 py-2 ${assessmentValidation.totalQuestions > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300'}`}>
                  At least one question required.
                </div>
                <div className={`rounded-lg border px-3 py-2 ${!assessmentValidation.emptySection ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300'}`}>
                  No empty sections.
                </div>
                <div className={`rounded-lg border px-3 py-2 ${assessmentValidation.invalidCodingCount === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300'}`}>
                  Coding questions must be published + validated.
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPublishModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDraftConfirm}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={handlePublishConfirm}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  Publish
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}


