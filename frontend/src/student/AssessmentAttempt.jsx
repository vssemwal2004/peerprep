
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
  Loader2,
  MapPin,
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

const CSE_VALID_VIOLATIONS = new Set([
  'tab_switch',
  'fullscreen_exit',
  'camera_loss',
  'camera_no_face',
  'multiple_faces',
  'face_out_of_frame',
  'copy_paste',
  'context_menu',
  'duplicate_tab',
  'idle',
  'heartbeat_failure',
  'other',
]);

const CSE_STATUS_DEFAULTS = {
  fullscreen: true,
  cameraActive: true,
  tabActive: true,
  idle: false,
  duplicateTab: false,
};

const CAMERA_VIOLATION_TYPES = new Set([
  'camera_loss',
  'camera_no_face',
  'multiple_faces',
  'face_out_of_frame',
]);

const BLOCKED_INPUT_TYPES = new Set([
  'insertFromPaste',
  'insertFromDrop',
  'insertReplacementText',
]);

const normalizeAction = (value, fallback = 'warn') => {
  if (value === 'terminate' || value === 'autosubmit') return 'autosubmit';
  if (value === 'pause') return 'pause';
  if (value === 'warn') return 'warn';
  return fallback;
};

const getViolationWeight = (settings = {}, type = 'other') => {
  const map = settings.violationWeights || settings.violationWeight || {};
  const aliases = {
    tab_switch: 'tabSwitch',
    fullscreen_exit: 'fullscreen',
    camera_loss: 'camera',
    camera_no_face: 'camera',
    multiple_faces: 'camera',
    face_out_of_frame: 'camera',
    copy_paste: 'copyPaste',
    context_menu: 'copyPaste',
    duplicate_tab: 'duplicateTab',
    idle: 'idle',
    heartbeat_failure: 'heartbeat',
    other: 'other',
  };
  const alias = aliases[type] || type;
  const direct = Number(settings[`${alias}ViolationWeight`] ?? settings[`${alias}Weight`] ?? settings[`${type}Weight`]);
  const mapped = Number(map[type] ?? map[alias]);
  if (Number.isFinite(direct) && direct >= 0) return direct;
  if (Number.isFinite(mapped) && mapped >= 0) return mapped;
  return 1;
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
  const [violationScore, setViolationScore] = useState(0);
  const [pauseCount, setPauseCount] = useState(0);
  const [lastPauseAt, setLastPauseAt] = useState(null);
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
    location: false,
    final: false,
  });
  const [validationMessage, setValidationMessage] = useState('');
  const [faceStatus, setFaceStatus] = useState('idle');
  const [setupCheckingStep, setSetupCheckingStep] = useState('');
  const [locationData, setLocationData] = useState(null);
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
  const [securityPopup, setSecurityPopup] = useState({
    open: false,
    title: '',
    message: '',
    tone: 'warning',
  });
  const [securityStatus, setSecurityStatus] = useState(CSE_STATUS_DEFAULTS);
  const [securityAction, setSecurityAction] = useState('warn');
  const [fullscreenRecovery, setFullscreenRecovery] = useState({ active: false, remaining: 0 });
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
  const violationThrottleRef = useRef({});
  const lastDuplicateTabViolationRef = useRef(0);
  const lastIsCodingRef = useRef(false);
  const fullscreenExitTimerRef = useRef(null);
  const fullscreenCountdownRef = useRef(null);
  const heartbeatFailureRef = useRef(0);
  const thresholdNoticeRef = useRef({});
  const popupThrottleRef = useRef({});
  const securityStatusRef = useRef(CSE_STATUS_DEFAULTS);
  const violationScoreRef = useRef(0);
  const pauseCountRef = useRef(0);
  const faceDetectorRef = useRef(null);
  const cameraViolationStreakRef = useRef({ type: '', count: 0, at: 0 });
  const idleTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const tabInstanceIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const rulesSeenStorageKey = `peerprep_assessment_rules_seen:${id}`;
  const activeSessionStorageKey = `peerprep_assessment_active_session:${id}`;

  const answerKey = (sectionIndex, questionIndex) => `${sectionIndex}-${questionIndex}`;
  const isSubmitted = submission?.status === 'submitted';
  const secureActive = phase === 'active' && !isSubmitted;
  const securitySettings = useMemo(() => assessment?.settings || {}, [assessment?.settings]);
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
  const duplicateTabCount = detectedTabs.filter((tab) => !tab.current).length;
  const totalViolations = tabSwitches + fullscreenExits + cameraFlags + copyPasteCount;
  const forcePauseActive = isPaused && phase === 'validation' && !isSubmitted;
  const securityHeartbeat = useMemo(() => ({
    fullscreen: !fullscreenRequired || Boolean(document.fullscreenElement),
    tabActive: !tabGuardEnabled || (document.hasFocus() && !document.hidden),
    cameraActive: !cameraRequired || (Boolean(streamRef.current) && cameraIndicator !== 'warning'),
    idle: Boolean(securityStatus.idle),
    duplicateTab: preventMultipleTabs && duplicateTabCount > 0,
  }), [fullscreenRequired, tabGuardEnabled, cameraRequired, cameraIndicator, securityStatus.idle, preventMultipleTabs, duplicateTabCount]);
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
  const setupSteps = useMemo(() => {
    const steps = [{ id: 1, key: 'environment', title: 'Clean Environment Check', icon: <Monitor className="h-4 w-4" /> }];
    if (cameraRequired) steps.push({ id: steps.length + 1, key: 'camera', title: 'Camera Verification', icon: <Video className="h-4 w-4" /> });
    steps.push({ id: steps.length + 1, key: 'location', title: 'Location Permission', icon: <MapPin className="h-4 w-4" /> });
    if (fullscreenRequired) steps.push({ id: steps.length + 1, key: 'fullscreen', title: 'Enable Full Screen', icon: <Maximize className="h-4 w-4" /> });
    steps.push({ id: steps.length + 1, key: 'final', title: 'Final Verification', icon: <ShieldCheck className="h-4 w-4" /> });
    return steps;
  }, [cameraRequired, fullscreenRequired]);
  const setupStepIsDone = useCallback((key) => {
    if (key === 'environment') return validationState.environment;
    if (key === 'camera') return validationState.camera && validationState.face;
    if (key === 'fullscreen') return validationState.fullscreen;
    if (key === 'location') return validationState.location;
    if (key === 'final') return validationState.final;
    return false;
  }, [validationState]);
  const currentSetupStepKey = setupSteps.find((item) => item.id === validationStep)?.key || setupSteps[0]?.key;
  const getSetupStepId = useCallback(
    (key) => setupSteps.find((item) => item.key === key)?.id || 1,
    [setupSteps],
  );
  const syncCompletedSecuritySteps = useCallback((completedSteps = []) => {
    const completed = new Set(completedSteps);
    setValidationState((prev) => ({
      ...prev,
      environment: prev.environment || completed.has('environment'),
      camera: prev.camera || completed.has('camera'),
      face: prev.face || completed.has('camera'),
      fullscreen: prev.fullscreen || completed.has('fullscreen'),
      location: prev.location || completed.has('location'),
      final: prev.final || completed.has('final'),
    }));
    const nextStep = setupSteps.find((item) => !completed.has(item.key));
    setValidationStep(nextStep?.id || setupSteps.length);
  }, [setupSteps]);
  const currentSectionForLayout = assessment?.sections?.[activeSection];
  const isCodingForLayout = currentSectionForLayout?.type === 'coding';
  const cameraStatusLine = useMemo(() => {
    if (!cameraRequired) return null;
    if (cameraIndicator === 'warning' || securityStatus.cameraActive === false) {
      return {
        ok: false,
        text: securityNotice || 'Camera violation detected: please sit properly and keep your face centered.',
      };
    }
    if (streamRef.current || cameraIndicator === 'normal') {
      return {
        ok: true,
        text: 'Camera monitoring active: posture OK.',
      };
    }
    return {
      ok: false,
      text: 'Camera monitoring waiting for a stable camera feed.',
    };
  }, [cameraRequired, cameraIndicator, securityStatus.cameraActive, securityNotice]);

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
  useEffect(() => {
    securityStatusRef.current = securityStatus;
  }, [securityStatus]);

  useEffect(() => {
    violationScoreRef.current = violationScore;
  }, [violationScore]);

  useEffect(() => {
    pauseCountRef.current = pauseCount;
  }, [pauseCount]);
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
        violationScore,
        pauseCount,
        lastPauseAt,
        securityHeartbeat,
        violations,
      });
    } catch (err) {
      toast.error(err.message || 'Auto-save failed');
    } finally {
      setSaving(false);
    }
  }, [assessment, isSubmitted, answersArray, phase, tabSwitches, fullscreenExits, copyPasteCount, cameraFlags, violationScore, pauseCount, lastPauseAt, securityHeartbeat, violations, toast]);

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
        violationScore,
        pauseCount,
        lastPauseAt,
        securityHeartbeat,
        violations,
      });
      toast.success(auto ? 'Time is up. Assessment auto-submitted.' : 'Assessment submitted successfully');
      navigate('/student/assessments');
    } catch (err) {
      toast.error(err.message || 'Failed to submit assessment');
    } finally {
      setSaving(false);
    }
  }, [assessment, answersArray, tabSwitches, fullscreenExits, copyPasteCount, cameraFlags, violationScore, pauseCount, lastPauseAt, securityHeartbeat, violations, toast, navigate]);

  const triggerForcePause = useCallback((type, message, serverState = {}) => {
    const nowIso = serverState.lastPauseAt || new Date().toISOString();
    setLastPauseAt(nowIso);
    setPauseCount((prev) => Math.max(prev + 1, Number(serverState.pauseCount || 0)));
    setViolationMessage(message || 'Security Violation Detected');
    setSecurityAction('pause');
    setIsPaused(true);
    setPhase('validation');
    if (type === 'camera_loss' || type === 'camera_no_face' || type === 'multiple_faces' || type === 'face_out_of_frame') {
      setValidationState((prev) => ({ ...prev, camera: false, face: false, final: false }));
      setValidationStep(getSetupStepId('camera'));
    } else if (type === 'fullscreen_exit') {
      setValidationState((prev) => ({ ...prev, fullscreen: false, final: false }));
      setValidationStep(getSetupStepId('fullscreen'));
    } else {
      setValidationState((prev) => ({ ...prev, environment: false, final: false }));
      setValidationStep(getSetupStepId('environment'));
    }
  }, [getSetupStepId]);

  const showSecurityPopup = useCallback((type, message, meta = {}, result = {}) => {
    const now = Date.now();
    const popupKey = `${type}:${meta.source || 'default'}`;
    const throttleMs = CAMERA_VIOLATION_TYPES.has(type) ? 12000 : 1200;
    if (now - (popupThrottleRef.current[popupKey] || 0) < throttleMs) return;

    if (CAMERA_VIOLATION_TYPES.has(type) && !meta.persistent) return;

    popupThrottleRef.current[popupKey] = now;
    const currentTabSwitches = Number(result?.tabSwitches ?? meta.nextCount ?? tabSwitches ?? 0);
    const limit = Number(meta.limit ?? tabSwitchLimit ?? 0);
    const limitText = limit > 0 ? ` (${Math.min(currentTabSwitches, limit)}/${limit})` : '';
    const exceeded = limit > 0 && currentTabSwitches >= limit;
    const configuredAction = normalizeAction(result?.action, tabSwitchAction || 'warn');

    let title = 'Security warning';
    let text = message || 'Assessment security rule triggered.';
    let tone = 'warning';

    if (type === 'tab_switch') {
      title = exceeded ? 'Tab switch limit reached' : 'Tab switch detected';
      text = exceeded
        ? `Tab switch limit reached${limitText}. ${configuredAction === 'autosubmit' ? 'The assessment will be submitted according to the admin setting.' : 'Return to the assessment window immediately.'}`
        : `Tab switch recorded${limitText}. Stay on this assessment tab.`;
      tone = exceeded ? 'danger' : 'warning';
    } else if (type === 'copy_paste') {
      title = 'Copy/paste blocked';
      text = 'Copy, paste, cut, drag/drop, and restricted clipboard shortcuts are disabled for this assessment.';
    } else if (type === 'context_menu') {
      title = 'Right-click blocked';
      text = 'Right-click is disabled by the assessment security settings.';
    } else if (CAMERA_VIOLATION_TYPES.has(type)) {
      title = 'Camera violation detected';
      text = message || 'Please sit properly and keep your face centered in the camera.';
      tone = 'danger';
    } else if (type === 'duplicate_tab') {
      title = 'Duplicate assessment tab';
      text = 'Close all other assessment tabs and continue only in this window.';
      tone = 'danger';
    } else if (type === 'idle') {
      title = 'Idle activity warning';
      text = message || 'No activity detected. Continue working in the assessment window.';
    }

    setSecurityPopup({
      open: true,
      title,
      message: text,
      tone,
    });
  }, [tabSwitchAction, tabSwitches, tabSwitchLimit]);

  const recordViolation = useCallback(async (type, message, meta = {}) => {
    if (isSubmitted || !assessment?._id || !CSE_VALID_VIOLATIONS.has(type)) return null;
    const now = Date.now();
    const throttleKey = `${type}:${meta.source || meta.reason || 'default'}:${meta.escalated ? 'escalated' : 'base'}`;
    const throttleMs = type === 'tab_switch' || meta.escalated ? 700 : 3500;
    if (now - (violationThrottleRef.current[throttleKey] || 0) < throttleMs) return null;
    violationThrottleRef.current[throttleKey] = now;

    const weight = getViolationWeight(securitySettings, type);
    const entry = {
      type,
      message,
      at: new Date().toISOString(),
      meta: { ...meta, weight },
    };
    setViolations((prev) => ([...prev, entry]));
    setViolationScore((prev) => prev + weight);
    setViolationMessage(message);
    setSecurityNotice(message);

    if (type === 'tab_switch') setTabSwitches((prev) => prev + 1);
    if (type === 'fullscreen_exit') setFullscreenExits((prev) => prev + 1);
    if (['camera_loss', 'camera_no_face', 'multiple_faces', 'face_out_of_frame'].includes(type)) setCameraFlags((prev) => prev + 1);
    if (type === 'copy_paste' || type === 'context_menu') setCopyPasteCount((prev) => prev + 1);

    try {
      const result = await api.logStudentAssessmentViolation(assessment._id, {
        type,
        message,
        timestamp: entry.at,
        meta: entry.meta,
      });
      if (typeof result?.tabSwitches === 'number') setTabSwitches(result.tabSwitches);
      if (typeof result?.fullscreenExits === 'number') setFullscreenExits(result.fullscreenExits);
      if (typeof result?.cameraFlags === 'number') setCameraFlags(result.cameraFlags);
      if (typeof result?.copyPasteCount === 'number') setCopyPasteCount(result.copyPasteCount);
      if (typeof result?.violationScore === 'number') setViolationScore(result.violationScore);
      if (typeof result?.pauseCount === 'number') setPauseCount(result.pauseCount);
      if (result?.lastPauseAt) setLastPauseAt(result.lastPauseAt);
      const action = normalizeAction(result?.action, result?.autoSubmit ? 'autosubmit' : 'warn');
      setSecurityAction(action);
      if (action === 'autosubmit') {
        toast.error('Violation limit reached. Assessment auto-submitted.');
        await handleSubmit(true);
        return result;
      }
      if (action === 'pause') {
        triggerForcePause(type, message, result);
        return result;
      }
      showSecurityPopup(type, message, entry.meta, result);
      const shouldPopup = type !== 'camera_no_face' && type !== 'face_out_of_frame';
      if (shouldPopup) toast.info(message);
      return result;
    } catch {
      showSecurityPopup(type, message, entry.meta);
      if (type === 'heartbeat_failure') {
        triggerForcePause(type, message);
      }
      return null;
    } finally {
      setTimeout(() => {
        handleSave();
      }, 0);
    }
  }, [isSubmitted, assessment?._id, securitySettings, handleSave, handleSubmit, toast, triggerForcePause, showSecurityPopup]);

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
      setViolationScore(data.submission?.violationScore || 0);
      setPauseCount(data.submission?.pauseCount || 0);
      setLastPauseAt(data.submission?.lastPauseAt || null);
      setViolations(data.submission?.violations || []);
      setLocationData(data.submission?.securitySetup?.location || null);
      syncCompletedSecuritySteps(data.completedSecuritySteps || []);

      const shouldSkipValidation = Boolean(
        data.submission?.status === 'submitted'
        || (data.submission?.status === 'in_progress' && data.submission?.startedAt && !data.requiresSecuritySetup),
      );
      if (shouldSkipValidation) {
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
  }, [id, rulesSeenStorageKey, syncCompletedSecuritySteps]);

  useEffect(() => {
    loadAssessment();
    loadRules();
  }, [loadAssessment, loadRules]);

  useEffect(() => {
    if (phase !== 'validation' || currentSetupStepKey !== 'environment') return undefined;
    const monitorEnvironment = () => {
      const focusOk = document.hasFocus() && !document.hidden;
      const duplicateAssessmentTabs = detectedTabs.filter((tab) => !tab.current);
      const tabsOk = !preventMultipleTabs || duplicateAssessmentTabs.length === 0;
      setValidationState((prev) => ({ ...prev, environment: focusOk && tabsOk }));
    };
    monitorEnvironment();
    const interval = setInterval(monitorEnvironment, 1000);
    return () => clearInterval(interval);
  }, [phase, currentSetupStepKey, detectedTabs, preventMultipleTabs]);

  useEffect(() => {
    if (!assessment?._id) return undefined;
    const key = `peerprep_assessment_tabs:${assessment._id}`;
    const sessionKey = activeSessionStorageKey;
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
        setSecurityStatus((prev) => ({ ...prev, duplicateTab: preventMultipleTabs && activeEntries.some((entry) => !entry.current) }));
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
      if (phase === 'active' && preventMultipleTabs) {
        const existing = JSON.parse(localStorage.getItem(sessionKey) || '{}');
        const stale = !existing?.lastSeen || Date.now() - existing.lastSeen > 6500;
        if (!existing?.instanceId || existing.instanceId === instanceId || stale) {
          localStorage.setItem(sessionKey, JSON.stringify({
            sessionId: assessment._id,
            instanceId,
            lastSeen: Date.now(),
          }));
        } else {
          setSecurityStatus((prev) => ({ ...prev, duplicateTab: true }));
        }
      }
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
        const session = JSON.parse(localStorage.getItem(sessionKey) || '{}');
        if (session?.instanceId === instanceId) localStorage.removeItem(sessionKey);
      } catch {
        // Ignore localStorage cleanup errors.
      }
    };
  }, [assessment?._id, assessment?.title, activeSessionStorageKey, phase, preventMultipleTabs]);

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
    if (!secureActive) return;
    if (tabGuardEnabled && tabSwitchWarnAt > 0 && tabSwitches >= tabSwitchWarnAt && !thresholdNoticeRef.current.tabSwitchWarnAt) {
      thresholdNoticeRef.current.tabSwitchWarnAt = true;
      toast.warning?.('Tab switch warning threshold reached.') || toast.info('Tab switch warning threshold reached.');
    }
    const maxWarnings = Number(securitySettings.maxWarnings || 0);
    if (maxWarnings > 0 && totalViolations >= maxWarnings && !thresholdNoticeRef.current.maxWarnings) {
      thresholdNoticeRef.current.maxWarnings = true;
      toast.warning?.('Maximum warning threshold reached.') || toast.info('Maximum warning threshold reached.');
    }
  }, [secureActive, tabGuardEnabled, tabSwitchWarnAt, tabSwitches, securitySettings.maxWarnings, totalViolations, toast]);

  useEffect(() => {
    if (!secureActive || !tabGuardEnabled) return undefined;
    const reportFocusLoss = (source) => {
      const active = document.hasFocus() && !document.hidden;
      setSecurityStatus((prev) => ({ ...prev, tabActive: active }));
      if (!active) {
        void recordViolation('tab_switch', 'Tab switch or focus loss detected. Return to the assessment window.', {
          limit: tabSwitchLimit || null,
          warnAt: tabSwitchWarnAt || null,
          action: tabSwitchAction,
          nextCount: tabSwitches + 1,
          source,
        });
      }
    };
    const handleVisibility = () => reportFocusLoss('visibilitychange');
    const handleBlur = () => reportFocusLoss('window_blur');
    const handleFocus = () => {
      setSecurityStatus((prev) => ({ ...prev, tabActive: document.hasFocus() && !document.hidden }));
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [secureActive, tabGuardEnabled, tabSwitchLimit, tabSwitchWarnAt, tabSwitchAction, tabSwitches, recordViolation]);

  useEffect(() => {
    if (!secureActive || !preventMultipleTabs) return;
    const duplicateCount = detectedTabs.filter((tab) => !tab.current).length;
    if (duplicateCount > 0 && Date.now() - lastDuplicateTabViolationRef.current > 8000) {
      lastDuplicateTabViolationRef.current = Date.now();
      void recordViolation('duplicate_tab', 'Duplicate assessment tab detected. Close all other assessment tabs.', {
        duplicateCount,
        source: 'duplicate_tab_guard',
      });
    }
  }, [secureActive, preventMultipleTabs, detectedTabs, recordViolation]);

  useEffect(() => {
    if (!secureActive || !copyBlockEnabled) return undefined;
    const stopRestrictedEvent = (event, type, message, meta = {}) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      void recordViolation(type, message, {
        source: event.type,
        ...meta,
      });
    };
    const handleCopy = (event) => {
      stopRestrictedEvent(event, 'copy_paste', 'Copy action blocked by assessment rules.');
    };
    const handleCut = (event) => {
      stopRestrictedEvent(event, 'copy_paste', 'Cut action blocked by assessment rules.');
    };
    const handlePaste = (event) => {
      stopRestrictedEvent(event, 'copy_paste', 'Paste action blocked by assessment rules.');
    };
    const handleContextMenu = (event) => {
      if (!blockRightClick) return;
      stopRestrictedEvent(event, 'context_menu', 'Right-click menu blocked by assessment rules.');
    };
    const handleDrop = (event) => {
      stopRestrictedEvent(event, 'copy_paste', 'Drag/drop content insertion blocked by assessment rules.');
    };
    const handleDragStart = (event) => {
      stopRestrictedEvent(event, 'copy_paste', 'Dragging selected content is blocked by assessment rules.');
    };
    const handleBeforeInput = (event) => {
      if (BLOCKED_INPUT_TYPES.has(event.inputType)) {
        stopRestrictedEvent(event, 'copy_paste', 'Paste or drop input blocked by assessment rules.', {
          inputType: event.inputType,
        });
      }
    };
    const handleKeydown = (event) => {
      const key = event.key?.toLowerCase();
      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      const blockedCtrlKey = ctrlOrMeta && ['c', 'v', 'x', 'a', 's', 'p', 'u', 'r'].includes(key);
      const blockedInsert = key === 'insert' && (event.shiftKey || ctrlOrMeta);
      if (blockedCtrlKey || blockedInsert) {
        stopRestrictedEvent(event, 'copy_paste', 'Restricted keyboard shortcut blocked.', {
          shortcut: [
            event.ctrlKey ? 'Ctrl' : '',
            event.metaKey ? 'Meta' : '',
            event.shiftKey ? 'Shift' : '',
            event.key,
          ].filter(Boolean).join('+'),
        });
      }
    };
    const capture = true;
    document.addEventListener('copy', handleCopy, capture);
    document.addEventListener('cut', handleCut, capture);
    document.addEventListener('paste', handlePaste, capture);
    document.addEventListener('contextmenu', handleContextMenu, capture);
    document.addEventListener('drop', handleDrop, capture);
    document.addEventListener('dragstart', handleDragStart, capture);
    document.addEventListener('beforeinput', handleBeforeInput, capture);
    document.addEventListener('keydown', handleKeydown, capture);
    return () => {
      document.removeEventListener('copy', handleCopy, capture);
      document.removeEventListener('cut', handleCut, capture);
      document.removeEventListener('paste', handlePaste, capture);
      document.removeEventListener('contextmenu', handleContextMenu, capture);
      document.removeEventListener('drop', handleDrop, capture);
      document.removeEventListener('dragstart', handleDragStart, capture);
      document.removeEventListener('beforeinput', handleBeforeInput, capture);
      document.removeEventListener('keydown', handleKeydown, capture);
    };
  }, [secureActive, copyBlockEnabled, blockRightClick, recordViolation]);

  useEffect(() => {
    if (!secureActive || !idleDetection) return undefined;
    const markActivity = () => {
      lastActivityRef.current = Date.now();
      setSecurityStatus((prev) => (prev.idle ? { ...prev, idle: false } : prev));
    };
    const checkIdle = () => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor < idleThresholdMs) return;
      lastActivityRef.current = Date.now();
      setSecurityStatus((prev) => ({ ...prev, idle: true }));
      const message = 'No activity detected. Please stay active in the assessment window.';
      void recordViolation('idle', message, {
        source: 'idle_detection',
        idleForMs: idleFor,
        action: idleAction,
      });
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
  }, [secureActive, idleDetection, idleThresholdMs, idleAction, recordViolation]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setValidationState((prev) => ({
        ...prev,
        fullscreen: active,
      }));
      setSecurityStatus((prev) => ({ ...prev, fullscreen: !fullscreenRequired || active }));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [fullscreenRequired]);

  useEffect(() => {
    if (!secureActive || !fullscreenRequired) return undefined;
    const handleFullscreenEnforcement = () => {
      if (!document.fullscreenElement) {
        setSecurityStatus((prev) => ({ ...prev, fullscreen: false }));
        setFullscreenRecovery({ active: true, remaining: fullscreenTimeoutSec || 0 });
        void recordViolation('fullscreen_exit', 'Fullscreen mode is required during the assessment.', {
          timeoutSec: fullscreenTimeoutSec || null,
          source: 'fullscreenchange',
        });
        if (fullscreenTimeoutSec > 0) {
          if (fullscreenExitTimerRef.current) clearTimeout(fullscreenExitTimerRef.current);
          if (fullscreenCountdownRef.current) clearInterval(fullscreenCountdownRef.current);
          const startedAt = Date.now();
          fullscreenCountdownRef.current = setInterval(() => {
            const remaining = Math.max(0, fullscreenTimeoutSec - Math.floor((Date.now() - startedAt) / 1000));
            setFullscreenRecovery((prev) => (prev.active ? { ...prev, remaining } : prev));
          }, 500);
          fullscreenExitTimerRef.current = setTimeout(() => {
            if (!document.fullscreenElement && !isSubmitted) {
              void recordViolation('fullscreen_exit', 'Fullscreen was not restored within the configured timeout.', {
                timeoutSec: fullscreenTimeoutSec,
                source: 'fullscreen_timeout',
                escalated: true,
              });
            }
          }, fullscreenTimeoutSec * 1000);
        } else {
          void recordViolation('fullscreen_exit', 'Fullscreen was not restored immediately.', {
            source: 'fullscreen_timeout',
            escalated: true,
          });
        }
      } else if (fullscreenExitTimerRef.current) {
        clearTimeout(fullscreenExitTimerRef.current);
        fullscreenExitTimerRef.current = null;
        if (fullscreenCountdownRef.current) clearInterval(fullscreenCountdownRef.current);
        fullscreenCountdownRef.current = null;
        setFullscreenRecovery({ active: false, remaining: 0 });
        setSecurityStatus((prev) => ({ ...prev, fullscreen: true }));
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenEnforcement);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenEnforcement);
      if (fullscreenExitTimerRef.current) clearTimeout(fullscreenExitTimerRef.current);
      if (fullscreenCountdownRef.current) clearInterval(fullscreenCountdownRef.current);
    };
  }, [secureActive, fullscreenRequired, fullscreenTimeoutSec, isSubmitted, recordViolation]);

  useEffect(() => {
    if (phase !== 'validation') return;
    setValidationStep(1);
    setValidationState({
      fullscreen: Boolean(document.fullscreenElement),
      environment: false,
      camera: !cameraRequired || Boolean(streamRef.current),
      face: !cameraRequired,
      location: false,
      final: false,
    });
    setLocationData(null);
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
      setSecurityStatus((prev) => ({ ...prev, cameraActive: !cameraRequired }));
      return undefined;
    }
    let intervalId;
    let cancelled = false;
    const video = monitorVideoRef.current;
    const canvas = monitorCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (streamRef.current) {
      attachStream(streamRef.current);
    }
    if (!faceDetectorRef.current && typeof window !== 'undefined' && 'FaceDetector' in window) {
      try {
        faceDetectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
      } catch {
        faceDetectorRef.current = null;
      }
    }
    const emitCameraViolation = (type, message, meta = {}) => {
      const streak = cameraViolationStreakRef.current;
      const sameType = streak.type === type && Date.now() - streak.at < 10000;
      const nextCount = sameType ? streak.count + 1 : 1;
      cameraViolationStreakRef.current = { type, count: nextCount, at: Date.now() };
      setCameraIndicator('warning');
      setSecurityStatus((prev) => ({ ...prev, cameraActive: false }));
      void recordViolation(type, message, {
        ...meta,
        source: 'camera_monitor',
        persistent: nextCount >= 3,
      });
    };
    const markCameraNormal = () => {
      cameraViolationStreakRef.current = { type: '', count: 0, at: Date.now() };
      setCameraIndicator('normal');
      setSecurityStatus((prev) => ({ ...prev, cameraActive: true }));
    };
    const fallbackPresenceCheck = () => {
      if (!streamRef.current || !video || !canvas || !ctx) {
        emitCameraViolation('camera_loss', 'Camera feed is not available.');
        return false;
      }
      if (video.readyState < 2) return null;
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
      return { detected: variance > 120, confidence: Math.min(1, variance / 240), variance };
    };
    const sampleFrame = async () => {
      if (cancelled) return;
      if (!streamRef.current || !video || !canvas || !ctx) {
        emitCameraViolation('camera_loss', 'Camera feed is not available.');
        return;
      }
      if (video.readyState < 2) return;
      if (faceDetectorRef.current) {
        try {
          const faces = await faceDetectorRef.current.detect(video);
          if (cancelled) return;
          if (!faces.length) {
            emitCameraViolation('camera_no_face', 'No face detected. Please stay in frame.', { confidence: 0.95 });
            return;
          }
          if (faces.length > 1) {
            emitCameraViolation('multiple_faces', 'Multiple faces detected in camera view.', { faces: faces.length, confidence: 0.95 });
            return;
          }
          const box = faces[0].boundingBox || {};
          const centerX = (box.x || 0) + (box.width || 0) / 2;
          const centerY = (box.y || 0) + (box.height || 0) / 2;
          const offCenter = Math.abs(centerX - video.videoWidth / 2) > video.videoWidth * 0.35
            || Math.abs(centerY - video.videoHeight / 2) > video.videoHeight * 0.35
            || (box.width || 0) < video.videoWidth * 0.12;
          if (offCenter) {
            emitCameraViolation('face_out_of_frame', 'Face moved away from the camera. Please center yourself.', { confidence: 0.9 });
            return;
          }
          markCameraNormal();
          return;
        } catch {
          faceDetectorRef.current = null;
        }
      }
      const fallback = fallbackPresenceCheck();
      if (fallback === null) return;
      if (fallback?.detected) {
        markCameraNormal();
      } else {
        emitCameraViolation('camera_no_face', 'Face or human presence was not clearly detected.', {
          confidence: fallback?.confidence || 0,
          variance: fallback?.variance || 0,
          detector: 'frame_variance_fallback',
        });
      }
    };
    intervalId = setInterval(() => {
      void sampleFrame();
    }, 1200);
    void sampleFrame();
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [secureActive, cameraRequired, recordViolation]);

  useEffect(() => {
    if (!secureActive) return undefined;
    const sendHeartbeat = async () => {
      const status = {
        fullscreen: !fullscreenRequired || Boolean(document.fullscreenElement),
        tabActive: !tabGuardEnabled || (document.hasFocus() && !document.hidden),
        cameraActive: !cameraRequired || (Boolean(streamRef.current) && securityStatusRef.current.cameraActive !== false),
        idle: Boolean(securityStatusRef.current.idle),
        duplicateTab: Boolean(securityStatusRef.current.duplicateTab),
      };
      setSecurityStatus((prev) => ({ ...prev, ...status }));
      try {
        const result = await api.sendStudentAssessmentHeartbeat(assessment._id, {
          status,
          violationScore: violationScoreRef.current,
          pauseCount: pauseCountRef.current,
          cameraFlags,
        });
        if (typeof result?.violationScore === 'number') setViolationScore(result.violationScore);
        if (typeof result?.pauseCount === 'number') setPauseCount(result.pauseCount);
        if (result?.lastPauseAt) setLastPauseAt(result.lastPauseAt);
        if (result?.inconsistent) {
          await recordViolation('heartbeat_failure', 'Security heartbeat reported an inconsistent session state.', {
            source: 'heartbeat_inconsistent',
            status,
          });
          return;
        }
      } catch {
        if (Date.now() - heartbeatFailureRef.current > 12000) {
          heartbeatFailureRef.current = Date.now();
          void recordViolation('heartbeat_failure', 'Security heartbeat failed. Please check your connection.', {
            source: 'heartbeat_request',
          });
        }
      }
    };
    void sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 5000);
    return () => clearInterval(interval);
  }, [secureActive, assessment?._id, fullscreenRequired, tabGuardEnabled, cameraRequired, cameraFlags, handleSubmit, recordViolation, triggerForcePause]);

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
    setSetupCheckingStep('fullscreen');
    if (fullscreenRequired) {
      await requestFullscreen();
    }
    const fullscreenOk = !fullscreenRequired || Boolean(document.fullscreenElement);
    setValidationState((prev) => ({ ...prev, fullscreen: fullscreenOk }));
    if (fullscreenOk) {
      try {
        let result = null;
        if (assessment?._id) {
          result = await api.markStudentAssessmentSetupStep(assessment._id, 'fullscreen');
        }
        syncCompletedSecuritySteps(result?.completedSecuritySteps || ['fullscreen']);
        setValidationMessage('');
      } catch (err) {
        setValidationMessage(err.message || 'Fullscreen step could not be verified by server.');
      } finally {
        setSetupCheckingStep('');
      }
    } else {
      setSetupCheckingStep('');
    }
  };

  const handleEnvironmentCheck = async () => {
    setSetupCheckingStep('environment');
    const focusOk = document.hasFocus() && !document.hidden;
    const duplicateAssessmentTabs = detectedTabs.filter((tab) => !tab.current);
    const tabsOk = !preventMultipleTabs || duplicateAssessmentTabs.length === 0;
    const ok = focusOk && tabsOk;
    setValidationState((prev) => ({ ...prev, environment: ok }));
    if (ok) {
      try {
        let result = null;
        if (assessment?._id) {
          result = await api.markStudentAssessmentSetupStep(assessment._id, 'environment');
        }
        syncCompletedSecuritySteps(result?.completedSecuritySteps || ['environment']);
        setValidationMessage('');
      } catch (err) {
        setValidationMessage(err.message || 'Environment step could not be verified by server.');
      } finally {
        setSetupCheckingStep('');
      }
    } else if (!tabsOk) {
      setValidationMessage('Close duplicate assessment tabs before continuing. Browser security only allows this platform to detect PeerPrep assessment tabs, not every external tab or application.');
      setSetupCheckingStep('');
    } else {
      setValidationMessage('We could not confirm focus. Please close other tabs and return to this window.');
      setSetupCheckingStep('');
    }
  };

  const handleCameraCheck = async () => {
    setSetupCheckingStep('camera');
    const ok = !cameraRequired || await ensureCamera();
    setValidationState((prev) => ({ ...prev, camera: ok }));
    if (!ok) {
      setValidationMessage('Camera permission is required to proceed.');
      setSetupCheckingStep('');
    } else {
      setFaceStatus('detecting');
      const faceOk = !cameraRequired || await verifyHumanPresence();
      setValidationState((prev) => ({ ...prev, face: faceOk }));
      setFaceStatus(faceOk ? 'detected' : 'idle');
      if (faceOk) {
        try {
          let result = null;
          if (assessment?._id) {
            result = await api.markStudentAssessmentSetupStep(assessment._id, 'camera');
          }
          syncCompletedSecuritySteps(result?.completedSecuritySteps || ['camera']);
          setValidationMessage('');
        } catch (err) {
          setValidationMessage(err.message || 'Camera step could not be verified by server.');
        } finally {
          setSetupCheckingStep('');
        }
      } else {
        setValidationMessage('Camera is active, but human presence was not clearly detected. Please center your face and try again.');
        setSetupCheckingStep('');
      }
    }
  };

  const handleLocationCheck = async () => {
    setSetupCheckingStep('location');
    if (!navigator.geolocation) {
      setValidationMessage('Location is not supported in this browser.');
      setSetupCheckingStep('');
      return;
    }
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
      const meta = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      let result = null;
      if (assessment?._id) {
        result = await api.markStudentAssessmentSetupStep(assessment._id, 'location', meta);
      }
      setLocationData(meta);
      setValidationState((prev) => ({ ...prev, location: true }));
      syncCompletedSecuritySteps(result?.completedSecuritySteps || ['location']);
      setValidationMessage('');
    } catch (err) {
      setValidationState((prev) => ({ ...prev, location: false }));
      setValidationMessage(err?.message || 'Location permission is required to continue.');
    } finally {
      setSetupCheckingStep('');
    }
  };

  const handleFinalCheck = async () => {
    const fullscreenOk = !fullscreenRequired || Boolean(document.fullscreenElement);
    const focusOk = document.hasFocus() && !document.hidden;
    const tabsOk = !preventMultipleTabs || detectedTabs.filter((tab) => !tab.current).length === 0;
    const cameraOk = !cameraRequired || (validationState.camera && validationState.face);
    const locationOk = Boolean(validationState.location);
    const ok = fullscreenOk && focusOk && tabsOk && cameraOk && locationOk;
    setValidationState((prev) => ({
      ...prev,
      fullscreen: fullscreenOk,
      environment: focusOk && tabsOk,
      final: ok,
    }));
    if (ok) {
      try {
        setSetupCheckingStep('final');
        let result = null;
        if (assessment?._id) {
          result = await api.markStudentAssessmentSetupStep(assessment._id, 'final');
        }
        syncCompletedSecuritySteps(result?.completedSecuritySteps || ['final']);
        setValidationMessage('');
      } catch (err) {
        setValidationMessage(err.message || 'Final verification could not be completed.');
        setValidationState((prev) => ({ ...prev, final: false }));
      } finally {
        setSetupCheckingStep('');
      }
    } else if (!tabsOk) {
      setValidationMessage('A duplicate assessment tab is still active. Close it and run the final check again.');
    } else {
      setValidationMessage('Please ensure all required focus, camera, fullscreen, and location checks are satisfied.');
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
      setSecurityStatus({
        fullscreen: !fullscreenRequired || Boolean(document.fullscreenElement),
        cameraActive: !cameraRequired || Boolean(streamRef.current),
        tabActive: document.hasFocus() && !document.hidden,
        idle: false,
        duplicateTab: false,
      });
      setSecurityAction('warn');
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
                  <div className="text-[11px] text-slate-500 dark:text-gray-400">
                    Violations: {totalViolations} - Score: {violationScore}
                  </div>
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

  const securityStatusItems = [
    {
      key: 'fullscreen',
      label: 'Fullscreen',
      ok: !fullscreenRequired || securityStatus.fullscreen,
      enabled: fullscreenRequired,
    },
    {
      key: 'camera',
      label: 'Camera',
      ok: !cameraRequired || securityStatus.cameraActive,
      enabled: cameraRequired,
    },
    {
      key: 'tab',
      label: 'Tab',
      ok: !tabGuardEnabled || securityStatus.tabActive,
      enabled: tabGuardEnabled,
    },
    {
      key: 'idle',
      label: 'Idle',
      ok: !idleDetection || !securityStatus.idle,
      enabled: idleDetection,
    },
  ];

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
          <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="px-6 pb-5 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-900/20 dark:text-sky-200">
                    Security Setup
                  </div>
                  <h2 className="mt-5 text-2xl font-black tracking-tight text-slate-950 dark:text-white">Security Setup</h2>
                  <p className="mt-3 text-base text-slate-500 dark:text-gray-300">Complete all mandatory checks before moving forward.</p>
                </div>
                <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-gray-800 dark:text-gray-200">
                  Step {validationStep} of {setupSteps.length}
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-5 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-3 text-base font-semibold text-slate-800 dark:text-gray-100">
                  <ShieldCheck className="h-5 w-5 text-sky-600" />
                  Security Checks
                </div>
                <div className="mt-5 grid gap-3">
                  {setupSteps.map((step) => {
                    const isActive = validationStep === step.id;
                    const done = setupStepIsDone(step.key);
                    const locked = step.id > validationStep && !done;
                    const checking = setupCheckingStep === step.key;
                    return (
                      <div
                        key={step.id}
                        className={`flex items-center gap-3 text-base ${
                          done ? 'text-emerald-700 dark:text-emerald-300' : isActive ? 'text-slate-800 dark:text-white' : 'text-slate-500 dark:text-gray-400'
                        }`}
                      >
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          done ? 'bg-emerald-100 text-emerald-600' : isActive ? 'bg-sky-100 text-sky-600' : 'bg-slate-200 text-slate-400 dark:bg-gray-700'
                        }`}>
                          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <CheckCircle2 className="h-4 w-4" /> : locked ? <span className="h-2 w-2 rounded-full bg-current" /> : step.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium">{step.title}</div>
                          {isActive && !done && <div className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">Run this check to unlock the next step.</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="max-h-[45vh] overflow-y-auto border-t border-slate-200 bg-white px-6 py-5 dark:border-gray-700 dark:bg-gray-900">
              {currentSetupStepKey === 'environment' && (
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
                    disabled={Boolean(setupCheckingStep)}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {setupCheckingStep === 'environment' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Monitor className="h-4 w-4" />}
                    Run Environment Check
                  </button>
                  {validationState.environment && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Environment confirmed.
                    </div>
                  )}
                </div>
              )}

              {currentSetupStepKey === 'camera' && (
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
                      disabled={Boolean(setupCheckingStep)}
                      className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {setupCheckingStep === 'camera' && <Loader2 className="h-4 w-4 animate-spin" />}
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

              {currentSetupStepKey === 'location' && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Step 3: Location Permission</div>
                  <p className="text-sm text-slate-600 dark:text-gray-300">Allow location access. Coordinates are stored for admin audit.</p>
                  {locationData ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                      <div>Latitude: {Number(locationData.latitude).toFixed(6)}</div>
                      <div>Longitude: {Number(locationData.longitude).toFixed(6)}</div>
                      <div>Accuracy: {Math.round(Number(locationData.accuracy || 0))} m</div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 dark:text-gray-400">Location is not captured yet.</div>
                  )}
                  <button
                    type="button"
                    onClick={handleLocationCheck}
                    disabled={Boolean(setupCheckingStep)}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {setupCheckingStep === 'location' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                    Allow & Verify Location
                  </button>
                  {validationState.location && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Location verified.
                    </div>
                  )}
                </div>
              )}

              {currentSetupStepKey === 'fullscreen' && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Step 4: Fullscreen Mode Activation</div>
                  <p className="text-sm text-slate-600 dark:text-gray-300">{fullscreenRequired ? 'Fullscreen mode is required and exit attempts will be logged.' : 'Fullscreen is not required by the admin settings for this assessment.'}</p>
                  <button
                    type="button"
                    onClick={handleEnableFullscreen}
                    disabled={Boolean(setupCheckingStep)}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {setupCheckingStep === 'fullscreen' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Maximize className="h-4 w-4" />}
                    {fullscreenRequired ? 'Enable Fullscreen' : 'Confirm Fullscreen Step'}
                  </button>
                  {(!fullscreenRequired || validationState.fullscreen) && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Fullscreen check complete.
                    </div>
                  )}
                </div>
              )}

              {currentSetupStepKey === 'final' && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Step 5: Final System Check</div>
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
                    <div className="flex items-center justify-between">
                      <span>Location permission</span>
                      <span className={validationState.location ? 'text-emerald-600' : 'text-rose-600'}>
                        {validationState.location ? 'Granted' : 'Pending'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleFinalCheck}
                      disabled={Boolean(setupCheckingStep)}
                      className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {setupCheckingStep === 'final' && <Loader2 className="h-4 w-4 animate-spin" />}
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
                {currentSetupStepKey !== 'final' ? (
                  <button
                    type="button"
                    onClick={() => setValidationStep((prev) => Math.min(setupSteps.length, prev + 1))}
                    disabled={
                      (currentSetupStepKey === 'environment' && !validationState.environment)
                      || (currentSetupStepKey === 'camera' && !(validationState.camera && validationState.face))
                      || (currentSetupStepKey === 'fullscreen' && !validationState.fullscreen)
                      || (currentSetupStepKey === 'location' && !validationState.location)
                    }
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

      {securityPopup.open && secureActive && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-[1px]">
          <div className={`w-full max-w-sm rounded-2xl border bg-white p-4 shadow-2xl dark:bg-gray-900 ${
            securityPopup.tone === 'danger'
              ? 'border-rose-200 dark:border-rose-800'
              : 'border-amber-200 dark:border-amber-800'
          }`}>
            <div className={`flex items-center gap-2 text-sm font-semibold ${
              securityPopup.tone === 'danger'
                ? 'text-rose-600 dark:text-rose-300'
                : 'text-amber-600 dark:text-amber-300'
            }`}>
              <AlertTriangle className="h-4 w-4" />
              {securityPopup.title}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-gray-300">
              {securityPopup.message}
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSecurityPopup((prev) => ({ ...prev, open: false }))}
                className={`rounded-xl px-4 py-2 text-xs font-semibold text-white ${
                  securityPopup.tone === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                OK
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

      {fullscreenRecovery.active && secureActive && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-800 dark:bg-gray-900">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm font-semibold">Fullscreen Required</span>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-gray-300">
              Re-enter fullscreen to continue the assessment. The session will escalate if fullscreen is not restored in time.
            </p>
            <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
              Time remaining: {fullscreenRecovery.remaining || 0}s
            </div>
            <button
              type="button"
              onClick={async () => {
                await requestFullscreen();
                const active = Boolean(document.fullscreenElement);
                setFullscreenRecovery({ active: !active, remaining: active ? 0 : fullscreenRecovery.remaining });
                setSecurityStatus((prev) => ({ ...prev, fullscreen: !fullscreenRequired || active }));
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
            >
              <Maximize className="h-4 w-4" />
              Re-enter Fullscreen
            </button>
          </div>
        </div>
      )}

      {forcePauseActive && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-800 dark:bg-gray-900">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm font-semibold">Security Violation Detected</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-white">Assessment paused for re-validation</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-gray-300">
              {violationMessage || 'Security checks must be completed again before you can resume.'}
            </p>
            <div className="mt-4 grid gap-3 text-xs text-slate-600 dark:text-gray-300 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <div className="text-slate-400">Violation score</div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">{violationScore}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <div className="text-slate-400">Pause count</div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">{pauseCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <div className="text-slate-400">Action</div>
                <div className="text-lg font-semibold capitalize text-slate-900 dark:text-white">{securityAction}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setViolationMessage('');
                setFullscreenRecovery({ active: false, remaining: 0 });
                setIsPaused(false);
                setPhase('validation');
              }}
              className="mt-5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
            >
              Complete Security Setup
            </button>
          </div>
        </div>
      )}

      {secureActive && (
        <>
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
            {cameraStatusLine && (
              <div className={`${cameraStatusLine.ok ? 'bg-emerald-500 text-white' : 'bg-rose-600 text-white'}`}>
                <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-1 text-[11px] font-semibold md:px-4">
                  <span className={`h-2 w-2 rounded-full ${cameraStatusLine.ok ? 'bg-white' : 'bg-rose-100'}`} />
                  <span className="truncate">{cameraStatusLine.text}</span>
                </div>
              </div>
            )}
            <div className="px-3 py-2">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {securityStatusItems.map((item) => (
                  <span
                    key={item.key}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold ${
                      item.ok
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                        : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${item.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    {item.label}: {item.enabled ? (item.ok ? 'OK' : 'Violated') : 'Off'}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-700 dark:text-gray-200">
                {securityNotice && <span className="max-w-[48rem] truncate text-rose-600 dark:text-rose-300">{securityNotice}</span>}
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-gray-700 dark:bg-gray-800">
                  Violations {totalViolations}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-gray-700 dark:bg-gray-800">
                  Score {violationScore}
                </span>
              </div>
            </div>
            </div>
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
