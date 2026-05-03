
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Maximize,
  Monitor,
  Pin,
  PinOff,
  ShieldCheck,
  Video,
} from 'lucide-react';
import CodeEditor from './CodeEditor';
import { RichTextPreview } from '../admin/compiler/CompilerContentPreview';
import { getCodeValidationMessage, getStarterCodeForLanguage } from './problemUtils';

const formatTime = (ms) => {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const buildSampleTestCases = (codingData = {}) => {
  const list = codingData.sampleTestCases || codingData.testCases || [];
  if (!Array.isArray(list)) return [];
  return list.map((testCase, index) => ({
    id: testCase.id || `sample-${index + 1}`,
    kind: 'sample',
    input: testCase.input ?? '',
    expectedOutput: testCase.output ?? testCase.expectedOutput ?? '',
  }));
};

export default function AssessmentAttempt() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [assessment, setAssessment] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [answersMap, setAnswersMap] = useState({});
  const [markedMap, setMarkedMap] = useState({});
  const [activeSection, setActiveSection] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [fullscreenExits, setFullscreenExits] = useState(0);
  const [copyPasteCount, setCopyPasteCount] = useState(0);
  const [cameraFlags, setCameraFlags] = useState(0);
  const [violations, setViolations] = useState([]);
  const [testCaseMap, setTestCaseMap] = useState({});
  const [activeTestCaseMap, setActiveTestCaseMap] = useState({});
  const [phase, setPhase] = useState('validation');
  const [validationStep, setValidationStep] = useState(1);
  const [validationState, setValidationState] = useState({
    fullscreen: false,
    environment: false,
    camera: false,
    face: false,
    final: false,
  });
  const [validationMessage, setValidationMessage] = useState('');
  const [faceStatus, setFaceStatus] = useState('idle');
  const [isPaused, setIsPaused] = useState(false);
  const [allowedEndTime, setAllowedEndTime] = useState(null);
  const [violationMessage, setViolationMessage] = useState('');
  const [activeConsoleTab, setActiveConsoleTab] = useState('result');
  const [codeResultMap, setCodeResultMap] = useState({});
  const [isRunningMap, setIsRunningMap] = useState({});
  const [isSubmittingMap, setIsSubmittingMap] = useState({});
  const [runInputUsedMap, setRunInputUsedMap] = useState({});
  const [rulesCountdown, setRulesCountdown] = useState(30);
  const [rulesReady, setRulesReady] = useState(false);
  const [hasSeenRules, setHasSeenRules] = useState(false);
  const [rulesBlocks, setRulesBlocks] = useState([]);
  const [rulesTitle, setRulesTitle] = useState('Assessment Rules');
  const [rulesLoading, setRulesLoading] = useState(false);
  const [cameraIndicator, setCameraIndicator] = useState('idle');
  const [detectedTabs, setDetectedTabs] = useState([]);
  const [securityNotice, setSecurityNotice] = useState('');
  const [leftWidth, setLeftWidth] = useState(420);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [navTypeFilter, setNavTypeFilter] = useState('all');
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const validationVideoRef = useRef(null);
  const monitorVideoRef = useRef(null);
  const monitorCanvasRef = useRef(null);
  const splitContainerRef = useRef(null);
  const problemPaneRef = useRef(null);
  const editorPaneRef = useRef(null);
  const dragFrameRef = useRef(null);
  const streamRef = useRef(null);
  const lastViolationRef = useRef(0);
  const lastDuplicateTabViolationRef = useRef(0);
  const lastIsCodingRef = useRef(false);
  const fullscreenExitTimerRef = useRef(null);
  const idleTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const tabInstanceIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const rulesSeenStorageKey = `peerprep_assessment_rules_seen:${id}`;

  const answerKey = (sectionIndex, questionIndex) => `${sectionIndex}-${questionIndex}`;
  const isSubmitted = submission?.status === 'submitted';
  const secureActive = phase === 'active' && !isSubmitted;
  const securitySettings = assessment?.settings || {};
  const fullscreenRequired = Boolean(securitySettings.enableFullscreen);
  const cameraRequired = Boolean(securitySettings.cameraMonitoring);
  const tabGuardEnabled = Boolean(securitySettings.tabSwitchDetection);
  const copyBlockEnabled = Boolean(securitySettings.disableCopyPaste);
  const preventMultipleTabs = Boolean(securitySettings.preventMultipleTabs);
  const blockRightClick = copyBlockEnabled && securitySettings.blockRightClick !== false;
  const tabSwitchLimit = Number(securitySettings.tabSwitchLimit || 0);
  const tabSwitchWarnAt = Number(securitySettings.tabSwitchWarnAt || 1);
  const tabSwitchAction = securitySettings.tabSwitchAction || 'warn';
  const autoSubmitOnEnd = securitySettings.autoSubmitOnEnd !== false;
  const restrictNavigation = Boolean(securitySettings.restrictNavigation);
  const allowSectionReview = securitySettings.allowSectionReview !== false;
  const fullscreenTimeoutSec = Number(securitySettings.fullscreenTimeoutSec || 0);
  const idleDetection = Boolean(securitySettings.idleDetection);
  const idleThresholdMs = Math.max(1, Number(securitySettings.idleThresholdMin || 5)) * 60 * 1000;
  const idleAction = securitySettings.idleAction || 'warn';
  const finalRules = useMemo(() => {
    const rules = [];
    if (fullscreenRequired) rules.push({ type: 'bullet', text: 'Fullscreen mode must remain active during the test.' });
    if (tabGuardEnabled) rules.push({ type: 'bullet', text: `Tab switching is monitored${tabSwitchLimit ? ` with a limit of ${tabSwitchLimit}` : ''}.` });
    if (cameraRequired) rules.push({ type: 'bullet', text: 'Camera monitoring must remain enabled and your face should stay visible.' });
    if (copyBlockEnabled) rules.push({ type: 'bullet', text: 'Copy, paste, print, page source, and restricted shortcuts are blocked.' });
    if (preventMultipleTabs) rules.push({ type: 'bullet', text: 'Only one assessment tab may remain open.' });
    if (securitySettings.randomShuffle) rules.push({ type: 'bullet', text: 'Questions may appear in a randomized order.' });
    if (securitySettings.autoSubmitOnEnd) rules.push({ type: 'bullet', text: 'The test auto-submits when the timer ends.' });
    if (securitySettings.restrictNavigation) rules.push({ type: 'bullet', text: 'Backward navigation may be restricted by the assessment rules.' });
    return rules;
  }, [fullscreenRequired, tabGuardEnabled, tabSwitchLimit, cameraRequired, copyBlockEnabled, preventMultipleTabs, securitySettings]);
  const currentSectionForLayout = assessment?.sections?.[activeSection];
  const isCodingForLayout = currentSectionForLayout?.type === 'coding';

  const answersArray = useMemo(() => (
    Object.entries(answersMap).map(([key, value]) => {
      const [sectionIndex, questionIndex] = key.split('-').map(Number);
      return { sectionIndex, questionIndex, ...value };
    })
  ), [answersMap]);
  const flatQuestions = useMemo(() => {
    const list = [];
    (assessment?.sections || []).forEach((sec, secIdx) => {
      (sec.questions || []).forEach((question, qIdx) => {
        list.push({ sectionIndex: secIdx, questionIndex: qIdx, section: sec, question });
      });
    });
    return list;
  }, [assessment]);

  const sectionStarts = useMemo(() => {
    let count = 0;
    return (assessment?.sections || []).map((sec) => {
      const start = count;
      count += sec.questions?.length || 0;
      return start;
    });
  }, [assessment]);

  const currentFlatIndex = useMemo(() => (
    flatQuestions.findIndex((item) => item.sectionIndex === activeSection && item.questionIndex === activeQuestion)
  ), [flatQuestions, activeSection, activeQuestion]);

  const totalQuestions = flatQuestions.length;
  const currentQuestionNumber = currentFlatIndex >= 0 ? currentFlatIndex + 1 : 1;
  const hasPrevQuestion = currentFlatIndex > 0;
  const hasNextQuestion = currentFlatIndex >= 0 && currentFlatIndex < totalQuestions - 1;
  const hasAllowedPrevQuestion = hasPrevQuestion && (!restrictNavigation || allowSectionReview);

  const questionStatus = useCallback((secIdx, qIdx) => {
    const key = `${secIdx}-${qIdx}`;
    const value = answersMap[key] || {};
    if (markedMap[key]) return 'review';
    const section = assessment?.sections?.[secIdx];
    if (!section) return 'unanswered';
    if (section.type === 'mcq') {
      return value.answer !== undefined && value.answer !== null ? 'answered' : 'unanswered';
    }
    if (section.type === 'coding') {
      return value.code && String(value.code).trim().length > 0 ? 'answered' : 'unanswered';
    }
    return value.answer && String(value.answer).trim().length > 0 ? 'answered' : 'unanswered';
  }, [answersMap, markedMap, assessment]);

  const progressCounts = useMemo(() => {
    let answered = 0;
    let review = 0;
    let unanswered = 0;
    flatQuestions.forEach(({ sectionIndex, questionIndex }) => {
      const key = answerKey(sectionIndex, questionIndex);
      if (markedMap[key]) {
        review += 1;
        return;
      }
      const status = questionStatus(sectionIndex, questionIndex);
      if (status === 'answered') answered += 1;
      else unanswered += 1;
    });
    return {
      total: totalQuestions,
      answered,
      review,
      unanswered,
    };
  }, [flatQuestions, markedMap, totalQuestions, questionStatus]);
  const totalViolations = tabSwitches + fullscreenExits + cameraFlags + copyPasteCount;

  const clampLeftWidth = (value) => {
    if (!splitContainerRef.current) return value;
    const containerWidth = splitContainerRef.current.getBoundingClientRect().width;
    const min = 280;
    const max = Math.max(min + 160, Math.floor(containerWidth * 0.6));
    return Math.min(max, Math.max(min, value));
  };

  const handleSave = useCallback(async () => {
    if (!assessment || isSubmitted || phase !== 'active') return;
    setSaving(true);
    try {
      await api.submitStudentAssessment({
        assessmentId: assessment._id,
        answers: answersArray,
        status: 'in_progress',
        tabSwitches,
        fullscreenExits,
        copyPasteCount,
        cameraFlags,
        violations,
      });
    } catch (err) {
      toast.error(err.message || 'Auto-save failed');
    } finally {
      setSaving(false);
    }
  }, [assessment, isSubmitted, answersArray, phase, tabSwitches, fullscreenExits, copyPasteCount, cameraFlags, violations, toast]);

  const handleSubmit = useCallback(async (auto = false) => {
    if (!assessment) return;
    setSaving(true);
    try {
      await api.submitStudentAssessment({
        assessmentId: assessment._id,
        answers: answersArray,
        status: 'submitted',
        tabSwitches,
        fullscreenExits,
        copyPasteCount,
        cameraFlags,
        violations,
      });
      toast.success(auto ? 'Time is up. Assessment auto-submitted.' : 'Assessment submitted successfully');
      navigate('/student/assessments');
    } catch (err) {
      toast.error(err.message || 'Failed to submit assessment');
    } finally {
      setSaving(false);
    }
  }, [assessment, answersArray, tabSwitches, fullscreenExits, copyPasteCount, cameraFlags, violations, toast, navigate]);

  const recordViolation = useCallback(async (type, message, meta = {}) => {
    if (isSubmitted || !assessment?._id) return;
    if (!['tab_switch', 'fullscreen_exit', 'camera_loss', 'copy_paste', 'context_menu', 'other'].includes(type)) return;
    const now = Date.now();
    if (type !== 'tab_switch') {
      if (now - lastViolationRef.current < 3000) return;
      lastViolationRef.current = now;
    }

    setViolations((prev) => ([
      ...prev,
      { type, message, at: new Date().toISOString(), meta },
    ]));
    if (type === 'tab_switch') {
      setTabSwitches((prev) => prev + 1);
    }
    if (type === 'fullscreen_exit') {
      setFullscreenExits((prev) => prev + 1);
    }
    if (type === 'camera_loss') {
      setCameraFlags((prev) => prev + 1);
    }
    if (type === 'copy_paste' || type === 'context_menu') {
      setCopyPasteCount((prev) => prev + 1);
    }
    setViolationMessage(message);
    setSecurityNotice(message);

    const projectedTabSwitches = type === 'tab_switch' ? tabSwitches + 1 : tabSwitches;
    const shouldPauseForTabSwitch = type === 'tab_switch'
      && tabSwitchAction !== 'warn'
      && (!tabSwitchLimit || projectedTabSwitches >= tabSwitchLimit);
    const shouldPauseForFullscreen = type === 'fullscreen_exit';
    const shouldPauseForBlockedAction = (type === 'copy_paste' || type === 'context_menu') && securitySettings.copyPasteAction === 'pause';
    if (shouldPauseForTabSwitch || shouldPauseForFullscreen || shouldPauseForBlockedAction) {
      setIsPaused(true);
      setPhase('violation');
    } else if (type !== 'camera_loss') {
      toast.info(message);
    }
    try {
      const result = await api.logStudentAssessmentViolation(assessment._id, { type, message, meta });
      if (typeof result?.tabSwitches === 'number') setTabSwitches(result.tabSwitches);
      if (typeof result?.fullscreenExits === 'number') setFullscreenExits(result.fullscreenExits);
      if (typeof result?.cameraFlags === 'number') setCameraFlags(result.cameraFlags);
      if (typeof result?.copyPasteCount === 'number') setCopyPasteCount(result.copyPasteCount);
      if (result?.autoSubmit) {
        toast.error('Violation limit reached. Assessment auto-submitted.');
        await handleSubmit(true);
        return;
      }
    } catch {
      // The local violation list is still saved by the periodic assessment save.
    }
    setTimeout(() => {
      handleSave();
    }, 0);
  }, [isSubmitted, assessment?._id, tabSwitches, tabSwitchAction, tabSwitchLimit, securitySettings.copyPasteAction, handleSave, handleSubmit, toast]);

  const handleResizeStart = (event) => {
    if (!splitContainerRef.current) return;
    event.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
    const startX = event.clientX;
    const startWidth = clampLeftWidth(leftWidth);
    let nextWidth = startWidth;

    const schedule = (value) => {
      nextWidth = clampLeftWidth(value);
      if (dragFrameRef.current) return;
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        setLeftWidth(nextWidth);
      });
    };

    const handlePointerMove = (moveEvent) => {
      schedule(startWidth + (moveEvent.clientX - startX));
    };

    const handlePointerUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (dragFrameRef.current) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const data = await api.getStudentAssessmentRules();
      const rules = data?.rules || {};
      const blocks = Array.isArray(rules.blocks) ? rules.blocks : [];
      setRulesBlocks(blocks);
      if (rules.title) setRulesTitle(rules.title);
    } catch {
      setRulesBlocks([]);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const loadAssessment = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getStudentAssessment(id);
      const serverTime = new Date(data.serverTime).getTime();
      const allowedEnd = new Date(data.allowedEnd).getTime();
      const localNow = Date.now();
      setOffset(serverTime - localNow);
      setTimeLeft(allowedEnd - serverTime);
      setAllowedEndTime(allowedEnd);
      setAssessment(data.assessment);
      setSubmission(data.submission);
      const locallySawRules = localStorage.getItem(rulesSeenStorageKey) === '1';
      setHasSeenRules(Boolean(data.submission?.startedAt) || locallySawRules);

      const initialAnswers = {};
      (data.submission?.answers || []).forEach((ans) => {
        initialAnswers[answerKey(ans.sectionIndex, ans.questionIndex)] = {
          answer: ans.answer,
          language: ans.language,
          code: ans.code,
        };
      });
      setAnswersMap(initialAnswers);
      setTabSwitches(data.submission?.tabSwitches || 0);
      setFullscreenExits(data.submission?.fullscreenExits || 0);
      setCopyPasteCount(data.submission?.copyPasteCount || 0);
      setCameraFlags(data.submission?.cameraFlags || 0);
      setViolations(data.submission?.violations || []);

      if (data.submission?.status === 'submitted' || (data.submission?.status === 'in_progress' && data.submission?.startedAt)) {
        setPhase('active');
      } else {
        setPhase('validation');
      }
      setIsPaused(false);
    } catch (err) {
      setError(err.message || 'Unable to load assessment');
    } finally {
      setLoading(false);
    }
  }, [id, rulesSeenStorageKey]);

  useEffect(() => {
    loadAssessment();
    loadRules();
  }, [loadAssessment, loadRules]);

  useEffect(() => {
    if (!assessment?._id) return undefined;
    const key = `peerprep_assessment_tabs:${assessment._id}`;
    const instanceId = tabInstanceIdRef.current;

    const readTabs = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '{}');
        const now = Date.now();
        const activeEntries = Object.entries(parsed)
          .filter(([, value]) => value?.lastSeen && now - value.lastSeen < 6000)
          .map(([id, value]) => ({
            id,
            title: value.title || 'Assessment tab',
            path: value.path || '',
            lastSeen: value.lastSeen,
            current: id === instanceId,
          }));
        setDetectedTabs(activeEntries.sort((a, b) => Number(b.current) - Number(a.current)));
        return Object.fromEntries(activeEntries.map((entry) => [entry.id, {
          title: entry.title,
          path: entry.path,
          lastSeen: entry.lastSeen,
        }]));
      } catch {
        setDetectedTabs([{ id: instanceId, title: assessment.title || 'Assessment tab', path: window.location.pathname, lastSeen: Date.now(), current: true }]);
        return {};
      }
    };

    const writeHeartbeat = () => {
      const active = readTabs();
      active[instanceId] = {
        title: assessment.title || 'Assessment tab',
        path: window.location.pathname,
        lastSeen: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(active));
      readTabs();
    };

    writeHeartbeat();
    const interval = setInterval(writeHeartbeat, 2000);
    const handleStorage = (event) => {
      if (event.key === key) readTabs();
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
      try {
        const active = JSON.parse(localStorage.getItem(key) || '{}');
        delete active[instanceId];
        localStorage.setItem(key, JSON.stringify(active));
      } catch {
        // Ignore localStorage cleanup errors.
      }
    };
  }, [assessment?._id, assessment?.title]);

  useEffect(() => {
    if (!assessment) return;
    if (isCodingForLayout && !lastIsCodingRef.current) {
      setSidebarExpanded(false);
      setSidebarPinned(false);
    }
    if (!isCodingForLayout && lastIsCodingRef.current) {
      setSidebarExpanded(true);
      setSidebarPinned(false);
    }
    lastIsCodingRef.current = Boolean(isCodingForLayout);
    setNavTypeFilter((prev) => (prev === 'all' ? (isCodingForLayout ? 'coding' : 'mcq') : prev));
  }, [assessment, isCodingForLayout]);

  useEffect(() => {
    if (!isCodingForLayout) return;
    // When jumping between questions, ensure the new question content is visible.
    // (The problem pane is scrollable; without this it can appear like navigation failed.)
    requestAnimationFrame(() => {
      if (problemPaneRef.current) problemPaneRef.current.scrollTop = 0;
      if (editorPaneRef.current) editorPaneRef.current.scrollTop = 0;
    });
  }, [isCodingForLayout, activeSection, activeQuestion]);

  useEffect(() => {
    if (!assessment || !allowedEndTime || isPaused || phase !== 'active') return undefined;
    const timer = setInterval(() => {
      const now = Date.now() + offset;
      const startedAt = submission?.startedAt ? new Date(submission.startedAt).getTime() : now;
      const durationMs = assessment.duration * 60 * 1000;
      const cappedEnd = Math.min(allowedEndTime, startedAt + durationMs);
      const remaining = cappedEnd - now;
      setTimeLeft(remaining);
      if (remaining <= 0 && submission?.status !== 'submitted' && autoSubmitOnEnd) {
        handleSubmit(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [assessment, submission, offset, allowedEndTime, isPaused, phase, autoSubmitOnEnd, handleSubmit]);

  useEffect(() => {
    if (!secureActive || isSubmitted) return undefined;
    const interval = setInterval(() => {
      handleSave();
    }, 15000);
    return () => clearInterval(interval);
  }, [secureActive, isSubmitted, handleSave]);

  useEffect(() => {
    if (!secureActive || !tabGuardEnabled) return undefined;
    const handleVisibility = () => {
      if (document.hidden) {
        void recordViolation('tab_switch', 'Tab switch detected. Return to the assessment window.', {
          limit: tabSwitchLimit || null,
          warnAt: tabSwitchWarnAt || null,
          action: tabSwitchAction,
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [secureActive, tabGuardEnabled, tabSwitchLimit, tabSwitchWarnAt, tabSwitchAction, recordViolation]);

  useEffect(() => {
    if (!secureActive || !preventMultipleTabs) return;
    const duplicateCount = detectedTabs.filter((tab) => !tab.current).length;
    if (duplicateCount > 0 && Date.now() - lastDuplicateTabViolationRef.current > 8000) {
      lastDuplicateTabViolationRef.current = Date.now();
      void recordViolation('tab_switch', 'Duplicate assessment tab detected. Close all other assessment tabs.', {
        duplicateCount,
        source: 'duplicate_tab_guard',
      });
    }
  }, [secureActive, preventMultipleTabs, detectedTabs, recordViolation]);

  useEffect(() => {
    if (!secureActive || !copyBlockEnabled) return undefined;
    const handleCopy = (event) => {
      event.preventDefault();
      void recordViolation('copy_paste', 'Copy action blocked by assessment rules.');
    };
    const handlePaste = (event) => {
      event.preventDefault();
      void recordViolation('copy_paste', 'Paste action blocked by assessment rules.');
    };
    const handleContextMenu = (event) => {
      if (!blockRightClick) return;
      event.preventDefault();
      void recordViolation('context_menu', 'Right-click menu blocked by assessment rules.');
    };
    const handleKeydown = (event) => {
      const key = event.key?.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && ['c', 'v', 'x', 'a', 's', 'p', 'u', 'r'].includes(key)) {
        event.preventDefault();
        void recordViolation('copy_paste', 'Restricted keyboard shortcut blocked.');
      }
    };
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [secureActive, copyBlockEnabled, blockRightClick, recordViolation]);

  useEffect(() => {
    if (!secureActive || !idleDetection) return undefined;
    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const checkIdle = () => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor < idleThresholdMs) return;
      lastActivityRef.current = Date.now();
      const message = 'No activity detected. Please stay active in the assessment window.';
      void recordViolation('other', message, {
        source: 'idle_detection',
        idleForMs: idleFor,
        action: idleAction,
      });
      if (idleAction === 'pause') {
        setIsPaused(true);
        setPhase('violation');
      }
      if (idleAction === 'autosubmit') {
        void handleSubmit(true);
      }
    };
    ['mousemove', 'keydown', 'click', 'scroll', 'pointerdown', 'touchstart'].forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });
    idleTimerRef.current = setInterval(checkIdle, 5000);
    return () => {
      ['mousemove', 'keydown', 'click', 'scroll', 'pointerdown', 'touchstart'].forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    };
  }, [secureActive, idleDetection, idleThresholdMs, idleAction, handleSubmit, recordViolation]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setValidationState((prev) => ({
        ...prev,
        fullscreen: Boolean(document.fullscreenElement),
      }));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!secureActive || !fullscreenRequired) return undefined;
    const handleFullscreenEnforcement = () => {
      if (!document.fullscreenElement) {
        void recordViolation('fullscreen_exit', 'Fullscreen mode is required during the assessment.', {
          timeoutSec: fullscreenTimeoutSec || null,
        });
        if (fullscreenTimeoutSec > 0) {
          if (fullscreenExitTimerRef.current) clearTimeout(fullscreenExitTimerRef.current);
          fullscreenExitTimerRef.current = setTimeout(() => {
            if (!document.fullscreenElement && !isSubmitted) {
              void handleSubmit(true);
            }
          }, fullscreenTimeoutSec * 1000);
        }
      } else if (fullscreenExitTimerRef.current) {
        clearTimeout(fullscreenExitTimerRef.current);
        fullscreenExitTimerRef.current = null;
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenEnforcement);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenEnforcement);
      if (fullscreenExitTimerRef.current) clearTimeout(fullscreenExitTimerRef.current);
    };
  }, [secureActive, fullscreenRequired, fullscreenTimeoutSec, isSubmitted, handleSubmit, recordViolation]);

  useEffect(() => {
    if (phase !== 'validation') return;
    setValidationStep(1);
    setValidationState({
      fullscreen: Boolean(document.fullscreenElement),
      environment: false,
      camera: !cameraRequired || Boolean(streamRef.current),
      face: !cameraRequired,
      final: false,
    });
    setValidationMessage('');
    setFaceStatus(streamRef.current ? 'detecting' : 'idle');
  }, [phase, cameraRequired]);

  useEffect(() => {
    if (phase !== 'rules') return undefined;
    if (hasSeenRules) {
      setRulesCountdown(0);
      setRulesReady(true);
      return undefined;
    }
    setRulesCountdown(30);
    setRulesReady(false);
    const timer = setInterval(() => {
      setRulesCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          localStorage.setItem(rulesSeenStorageKey, '1');
          setHasSeenRules(true);
          setRulesReady(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, hasSeenRules, rulesSeenStorageKey]);

  useEffect(() => {
    if (validationState.camera) return;
    setFaceStatus('idle');
  }, [validationState.camera]);

  useEffect(() => {
    if (!securityNotice) return undefined;
    const timer = setTimeout(() => setSecurityNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [securityNotice]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!secureActive || !cameraRequired) {
      setCameraIndicator('idle');
      return undefined;
    }
    let intervalId;
    const video = monitorVideoRef.current;
    const canvas = monitorCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (streamRef.current) {
      attachStream(streamRef.current);
    }
    const sampleFrame = () => {
      if (!streamRef.current || !video || !canvas || !ctx) {
        setCameraIndicator('warning');
        void recordViolation('camera_loss', 'Camera feed is not available.');
        return;
      }
      if (video.readyState < 2) return;
      const width = 160;
      const height = 90;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(video, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const value = (data[i] + data[i + 1] + data[i + 2]) / 3;
        sum += value;
        sumSq += value * value;
        count += 1;
      }
      if (!count) return;
      const avg = sum / count;
      const variance = sumSq / count - avg * avg;
      const detected = variance > 120;
      setCameraIndicator(detected ? 'normal' : 'warning');
      if (!detected) {
        void recordViolation('camera_loss', 'Face or human presence was not clearly detected.');
      }
    };
    intervalId = setInterval(sampleFrame, 1200);
    sampleFrame();
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [secureActive, cameraRequired, recordViolation]);

  const updateAnswer = (sectionIndex, questionIndex, value) => {
    setAnswersMap((prev) => ({
      ...prev,
      [answerKey(sectionIndex, questionIndex)]: { ...prev[answerKey(sectionIndex, questionIndex)], ...value },
    }));
  };

  const toggleMarkForReview = () => {
    const key = answerKey(activeSection, activeQuestion);
    setMarkedMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const requestFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
      return document.documentElement.requestFullscreen().catch(() => {
        toast.info('Fullscreen is not available on this device.');
      });
    }
    return Promise.resolve();
  };

  const attachStream = (stream) => {
    const videos = [validationVideoRef.current, monitorVideoRef.current];
    videos.forEach((video) => {
      if (video && video.srcObject !== stream) {
        video.srcObject = stream;
        video.play().catch(() => {});
      }
    });
  };

  const ensureCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    if (streamRef.current) {
      attachStream(streamRef.current);
      return true;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      attachStream(stream);
      return true;
    } catch {
      return false;
    }
  };

  const verifyHumanPresence = async () => {
    const video = validationVideoRef.current;
    if (!video) return false;
    const waitForFrame = () => new Promise((resolve) => {
      if (video.readyState >= 2) {
        resolve(true);
        return;
      }
      const timeout = setTimeout(() => resolve(false), 2500);
      video.onloadeddata = () => {
        clearTimeout(timeout);
        resolve(true);
      };
    });
    const ready = await waitForFrame();
    if (!ready) return false;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const width = 160;
    const height = 90;
    canvas.width = width;
    canvas.height = height;

    let detectedFrames = 0;
    for (let frame = 0; frame < 3; frame += 1) {
      ctx.drawImage(video, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const value = (data[i] + data[i + 1] + data[i + 2]) / 3;
        sum += value;
        sumSq += value * value;
        count += 1;
      }
      const avg = count ? sum / count : 0;
      const variance = count ? (sumSq / count) - (avg * avg) : 0;
      if (variance > 120) detectedFrames += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return detectedFrames >= 2;
  };

  const handleEnableFullscreen = async () => {
    if (!fullscreenRequired) {
      setValidationState((prev) => ({ ...prev, fullscreen: true }));
      setValidationStep(4);
      return;
    }
    await requestFullscreen();
    const fullscreenOk = Boolean(document.fullscreenElement);
    setValidationState((prev) => ({ ...prev, fullscreen: fullscreenOk }));
    if (fullscreenOk) {
      setValidationStep(4);
      setValidationMessage('');
    }
  };

  const handleEnvironmentCheck = () => {
    const focusOk = document.hasFocus() && !document.hidden;
    const duplicateAssessmentTabs = detectedTabs.filter((tab) => !tab.current);
    const tabsOk = !preventMultipleTabs || duplicateAssessmentTabs.length === 0;
    const ok = focusOk && tabsOk;
    setValidationState((prev) => ({ ...prev, environment: ok }));
    if (ok) {
      setValidationMessage('');
      setValidationStep(2);
    } else if (!tabsOk) {
      setValidationMessage('Close duplicate assessment tabs before continuing. Browser security only allows this platform to detect PeerPrep assessment tabs, not every external tab or application.');
    } else {
      setValidationMessage('We could not confirm focus. Please close other tabs and return to this window.');
    }
  };

  const handleCameraCheck = async () => {
    if (!cameraRequired) {
      setValidationState((prev) => ({ ...prev, camera: true, face: true }));
      setFaceStatus('detected');
      setValidationStep(3);
      return;
    }
    const ok = await ensureCamera();
    setValidationState((prev) => ({ ...prev, camera: ok }));
    if (!ok) {
      setValidationMessage('Camera permission is required to proceed.');
    } else {
      setFaceStatus('detecting');
      const faceOk = await verifyHumanPresence();
      setValidationState((prev) => ({ ...prev, face: faceOk }));
      setFaceStatus(faceOk ? 'detected' : 'idle');
      if (faceOk) {
        setValidationMessage('');
        setValidationStep(3);
      } else {
        setValidationMessage('Camera is active, but human presence was not clearly detected. Please center your face and try again.');
      }
    }
  };

  const handleFinalCheck = () => {
    const fullscreenOk = !fullscreenRequired || Boolean(document.fullscreenElement);
    const focusOk = document.hasFocus() && !document.hidden;
    const tabsOk = !preventMultipleTabs || detectedTabs.filter((tab) => !tab.current).length === 0;
    const cameraOk = !cameraRequired || (validationState.camera && validationState.face);
    const ok = fullscreenOk && focusOk && tabsOk && cameraOk;
    setValidationState((prev) => ({
      ...prev,
      fullscreen: fullscreenOk,
      environment: focusOk && tabsOk,
      final: ok,
    }));
    if (ok) {
      setValidationMessage('');
    } else if (!tabsOk) {
      setValidationMessage('A duplicate assessment tab is still active. Close it and run the final check again.');
    } else {
      setValidationMessage('Please ensure all required focus, camera, and fullscreen checks are satisfied.');
    }
  };

  const startAssessment = async () => {
    if (!validationState.final) {
      toast.error('Complete the final system check before starting.');
      setPhase('validation');
      return;
    }
    try {
      if (fullscreenRequired) await requestFullscreen();
      if (cameraRequired) await ensureCamera();
      const data = await api.beginStudentAssessment(assessment._id);
      const serverTime = new Date(data.serverTime).getTime();
      const allowedEnd = new Date(data.allowedEnd).getTime();
      setOffset(serverTime - Date.now());
      setTimeLeft(allowedEnd - serverTime);
      setAllowedEndTime(allowedEnd);
      setSubmission(data.submission);
      setIsPaused(false);
      localStorage.setItem(rulesSeenStorageKey, '1');
      setHasSeenRules(true);
      setPhase('active');
    } catch (err) {
      toast.error(err.message || 'Unable to start assessment.');
    }
  };

  const handleRunCoding = () => {
    if (!assessment || isSubmitted) return;
    const section = assessment?.sections?.[activeSection];
    if (!section || section.type !== 'coding') return;
    const question = section?.questions?.[activeQuestion];
    const key = answerKey(activeSection, activeQuestion);
    const codingData = question?.problemDataSnapshot || question?.problemData || question?.coding?.problemData || question?.coding || {};
    const problemId = question?.problemId || question?.coding?.problemId || codingData?._id;
    if (!problemId) {
      toast.error('This coding question is missing its problem reference.');
      return;
    }
    const supported = codingData?.supportedLanguages?.length ? codingData.supportedLanguages : ['python'];
    const language = answersMap[key]?.language || supported[0];
    const sourceCode = answersMap[key]?.code || '';
    const validationMessage = getCodeValidationMessage(
      sourceCode,
      getStarterCodeForLanguage(codingData, language),
      'run',
    );
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    const baseTestCases = buildSampleTestCases(codingData);
    const testCases = testCaseMap[key] || baseTestCases;
    const activeTestCaseId = activeTestCaseMap[key] || testCases[0]?.id || null;
    const activeTestCase = testCases.find((entry) => String(entry.id) === String(activeTestCaseId)) || testCases[0];
    const runInput = activeTestCase?.input ?? '';

    setRunInputUsedMap((prev) => ({ ...prev, [key]: runInput }));
    setIsRunningMap((prev) => ({ ...prev, [key]: true }));

    api.runStudentProblem(problemId, {
      language,
      sourceCode,
      customInput: runInput,
      ...(activeTestCase?.expectedOutput !== null && activeTestCase?.expectedOutput !== undefined
        ? { expectedOutput: activeTestCase.expectedOutput }
        : {}),
      assessmentId: assessment?._id,
    }).then(async (queuedJob) => {
      let completedRun = queuedJob;
      if (queuedJob?.jobId) {
        toast.info('Run received. Waiting for execution result.');
        completedRun = await api.waitForExecutionResult(queuedJob.jobId, {
          intervalMs: 1000,
          timeoutMs: 2 * 60 * 1000,
        });
      }

      const response = completedRun?.result?.response || completedRun;
      setCodeResultMap((prev) => ({ ...prev, [key]: response }));
      setActiveConsoleTab('result');
      toast.success(`Run finished with status ${response.status || 'Completed'}`);

      if (activeTestCase?.kind === 'custom') {
        api.getStudentExpectedOutput(problemId, {
          language,
          customInput: runInput,
          assessmentId: assessment?._id,
        }).then((expected) => {
          if (expected && typeof expected.expectedOutput === 'string') {
            setTestCaseMap((prev) => {
              const existing = prev[key] || baseTestCases;
              const next = existing.map((entry) => (
                String(entry.id) === String(activeTestCase.id)
                  ? { ...entry, expectedOutput: expected.expectedOutput }
                  : entry
              ));
              return { ...prev, [key]: next };
            });
          }
        }).catch(() => {
          // Expected output is optional; ignore failures.
        });
      }
    }).catch((error) => {
      toast.error(error.message || 'Failed to run code.');
    }).finally(() => {
      setIsRunningMap((prev) => ({ ...prev, [key]: false }));
    });
  };

  const handleSubmitCoding = () => {
    if (!assessment || isSubmitted) return;
    const section = assessment?.sections?.[activeSection];
    if (!section || section.type !== 'coding') return;
    const question = section?.questions?.[activeQuestion];
    const key = answerKey(activeSection, activeQuestion);
    const codingData = question?.problemDataSnapshot || question?.problemData || question?.coding?.problemData || question?.coding || {};
    const problemId = question?.problemId || question?.coding?.problemId || codingData?._id;
    if (!problemId) {
      toast.error('This coding question is missing its problem reference.');
      return;
    }
    const supported = codingData?.supportedLanguages?.length ? codingData.supportedLanguages : ['python'];
    const language = answersMap[key]?.language || supported[0];
    const sourceCode = answersMap[key]?.code || '';
    const validationMessage = getCodeValidationMessage(
      sourceCode,
      getStarterCodeForLanguage(codingData, language),
      'submit',
    );
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setIsSubmittingMap((prev) => ({ ...prev, [key]: true }));

    api.submitStudentProblem(problemId, {
      language,
      sourceCode,
      assessmentId: assessment?._id,
    }).then(async (queuedJob) => {
      let completedSubmission = queuedJob;
      if (queuedJob?.jobId) {
        toast.info('Submission received. Waiting for final verdict.');
        completedSubmission = await api.waitForExecutionResult(queuedJob.jobId, {
          intervalMs: 1000,
          timeoutMs: 10 * 60 * 1000,
        });
      }

      const response = completedSubmission?.result?.response || completedSubmission;
      setCodeResultMap((prev) => ({ ...prev, [key]: response }));
      setActiveConsoleTab('result');
      toast.success(`Submission finished with verdict ${response.status || 'Completed'}`);
    }).catch((error) => {
      toast.error(error.message || 'Failed to submit code.');
    }).finally(() => {
      setIsSubmittingMap((prev) => ({ ...prev, [key]: false }));
    });
  };

  const handleResetCoding = () => {
    const key = answerKey(activeSection, activeQuestion);
    const section = assessment?.sections?.[activeSection];
    if (!section || section.type !== 'coding') return;
    setAnswersMap((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        code: '',
      },
    }));
  };

  const canNavigateToQuestion = (sectionIndex, questionIndex) => {
    if (!restrictNavigation) return true;
    const targetFlatIndex = flatQuestions.findIndex((item) => item.sectionIndex === sectionIndex && item.questionIndex === questionIndex);
    if (targetFlatIndex < 0) return false;
    if (targetFlatIndex >= currentFlatIndex) return true;
    return allowSectionReview && sectionIndex === activeSection;
  };

  const navigateToQuestion = (sectionIndex, questionIndex) => {
    if (!canNavigateToQuestion(sectionIndex, questionIndex)) {
      toast.info('Backward navigation is restricted for this assessment.');
      return false;
    }
    setActiveSection(sectionIndex);
    setActiveQuestion(questionIndex);
    return true;
  };

  const goToNextQuestion = () => {
    const sections = assessment?.sections || [];
    const currentSection = sections[activeSection];
    const totalInSection = currentSection?.questions?.length || 0;
    if (activeQuestion < totalInSection - 1) {
      setActiveQuestion((prev) => prev + 1);
      return;
    }
    if (activeSection < sections.length - 1) {
      setActiveSection((prev) => prev + 1);
      setActiveQuestion(0);
    }
  };

  const goToPrevQuestion = () => {
    const sections = assessment?.sections || [];
    if (activeQuestion > 0) {
      navigateToQuestion(activeSection, activeQuestion - 1);
      return;
    }
    if (activeSection > 0) {
      const prevSectionIndex = activeSection - 1;
      const prevSection = sections[prevSectionIndex];
      const prevCount = prevSection?.questions?.length || 1;
      navigateToQuestion(prevSectionIndex, Math.max(prevCount - 1, 0));
    }
  };

  const clearResponse = () => {
    const section = assessment?.sections?.[activeSection];
    const key = answerKey(activeSection, activeQuestion);
    if (!section) return;
    if (section.type === 'mcq') {
      setAnswersMap((prev) => ({
        ...prev,
        [key]: { ...prev[key], answer: undefined },
      }));
      return;
    }
    if (section.type === 'short' || section.type === 'one_line') {
      setAnswersMap((prev) => ({
        ...prev,
        [key]: { ...prev[key], answer: '' },
      }));
    }
  };

  const markForReviewAndNext = () => {
    const key = answerKey(activeSection, activeQuestion);
    setMarkedMap((prev) => ({ ...prev, [key]: true }));
    goToNextQuestion();
  };

  const saveAndNext = () => {
    void handleSave();
    goToNextQuestion();
  };

  if (loading) {
    return <div className="min-h-screen bg-white dark:bg-gray-900 pt-20 text-center text-slate-500">Loading assessment...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 pt-20">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!assessment) return null;

  const section = assessment.sections?.[activeSection];
  const question = section?.questions?.[activeQuestion];
  const isMarked = markedMap[answerKey(activeSection, activeQuestion)];
  const questionMarks = question?.marks ?? section?.marksPerQuestion ?? 0;
  const isCoding = section?.type === 'coding';
  const codingData = isCoding
    ? (question?.problemDataSnapshot || question?.problemData || question?.coding?.problemData || question?.coding || {})
    : null;
  const codingLanguages = isCoding
    ? (codingData?.supportedLanguages?.length ? codingData.supportedLanguages : ['python'])
    : [];
  const activeLanguage = isCoding
    ? (answersMap[answerKey(activeSection, activeQuestion)]?.language || codingLanguages[0])
    : '';
  const activeAnswerKey = answerKey(activeSection, activeQuestion);
  const codeResult = codeResultMap[activeAnswerKey] || null;
  const isRunning = Boolean(isRunningMap[activeAnswerKey]);
  const isSubmitting = Boolean(isSubmittingMap[activeAnswerKey]);
  const runInputUsed = runInputUsedMap[activeAnswerKey] ?? null;
  const currentSectionLabel = section?.sectionName || `Section ${activeSection + 1}`;
  const breadcrumbLabel = `${currentSectionLabel} > Question ${activeQuestion + 1}`;
  const fallbackRules = [
    { type: 'bullet', text: 'Fullscreen mode is required' },
    { type: 'bullet', text: 'Do not switch tabs during the test' },
    { type: 'bullet', text: 'Do not exit fullscreen once the test starts' },
    { type: 'bullet', text: 'Do not refresh the page' },
    { type: 'bullet', text: 'Do not use keyboard shortcuts' },
    { type: 'bullet', text: 'Complete the test in one session' },
  ];
  const assessmentInstructionRules = [
    ...(assessment.instructions ? [{ type: 'paragraph', text: assessment.instructions }] : []),
    ...((assessment.customInstructions || []).map((text) => ({ type: 'bullet', text }))),
  ];
  const effectiveRules = [
    ...assessmentInstructionRules,
    ...(rulesBlocks.length ? rulesBlocks : fallbackRules),
    ...finalRules,
  ];
  const showAssessmentWorkspace = phase === 'active' || isSubmitted;

  const questionNavigatorPanel = (
    (() => {
      const hasMcq = flatQuestions.some((item) => item.section?.type !== 'coding');
      const hasCoding = flatQuestions.some((item) => item.section?.type === 'coding');
      const effectiveFilter = navTypeFilter === 'all'
        ? (isCodingForLayout ? 'coding' : 'mcq')
        : navTypeFilter;
      const navItems = flatQuestions.filter((item) => {
        const kind = item.section?.type === 'coding' ? 'coding' : 'mcq';
        return effectiveFilter === 'coding' ? kind === 'coding' : kind === 'mcq';
      });

      const allowCollapse = Boolean(isCodingForLayout);
      const isCollapsed = allowCollapse && !sidebarExpanded;

      const togglePinned = () => {
        if (!allowCollapse) return;
        setSidebarPinned((prev) => {
          const nextPinned = !prev;
          setSidebarExpanded(nextPinned);
          return nextPinned;
        });
      };

      return (
        <aside
          onMouseEnter={() => {
            if (!allowCollapse || sidebarPinned) return;
            setSidebarExpanded(true);
          }}
          onMouseLeave={() => {
            if (!allowCollapse || sidebarPinned) return;
            setSidebarExpanded(false);
          }}
          className={`flex-none shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 w-full lg:min-h-0 lg:overflow-y-auto transition-all duration-200 ${
            isCollapsed
              ? 'p-1.5 lg:w-14 lg:min-w-[3.5rem]'
              : 'p-3 lg:w-72 lg:min-w-[18rem]'
          }`}
          aria-label="Assessment sidebar"
        >
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} gap-2`}> 
            {!isCollapsed && (
              <div className="text-sm font-semibold text-slate-800 dark:text-white">Navigator</div>
            )}
            {allowCollapse && (
              <button
                type="button"
                onClick={togglePinned}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                aria-label={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                title={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
              >
                {sidebarPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </button>
            )}
          </div>

          {isCollapsed ? (
            <div className="mt-2 flex flex-col items-center gap-3 text-[10px] text-slate-500">
              <div className="h-2 w-2 rounded-full bg-emerald-500" title="Answered" />
              <div className="h-2 w-2 rounded-full bg-rose-500" title="Not Answered" />
              <div className="h-2 w-2 rounded-full bg-purple-500" title="Marked" />
            </div>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {hasMcq && (
                  <button
                    type="button"
                    onClick={() => setNavTypeFilter('mcq')}
                    className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
                      effectiveFilter === 'mcq' ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    MCQ
                  </button>
                )}
                {hasCoding && (
                  <button
                    type="button"
                    onClick={() => setNavTypeFilter('coding')}
                    className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
                      effectiveFilter === 'coding' ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Coding
                  </button>
                )}
              </div>

              <div className="mt-3 grid grid-cols-5 gap-2">
                {navItems.map((item) => {
                  const status = questionStatus(item.sectionIndex, item.questionIndex);
                  const statusTone = status === 'answered'
                    ? 'bg-emerald-500 text-white'
                    : status === 'review'
                      ? 'bg-purple-500 text-white'
                      : 'bg-rose-500 text-white';
                  const isActive = item.sectionIndex === activeSection && item.questionIndex === activeQuestion;
                  const number = (sectionStarts[item.sectionIndex] || 0) + item.questionIndex + 1;
                  const canNavigate = canNavigateToQuestion(item.sectionIndex, item.questionIndex);
                  return (
                    <button
                      key={`nav-${item.sectionIndex}-${item.questionIndex}`}
                      type="button"
                      onClick={() => navigateToQuestion(item.sectionIndex, item.questionIndex)}
                      disabled={!canNavigate}
                      className={`h-9 w-9 rounded-lg text-xs font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${statusTone} ${
                        isActive ? 'ring-2 ring-sky-400 ring-offset-2' : ''
                      }`}
                      aria-label={`Go to question ${number}`}
                      title={`Question ${number}`}
                    >
                      {number}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-600">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Answered
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Not Answered
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-purple-700">
                  <span className="h-2 w-2 rounded-full bg-purple-500" />
                  Marked
                </span>
              </div>

              <div className="mt-4 border-t border-slate-200 pt-3 dark:border-gray-700">
                <div className="text-xs font-semibold text-slate-700 dark:text-gray-200">Progress</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-gray-700 dark:bg-gray-800">
                    <div className="text-[10px] text-slate-500 dark:text-gray-300">Total</div>
                    <div className="text-base font-semibold text-slate-900 dark:text-white">{progressCounts.total}</div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 dark:border-emerald-800 dark:bg-emerald-900/20">
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-300">Attempted</div>
                    <div className="text-base font-semibold text-emerald-700 dark:text-emerald-300">{progressCounts.answered}</div>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 dark:border-rose-800 dark:bg-rose-900/20">
                    <div className="text-[10px] text-rose-700 dark:text-rose-300">Not Attempted</div>
                    <div className="text-base font-semibold text-rose-700 dark:text-rose-300">{progressCounts.unanswered}</div>
                  </div>
                  <div className="rounded-xl border border-purple-200 bg-purple-50 px-2.5 py-2 dark:border-purple-800 dark:bg-purple-900/20">
                    <div className="text-[10px] text-purple-700 dark:text-purple-300">Marked</div>
                    <div className="text-base font-semibold text-purple-700 dark:text-purple-300">{progressCounts.review}</div>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {saving ? 'Saving progress...' : 'Progress auto-saved'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-gray-400">Violations: {totalViolations}</div>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200 pt-3 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(true)}
                  disabled={isSubmitted}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Submit
                </button>
                <div className="mt-2 text-[10px] text-slate-500 dark:text-gray-400">
                  Submit ends the assessment attempt.
                </div>
              </div>
            </>
          )}
        </aside>
      );
    })()
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 lg:h-screen lg:overflow-hidden">
      {!showAssessmentWorkspace && (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center dark:bg-gray-950">
          <div className="max-w-md">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Secure assessment setup</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-gray-300">
              Complete the required checks and review the rules before the test timer starts.
            </p>
          </div>
        </div>
      )}

      {showAssessmentWorkspace && (
      <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm dark:border-gray-700 dark:bg-gray-900/95">
        <div className="flex w-full flex-wrap items-center gap-3 px-3 py-3 md:px-4 lg:px-6">
          <div className="flex min-w-[240px] flex-1 items-center gap-3">
            <button
              type="button"
              onClick={goToPrevQuestion}
              disabled={!hasAllowedPrevQuestion}
              title="Previous question"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <div>
              <div className="text-xs text-slate-500 dark:text-gray-400">Assessment</div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white">{assessment.title}</div>
              <div className="text-[11px] text-slate-500 dark:text-gray-400">{breadcrumbLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            Q {currentQuestionNumber}/{totalQuestions || 1}
          </div>
          <div className="flex min-w-[240px] flex-1 items-center justify-end gap-2">
            <button
              type="button"
              onClick={goToNextQuestion}
              disabled={!hasNextQuestion}
              title="Next question"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              <Clock className="h-4 w-4" />
              {formatTime(timeLeft)}
            </div>
            {isCoding && (
              <select
                value={activeLanguage}
                onChange={(event) => updateAnswer(activeSection, activeQuestion, { language: event.target.value })}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                {codingLanguages.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            )}
            {isCoding && (
              <button
                type="button"
                onClick={handleRunCoding}
                disabled={isRunning || isSubmitting || isSubmitted}
                className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                {isRunning ? 'Running...' : 'Run Code'}
              </button>
            )}
            {isCoding && (
              <button
                type="button"
                onClick={handleSubmitCoding}
                disabled={isRunning || isSubmitting || isSubmitted}
                className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Code'}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={isSubmitted}
              className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              Submit Assessment
            </button>
            {isCoding && (
              <button
                type="button"
                onClick={handleResetCoding}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </header>
      {isCoding ? (
        <div className="w-full px-3 py-4 pb-12 md:px-4 lg:px-0 lg:h-[calc(100vh-84px)] lg:overflow-hidden">
          <div className="flex h-full flex-col gap-4 lg:flex-row lg:min-h-0">
            {questionNavigatorPanel}
            <div className="flex min-h-0 flex-1 flex-col lg:min-h-0">
              <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:min-h-0">
                <section
                  ref={problemPaneRef}
                  style={{ width: leftWidth ? `${leftWidth}px` : undefined, flexBasis: leftWidth ? `${leftWidth}px` : undefined }}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900 lg:h-full lg:overflow-y-auto"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500">Section {activeSection + 1} • Coding • Marks {questionMarks}</div>
                      <div className="text-lg font-semibold text-slate-900 dark:text-white">
                        {question?.questionText || question?.problemDataSnapshot?.title || question?.coding?.problemData?.title || question?.coding?.title}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={toggleMarkForReview}
                      title={isMarked ? 'Unmark review' : 'Mark this question for review'}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                        isMarked ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {isMarked ? 'Marked' : 'Mark for Review'}
                    </button>
                  </div>

                  <div className="mt-4 space-y-4 text-sm text-slate-700 dark:text-gray-200">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Problem Statement</div>
                      <div className="mt-2">
                        {(codingData?.description || codingData?.statement)
                          ? <RichTextPreview content={codingData.description || codingData.statement} />
                          : <div className="text-slate-500">No statement available.</div>}
                      </div>
                    </div>

                    {(codingData?.constraints || codingData?.inputFormat || codingData?.outputFormat) && (
                      <div className="grid gap-3 text-xs text-slate-600 dark:text-gray-300">
                        {codingData.constraints && (
                          <div>
                            <div className="font-semibold text-slate-500">Constraints</div>
                            <div>{codingData.constraints}</div>
                          </div>
                        )}
                        {codingData.inputFormat && (
                          <div>
                            <div className="font-semibold text-slate-500">Input Format</div>
                            <div>{codingData.inputFormat}</div>
                          </div>
                        )}
                        {codingData.outputFormat && (
                          <div>
                            <div className="font-semibold text-slate-500">Output Format</div>
                            <div>{codingData.outputFormat}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goToPrevQuestion}
                  disabled={!hasAllowedPrevQuestion}
                  title="Go to previous question"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={goToNextQuestion}
                  title="Go to next question"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Next
                </button>
                  </div>
                </section>

                <button
                  type="button"
                  onPointerDown={handleResizeStart}
                  className="hidden lg:flex w-3 shrink-0 cursor-col-resize items-center justify-center bg-slate-50 transition-colors hover:bg-slate-100"
                  aria-label="Resize panels"
                >
                  <div className="h-12 w-1 rounded-full bg-slate-300" />
                </button>

                <section ref={editorPaneRef} className="flex min-h-[560px] flex-1 flex-col lg:min-h-0">
                  {section?.type === 'coding' && (() => {
                    const answerValue = answersMap[answerKey(activeSection, activeQuestion)] || {};
                    const key = answerKey(activeSection, activeQuestion);
                    const baseTestCases = buildSampleTestCases(codingData);
                    const testCases = testCaseMap[key] || baseTestCases;
                    const activeTestCaseId = activeTestCaseMap[key] || testCases[0]?.id || null;
                    const activeTestCase = testCases.find((entry) => String(entry.id) === String(activeTestCaseId))
                      || testCases[0]
                      || null;
                    const expectedOutputForRun = activeTestCase?.expectedOutput ?? null;

                    const handleTestCaseInputChange = (testCaseId, nextInput) => {
                      setTestCaseMap((prev) => {
                        const existing = prev[key] || baseTestCases;
                        const next = existing.map((entry) => {
                          if (String(entry.id) !== String(testCaseId)) return entry;
                          if (entry.kind === 'sample') return entry;
                          return { ...entry, input: nextInput, expectedOutput: null };
                        });
                        return { ...prev, [key]: next };
                      });
                    };

                    return (
                      <CodeEditor
                        supportedLanguages={codingLanguages}
                        language={answerValue.language || codingLanguages[0]}
                        code={answerValue.code || ''}
                        onLanguageChange={(lang) => updateAnswer(activeSection, activeQuestion, { language: lang })}
                        onCodeChange={(code) => updateAnswer(activeSection, activeQuestion, { code })}
                        customInput=""
                        testCases={testCases}
                        activeTestCaseId={activeTestCaseId}
                        onActiveTestCaseChange={(nextId) => setActiveTestCaseMap((prev) => ({ ...prev, [key]: nextId }))}
                        onTestCaseInputChange={handleTestCaseInputChange}
                        expectedOutputForRun={expectedOutputForRun}
                        runInputUsed={runInputUsed}
                        activeConsoleTab={activeConsoleTab}
                        onConsoleTabChange={setActiveConsoleTab}
                        result={codeResult}
                        isRunning={isRunning}
                        isSubmitting={isSubmitting}
                        onRun={handleRunCoding}
                        onSubmit={handleSubmitCoding}
                        onReset={handleResetCoding}
                        showToolbar={false}
                      />
                    );
                  })()}
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full px-3 py-4 pb-12 md:px-4 lg:px-6 lg:h-[calc(100vh-84px)] lg:overflow-hidden">
          <div className="flex h-full flex-col gap-4 lg:flex-row lg:min-h-0">
            {questionNavigatorPanel}
            <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900 lg:min-h-0 lg:overflow-y-auto">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">Section {activeSection + 1} • MCQ • Marks {questionMarks}</div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-white">
                    {question?.questionText || 'Question'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleMarkForReview}
                  title={isMarked ? 'Unmark review' : 'Mark this question for review'}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                    isMarked ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  {isMarked ? 'Marked' : 'Mark for Review'}
                </button>
              </div>

              {section?.type === 'mcq' && (
                <div className="mt-4 space-y-3">
                  {question.options?.map((opt, idx) => {
                    const selected = answersMap[answerKey(activeSection, activeQuestion)]?.answer === idx;
                    const optionLabel = String.fromCharCode(65 + idx);
                    return (
                      <button
                        type="button"
                        key={`opt-${idx}`}
                        onClick={() => updateAnswer(activeSection, activeQuestion, { answer: idx })}
                        disabled={isSubmitted}
                        className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                          selected
                            ? 'border-sky-300 bg-sky-50 text-sky-700 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${
                          selected ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 text-slate-500'
                        }`}>
                          {optionLabel}
                        </span>
                        <span className="text-sm text-slate-700">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {(section?.type === 'short' || section?.type === 'one_line') && (
                <textarea
                  value={answersMap[answerKey(activeSection, activeQuestion)]?.answer || ''}
                  onChange={(e) => updateAnswer(activeSection, activeQuestion, { answer: e.target.value })}
                  rows="6"
                  className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm focus:border-sky-300 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  disabled={isSubmitted}
                  placeholder="Type your response here"
                />
              )}

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={markForReviewAndNext}
                  title="Mark this question for review and move forward"
                  className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-xs font-semibold text-purple-700"
                >
                  Mark for Review & Next
                </button>
                <button
                  type="button"
                  onClick={clearResponse}
                  title="Clear the selected response"
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Clear Response
                </button>
                <button
                  type="button"
                  onClick={saveAndNext}
                  title="Save answer and move to the next question"
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
                >
                  Save & Next
                </button>
                <button
                  type="button"
                  onClick={goToPrevQuestion}
                  disabled={!hasAllowedPrevQuestion}
                  title="Go to previous question"
                  className="ml-auto rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
      </>
      )}
      {phase === 'validation' && !isSubmitted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">System Validation</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Complete each step to enter the secure assessment window.</p>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                Step {validationStep} of 4
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { id: 1, title: 'Clean Environment', icon: <Monitor className="h-4 w-4" />, done: validationState.environment },
                { id: 2, title: 'Camera Verification', icon: <Video className="h-4 w-4" />, done: validationState.camera && validationState.face },
                { id: 3, title: 'Fullscreen Mode', icon: <Maximize className="h-4 w-4" />, done: !fullscreenRequired || validationState.fullscreen },
                { id: 4, title: 'Final System Check', icon: <ShieldCheck className="h-4 w-4" />, done: validationState.final },
              ].map((step) => {
                const isActive = validationStep === step.id;
                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                      isActive ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full ${step.done ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {step.done ? <CheckCircle2 className="h-4 w-4" /> : step.icon}
                    </div>
                    <div>{step.title}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
              {validationStep === 1 && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Step 1: Clean Environment Check</div>
                  <p className="text-sm text-slate-600 dark:text-gray-300">Keep only this assessment tab active. Browser security prevents websites from listing every external tab, app, or extension, so PeerPrep verifies focus and detects duplicate assessment tabs within the platform.</p>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-gray-300">
                      <span>Detected PeerPrep assessment tabs</span>
                      <span className={detectedTabs.filter((tab) => !tab.current).length === 0 ? 'text-emerald-600' : 'text-rose-600'}>
                        {detectedTabs.filter((tab) => !tab.current).length === 0 ? 'Clean' : 'Duplicate found'}
                      </span>
                    </div>
                    <div className="grid gap-2">
                      {(detectedTabs.length ? detectedTabs : [{ id: 'current', title: assessment.title || 'Assessment tab', current: true }]).map((tab) => (
                        <div key={tab.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-800">
                          <span className="truncate text-slate-600 dark:text-gray-300">{tab.title}</span>
                          <span className={tab.current ? 'text-emerald-600' : 'text-rose-600'}>
                            {tab.current ? 'Current' : 'Close this tab'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-2 text-xs text-slate-600 dark:text-gray-300">
                    {[
                      ['Current tab focused', document.hasFocus() && !document.hidden],
                      ['Assessment window visible', !document.hidden],
                      ['No duplicate assessment tabs', !preventMultipleTabs || detectedTabs.filter((tab) => !tab.current).length === 0],
                      ['Extra apps/extensions closed by student', validationState.environment],
                    ].map(([label, ok]) => (
                      <div key={label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                        <span>{label}</span>
                        <span className={ok ? 'text-emerald-600' : 'text-amber-600'}>{ok ? 'OK' : 'Pending'}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleEnvironmentCheck}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white"
                  >
                    <Monitor className="h-4 w-4" />
                    Run Environment Check
                  </button>
                  {validationState.environment && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Environment confirmed.
                    </div>
                  )}
                </div>
              )}

              {validationStep === 2 && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Step 2: Camera Verification</div>
                  {cameraRequired ? (
                    <>
                      <p className="text-sm text-slate-600 dark:text-gray-300">Camera access is required by the assessment settings.</p>
                      <div className="mx-auto w-full max-w-xl">
                        <div className="relative h-48 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900/10 dark:border-gray-700">
                          <video ref={validationVideoRef} className="h-full w-full object-cover object-center" muted playsInline autoPlay />
                          <div className="pointer-events-none absolute inset-3 rounded-2xl border-2 border-rose-400/60">
                            <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-rose-500/50 animate-pulse" />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-gray-300">Camera monitoring is not required for this assessment.</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleCameraCheck}
                      className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white"
                    >
                      {cameraRequired ? 'Enable Camera' : 'Confirm Camera Step'}
                    </button>
                    <span className="text-xs text-slate-500">
                      {faceStatus === 'detected' ? 'Face detected' : faceStatus === 'detecting' ? 'Detecting face...' : 'Camera not ready'}
                    </span>
                  </div>
                  {validationState.camera && validationState.face && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Camera verified.
                    </div>
                  )}
                </div>
              )}

              {validationStep === 3 && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Step 3: Fullscreen Mode Activation</div>
                  <p className="text-sm text-slate-600 dark:text-gray-300">{fullscreenRequired ? 'Fullscreen mode is required and exit attempts will be logged.' : 'Fullscreen is not required by the admin settings for this assessment.'}</p>
                  <button
                    type="button"
                    onClick={handleEnableFullscreen}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white"
                  >
                    <Maximize className="h-4 w-4" />
                    {fullscreenRequired ? 'Enable Fullscreen' : 'Confirm Fullscreen Step'}
                  </button>
                  {(!fullscreenRequired || validationState.fullscreen) && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Fullscreen check complete.
                    </div>
                  )}
                </div>
              )}

              {validationStep === 4 && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Step 4: Final System Check</div>
                  <div className="grid gap-2 text-sm text-slate-600 dark:text-gray-300">
                    <div className="flex items-center justify-between">
                      <span>Fullscreen active</span>
                      <span className={!fullscreenRequired || validationState.fullscreen ? 'text-emerald-600' : 'text-rose-600'}>
                        {!fullscreenRequired ? 'Not required' : validationState.fullscreen ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Camera active</span>
                      <span className={!cameraRequired || validationState.camera ? 'text-emerald-600' : 'text-rose-600'}>
                        {!cameraRequired ? 'Not required' : validationState.camera ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Page focused</span>
                      <span className={validationState.environment ? 'text-emerald-600' : 'text-rose-600'}>
                        {validationState.environment ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Duplicate assessment tabs</span>
                      <span className={!preventMultipleTabs || detectedTabs.filter((tab) => !tab.current).length === 0 ? 'text-emerald-600' : 'text-rose-600'}>
                        {!preventMultipleTabs ? 'Not restricted' : detectedTabs.filter((tab) => !tab.current).length === 0 ? 'None' : 'Close duplicates'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleFinalCheck}
                      className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white"
                    >
                      Run Final Check
                    </button>
                    {validationState.final && (
                      <div className="flex items-center gap-2 text-sm text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" /> All Set
                      </div>
                    )}
                  </div>
                </div>
              )}

              {validationMessage && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{validationMessage}</span>
                </div>
              )}

              <div className="mt-5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setValidationStep((prev) => Math.max(1, prev - 1))}
                  disabled={validationStep === 1}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"
                >
                  Back
                </button>
                {validationStep < 4 ? (
                  <button
                    type="button"
                    onClick={() => setValidationStep((prev) => Math.min(4, prev + 1))}
                    disabled={(validationStep === 1 && !validationState.environment) || (validationStep === 2 && cameraRequired && !(validationState.camera && validationState.face)) || (validationStep === 3 && fullscreenRequired && !validationState.fullscreen)}
                    className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (validationState.final) {
                        setPhase('rules');
                      }
                    }}
                    disabled={!validationState.final}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Proceed
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Submit assessment?</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-gray-300">
                  Are you sure you want to submit the assessment? This action cannot be undone.
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSubmitConfirm(false);
                  void handleSubmit(false);
                }}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                Yes, Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'rules' && !isSubmitted && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 px-4 py-10">
          <div className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Assessment Instructions & Guidelines</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{rulesTitle}. Please read all sections carefully before you begin.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-gray-200">
                  <BookOpen className="h-4 w-4 text-slate-500" />
                  Assessment Overview
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-gray-300">
                  <div className="flex items-center justify-between">
                    <span>Total Questions</span>
                    <span className="font-semibold">{totalQuestions}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Total Marks</span>
                    <span className="font-semibold">{assessment.totalMarks || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Duration</span>
                    <span className="font-semibold">{assessment.duration} minutes</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Type of Questions</span>
                    <span className="font-semibold">{assessment.assessmentType || section?.type || 'mixed'}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-gray-200">
                  <ShieldCheck className="h-4 w-4 text-slate-500" />
                  Rules & Regulations
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-gray-300">
                  {rulesLoading && <div className="text-xs text-slate-500">Loading rules...</div>}
                  {!rulesLoading && effectiveRules.map((block, idx) => (
                    block.type === 'paragraph' ? (
                      <p key={`rule-${idx}`} className="text-sm text-slate-600 dark:text-gray-300">{block.text}</p>
                    ) : (
                      <div key={`rule-${idx}`} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                        <span>{block.text}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-gray-200">
                  <Monitor className="h-4 w-4 text-slate-500" />
                  System Requirements
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-gray-300">
                  <li>Camera access enabled (for monitoring only)</li>
                  <li>No multiple tabs open</li>
                  <li>Use a supported browser</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-gray-200">
                  <AlertCircle className="h-4 w-4 text-slate-500" />
                  Important Notes
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-gray-300">
                  <li>Your progress is auto-saved</li>
                  <li>Violations will pause the test</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-gray-400">
                {rulesReady ? 'You may start once you are ready.' : `Please review the rules. You can start in ${rulesCountdown}s.`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/student/assessments')}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Exit
                </button>
                <button
                  type="button"
                  onClick={startAssessment}
                  disabled={!rulesReady}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {rulesReady ? 'Start Assessment' : `Start in ${rulesCountdown}s`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === 'violation' && !isSubmitted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-xl dark:border-rose-800 dark:bg-gray-900">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm font-semibold">Violation detected</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">{violationMessage || 'Violation detected. Tab switching is not allowed.'}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPhase('validation');
                  setViolationMessage('');
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
              >
                Re-Verify Environment
              </button>
            </div>
          </div>
        </div>
      )}

      {secureActive && (cameraRequired || securityNotice) && (
        <>
          <div className={`fixed bottom-0 left-0 right-0 z-20 flex items-center justify-center px-4 py-2 text-xs font-semibold text-white ${
            cameraRequired && cameraIndicator === 'normal' && !securityNotice ? 'bg-emerald-600' : 'bg-rose-600'
          }`}>
            {securityNotice || (cameraIndicator === 'normal' ? 'Face detected' : 'Face not detected, please stay in frame')}
          </div>
          {cameraRequired && (
            <>
              <video ref={monitorVideoRef} className="fixed -left-[9999px] h-1 w-1 opacity-0" muted playsInline autoPlay />
              <canvas ref={monitorCanvasRef} className="fixed -left-[9999px] h-1 w-1 opacity-0" />
            </>
          )}
        </>
      )}
    </div>
  );
}
