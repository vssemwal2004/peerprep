
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { ArrowLeft, ClipboardList, Save, Send, AlertCircle, Plus } from 'lucide-react';
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

const steps = [
  { id: 'basic', label: 'Basic Info', description: 'Title, description, instructions.' },
  { id: 'target', label: 'Target Students', description: 'Choose audience and upload or select.' },
  { id: 'schedule', label: 'Schedule', description: 'Timing, duration, limits.' },
  { id: 'sections', label: 'Sections & Questions', description: 'Build assessment sections.' },
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
    attemptLimit: 1,
    targetMode: 'all',
    sendEmail: true,
    lifecycleStatus: 'draft',
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

  const autoSaveRef = useRef(null);
  const draftLoadedRef = useRef(false);
  const isSavingRef = useRef(false);
  const assessmentKey = currentId || 'new';

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
        questions: [clonedQuestion],
      });
    });

    return nextSections;
  };

  const handleOpenCodingEditor = async (sectionIndex, questionIndex) => {
    const section = sections[sectionIndex];
    const question = section?.questions?.[questionIndex];
    if (!question) return;

    if (currentId && dirty) {
      await saveDraft(true);
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
      assessment: assessmentKey,
      section: String(sectionIndex),
      question: String(questionIndex),
      return: returnTo,
    });
    navigate(`${rolePrefix}/assessment/coding-question/${editorId}?${query.toString()}`);
  };

  const handleOpenProblemLibrary = async () => {
    if (currentId && dirty) {
      await saveDraft(true);
    }
    saveAssessmentDraft(assessmentKey, {
      form,
      sections,
      selectedStudents,
      csvState,
      version,
    });
    const returnTo = currentId ? `${rolePrefix}/assessment/${currentId}/edit` : `${rolePrefix}/assessment/create`;
    const query = new URLSearchParams({
      mode: 'select',
      assessment: assessmentKey,
      return: returnTo,
    });
    navigate(`${rolePrefix}/library?${query.toString()}`);
  };

  useEffect(() => {
    if (id || draftLoadedRef.current) return;
    const draft = loadAssessmentDraft(assessmentKey);
    if (draft) {
      setForm((prev) => ({ ...prev, ...(draft.form || {}) }));
      setSections(Array.isArray(draft.sections) ? draft.sections : []);
      setSelectedStudents(Array.isArray(draft.selectedStudents) ? draft.selectedStudents : []);
      setCsvState(draft.csvState || emptyCsvState);
      if (draft.version) setVersion(draft.version);
    }
    draftLoadedRef.current = true;
  }, [assessmentKey, id]);

  useEffect(() => {
    let mounted = true;
    const loadStudents = async () => {
      try {
        const data = await api.listAllStudents('', 'asc');
        if (!mounted) return;
        setAllStudents(data.students || []);
      } catch {
        if (!mounted) return;
        setAllStudents([]);
      }
    };
    loadStudents();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!id) return;
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
        setForm((prev) => ({
          ...prev,
          title: assessment.title || '',
          description: assessment.description || '',
          instructions: assessment.instructions || '',
          startTime: assessment.startTime ? toLocalIsoMinutes(assessment.startTime) : '',
          endTime: assessment.endTime ? toLocalIsoMinutes(assessment.endTime) : '',
          duration: assessment.duration || 60,
          allowLateSubmission: Boolean(assessment.allowLateSubmission),
          attemptLimit: assessment.attemptLimit || 1,
          targetMode: resolvedTargetMode,
          lifecycleStatus: assessment.lifecycleStatus || 'draft',
          sendEmail: true,
        }));
        setVersion(assessment.version || 1);
        if (resolvedTargetMode === 'csv') {
          setCsvState({
            file: null,
            rows: draftAssigned,
            errors: [],
            summary: draftAssigned.length ? `Draft loaded with ${draftAssigned.length} row(s). Revalidate before publish.` : '',
          });
          setSelectedStudents([]);
        } else if (resolvedTargetMode === 'individual') {
          if (isDraft && draftAssigned.length) {
            setSelectedStudents(draftAssigned);
          } else {
            setSelectedStudents(Array.isArray(assessment.assignedStudents) ? assessment.assignedStudents : []);
          }
          setCsvState(emptyCsvState);
        } else {
          setSelectedStudents([]);
          setCsvState(emptyCsvState);
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
        let mergedSections = problemSelections.length
          ? problemSelections.reduce((acc, selection) => addProblemsToSection(acc, selection.sectionIndex, selection.problems || []), mappedSections)
          : mappedSections;
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

  useEffect(() => {
    if (!assessmentKey) return;
    saveAssessmentDraft(assessmentKey, {
      form,
      sections,
      selectedStudents,
      csvState,
      version,
    });
  }, [assessmentKey, form, sections, selectedStudents, csvState, version]);

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

      // Persist immediately so navigation/remount doesn't lose the selection.
      saveAssessmentDraft(assessmentKey, {
        form,
        sections: next,
        selectedStudents,
        csvState,
        version,
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
      attemptLimit: form.attemptLimit || 1,
      targetType: normalizedTargetType,
      draftTargetMode: form.targetMode,
      assignedStudents: form.targetMode === 'all' ? [] : assignedStudents,
      sections: normalizedSections,
      lifecycleStatus,
      sendEmail: form.sendEmail,
    };
  };

  const saveDraft = async (silent = false, redirect = false) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setAutoSaveStatus('Saving draft...');
    const payload = buildPayload('draft');
    try {
      if (currentId) {
        await api.updateAssessment(currentId, payload);
        if (!silent && !redirect) toast.success('Draft updated');
      } else {
        const response = await api.createAssessment(payload);
        const newId = response.assessmentId;
        setCurrentId(newId);
        if (!redirect) {
          navigate(`${rolePrefix}/assessment/${newId}/edit`, { replace: true });
        }
        if (!silent && !redirect) toast.success('Draft created');
      }
      setDirty(false);
      setAutoSaveStatus('Draft saved');
      if (redirect) {
        toast.success('Draft saved');
        clearAssessmentDraft(assessmentKey);
        navigate(`${rolePrefix}/assessment`);
      }
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
      if (currentId) {
        await api.updateAssessment(currentId, payload);
      } else {
        await api.createAssessment(payload);
      }
      toast.success('Assessment published');
      clearAssessmentDraft(assessmentKey);
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
    await saveDraft(false, true);
    setShowPublishModal(false);
  };

  useEffect(() => {
    if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    autoSaveRef.current = setInterval(() => {
      if (!dirty) return;
      saveDraft(true);
    }, 20000);
    return () => clearInterval(autoSaveRef.current);
  }, [dirty, currentId, form, sections, csvState, selectedStudents]);

  const stepIndex = steps.findIndex((step) => step.id === activeStep);
  const stepMeta = steps[stepIndex] || steps[0];

  const stepContent = {
    basic: (
      <SectionCard title="Basic Information" subtitle="Define core details for the assessment.">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Title</label>
            <input
              value={form.title}
              onChange={(e) => updateForm({ title: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              placeholder="Assessment title"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Short Description</label>
            <input
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              placeholder="Brief summary for admins"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-500 dark:text-gray-400">Instructions (Rich Text)</label>
            <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <RichTextEditor
                value={form.instructions}
                onChange={(content) => updateForm({ instructions: content })}
                rows={10}
                placeholder="Provide instructions, policies, and rules for students."
              />
            </div>
          </div>
        </div>
      </SectionCard>
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
      <SectionCard title="Schedule & Limits" subtitle="Define timing, duration, and attempt rules.">
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
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Attempt Limit</label>
            <input
              type="number"
              min="1"
              value={form.attemptLimit}
              onChange={(e) => updateForm({ attemptLimit: Number(e.target.value) })}
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
      <SectionCard title="Sections & Questions" subtitle="Create structured sections with rich question builders.">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-gray-100">Question Library</div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-gray-400">
              Reuse questions across all types and let the builder group them into sections automatically.
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleOpenProblemLibrary()}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Questions from Library
          </button>
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
      </SectionCard>
    ),
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
              onClick={() => saveDraft(false, true)}
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
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                activeStep === step.id
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


