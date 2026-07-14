
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
  Hash,
  Layers,
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
import ProctoringFooter from '../features/assessment/student/components/ProctoringFooter';
import { ProctoringManager } from '../features/assessment/proctoring';
import { logAiProctoringViolation } from '../features/assessment/proctoring/services/proctoringApi';

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

const SOFT_CAMERA_WARNING_TYPES = new Set([
  'camera_loss',
  'camera_no_face',
]);

const NON_BLOCKING_DETECTION_TYPES = new Set([
  ...CAMERA_VIOLATION_TYPES,
  'fullscreen_exit',
]);

const SOFT_FOOTER_WARNING_TYPES = new Set([
  ...CAMERA_VIOLATION_TYPES,
  'fullscreen_exit',
]);

const RESTRICTED_ACTION_WARNING_MS = 15000;
const SCREENSHOT_WARNING_GRACE_MS = RESTRICTED_ACTION_WARNING_MS;
const AI_PREVIEW_MARGIN_PX = 8;
const CAMERA_WARNING_STREAK_LIMIT = 6;
const FACE_CENTER_TOLERANCE_RATIO = 0.46;
const FACE_MIN_WIDTH_RATIO = 0.08;

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

const formatSectionTypeLabel = (type = 'mixed') => {
  const normalized = String(type || 'mixed').replace(/_/g, ' ').toLowerCase();
  if (normalized === 'mcq') return 'MCQ';
  if (normalized === 'short') return 'Short Answer';
  if (normalized === 'one line') return 'One-line Answer';
  if (normalized === 'coding') return 'Coding';
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
};

const createSeededRandom = (seedInput = '') => {
  let seed = 0;
  const text = String(seedInput || 'peerprep');
  for (let i = 0; i < text.length; i += 1) {
    seed = ((seed << 5) - seed + text.charCodeAt(i)) >>> 0;
  }
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};

const seededShuffle = (items = [], random) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const transformAssessmentForAttempt = (assessment, submissionId = '') => {
  if (!assessment) return null;
  const settings = assessment.settings || {};
  if (!settings.randomShuffle && !settings.shuffleOptions) return assessment;

  const random = createSeededRandom(`${assessment._id || 'assessment'}:${submissionId || 'attempt'}`);
  const sections = (assessment.sections || []).map((section, sectionIndex) => {
    let questions = (section.questions || []).map((question, questionIndex) => ({
      ...question,
      __originSectionIndex: sectionIndex,
      __originQuestionIndex: questionIndex,
    }));

    if (settings.randomShuffle) {
      questions = seededShuffle(questions, random);
    }

    questions = questions.map((question) => {
      if (settings.shuffleOptions && section.type === 'mcq' && Array.isArray(question.options) && question.options.length > 1) {
        const shuffledOptions = seededShuffle(
          question.options.map((option, optionIndex) => ({ option, optionIndex })),
          random,
        );
        return {
          ...question,
          options: shuffledOptions.map((entry) => entry.option),
          correctOptionIndex: shuffledOptions.findIndex((entry) => entry.optionIndex === Number(question.correctOptionIndex)),
          __optionOrder: shuffledOptions.map((entry) => entry.optionIndex),
        };
      }
      return question;
    });

    return { ...section, questions };
  });

  return { ...assessment, sections };
};

const getCodingDataFromQuestion = (question = {}) => (
  question?.problemDataSnapshot
  || question?.problemData
  || question?.coding?.problemData
  || question?.coding
  || {}
);

const getCodingLanguagesFromData = (codingData = {}) => (
  Array.isArray(codingData?.supportedLanguages) && codingData.supportedLanguages.length
    ? codingData.supportedLanguages
    : ['python']
);

const getCodingStarterCode = (question, language) => (
  getStarterCodeForLanguage(getCodingDataFromQuestion(question), language)
);

const clampAiPreviewPosition = ({ x, y, width = 144, height = 96 }) => {
  if (typeof window === 'undefined') return { x, y };
  const maxX = Math.max(AI_PREVIEW_MARGIN_PX, window.innerWidth - width - AI_PREVIEW_MARGIN_PX);
  const maxY = Math.max(AI_PREVIEW_MARGIN_PX, window.innerHeight - height - AI_PREVIEW_MARGIN_PX);
  return {
    x: Math.min(Math.max(AI_PREVIEW_MARGIN_PX, x), maxX),
    y: Math.min(Math.max(AI_PREVIEW_MARGIN_PX, y), maxY),
  };
};

export default function AssessmentAttempt() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const aiPreviewStorageKey = `peerprep_ai_preview_position:${id}`;

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
  const [screenshotWarnings, setScreenshotWarnings] = useState(0);
  const [aiWarnings, setAiWarnings] = useState(0);
  const [violationScore, setViolationScore] = useState(0);
  const [pauseCount, setPauseCount] = useState(0);
  const [lastPauseAt, setLastPauseAt] = useState(null);
  const [violations, setViolations] = useState([]);
  const [testCaseMap, setTestCaseMap] = useState({});
  const [activeTestCaseMap, setActiveTestCaseMap] = useState({});
  const [phase, setPhase] = useState('validation');
  const [validationStep, setValidationStep] = useState(1);
  const [completedSetupSteps, setCompletedSetupSteps] = useState([]);
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
  const [securityRecheckStartedAt, setSecurityRecheckStartedAt] = useState(null);
  const [securityRecheckRemainingSec, setSecurityRecheckRemainingSec] = useState(0);
  const [violationMessage, setViolationMessage] = useState('');
  const [activeConsoleTab, setActiveConsoleTab] = useState('result');
  const [codeResultMap, setCodeResultMap] = useState({});
  const [isRunningMap, setIsRunningMap] = useState({});
  const [isSubmittingMap, setIsSubmittingMap] = useState({});
  const [runInputUsedMap, setRunInputUsedMap] = useState({});
  const [rulesCountdown, setRulesCountdown] = useState(30);
  const [rulesReady, setRulesReady] = useState(false);
  const [hasSeenRules, setHasSeenRules] = useState(false);
  const [cameraIndicator, setCameraIndicator] = useState('idle');
  const [detectedTabs, setDetectedTabs] = useState([]);
  const [securityNotice, setSecurityNotice] = useState('');
  const [securityPopup, setSecurityPopup] = useState({
    open: false,
    title: '',
    message: '',
    tone: 'warning',
  });
  const [timedWarningRemainingSec, setTimedWarningRemainingSec] = useState(0);
  const [securityStatus, setSecurityStatus] = useState(CSE_STATUS_DEFAULTS);
  const [securityAction, setSecurityAction] = useState('warn');
  const [fullscreenRecovery, setFullscreenRecovery] = useState({ active: false, remaining: 0 });
  const [leftWidth, setLeftWidth] = useState(420);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [navTypeFilter, setNavTypeFilter] = useState('all');
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [proctoringStatus, setProctoringStatus] = useState(null);
  const [aiPreviewPosition, setAiPreviewPosition] = useState(() => {
    try {
      const raw = localStorage.getItem(`peerprep_ai_preview_position:${id}`);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) return parsed;
    } catch {
      // Use the default bottom-right placement.
    }
    return null;
  });

  const validationVideoRef = useRef(null);
  const monitorVideoRef = useRef(null);
  const aiProctoringVideoRef = useRef(null);
  const aiPreviewRef = useRef(null);
  const aiPreviewDragFrameRef = useRef(null);
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
  const restrictedActionGraceUntilRef = useRef(0);
  const restrictedActionNoticeRef = useRef('Restricted action recorded as a warning. Continue the assessment.');
  const timedWarningTimerRef = useRef(null);
  const screenshotGraceUntilRef = useRef(0);
  const lastScreenshotWarningAtRef = useRef(0);
  const thresholdNoticeRef = useRef({});
  const popupThrottleRef = useRef({});
  const securityStatusRef = useRef(CSE_STATUS_DEFAULTS);
  const violationScoreRef = useRef(0);
  const pauseCountRef = useRef(0);
  const securityRecheckAutoSubmitRef = useRef(false);
  const faceDetectorRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  const audioDataRef = useRef(null);
  const monitoringCooldownRef = useRef({});
  const cameraViolationStreakRef = useRef({ type: '', count: 0, at: 0 });
  const proctoringManagerRef = useRef(null);
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
  const watermarkConfig = useMemo(() => {
    const type = securitySettings.watermarkTextType || 'platform';
    const student = submission?.studentSnapshot || {};
    let text = 'PeerPrep';
    if (type === 'candidate_name') text = student.name || submission?.studentName || 'Candidate';
    else if (type === 'candidate_email') text = student.email || submission?.studentEmail || 'candidate@peerprep';
    else if (type === 'candidate_id') text = student.studentId || submission?.studentRollNo || 'PP-Student';
    else if (type === 'custom') text = securitySettings.watermarkCustomText || 'PeerPrep';
    return {
      enabled: Boolean(securitySettings.questionWatermark),
      text,
      opacity: Math.max(0.04, Math.min(0.35, Number(securitySettings.watermarkOpacity || 12) / 100)),
      color: securitySettings.watermarkColor || '#cbd5e1',
      angle: Number(securitySettings.watermarkAngle ?? -45) || -45,
      spacing: Math.max(120, Number(securitySettings.watermarkSpacing || 220) || 220),
      fontSize: Math.max(14, Number(securitySettings.watermarkFontSize || 24) || 24),
    };
  }, [securitySettings, submission]);
  const fullscreenRequired = Boolean(securitySettings.enableFullscreen);
  const cameraRequired = Boolean(securitySettings.cameraMonitoring);
  const aiProctoringEnabled = Boolean(securitySettings.aiProctoring?.enabled);
  const audioMonitoringEnabled = Boolean(securitySettings.audioMonitoring);
  const tabGuardEnabled = Boolean(securitySettings.tabSwitchDetection);
  const copyBlockEnabled = Boolean(securitySettings.disableCopyPaste);
  const screenshotProtectionEnabled = Boolean(securitySettings.blockScreenshots);
  const preventMultipleTabs = Boolean(securitySettings.preventMultipleTabs);
  const blockRightClick = copyBlockEnabled && securitySettings.blockRightClick !== false;
  const tabSwitchLimit = Number(securitySettings.tabSwitchLimit || 0);
  const tabSwitchWarnAt = Number(securitySettings.tabSwitchWarnAt || 1);
  const tabSwitchAction = securitySettings.tabSwitchAction || 'warn';
  const autoSubmitOnEnd = securitySettings.autoSubmitOnEnd !== false;
  const restrictNavigation = Boolean(securitySettings.restrictNavigation);
  const allowSectionReview = securitySettings.allowSectionReview !== false;
  const fullscreenTimeoutSec = Number(securitySettings.fullscreenTimeoutSec || 0);
  const configuredSecurityRecheckTimeoutSec = Number(securitySettings.securityRecheckTimeoutSec);
  const securityRecheckTimeoutSec = Number.isFinite(configuredSecurityRecheckTimeoutSec)
    ? Math.min(1800, Math.max(30, configuredSecurityRecheckTimeoutSec))
    : 180;
  const idleDetection = Boolean(securitySettings.idleDetection);
  const idleThresholdMs = Math.max(1, Number(securitySettings.idleThresholdMin || 5)) * 60 * 1000;
  const idleAction = securitySettings.idleAction || 'warn';
  const sectionWiseLock = Boolean(securitySettings.sectionWiseLock);
  const sectionGraceSec = Number(securitySettings.sectionGraceSec || 10);
  const duplicateTabCount = detectedTabs.filter((tab) => !tab.current).length;
  const totalViolations = tabSwitches + fullscreenExits + cameraFlags + copyPasteCount;
  const totalWarnings = totalViolations + screenshotWarnings + aiWarnings;
  const forcePauseActive = isPaused && phase === 'violation' && !isSubmitted;
  const securityRecheckActive = isPaused && !isSubmitted && (phase === 'violation' || phase === 'validation');
  const securityHeartbeat = useMemo(() => ({
    fullscreen: !fullscreenRequired || Boolean(document.fullscreenElement),
    tabActive: !tabGuardEnabled || (document.hasFocus() && !document.hidden),
    cameraActive: !cameraRequired || Boolean(streamRef.current),
    idle: Boolean(securityStatus.idle),
    duplicateTab: preventMultipleTabs && duplicateTabCount > 0,
  }), [fullscreenRequired, tabGuardEnabled, cameraRequired, securityStatus.idle, preventMultipleTabs, duplicateTabCount]);
  const finalRules = useMemo(() => {
    const rules = [];
    if (fullscreenRequired) rules.push({ type: 'bullet', text: 'Fullscreen mode must remain active during the test.' });
    if (tabGuardEnabled) rules.push({ type: 'bullet', text: `Tab switching is monitored${tabSwitchLimit ? ` with a limit of ${tabSwitchLimit}` : ''}.` });
    if (cameraRequired) rules.push({ type: 'bullet', text: 'Camera monitoring must remain enabled and your face should stay visible.' });
    if (copyBlockEnabled) rules.push({ type: 'bullet', text: 'Copy, paste, print, page source, and restricted shortcuts are blocked.' });
    if (preventMultipleTabs) rules.push({ type: 'bullet', text: 'Only one assessment tab may remain open.' });
    if (securitySettings.randomShuffle) rules.push({ type: 'bullet', text: 'Questions may appear in a randomized order.' });
    if (securitySettings.autoSubmitOnEnd) rules.push({ type: 'bullet', text: 'The test auto-submits when the timer ends.' });
    if (securitySettings.restrictNavigation) {
      rules.push({
        type: 'bullet',
        text: allowSectionReview
          ? 'You may review questions only inside your current section. Once you move to another section, earlier sections cannot be reopened.'
          : 'Backward navigation is locked. Once you move forward, previous questions cannot be reopened.',
      });
    }
    return rules;
  }, [fullscreenRequired, tabGuardEnabled, tabSwitchLimit, cameraRequired, copyBlockEnabled, preventMultipleTabs, securitySettings, allowSectionReview]);
  const setupSteps = useMemo(() => {
    const steps = [{ id: 1, key: 'environment', title: 'Clean Environment Check', icon: <Monitor className="h-4 w-4" /> }];
    if (cameraRequired) steps.push({ id: steps.length + 1, key: 'camera', title: 'Camera Verification', icon: <Video className="h-4 w-4" /> });
    steps.push({ id: steps.length + 1, key: 'location', title: 'Location Permission', icon: <MapPin className="h-4 w-4" /> });
    if (fullscreenRequired) steps.push({ id: steps.length + 1, key: 'fullscreen', title: 'Enable Full Screen', icon: <Maximize className="h-4 w-4" /> });
    steps.push({ id: steps.length + 1, key: 'final', title: 'Final Verification', icon: <ShieldCheck className="h-4 w-4" /> });
    return steps;
  }, [cameraRequired, fullscreenRequired]);
  const completedSetupStepSet = useMemo(() => new Set(completedSetupSteps), [completedSetupSteps]);
  const setupStepIsDone = useCallback((key) => {
    return completedSetupStepSet.has(key);
  }, [completedSetupStepSet]);
  const currentSetupStepKey = setupSteps.find((item) => item.id === validationStep)?.key || setupSteps[0]?.key;
  const resetSecuritySetupProgress = useCallback(() => {
    setCompletedSetupSteps([]);
    setValidationStep(1);
    setValidationState({
      fullscreen: false,
      environment: false,
      camera: false,
      face: false,
      location: false,
      final: false,
    });
    setLocationData(null);
    setValidationMessage('');
    setFaceStatus('idle');
  }, []);
  const syncCompletedSecuritySteps = useCallback((completedSteps = []) => {
    const orderedCompletedSteps = setupSteps
      .map((item) => item.key)
      .filter((key) => completedSteps.includes(key));
    const completed = new Set(orderedCompletedSteps);
    setCompletedSetupSteps(orderedCompletedSteps);
    setValidationState((prev) => ({
      ...prev,
      environment: completed.has('environment'),
      camera: completed.has('camera'),
      face: completed.has('camera'),
      fullscreen: completed.has('fullscreen'),
      location: completed.has('location'),
      final: completed.has('final'),
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
        text: securityNotice || 'Camera cannot detect your face.',
      };
    }
    if (streamRef.current || cameraIndicator === 'normal') {
      return {
        ok: true,
        text: 'Camera monitoring active.',
      };
    }
    return {
      ok: false,
      text: 'Waiting for a stable camera feed.',
    };
  }, [cameraRequired, cameraIndicator, securityStatus.cameraActive, securityNotice]);

  const answersArray = useMemo(() => (
    Object.entries(answersMap).map(([key, value]) => {
      const [sectionIndex, questionIndex] = key.split('-').map(Number);
      const displayQuestion = assessment?.sections?.[sectionIndex]?.questions?.[questionIndex];
      const originSectionIndex = Number(displayQuestion?.__originSectionIndex ?? sectionIndex);
      const originQuestionIndex = Number(displayQuestion?.__originQuestionIndex ?? questionIndex);
      const payload = { ...value };
      if (typeof value?.answer === 'number' && Array.isArray(displayQuestion?.__optionOrder)) {
        payload.answer = displayQuestion.__optionOrder[value.answer] ?? value.answer;
      }
      return { sectionIndex: originSectionIndex, questionIndex: originQuestionIndex, ...payload };
    })
  ), [answersMap, assessment]);
  const flatQuestions = useMemo(() => {
    const list = [];
    (assessment?.sections || []).forEach((sec, secIdx) => {
      (sec.questions || []).forEach((question, qIdx) => {
        list.push({ sectionIndex: secIdx, questionIndex: qIdx, section: sec, question });
      });
    });
    return list;
  }, [assessment]);
  const sectionLockPlan = useMemo(() => {
    if (!assessment?.sections?.length || !sectionWiseLock) return [];
    const totalDurationMs = Math.max(0, Number(assessment.duration || 0)) * 60 * 1000;
    const totalQuestionCount = Math.max(1, flatQuestions.length);
    let elapsed = 0;
    return (assessment.sections || []).map((sec) => {
      const questionCount = Math.max(1, sec.questions?.length || 0);
      const durationMs = Math.round((totalDurationMs * questionCount) / totalQuestionCount);
      const startsAtMs = elapsed;
      elapsed += durationMs;
      return {
        startsAtMs,
        endsAtMs: elapsed,
      };
    });
  }, [assessment, sectionWiseLock, flatQuestions.length]);

  const elapsedAssessmentMs = useMemo(() => {
    if (!assessment?.duration) return 0;
    const totalDurationMs = Math.max(0, Number(assessment.duration || 0)) * 60 * 1000;
    return Math.max(0, totalDurationMs - timeLeft);
  }, [assessment?.duration, timeLeft]);

  const isSectionLocked = useCallback((sectionIndex) => {
    if (!sectionWiseLock) return false;
    const plan = sectionLockPlan[sectionIndex];
    if (!plan) return false;
    return elapsedAssessmentMs > plan.endsAtMs + (sectionGraceSec * 1000);
  }, [sectionWiseLock, sectionLockPlan, elapsedAssessmentMs, sectionGraceSec]);

  const sectionStarts = useMemo(() => {
    let count = 0;
    return (assessment?.sections || []).map((sec) => {
      const start = count;
      count += sec.questions?.length || 0;
      return start;
    });
  }, [assessment]);

  const sectionSummaries = useMemo(() => (
    (assessment?.sections || []).map((sec, index) => {
      const count = sec?.questions?.length || 0;
      const start = (sectionStarts[index] || 0) + 1;
      const end = count > 0 ? start + count - 1 : start;
      return {
        index,
        count,
        start,
        end,
        label: sec?.sectionName || `Section ${index + 1}`,
        typeLabel: formatSectionTypeLabel(sec?.type),
      };
    })
  ), [assessment?.sections, sectionStarts]);

  const typeQuestionNumbers = useMemo(() => {
    let mcqCount = 0;
    let codingCount = 0;
    const map = {};
    flatQuestions.forEach((item) => {
      const key = `${item.sectionIndex}-${item.questionIndex}`;
      if (item.section?.type === 'coding') {
        codingCount += 1;
        map[key] = codingCount;
      } else {
        mcqCount += 1;
        map[key] = mcqCount;
      }
    });
    return map;
  }, [flatQuestions]);

  const currentFlatIndex = useMemo(() => (
    flatQuestions.findIndex((item) => item.sectionIndex === activeSection && item.questionIndex === activeQuestion)
  ), [flatQuestions, activeSection, activeQuestion]);

  const totalQuestions = flatQuestions.length;
  const currentQuestionNumber = currentFlatIndex >= 0 ? currentFlatIndex + 1 : 1;
  const hasPrevQuestion = currentFlatIndex > 0;
  const hasNextQuestion = currentFlatIndex >= 0 && currentFlatIndex < totalQuestions - 1;

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

  useEffect(() => {
    securityStatusRef.current = securityStatus;
  }, [securityStatus]);

  useEffect(() => {
    violationScoreRef.current = violationScore;
  }, [violationScore]);

  useEffect(() => {
    pauseCountRef.current = pauseCount;
  }, [pauseCount]);

  const stopAiProctoring = useCallback(() => {
    if (proctoringManagerRef.current) {
      proctoringManagerRef.current.stop();
      proctoringManagerRef.current = null;
    }
    setProctoringStatus(null);
  }, []);

  const handleAiViolationConfirmed = useCallback(async (event) => {
    if (!assessment?._id || !event?.type) return;

    const limitExceeded = Boolean(event.metadata?.limitExceeded);
    setSecurityNotice(event.message || 'Camera attention needed. Please adjust and continue.');
    setAiWarnings((prev) => prev + 1);

    try {
      await logAiProctoringViolation({
        assessmentId: assessment._id,
        submissionId: submission?._id,
        violation: event,
      });
    } catch (err) {
      console.warn('AI proctoring violation logging failed; assessment will continue.', err);
    }

    if (limitExceeded) {
      setSecurityNotice(`${event.message || 'Camera attention needed.'} Repeated AI violation detected.`);
    }
  }, [assessment?._id, submission?._id]);

  const handleAiProctoringError = useCallback((error) => {
    // AI proctoring should never interrupt the existing assessment flow in this step.
    console.warn('AI Proctoring error', error);
  }, []);

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
      stopAiProctoring();
      toast.success(auto ? 'Time is up. Assessment auto-submitted.' : 'Assessment submitted successfully');
      navigate('/student/assessments');
    } catch (err) {
      toast.error(err.message || 'Failed to submit assessment');
    } finally {
      setSaving(false);
    }
  }, [assessment, answersArray, tabSwitches, fullscreenExits, copyPasteCount, cameraFlags, violationScore, pauseCount, lastPauseAt, securityHeartbeat, violations, stopAiProctoring, toast, navigate]);

  const triggerForcePause = useCallback((type, message, serverState = {}) => {
    if (SOFT_FOOTER_WARNING_TYPES.has(type)) {
      setSecurityNotice(message || 'Security attention needed. Please correct it and continue.');
      setSecurityAction('warn');
      setIsPaused(false);
      if (phase === 'violation') setPhase('active');
      return;
    }

    const nowIso = serverState.pauseStartedAt || serverState.lastPauseAt || new Date().toISOString();
    const pauseStartMs = new Date(nowIso).getTime();
    const effectivePauseStart = Number.isFinite(pauseStartMs) ? pauseStartMs : Date.now();
    setLastPauseAt(nowIso);
    setSecurityRecheckStartedAt(effectivePauseStart);
    setSecurityRecheckRemainingSec(Number(serverState.securityRecheckTimeoutSec || securityRecheckTimeoutSec));
    securityRecheckAutoSubmitRef.current = false;
    setPauseCount((prev) => Math.max(prev + 1, Number(serverState.pauseCount || 0)));
    setViolationMessage(message || 'Security Violation Detected');
    setSecurityAction('pause');
    setIsPaused(true);
    resetSecuritySetupProgress();
    setPhase('violation');
  }, [phase, resetSecuritySetupProgress, securityRecheckTimeoutSec]);

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
      title = 'Camera attention needed';
      text = message || 'Camera visibility is unstable. Please return to the frame.';
      tone = 'warning';
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

  const closeSecurityPopup = useCallback(() => {
    if (timedWarningTimerRef.current) {
      clearInterval(timedWarningTimerRef.current);
      timedWarningTimerRef.current = null;
    }
    setTimedWarningRemainingSec(0);
    setSecurityPopup((prev) => ({ ...prev, open: false }));
  }, []);

  const showTimedSecurityWarning = useCallback(({ title, message, tone = 'warning', notice }) => {
    const now = Date.now();
    const warningUntil = now + RESTRICTED_ACTION_WARNING_MS;
    restrictedActionGraceUntilRef.current = Math.max(restrictedActionGraceUntilRef.current, warningUntil);
    restrictedActionNoticeRef.current = notice || message || 'Restricted action recorded as a warning. Continue the assessment.';

    if (timedWarningTimerRef.current) clearInterval(timedWarningTimerRef.current);
    setSecurityPopup({ open: true, title, message, tone });
    setTimedWarningRemainingSec(Math.ceil(RESTRICTED_ACTION_WARNING_MS / 1000));
    setSecurityNotice(restrictedActionNoticeRef.current);

    timedWarningTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((warningUntil - Date.now()) / 1000));
      setTimedWarningRemainingSec(remaining);
      if (remaining <= 0) {
        clearInterval(timedWarningTimerRef.current);
        timedWarningTimerRef.current = null;
        setSecurityPopup((prev) => ({ ...prev, open: false }));
      }
    }, 250);
  }, []);

  const showScreenshotBlockedPopup = useCallback(() => {
    const now = Date.now();
    if (now - lastScreenshotWarningAtRef.current < 1500) return;
    lastScreenshotWarningAtRef.current = now;
    screenshotGraceUntilRef.current = now + SCREENSHOT_WARNING_GRACE_MS;
    const warningCount = totalWarnings + 1;
    setScreenshotWarnings((prev) => prev + 1);
    showTimedSecurityWarning({
      title: 'Screenshots are not allowed',
      message: `Screenshots are not allowed. Warning count: ${warningCount}.`,
      tone: 'warning',
      notice: 'Screenshot attempt recorded as a warning. Continue the assessment.',
    });
    setSecurityNotice(`Screenshots are not allowed. Warning count: ${warningCount}.`);
  }, [showTimedSecurityWarning, totalWarnings]);

  const recordViolation = useCallback(async (type, message, meta = {}) => {
    if (isSubmitted || !assessment?._id || !CSE_VALID_VIOLATIONS.has(type)) return null;
    const now = Date.now();
    const throttleKey = `${type}:${meta.source || meta.reason || 'default'}:${meta.escalated ? 'escalated' : 'base'}`;
    const throttleMs = type === 'tab_switch' || meta.escalated ? 700 : 3500;
    if (now - (violationThrottleRef.current[throttleKey] || 0) < throttleMs) return null;
    violationThrottleRef.current[throttleKey] = now;

    const detectionOnly = NON_BLOCKING_DETECTION_TYPES.has(type) || meta.warningOnly === true;
    const weight = detectionOnly ? 0 : getViolationWeight(securitySettings, type);
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
      if (typeof result?.violationScore === 'number' && !detectionOnly) setViolationScore(result.violationScore);
      if (typeof result?.pauseCount === 'number' && !detectionOnly) setPauseCount(result.pauseCount);
      if (result?.lastPauseAt && !detectionOnly) setLastPauseAt(result.lastPauseAt);
      const action = detectionOnly ? 'warn' : normalizeAction(result?.action, result?.autoSubmit ? 'autosubmit' : 'warn');
      setSecurityAction(action);
      if (action === 'autosubmit') {
        toast.error('Violation limit reached. Assessment auto-submitted.');
        await handleSubmit(true);
        return result;
      }
      if (action === 'pause' && !SOFT_FOOTER_WARNING_TYPES.has(type)) {
        triggerForcePause(type, message, result);
        return result;
      }
      if (SOFT_FOOTER_WARNING_TYPES.has(type)) {
        setSecurityNotice(message);
      } else if (meta.localPopupShown) {
        setSecurityNotice(message);
      } else {
        showSecurityPopup(type, message, entry.meta, result);
        toast.info(message);
      }
      return result;
    } catch {
      if (SOFT_FOOTER_WARNING_TYPES.has(type) || meta.localPopupShown) {
        setSecurityNotice(message);
      } else {
        showSecurityPopup(type, message, entry.meta);
      }
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

  const handleAiPreviewDragStart = useCallback((event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const preview = aiPreviewRef.current;
    if (!preview) return;

    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const rect = preview.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    const size = { width: rect.width, height: rect.height };
    let nextPosition = clampAiPreviewPosition({ x: startLeft, y: startTop, ...size });
    setAiPreviewPosition(nextPosition);

    const schedule = (moveEvent) => {
      nextPosition = clampAiPreviewPosition({
        x: startLeft + (moveEvent.clientX - startX),
        y: startTop + (moveEvent.clientY - startY),
        ...size,
      });
      if (aiPreviewDragFrameRef.current) return;
      aiPreviewDragFrameRef.current = requestAnimationFrame(() => {
        aiPreviewDragFrameRef.current = null;
        setAiPreviewPosition(nextPosition);
      });
    };

    const handlePointerMove = (moveEvent) => {
      schedule(moveEvent);
    };

    const handlePointerUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (aiPreviewDragFrameRef.current) {
        cancelAnimationFrame(aiPreviewDragFrameRef.current);
        aiPreviewDragFrameRef.current = null;
      }
      setAiPreviewPosition(nextPosition);
      try {
        localStorage.setItem(aiPreviewStorageKey, JSON.stringify(nextPosition));
      } catch {
        // Ignore storage failures; dragging should still work for this page.
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [aiPreviewStorageKey]);

  useEffect(() => {
    if (!aiPreviewPosition) return undefined;
    const handleResize = () => {
      const rect = aiPreviewRef.current?.getBoundingClientRect();
      const size = rect ? { width: rect.width, height: rect.height } : {};
      setAiPreviewPosition((prev) => {
        if (!prev) return prev;
        const next = clampAiPreviewPosition({ ...prev, ...size });
        try {
          localStorage.setItem(aiPreviewStorageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [aiPreviewPosition, aiPreviewStorageKey]);

  useEffect(() => {
    return () => {
      if (aiPreviewDragFrameRef.current) cancelAnimationFrame(aiPreviewDragFrameRef.current);
    };
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
      const attemptAssessment = transformAssessmentForAttempt(data.assessment, data.submission?._id || `${id}:preview`);
      setAssessment(attemptAssessment);
      setSubmission(data.submission);
      const locallySawRules = localStorage.getItem(rulesSeenStorageKey) === '1';
      setHasSeenRules(Boolean(data.submission?.startedAt) || locallySawRules);

      const initialAnswers = {};
      const displayIndexLookup = new Map();
      (attemptAssessment?.sections || []).forEach((sectionItem, displaySectionIndex) => {
        (sectionItem.questions || []).forEach((questionItem, displayQuestionIndex) => {
          const originSectionIndex = Number(questionItem.__originSectionIndex ?? displaySectionIndex);
          const originQuestionIndex = Number(questionItem.__originQuestionIndex ?? displayQuestionIndex);
          displayIndexLookup.set(`${originSectionIndex}-${originQuestionIndex}`, { displaySectionIndex, displayQuestionIndex, questionItem });
        });
      });
      (data.submission?.answers || []).forEach((ans) => {
        const mapped = displayIndexLookup.get(`${ans.sectionIndex}-${ans.questionIndex}`);
        if (!mapped) return;
        const displayAnswer = { answer: ans.answer, language: ans.language, code: ans.code };
        if (typeof ans.answer === 'number' && Array.isArray(mapped.questionItem?.__optionOrder)) {
          displayAnswer.answer = mapped.questionItem.__optionOrder.findIndex((optionIndex) => optionIndex === ans.answer);
        }
        initialAnswers[answerKey(mapped.displaySectionIndex, mapped.displayQuestionIndex)] = {
          ...displayAnswer,
        };
      });
      (attemptAssessment?.sections || []).forEach((sectionItem, displaySectionIndex) => {
        if (sectionItem?.type !== 'coding') return;
        (sectionItem.questions || []).forEach((questionItem, displayQuestionIndex) => {
          const key = answerKey(displaySectionIndex, displayQuestionIndex);
          const existingAnswer = initialAnswers[key] || {};
          const codingData = getCodingDataFromQuestion(questionItem);
          const languages = getCodingLanguagesFromData(codingData);
          const language = existingAnswer.language || languages[0];
          const hasCode = typeof existingAnswer.code === 'string' && existingAnswer.code.trim();
          initialAnswers[key] = {
            ...existingAnswer,
            language,
            code: hasCode ? existingAnswer.code : getStarterCodeForLanguage(codingData, language),
          };
        });
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
      const loadedTimeoutSec = Math.min(
        1800,
        Math.max(30, Number(data.securityRecheckTimeoutSec || data.assessment?.settings?.securityRecheckTimeoutSec || 180) || 180),
      );
      const pauseStartMs = data.submission?.pauseStartedAt ? new Date(data.submission.pauseStartedAt).getTime() : null;
      const hasActiveSecurityPause = data.submission?.status !== 'submitted' && Number.isFinite(pauseStartMs);
      if (hasActiveSecurityPause) {
        const elapsedSec = Math.floor((Date.now() - pauseStartMs) / 1000);
        setIsPaused(true);
        setSecurityRecheckStartedAt(pauseStartMs);
        setSecurityRecheckRemainingSec(Math.max(0, loadedTimeoutSec - elapsedSec));
        securityRecheckAutoSubmitRef.current = false;
      } else {
        setIsPaused(false);
        setSecurityRecheckStartedAt(null);
        setSecurityRecheckRemainingSec(0);
      }

      const shouldSkipValidation = Boolean(
        data.submission?.status === 'submitted'
        || (data.submission?.status === 'in_progress' && data.submission?.startedAt && !data.requiresSecuritySetup),
      );
      if (hasActiveSecurityPause) {
        setPhase('validation');
      } else if (shouldSkipValidation) {
        setPhase('active');
      } else {
        setPhase('validation');
      }
    } catch (err) {
      setError(err.message || 'Unable to load assessment');
    } finally {
      setLoading(false);
    }
  }, [id, rulesSeenStorageKey, syncCompletedSecuritySteps]);

  useEffect(() => {
    loadAssessment();
  }, [loadAssessment]);

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
  }, [assessment, isCodingForLayout]);

  useEffect(() => {
    const currentType = assessment?.sections?.[activeSection]?.type === 'coding' ? 'coding' : 'mcq';
    setNavTypeFilter((prev) => (prev === 'all' ? currentType : prev));
  }, [assessment, activeSection]);

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
      const remaining = allowedEndTime - now;
      setTimeLeft(remaining);
      if (remaining <= 0 && submission?.status !== 'submitted' && autoSubmitOnEnd) {
        handleSubmit(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [assessment, submission, offset, allowedEndTime, isPaused, phase, autoSubmitOnEnd, handleSubmit]);

  useEffect(() => {
    if (!securityRecheckActive || !securityRecheckStartedAt) return undefined;
    const tick = () => {
      const elapsedSec = Math.floor((Date.now() - securityRecheckStartedAt) / 1000);
      const remaining = Math.max(0, securityRecheckTimeoutSec - elapsedSec);
      setSecurityRecheckRemainingSec(remaining);
      if (remaining <= 0 && !securityRecheckAutoSubmitRef.current) {
        securityRecheckAutoSubmitRef.current = true;
        toast.error('Security recheck time expired. Assessment is being auto-submitted.');
        void handleSubmit(true);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [securityRecheckActive, securityRecheckStartedAt, securityRecheckTimeoutSec, handleSubmit, toast]);

  useEffect(() => {
    return () => {
      if (timedWarningTimerRef.current) clearInterval(timedWarningTimerRef.current);
    };
  }, []);

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
      const screenshotWarningActive = Date.now() < screenshotGraceUntilRef.current
        || Date.now() < restrictedActionGraceUntilRef.current
        || Date.now() - lastScreenshotWarningAtRef.current < SCREENSHOT_WARNING_GRACE_MS;
      if (screenshotWarningActive) {
        setSecurityStatus((prev) => ({ ...prev, tabActive: true }));
        setSecurityNotice(restrictedActionNoticeRef.current);
        return;
      }
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
    if (!secureActive || (!copyBlockEnabled && !screenshotProtectionEnabled)) return undefined;
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
      if (!copyBlockEnabled) return;
      stopRestrictedEvent(event, 'copy_paste', 'Copy action blocked by assessment rules.');
    };
    const handleCut = (event) => {
      if (!copyBlockEnabled) return;
      stopRestrictedEvent(event, 'copy_paste', 'Cut action blocked by assessment rules.');
    };
    const handlePaste = (event) => {
      if (!copyBlockEnabled) return;
      stopRestrictedEvent(event, 'copy_paste', 'Paste action blocked by assessment rules.');
    };
    const handleContextMenu = (event) => {
      if (!blockRightClick) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const warningCount = totalWarnings + 1;
      showTimedSecurityWarning({
        title: 'Right-click blocked',
        message: `Right-click is disabled for this assessment. Warning count: ${warningCount}.`,
        tone: 'warning',
        notice: 'Right-click attempt recorded as a warning. Continue the assessment.',
      });
      void recordViolation('context_menu', 'Right-click menu blocked by assessment rules.', {
        source: event.type,
        warningOnly: true,
        localPopupShown: true,
      });
    };
    const handleDrop = (event) => {
      if (!copyBlockEnabled) return;
      stopRestrictedEvent(event, 'copy_paste', 'Drag/drop content insertion blocked by assessment rules.');
    };
    const handleDragStart = (event) => {
      if (!copyBlockEnabled) return;
      stopRestrictedEvent(event, 'copy_paste', 'Dragging selected content is blocked by assessment rules.');
    };
    const handleBeforeInput = (event) => {
      if (!copyBlockEnabled) return;
      if (BLOCKED_INPUT_TYPES.has(event.inputType)) {
        stopRestrictedEvent(event, 'copy_paste', 'Paste or drop input blocked by assessment rules.', {
          inputType: event.inputType,
        });
      }
    };
    const handleKeydown = (event) => {
      const key = event.key?.toLowerCase();
      const screenshotShortcut = screenshotProtectionEnabled && (
        key === 'printscreen'
        || event.code === 'PrintScreen'
        || ((event.metaKey || event.ctrlKey) && event.shiftKey && ['3', '4', '5'].includes(key))
      );
      if (screenshotShortcut) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        showScreenshotBlockedPopup();
        return;
      }
      if (!copyBlockEnabled) return;
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
    window.addEventListener('keyup', handleKeydown, capture);
    return () => {
      document.removeEventListener('copy', handleCopy, capture);
      document.removeEventListener('cut', handleCut, capture);
      document.removeEventListener('paste', handlePaste, capture);
      document.removeEventListener('contextmenu', handleContextMenu, capture);
      document.removeEventListener('drop', handleDrop, capture);
      document.removeEventListener('dragstart', handleDragStart, capture);
      document.removeEventListener('beforeinput', handleBeforeInput, capture);
      document.removeEventListener('keydown', handleKeydown, capture);
      window.removeEventListener('keyup', handleKeydown, capture);
    };
  }, [secureActive, copyBlockEnabled, screenshotProtectionEnabled, blockRightClick, recordViolation, showScreenshotBlockedPopup, showTimedSecurityWarning, totalWarnings]);

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
        const screenshotWarningActive = Date.now() < screenshotGraceUntilRef.current
          || Date.now() < restrictedActionGraceUntilRef.current
          || Date.now() - lastScreenshotWarningAtRef.current < SCREENSHOT_WARNING_GRACE_MS;
        if (screenshotWarningActive) {
          setSecurityStatus((prev) => ({ ...prev, fullscreen: true }));
          setFullscreenRecovery({ active: false, remaining: 0 });
          setSecurityNotice(restrictedActionNoticeRef.current);
          return;
        }
        setSecurityStatus((prev) => ({ ...prev, fullscreen: false }));
        setFullscreenRecovery({ active: true, remaining: fullscreenTimeoutSec || 0 });
        setSecurityNotice('Fullscreen is off. Re-enter fullscreen to continue without a warning.');
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
    const completed = completedSetupStepSet;
    const nextStep = setupSteps.find((item) => !completed.has(item.key));
    setValidationStep((prev) => {
      const currentStepStillPending = setupSteps.some((item) => item.id === prev && !completed.has(item.key));
      return currentStepStillPending ? prev : (nextStep?.id || setupSteps.length);
    });
    setValidationState((prev) => ({
      ...prev,
      fullscreen: completed.has('fullscreen') || Boolean(document.fullscreenElement),
      environment: completed.has('environment'),
      camera: completed.has('camera') || !cameraRequired || Boolean(streamRef.current),
      face: completed.has('camera') || !cameraRequired,
      location: completed.has('location'),
      final: completed.has('final'),
    }));
    if (!completed.has('location')) setLocationData(null);
    setValidationMessage('');
    setFaceStatus(streamRef.current ? 'detecting' : 'idle');
  }, [phase, cameraRequired, completedSetupStepSet, setupSteps]);

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
      stopAiProctoring();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current?.close) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stopAiProctoring]);

  useEffect(() => {
    const assessmentCameraReady = Boolean(streamRef.current);

    if (!secureActive || !aiProctoringEnabled || !assessment?._id || !submission?._id || !assessmentCameraReady) {
      stopAiProctoring();
      return undefined;
    }

    if (proctoringManagerRef.current) return undefined;

    let cancelled = false;
    const manager = new ProctoringManager({
      assessmentId: assessment._id,
      submissionId: submission._id,
      settings: securitySettings.aiProctoring,
      videoElement: aiProctoringVideoRef.current,
      stream: streamRef.current,
      requireExistingStream: true,
      onStatusChange: setProctoringStatus,
      onViolationConfirmed: handleAiViolationConfirmed,
      onError: handleAiProctoringError,
    });

    proctoringManagerRef.current = manager;
    setProctoringStatus(manager.getStatus());

    void manager.start().then(() => {
      if (cancelled) manager.stop();
    });

    return () => {
      cancelled = true;
      stopAiProctoring();
    };
  }, [
    secureActive,
    aiProctoringEnabled,
    assessment?._id,
    submission?._id,
    securitySettings.aiProctoring,
    securityStatus.cameraActive,
    stopAiProctoring,
    handleAiViolationConfirmed,
    handleAiProctoringError,
  ]);

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
      setSecurityNotice(message);
      if (type === 'camera_no_face') {
        setFaceStatus('idle');
      }
      if (SOFT_CAMERA_WARNING_TYPES.has(type)) {
        return;
      }
      if (nextCount >= CAMERA_WARNING_STREAK_LIMIT) {
        void recordViolation(type, message, {
          ...meta,
          source: 'camera_monitor',
          persistent: true,
        });
      }
    };
    const markCameraNormal = () => {
      cameraViolationStreakRef.current = { type: '', count: 0, at: Date.now() };
      setCameraIndicator('normal');
      setSecurityStatus((prev) => ({ ...prev, cameraActive: true }));
      setSecurityNotice('');
      setFaceStatus('detected');
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
            emitCameraViolation('camera_no_face', 'Camera cannot detect your face. Please stay centered in frame.', { confidence: 0.95 });
            return;
          }
          if (faces.length > 1) {
            emitCameraViolation('multiple_faces', 'Multiple faces detected in camera view.', { faces: faces.length, confidence: 0.95 });
            return;
          }
          const box = faces[0].boundingBox || {};
          const centerX = (box.x || 0) + (box.width || 0) / 2;
          const centerY = (box.y || 0) + (box.height || 0) / 2;
          const offCenter = Math.abs(centerX - video.videoWidth / 2) > video.videoWidth * FACE_CENTER_TOLERANCE_RATIO
            || Math.abs(centerY - video.videoHeight / 2) > video.videoHeight * FACE_CENTER_TOLERANCE_RATIO
            || (box.width || 0) < video.videoWidth * FACE_MIN_WIDTH_RATIO;
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
        emitCameraViolation('camera_no_face', 'Camera cannot detect your face. Please stay centered in frame.', {
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
    if (!secureActive || !cameraRequired || !assessment?._id) return undefined;
    const intervalSec = Math.max(15, Number(securitySettings.cameraSnapshotInterval || 120) || 120);
    const timer = setInterval(() => {
      const video = monitorVideoRef.current;
      if (!video || video.readyState < 2) return;
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      void api.logStudentAssessmentMonitoring(assessment._id, {
        snapshot: {
          type: 'camera',
          capturedAt: new Date().toISOString(),
          dataUrl: canvas.toDataURL('image/jpeg', 0.45),
          width: canvas.width,
          height: canvas.height,
        },
      }).catch(() => {});
    }, intervalSec * 1000);
    return () => clearInterval(timer);
  }, [secureActive, cameraRequired, assessment?._id, securitySettings.cameraSnapshotInterval]);

  useEffect(() => {
    if (!secureActive || !audioMonitoringEnabled || !assessment?._id || !streamRef.current) return undefined;
    let cancelled = false;
    const threshold = Math.max(10, Number(securitySettings.audioNoiseThreshold || 65) || 65);
    const cooldownMs = Math.max(5000, (Number(securitySettings.audioEventCooldownSec || 20) || 20) * 1000);
    const setup = async () => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        audioContextRef.current = audioContextRef.current || new AudioCtx();
        const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioAnalyserRef.current = analyser;
        audioDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      } catch {
        // ignore unsupported audio analysis
      }
    };
    void setup();
    const interval = setInterval(() => {
      if (cancelled || !audioAnalyserRef.current || !audioDataRef.current) return;
      audioAnalyserRef.current.getByteFrequencyData(audioDataRef.current);
      const avg = audioDataRef.current.reduce((sum, value) => sum + value, 0) / Math.max(1, audioDataRef.current.length);
      const pseudoDb = Math.round((avg / 255) * 100);
      if (pseudoDb < threshold) return;
      const now = Date.now();
      if (now - (monitoringCooldownRef.current.audio || 0) < cooldownMs) return;
      monitoringCooldownRef.current.audio = now;
      setSecurityNotice(`Background noise is above the allowed threshold (${pseudoDb}/${threshold}). Please keep your environment quiet.`);
      void api.logStudentAssessmentMonitoring(assessment._id, {
        event: {
          type: 'audio_threshold',
          at: new Date().toISOString(),
          message: 'Audio threshold exceeded during assessment.',
          meta: { level: pseudoDb, threshold },
        },
      }).catch(() => {});
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [secureActive, audioMonitoringEnabled, assessment?._id, securitySettings.audioNoiseThreshold, securitySettings.audioEventCooldownSec]);

  useEffect(() => {
    if (!secureActive) return undefined;
    const sendHeartbeat = async () => {
      const screenshotGraceActive = Date.now() < screenshotGraceUntilRef.current;
      const restrictedWarningActive = Date.now() < restrictedActionGraceUntilRef.current;
      const screenshotWarningRecent = Date.now() - lastScreenshotWarningAtRef.current < SCREENSHOT_WARNING_GRACE_MS;
      const warningGraceActive = screenshotGraceActive || restrictedWarningActive || screenshotWarningRecent;
      const fullscreenRecoveryActive = Boolean(fullscreenRecovery.active);
      const status = {
        fullscreen: warningGraceActive || fullscreenRecoveryActive || !fullscreenRequired || Boolean(document.fullscreenElement),
        tabActive: warningGraceActive || !tabGuardEnabled || (document.hasFocus() && !document.hidden),
        cameraActive: !cameraRequired || Boolean(streamRef.current),
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
        if (result?.inconsistent && warningGraceActive) {
          setSecurityNotice(restrictedActionNoticeRef.current);
          return;
        }
        if (result?.inconsistent && !warningGraceActive) {
          await recordViolation('heartbeat_failure', 'Security heartbeat reported an inconsistent session state.', {
            source: 'heartbeat_inconsistent',
            status,
          });
          return;
        }
      } catch {
        if (warningGraceActive) {
          setSecurityNotice(restrictedActionNoticeRef.current);
          return;
        }
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
  }, [secureActive, assessment?._id, fullscreenRequired, fullscreenRecovery.active, tabGuardEnabled, cameraRequired, cameraFlags, handleSubmit, recordViolation, triggerForcePause]);

  const updateAnswer = (sectionIndex, questionIndex, value) => {
    setAnswersMap((prev) => ({
      ...prev,
      [answerKey(sectionIndex, questionIndex)]: { ...prev[answerKey(sectionIndex, questionIndex)], ...value },
    }));
  };

  const updateCodingLanguage = (sectionIndex, questionIndex, nextLanguage) => {
    const sectionItem = assessment?.sections?.[sectionIndex];
    const questionItem = sectionItem?.questions?.[questionIndex];
    if (!questionItem || sectionItem?.type !== 'coding') {
      updateAnswer(sectionIndex, questionIndex, { language: nextLanguage });
      return;
    }

    const key = answerKey(sectionIndex, questionIndex);
    setAnswersMap((prev) => {
      const existingAnswer = prev[key] || {};
      const previousLanguage = existingAnswer.language || getCodingLanguagesFromData(getCodingDataFromQuestion(questionItem))[0];
      const currentCode = existingAnswer.code || '';
      const previousStarter = getCodingStarterCode(questionItem, previousLanguage);
      const nextStarter = getCodingStarterCode(questionItem, nextLanguage);
      const shouldUseTemplate = !String(currentCode).trim()
        || String(currentCode).trim() === String(previousStarter).trim();
      return {
        ...prev,
        [key]: {
          ...existingAnswer,
          language: nextLanguage,
          code: shouldUseTemplate ? nextStarter : currentCode,
        },
      };
    });
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
    const videos = [validationVideoRef.current, monitorVideoRef.current, aiProctoringVideoRef.current];
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
        setValidationState((prev) => ({ ...prev, fullscreen: false }));
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
        setValidationState((prev) => ({ ...prev, environment: false }));
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
          setValidationState((prev) => ({ ...prev, camera: false, face: false }));
          setFaceStatus('idle');
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
      setLocationData(null);
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
    if (!setupStepIsDone('final')) {
      toast.error('Complete the final system check before starting.');
      setPhase('validation');
      return;
    }
    try {
      if (fullscreenRequired) await requestFullscreen();
      if (cameraRequired) await ensureCamera();
      const data = await api.beginStudentAssessment(assessment._id);
      const serverTime = new Date(data.serverTime).getTime();
      const serverAllowedEnd = new Date(data.allowedEnd).getTime();
      setOffset(serverTime - Date.now());
      setTimeLeft(serverAllowedEnd - serverTime);
      setAllowedEndTime(serverAllowedEnd);
      setSubmission(data.submission);
      setIsPaused(false);
      setSecurityRecheckStartedAt(null);
      setSecurityRecheckRemainingSec(0);
      securityRecheckAutoSubmitRef.current = false;
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
      if (err?.response?.status === 409) {
        toast.error(err.message || 'Security recheck time expired. Assessment was auto-submitted.');
        navigate('/student/assessments');
        return;
      }
      toast.error(err.message || 'Unable to start assessment.');
    }
  };

  const handleRunCoding = () => {
    if (!assessment || isSubmitted) return;
    const section = assessment?.sections?.[activeSection];
    if (!section || section.type !== 'coding') return;
    const question = section?.questions?.[activeQuestion];
    const key = answerKey(activeSection, activeQuestion);
    const codingData = getCodingDataFromQuestion(question);
    const problemId = question?.problemId || question?.coding?.problemId || codingData?._id;
    if (!problemId) {
      toast.error('This coding question is missing its problem reference.');
      return;
    }
    const supported = getCodingLanguagesFromData(codingData);
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
    const codingData = getCodingDataFromQuestion(question);
    const problemId = question?.problemId || question?.coding?.problemId || codingData?._id;
    if (!problemId) {
      toast.error('This coding question is missing its problem reference.');
      return;
    }
    const supported = getCodingLanguagesFromData(codingData);
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
    const question = section?.questions?.[activeQuestion];
    const codingData = getCodingDataFromQuestion(question);
    const supported = getCodingLanguagesFromData(codingData);
    const language = answersMap[key]?.language || supported[0];
    setAnswersMap((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        language,
        code: getStarterCodeForLanguage(codingData, language),
      },
    }));
  };

  const getNavigationRestrictionMessage = (sectionIndex, questionIndex) => {
    if (isSectionLocked(sectionIndex)) {
      const targetSummary = sectionSummaries[sectionIndex];
      return `${targetSummary?.label || `Section ${sectionIndex + 1}`} is locked by the section timer. You can continue only in unlocked sections.`;
    }
    if (!restrictNavigation) return '';
    const targetFlatIndex = flatQuestions.findIndex((item) => item.sectionIndex === sectionIndex && item.questionIndex === questionIndex);
    if (targetFlatIndex === -1) return 'This question is not available.';
    if (targetFlatIndex >= currentFlatIndex) return '';
    const targetNumber = targetFlatIndex + 1;
    const currentSummary = sectionSummaries[activeSection];
    const targetSummary = sectionSummaries[sectionIndex];
    if (allowSectionReview && sectionIndex === activeSection) return '';
    if (allowSectionReview) {
      return `You are now in ${currentSummary?.label || `Section ${activeSection + 1}`}. This assessment allows review only inside the current section, so Question ${targetNumber} in ${targetSummary?.label || `Section ${sectionIndex + 1}`} cannot be reopened.`;
    }
    return `Backward navigation is locked for this assessment. You have already moved past Question ${targetNumber}, so it cannot be reopened.`;
  };

  const canNavigateToQuestion = (sectionIndex, questionIndex) => {
    return !getNavigationRestrictionMessage(sectionIndex, questionIndex);
  };

  const navigateToQuestion = (sectionIndex, questionIndex) => {
    const restrictionMessage = getNavigationRestrictionMessage(sectionIndex, questionIndex);
    if (restrictionMessage) {
      setSecurityPopup({
        open: true,
        title: 'Navigation locked',
        message: restrictionMessage,
        tone: 'warning',
      });
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
    setMarkedMap((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: true };
    });
    goToNextQuestion();
  };

  const saveAndNext = () => {
    void handleSave();
    goToNextQuestion();
  };

  useEffect(() => {
    if (!sectionWiseLock || !assessment?.sections?.length) return;
    if (!isSectionLocked(activeSection)) return;
    const nextAvailableSection = assessment.sections.findIndex((_, index) => !isSectionLocked(index));
    if (nextAvailableSection >= 0 && nextAvailableSection !== activeSection) {
      setActiveSection(nextAvailableSection);
      setActiveQuestion(0);
      toast.info('The previous section has been locked based on the assessment timing settings.');
    }
  }, [sectionWiseLock, assessment, activeSection, isSectionLocked, toast]);

  const watermarkColumns = useMemo(() => {
    const spacing = Math.max(120, watermarkConfig.spacing);
    return Array.from({ length: 12 }).map((_, index) => ({
      id: `wm-${index}`,
      left: `${(index % 4) * 28 + 6}%`,
      top: `${Math.floor(index / 4) * 30 + 10}%`,
      text: watermarkConfig.text,
      spacing,
    }));
  }, [watermarkConfig]);

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
  const codingData = isCoding ? getCodingDataFromQuestion(question) : null;
  const codingLanguages = isCoding ? getCodingLanguagesFromData(codingData) : [];
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
    ...fallbackRules,
    ...finalRules,
  ];
  const showAssessmentWorkspace = phase === 'active' || isSubmitted;

  const questionNavigatorPanel = (
    (() => {
      const hasMcq = flatQuestions.some((item) => item.section?.type !== 'coding');
      const hasCoding = flatQuestions.some((item) => item.section?.type === 'coding');
      const effectiveFilter = navTypeFilter === 'all'
        ? (section?.type === 'coding' ? 'coding' : 'mcq')
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
      const answeredCnt = navItems.filter((item) => questionStatus(item.sectionIndex, item.questionIndex) === 'answered').length;
      const reviewCnt = navItems.filter((item) => questionStatus(item.sectionIndex, item.questionIndex) === 'review').length;
      const unansweredCnt = navItems.length - answeredCnt - reviewCnt;
      const pct = navItems.length > 0 ? Math.round((answeredCnt / navItems.length) * 100) : 0;
      const currentTypeLabel = effectiveFilter === 'coding' ? 'Coding' : 'MCQ / Short';
      return (
        <aside
          onMouseEnter={() => { if (!allowCollapse || sidebarPinned) return; setSidebarExpanded(true); }}
          onMouseLeave={() => { if (!allowCollapse || sidebarPinned) return; setSidebarExpanded(false); }}
          className={`flex-none shrink-0 w-full lg:min-h-0 lg:overflow-y-auto transition-all duration-300 ease-in-out flex flex-col overflow-hidden rounded-[28px] border border-cyan-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(242,251,252,0.98)_48%,rgba(255,255,255,0.96)_100%)] shadow-[0_28px_70px_-44px_rgba(8,145,178,0.38)] backdrop-blur dark:border-slate-700 dark:bg-gray-900 ${isCollapsed ? 'lg:w-[4.5rem] lg:min-w-[4.5rem]' : 'lg:w-[21.5rem] lg:min-w-[21.5rem]'}`}
          aria-label="Assessment sidebar"
        >
          {/* Header */}
          <div className="relative flex items-center justify-between shrink-0 overflow-hidden border-b border-cyan-200/70 bg-[linear-gradient(135deg,#0f89ab_0%,#12a3bb_35%,#1abc87_100%)] px-5 py-5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_58%)]" />
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-50/90">Question Palette</div>
                <div className="mt-2 text-xl font-black text-white truncate leading-tight">{assessment?.title || 'Assessment'}</div>
                <div className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-cyan-50/95">
                  <span>{currentTypeLabel}</span>
                  <span className="h-1 w-1 rounded-full bg-white/80" />
                  <span>{navItems.length} Questions</span>
                </div>
              </div>
            )}
            {allowCollapse && (
              <button
                type="button"
                onClick={togglePinned}
                className={`relative z-[1] flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/14 text-cyan-50 hover:bg-white/24 hover:text-white transition-colors ${isCollapsed ? 'mx-auto' : 'ml-3'}`}
                aria-label={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                title={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
              >
                {sidebarPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>

          {isCollapsed ? (
            <div className="flex flex-1 flex-col items-center gap-3 bg-white/90 py-5 dark:bg-gray-900">
              <div className="flex flex-col items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-700" title={`Answered: ${answeredCnt}`} />
                <div className="h-2.5 w-2.5 rounded-full bg-rose-600" title={`Not Answered: ${unansweredCnt}`} />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500" title={`Marked: ${reviewCnt}`} />
              </div>
              <div className="h-px w-7 bg-slate-200 dark:bg-gray-700" />
              <div className="text-[9px] font-black text-slate-400 tabular-nums">{pct}%</div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-y-auto bg-white/95 dark:bg-gray-900">
              {/* Type filter */}
              {(hasMcq && hasCoding) && (
                <div className="px-4 pt-4 pb-0 shrink-0">
                  <div className="flex gap-1.5 rounded-2xl border border-cyan-100 bg-[linear-gradient(180deg,#effbfc_0%,#eef8fb_100%)] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                  {hasMcq && (
                    <button type="button" onClick={() => setNavTypeFilter('mcq')}
                      className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-extrabold transition-all ${effectiveFilter === 'mcq' ? 'bg-white text-cyan-800 shadow-[0_10px_24px_-18px_rgba(8,145,178,0.9)] ring-1 ring-cyan-200' : 'text-slate-600 hover:bg-white/80 hover:text-cyan-700 dark:text-gray-300'}`}>
                      MCQ / Short
                    </button>
                  )}
                  {hasCoding && (
                    <button type="button" onClick={() => setNavTypeFilter('coding')}
                      className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-extrabold transition-all ${effectiveFilter === 'coding' ? 'bg-white text-emerald-800 shadow-[0_10px_24px_-18px_rgba(5,150,105,0.9)] ring-1 ring-emerald-200' : 'text-slate-600 hover:bg-white/80 hover:text-emerald-700 dark:text-gray-300'}`}>
                      Coding
                    </button>
                  )}
                  </div>
                </div>
              )}

              {/* Legend */}
              <div className="px-4 pt-4 pb-2 flex flex-wrap gap-x-4 gap-y-2 shrink-0">
                {[['bg-emerald-700','Answered'],['bg-rose-600','Not Done'],['bg-amber-500','Review']].map(([color,label]) => (
                  <span key={label} className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-gray-500">
                    <span className={`h-3 w-3 rounded-[4px] ${color} inline-block shadow-sm`} />{label}
                  </span>
                ))}
              </div>

              {/* Section map */}
              <div className="px-4 pb-2 shrink-0">
                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700">Sections</span>
                    {restrictNavigation && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                        Back locked
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {sectionSummaries.map((summary) => {
                      const isCurrentSection = summary.index === activeSection;
                      return (
                        <div
                          key={`section-map-${summary.index}`}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-[11px] font-semibold ${
                            isCurrentSection
                              ? 'border-cyan-300 bg-white text-cyan-900 shadow-sm'
                              : 'border-cyan-100 bg-white/70 text-slate-600'
                          }`}
                        >
                          <span className="min-w-0 truncate">{summary.label}</span>
                          <span className="shrink-0 text-right text-[10px] font-black uppercase tracking-[0.08em]">
                            Q{summary.start}-Q{summary.end} {summary.typeLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {restrictNavigation && (
                    <p className="mt-2 text-[10px] font-medium leading-4 text-slate-600">
                      {allowSectionReview
                        ? 'You can review only the section you are currently in. Previous sections stay locked.'
                        : 'After moving forward, previous questions stay locked.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Question grid */}
              <div className="px-4 pt-2 pb-4 grid grid-cols-5 gap-3 shrink-0">
                {navItems.map((item) => {
                  const status = questionStatus(item.sectionIndex, item.questionIndex);
                  const isActive = item.sectionIndex === activeSection && item.questionIndex === activeQuestion;
                  const number = typeQuestionNumbers[`${item.sectionIndex}-${item.questionIndex}`] || (item.questionIndex + 1);
                  const canNavigate = canNavigateToQuestion(item.sectionIndex, item.questionIndex);
                  let cls = '';
                  if (isActive) cls = 'relative z-10 border border-cyan-400 bg-[linear-gradient(135deg,#1095bb_0%,#0ea5c9_54%,#11b7d8_100%)] text-white shadow-[0_18px_34px_-18px_rgba(8,145,178,0.95)] ring-4 ring-cyan-100';
                  else if (status === 'answered') cls = 'border border-emerald-300/80 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 shadow-[0_10px_24px_-22px_rgba(5,150,105,0.9)] dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-200';
                  else if (status === 'review') cls = 'border border-amber-300/90 bg-amber-50 text-amber-800 hover:bg-amber-100 shadow-[0_10px_24px_-22px_rgba(245,158,11,0.85)] dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200';
                  else cls = 'border border-rose-300/80 bg-white text-rose-700 hover:border-rose-400 hover:bg-rose-50 shadow-[0_10px_24px_-24px_rgba(225,29,72,0.55)] dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-200';
                  if (!canNavigate && !isActive) cls += ' cursor-not-allowed opacity-70 grayscale-[0.15]';
                  return (
                    <button
                      key={`nav-${item.sectionIndex}-${item.questionIndex}`}
                      type="button"
                      onClick={() => navigateToQuestion(item.sectionIndex, item.questionIndex)}
                      aria-disabled={!canNavigate}
                      className={`h-12 w-full rounded-xl text-[15px] font-black transition-all duration-150 ${cls}`}
                      aria-label={`Go to question ${number}`}
                      title={canNavigate ? `Q${number} - ${status}` : 'Click to see why this question is locked'}
                    >
                      {number}
                    </button>
                  );
                })}
              </div>

              {/* Progress */}
              <div className="px-4 pb-4 shrink-0">
                <div className="mb-3 rounded-[22px] border border-cyan-100 bg-white px-4 py-3 shadow-[0_18px_45px_-34px_rgba(8,145,178,0.3)]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Progress</span>
                  <span className="text-[12px] font-black text-cyan-700 dark:text-cyan-300">{pct}%</span>
                </div>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700">
                  <div className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/25 border border-emerald-200 dark:border-emerald-800 py-3">
                    <div className="text-2xl font-black text-emerald-800 dark:text-emerald-200">{answeredCnt}</div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">Done</div>
                  </div>
                  <div className="rounded-2xl bg-rose-50 dark:bg-rose-900/25 border border-rose-200 dark:border-rose-800 py-3">
                    <div className="text-2xl font-black text-rose-700 dark:text-rose-200">{unansweredCnt}</div>
                    <div className="text-[11px] text-rose-600 dark:text-rose-300 font-semibold">Left</div>
                  </div>
                  <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/25 border border-amber-200 dark:border-amber-800 py-3">
                    <div className="text-2xl font-black text-amber-700 dark:text-amber-200">{reviewCnt}</div>
                    <div className="text-[11px] text-amber-600 dark:text-amber-300 font-semibold">Review</div>
                  </div>
                </div>
              </div>

              {/* Timer */}
              <div className="border-t border-cyan-100 px-4 pb-4 pt-3 shrink-0 dark:border-gray-700">
                <div className="rounded-[22px] bg-[linear-gradient(135deg,#1e293b_0%,#25324a_100%)] dark:bg-gray-800 px-4 py-3.5 flex items-center justify-between shadow-[0_20px_46px_-34px_rgba(15,23,42,0.95)]">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 shrink-0 text-cyan-300" />
                    <span className="text-[2rem] leading-none font-black text-white tabular-nums tracking-tight">{formatTime(timeLeft)}</span>
                  </div>
                  <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${saving ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                    {saving ? 'Saving...' : 'Saved'}
                  </span>
                </div>
              </div>

              {/* Submit */}
              <div className="px-4 pb-5 shrink-0 mt-auto">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(true)}
                  disabled={isSubmitted}
                  className="w-full rounded-[20px] bg-gradient-to-r from-emerald-600 to-emerald-500 py-4 text-xl font-black text-white shadow-[0_20px_40px_-24px_rgba(16,185,129,0.8)] dark:shadow-none hover:from-emerald-500 hover:to-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitted ? 'Submitted' : 'Submit Assessment'}
                </button>
                <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-gray-500">Answers are auto-saved</p>
              </div>
            </div>
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
  const aiFooterIssueStates = {
    faceModel: ['fallback', 'unavailable'],
    objectModel: ['unavailable'],
    camera: ['blocked', 'error'],
    face: ['missing', 'out_of_frame', 'multiple'],
    eye: ['looking_away', 'unavailable'],
    mobile: ['detected'],
    person: ['multiple', 'missing'],
  };
  const hasAiFooterIssue = Boolean(
    aiProctoringEnabled
      && proctoringStatus
      && (proctoringStatus.error || Object.entries(aiFooterIssueStates).some(([key, states]) => states.includes(proctoringStatus[key]))),
  );
  const footerIssueItems = securityStatusItems.filter((item) => item.enabled && !item.ok);
  const footerHasIssue = Boolean(securityNotice || hasAiFooterIssue || footerIssueItems.length || (cameraStatusLine && !cameraStatusLine.ok));
  const footerNoticeText = securityNotice
    || (cameraStatusLine && !cameraStatusLine.ok ? cameraStatusLine.text : '')
    || (hasAiFooterIssue ? 'AI proctoring needs attention. Please adjust and continue.' : '');

  return (
    <div className="relative min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#f8fafc_36%,#eef2ff_100%)] text-slate-900 dark:bg-gray-900 lg:h-screen lg:overflow-hidden">
      {showAssessmentWorkspace && watermarkConfig.enabled && (
        <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden="true">
          {watermarkColumns.map((item) => (
            <div
              key={item.id}
              className="absolute select-none whitespace-nowrap font-black uppercase tracking-[0.22em]"
              style={{
                left: item.left,
                top: item.top,
                transform: `rotate(${watermarkConfig.angle}deg)`,
                color: watermarkConfig.color,
                opacity: watermarkConfig.opacity,
                fontSize: `${watermarkConfig.fontSize}px`,
              }}
            >
              {item.text}
            </div>
          ))}
        </div>
      )}
      {!showAssessmentWorkspace && (
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_42%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_52%,#f8fafc_100%)] px-4 text-center dark:bg-gray-950">
          <div className="max-w-md rounded-[28px] border border-white/80 bg-white/90 p-8 shadow-[0_30px_90px_-45px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100 dark:bg-sky-900/20 dark:text-sky-300">
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
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/92 backdrop-blur-xl shadow-[0_12px_32px_-24px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-gray-950/95">
        <div className="flex w-full flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToPrevQuestion}
              disabled={!hasPrevQuestion}
              title={hasPrevQuestion ? 'Previous question' : 'No previous question'}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 transition-all shadow-sm"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">{assessment.title}</div>
              <div className="text-[10px] text-slate-500 dark:text-gray-400">{breadcrumbLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            Q {currentQuestionNumber}/{totalQuestions || 1}
          </div>
          <div className="flex flex-1 items-center justify-end gap-2">
            <button
              type="button"
              onClick={goToNextQuestion}
              disabled={!hasNextQuestion}
              title="Next question"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 transition-all shadow-sm"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(timeLeft)}
            </div>
            {isCoding && (
              <select
                value={activeLanguage}
                onChange={(event) => updateCodingLanguage(activeSection, activeQuestion, event.target.value)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
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
                className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                {isRunning ? '...' : 'Run'}
              </button>
            )}
            {isCoding && (
              <button
                type="button"
                onClick={handleSubmitCoding}
                disabled={isRunning || isSubmitting || isSubmitted}
                className="rounded-md bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {isSubmitting ? '...' : 'Submit'}
              </button>
            )}
            {isCoding && (
              <button
                type="button"
                onClick={handleResetCoding}
                className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </header>
      {isCoding ? (
        <div className={`w-full px-3 py-3 pb-16 md:px-4 lg:h-[calc(100vh-68px)] lg:overflow-hidden ${
          cameraStatusLine && !cameraStatusLine.ok
            ? 'bg-[linear-gradient(180deg,#fff5f5_0%,#fffdfd_18%,#ffffff_52%,#fff5f5_100%)]'
            : 'bg-[linear-gradient(180deg,#eef7fb_0%,#f7fbfd_18%,#ffffff_52%,#f7fbfd_100%)]'
        }`}>
          <div className="flex h-full flex-col gap-3 lg:flex-row lg:min-h-0 lg:overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden min-w-0">
              <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:min-h-0">
                <section
                  ref={problemPaneRef}
                  style={{ width: leftWidth ? `${leftWidth}px` : undefined, flexBasis: leftWidth ? `${leftWidth}px` : undefined }}
                  className={`rounded-[28px] bg-white/95 p-5 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.35)] dark:bg-gray-900 lg:h-full lg:overflow-y-auto ${
                    cameraStatusLine && !cameraStatusLine.ok ? 'border border-rose-300 shadow-[0_0_0_1px_rgba(244,63,94,0.08),0_24px_60px_-42px_rgba(225,29,72,0.35)]' : 'border border-slate-200/80 dark:border-gray-700'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 dark:border-gray-700 pb-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 border border-violet-100 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-violet-600 dark:bg-violet-900/20 dark:border-violet-700 dark:text-violet-300 mb-1.5">
                        Section {activeSection + 1} Â· Coding Â· {questionMarks}pt
                      </div>
                      <div className="text-[0.95rem] font-bold leading-snug text-slate-900 dark:text-white">
                        {question?.questionText || question?.problemDataSnapshot?.title || question?.coding?.problemData?.title || question?.coding?.title}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 space-y-3 text-xs text-slate-700 dark:text-gray-200">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/60">
                      <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-400 mb-2">Problem Statement</div>
                      <div className="text-[0.82rem] leading-relaxed">
                        {(codingData?.description || codingData?.statement)
                          ? <RichTextPreview content={codingData.description || codingData.statement} />
                          : <div className="text-slate-500">No statement available.</div>}
                      </div>
                    </div>

                    {(codingData?.constraints || codingData?.inputFormat || codingData?.outputFormat) && (
                      <div className="grid gap-2 text-[0.78rem] text-slate-600 dark:text-gray-300">
                        {codingData.constraints && (
                          <div className="rounded-lg bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-700 px-2.5 py-2">
                            <div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-slate-400 mb-1">Constraints</div>
                            <div className="leading-relaxed">{codingData.constraints}</div>
                          </div>
                        )}
                        {codingData.inputFormat && (
                          <div className="rounded-lg bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-700 px-2.5 py-2">
                            <div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-slate-400 mb-1">Input Format</div>
                            <div className="leading-relaxed">{codingData.inputFormat}</div>
                          </div>
                        )}
                        {codingData.outputFormat && (
                          <div className="rounded-lg bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-700 px-2.5 py-2">
                            <div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-slate-400 mb-1">Output Format</div>
                            <div className="leading-relaxed">{codingData.outputFormat}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goToPrevQuestion}
                  disabled={!hasPrevQuestion}
                  title={hasPrevQuestion ? 'Go to previous question' : 'No previous question'}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={goToNextQuestion}
                  title="Go to next question"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
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

                <section ref={editorPaneRef} className={`flex min-h-[520px] flex-1 flex-col rounded-[28px] bg-white/96 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.35)] dark:bg-gray-900 lg:min-h-0 lg:overflow-hidden ${
                  cameraStatusLine && !cameraStatusLine.ok ? 'border border-rose-300 shadow-[0_0_0_1px_rgba(244,63,94,0.08),0_24px_60px_-42px_rgba(225,29,72,0.35)]' : 'border border-slate-200/80 dark:border-gray-700'
                }`}>
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
                        code={answerValue.code ?? getStarterCodeForLanguage(codingData, answerValue.language || codingLanguages[0])}
                        onLanguageChange={(lang) => updateCodingLanguage(activeSection, activeQuestion, lang)}
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
            {questionNavigatorPanel}
          </div>
        </div>
      ) : (
        <div className={`w-full px-3 py-3 pb-16 md:px-4 lg:h-[calc(100vh-68px)] lg:overflow-hidden ${
          cameraStatusLine && !cameraStatusLine.ok
            ? 'bg-[linear-gradient(180deg,#fff5f5_0%,#ffffff_40%,#fff7f7_100%)]'
            : 'bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,0.98)_40%,rgba(248,250,252,1)_100%)]'
        }`}>
          <div className="flex h-full flex-col gap-3 lg:flex-row lg:min-h-0 lg:overflow-hidden">
            <section className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_18px_48px_-36px_rgba(8,145,178,0.22)] dark:bg-gray-900 lg:min-h-0 lg:overflow-y-auto ${
              cameraStatusLine && !cameraStatusLine.ok ? 'border border-rose-300 shadow-[0_0_0_1px_rgba(244,63,94,0.08),0_18px_48px_-36px_rgba(225,29,72,0.34)]' : 'border border-cyan-100 dark:border-gray-700'
            }`}>
              <div className="border-b border-cyan-100 bg-[linear-gradient(180deg,#f2fbff_0%,#ffffff_100%)] px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
                      <span className="rounded-md bg-cyan-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">Question {currentQuestionNumber}</span><span className="rounded-md border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-cyan-700">Marks: {questionMarks}</span><span className="rounded-md border border-slate-200 bg-white px-2.5 py-1">{section?.type === 'mcq' ? 'MCQ' : 'Short Answer'}</span>
                    </div>
                    <div className="text-lg font-bold leading-snug text-slate-900 dark:text-white md:text-[1.15rem]">
                      {question?.questionText || 'Question'}
                    </div>
                  </div>
                </div>
              </div>

              {section?.type === 'mcq' && (
                <div className="mt-3 space-y-2 px-5 pb-5 md:px-6">
                  {question.options?.map((opt, idx) => {
                    const selected = answersMap[answerKey(activeSection, activeQuestion)]?.answer === idx;
                    const optionLabel = String.fromCharCode(65 + idx);
                    return (
                      <button
                        type="button"
                        key={`opt-${idx}`}
                        onClick={() => updateAnswer(activeSection, activeQuestion, { answer: idx })}
                        disabled={isSubmitted}
                        className={`flex w-full items-start gap-3 rounded-md border px-3.5 py-3 text-left transition-all duration-150 ${
                          selected
                            ? 'border-cyan-400 bg-cyan-50 shadow-sm dark:bg-sky-900/20 dark:border-sky-500'
                            : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/40 dark:border-gray-700 dark:bg-gray-900'
                        }`}
                      >
                        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold transition-all ${
                          selected ? 'bg-cyan-600 text-white' : 'border border-slate-300 text-slate-500 dark:border-gray-600'
                        }`}>
                          {optionLabel}
                        </span>
                        <span className={`text-[0.94rem] leading-relaxed font-medium ${selected ? 'text-sky-900 dark:text-sky-100' : 'text-slate-700 dark:text-gray-200'}`}>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {(section?.type === 'short' || section?.type === 'one_line') && (
                <div className="px-6 pb-2">
                  <textarea
                    value={answersMap[answerKey(activeSection, activeQuestion)]?.answer || ''}
                    onChange={(e) => updateAnswer(activeSection, activeQuestion, { answer: e.target.value })}
                    rows="7"
                    className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-[0.94rem] leading-relaxed text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    disabled={isSubmitted}
                    placeholder="Type your response here..."
                  />
                </div>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-cyan-100 bg-[linear-gradient(180deg,#ffffff_0%,#f6fbfd_100%)] px-5 py-4 md:px-6 dark:border-gray-700">
                <button
                  type="button"
                  onClick={goToPrevQuestion}
                  disabled={!hasPrevQuestion}
                  title={hasPrevQuestion ? 'Go to previous question' : 'No previous question'}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 transition-all"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <button
                  type="button"
                  onClick={markForReviewAndNext}
                  title={isMarked ? 'Unmark and go to next question' : 'Mark for review and go to next question'}
                  className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 transition-all hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300"
                >
                  Mark & Next
                </button>
                <button
                  type="button"
                  onClick={clearResponse}
                  title="Clear the selected response"
                  className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:border-gray-600 dark:bg-gray-800 transition-all"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={saveAndNext}
                  title="Save and advance"
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-5 py-2 text-xs font-bold text-white transition-all hover:bg-emerald-500 shadow-md shadow-emerald-200 dark:shadow-none"
                >
                  Save & Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </section>
            {questionNavigatorPanel}
          </div>
        </div>
      )}
      </>
      )}
      {phase === 'validation' && !isSubmitted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-3 py-3 sm:px-4">
          <div className="flex max-h-[96vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="px-4 pb-3 pt-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-900/20 dark:text-sky-200">
                    Security Setup
                  </div>
                  <h2 className="mt-2.5 text-[1.55rem] font-black tracking-tight text-slate-950 dark:text-white sm:text-[1.65rem]">Security Setup</h2>
                  <p className="mt-1.5 text-sm text-slate-500 dark:text-gray-300">
                    {securityRecheckActive
                      ? 'Assessment timer is paused. Complete these checks before the security recheck timer expires.'
                      : 'Complete all mandatory checks before moving forward.'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {securityRecheckActive && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 dark:border-sky-400/30 dark:bg-sky-900/20 dark:text-sky-200">
                      Recheck time {formatTime(securityRecheckRemainingSec * 1000)}
                    </div>
                  )}
                  <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-gray-800 dark:text-gray-200">
                    Step {validationStep} of {setupSteps.length}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800 sm:px-5">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-800 dark:text-gray-100 sm:text-base">
                  <ShieldCheck className="h-4 w-4 text-sky-600 sm:h-5 sm:w-5" />
                  Security Checks
                </div>
                <div className="mt-3 grid gap-2">
                  {setupSteps.map((step) => {
                    const isActive = validationStep === step.id;
                    const done = setupStepIsDone(step.key);
                    const locked = step.id > validationStep && !done;
                    const checking = setupCheckingStep === step.key;
                    return (
                      <div
                        key={step.id}
                        className={`flex items-center gap-3 text-sm sm:text-base ${
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

            <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:px-5">
              {currentSetupStepKey === 'environment' && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Step 1: Clean Environment Check</div>
                  <p className="text-sm text-slate-600 dark:text-gray-300">Keep only this assessment tab active. Browser security prevents websites from listing every external tab, app, or extension, so PeerPrep verifies focus and detects duplicate assessment tabs within the platform.</p>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-gray-300">
                      <span>Detected PeerPrep assessment tabs</span>
                      <span className={detectedTabs.filter((tab) => !tab.current).length === 0 ? 'text-emerald-600' : 'text-rose-600'}>
                        {detectedTabs.filter((tab) => !tab.current).length === 0 ? 'Clean' : 'Duplicate found'}
                      </span>
                    </div>
                    <div className="grid gap-1.5">
                      {(detectedTabs.length ? detectedTabs : [{ id: 'current', title: assessment.title || 'Assessment tab', current: true }]).map((tab) => (
                        <div key={tab.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                          <span className="truncate text-slate-600 dark:text-gray-300">{tab.title}</span>
                          <span className={tab.current ? 'text-emerald-600' : 'text-rose-600'}>
                            {tab.current ? 'Current' : 'Close this tab'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-1.5 text-xs text-slate-600 dark:text-gray-300">
                    {[
                      ['Current tab focused', document.hasFocus() && !document.hidden],
                      ['Assessment window visible', !document.hidden],
                      ['No duplicate assessment tabs', !preventMultipleTabs || detectedTabs.filter((tab) => !tab.current).length === 0],
                      ['Extra apps/extensions closed by student', validationState.environment],
                    ].map(([label, ok]) => (
                      <div key={label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-1.5 dark:border-gray-700 dark:bg-gray-900">
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
                  <div>
                    <div className="text-sm font-bold text-slate-800 dark:text-white">Camera Verification</div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                      {cameraRequired
                        ? 'Your webcam feed is required for identity verification during this assessment.'
                        : 'Camera monitoring is not required for this assessment.'}
                    </p>
                  </div>
                  {cameraRequired && (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                      <div className="relative w-full max-w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm dark:border-gray-700">
                        <div className="relative aspect-[4/3]">
                          <video ref={validationVideoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
                          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.12)_0%,rgba(15,23,42,0.28)_100%)]" />
                          <div className="pointer-events-none absolute inset-[12%] rounded-[22px] border border-white/35" />
                          <div className="pointer-events-none absolute inset-x-[22%] top-[16%] bottom-[16%] rounded-[26px] border border-dashed border-sky-200/55 bg-white/5" />
                          <div className="absolute left-3 top-3 rounded-full bg-slate-950/55 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                            Camera preview
                          </div>
                          <div className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold backdrop-blur-sm ${
                            faceStatus === 'detected'
                              ? 'bg-emerald-500/20 text-emerald-100'
                              : faceStatus === 'detecting'
                                ? 'bg-amber-500/20 text-amber-100'
                                : 'bg-slate-900/45 text-white/90'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              faceStatus === 'detected'
                                ? 'bg-emerald-300'
                                : faceStatus === 'detecting'
                                  ? 'bg-amber-300 animate-pulse'
                                  : 'bg-rose-300'
                            }`} />
                            {faceStatus === 'detected' ? 'Face detected' : faceStatus === 'detecting' ? 'Scanning' : 'Waiting'}
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                          Keep your face centered and clearly visible. A simple preview will appear as soon as the camera is active.
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            ['Camera', validationState.camera ? 'Ready' : 'Pending'],
                            ['Face', faceStatus === 'detected' ? 'Detected' : faceStatus === 'detecting' ? 'Scanning' : 'Waiting'],
                            ['Feed', streamRef.current ? 'Live' : 'Off'],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                              <span className="text-slate-400">{label}:</span> {value}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleCameraCheck}
                      disabled={Boolean(setupCheckingStep)}
                      className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-200 dark:shadow-none disabled:cursor-not-allowed disabled:opacity-60 hover:bg-sky-500 transition-colors"
                    >
                      {setupCheckingStep === 'camera' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                      {cameraRequired ? 'Activate & Verify Camera' : 'Confirm Camera Step'}
                    </button>
                  </div>
                  {validationState.camera && validationState.face && (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" /> Camera identity verified successfully.
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

              <div className="mt-4 flex items-center justify-between">
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
                      !setupStepIsDone(currentSetupStepKey)
                    }
                    className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (setupStepIsDone('final')) {
                        if (isPaused) {
                          void startAssessment();
                        } else {
                          setPhase('rules');
                        }
                      }
                    }}
                    disabled={!setupStepIsDone('final')}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {isPaused ? 'Resume Assessment' : 'Proceed'}
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
          <div className={`w-full max-w-md rounded-[28px] border bg-white p-5 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.42)] dark:bg-gray-900 ${
            securityPopup.tone === 'danger'
              ? 'border-rose-200 dark:border-rose-800'
              : 'border-amber-200 dark:border-amber-800'
          }`}>
            <div className={`flex items-center gap-2 text-base font-bold ${
              securityPopup.tone === 'danger'
                ? 'text-rose-600 dark:text-rose-300'
                : 'text-amber-600 dark:text-amber-300'
            }`}>
              <AlertTriangle className="h-4 w-4" />
              {securityPopup.title}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-gray-300">
              {securityPopup.message}
            </p>
            {timedWarningRemainingSec > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                Warning closes in {timedWarningRemainingSec}s
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={closeSecurityPopup}
                className={`rounded-2xl px-5 py-2.5 text-sm font-semibold text-white ${
                  securityPopup.tone === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'rules' && !isSubmitted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/45 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex h-[calc(100vh-1rem)] w-full max-w-[min(98vw,1500px)] flex-col overflow-hidden rounded-[26px] border border-sky-100 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-4 shadow-[0_42px_120px_-54px_rgba(14,165,233,0.35)] dark:border-gray-700 dark:bg-gray-900 sm:h-[calc(100vh-1.5rem)] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-100 pb-3">
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                  <BookOpen className="h-3 w-3" />
                  Assessment Briefing
                </div>
                <h2 className="mt-2.5 text-[1.7rem] font-black tracking-tight text-slate-900 dark:text-white sm:text-[1.85rem]">Assessment Instructions & Guidelines</h2>
                <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-slate-500 dark:text-gray-400">
                  Review the format, section structure, and monitoring rules carefully. This screen is designed to give you a complete pre-start briefing before the assessment begins.
                </p>
              </div>

              <div className="flex items-start gap-3 self-start">
                <div className="min-w-[124px] rounded-2xl border border-sky-100 bg-white px-3.5 py-2.5 text-center shadow-[0_18px_40px_-30px_rgba(14,165,233,0.35)]">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-400">Countdown</div>
                  <div className={`mt-1.5 text-[2rem] font-black tracking-tight ${rulesReady ? 'text-emerald-600' : 'animate-pulse text-sky-600'}`}>
                    {rulesCountdown}s
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {rulesReady ? 'Start is now enabled' : 'Start unlocks automatically'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={startAssessment}
                  disabled={!rulesReady}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all ${
                    rulesReady
                      ? 'bg-sky-600 hover:-translate-y-0.5 hover:bg-sky-500'
                      : 'cursor-not-allowed bg-sky-200 text-sky-50'
                  }`}
                >
                  {rulesReady ? 'Start Assessment' : `Start in ${rulesCountdown}s`}
                </button>
              </div>
            </div>

            <div className="mt-3 grid min-h-0 flex-1 gap-3 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
                <div className="rounded-[22px] border border-sky-100 bg-white p-3.5 shadow-[0_20px_48px_-36px_rgba(14,165,233,0.28)]">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700 dark:text-gray-200">
                    <Layers className="h-4 w-4 text-sky-600" />
                    Assessment Overview
                  </div>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {[
                      ['Total Questions', totalQuestions],
                      ['Total Marks', assessment.totalMarks || 0],
                      ['Duration', `${assessment.duration} minutes`],
                      ['Question Types', assessment.assessmentType || section?.type || 'mixed'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
                        <div className="mt-1.5 text-base font-bold text-slate-900 dark:text-white">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[22px] border border-sky-100 bg-white p-3.5 shadow-[0_20px_48px_-36px_rgba(14,165,233,0.28)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700 dark:text-gray-200">
                      <Hash className="h-4 w-4 text-sky-600" />
                      Section Breakdown
                    </div>
                    <div className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700">
                      {(assessment.sections || []).length} section{(assessment.sections || []).length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {(assessment.sections || []).map((sec, idx) => {
                      const summary = sectionSummaries[idx];
                      const questionCount = sec?.questions?.length || 0;
                      const marksEach = Number(sec?.marksPerQuestion || sec?.questions?.[0]?.points || sec?.questions?.[0]?.marks || 0) || 0;
                      const totalSectionMarks = Number(sec?.totalMarks || 0) || (questionCount * marksEach);
                      const sectionType = summary?.typeLabel || formatSectionTypeLabel(sec?.type);
                      const sectionLabel = sec?.sectionName || `Section ${idx + 1}`;

                      return (
                        <div key={`${sectionLabel}-${idx}`} className="rounded-2xl border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3.5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-100 text-[11px] font-bold text-sky-700">
                                  {idx + 1}
                                </div>
                                <div>
                                  <div className="text-[13px] font-semibold text-slate-900 dark:text-white">{sectionLabel}</div>
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Q{summary?.start || 1}-Q{summary?.end || questionCount} - {sectionType}</div>
                                </div>
                              </div>
                            </div>
                            <div className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700">
                              {totalSectionMarks} total marks
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Questions</div>
                              <div className="mt-1 text-[13px] font-semibold text-slate-800">{questionCount}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Marks Each</div>
                              <div className="mt-1 text-[13px] font-semibold text-slate-800">{marksEach}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Section Type</div>
                              <div className="mt-1 text-[13px] font-semibold text-slate-800">{sectionType}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
                <div className="rounded-[22px] border border-sky-100 bg-white p-3.5 shadow-[0_20px_48px_-36px_rgba(14,165,233,0.28)]">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700 dark:text-gray-200">
                    <ShieldCheck className="h-4 w-4 text-sky-600" />
                    Rules & Regulations
                  </div>
                  <div className="mt-3 space-y-2 text-[12.5px] text-slate-600 dark:text-gray-300 sm:text-[13px]">
                    {effectiveRules.map((block, idx) => (
                      block.type === 'paragraph' ? (
                        <div key={`rule-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 font-medium leading-5 tracking-[0.01em]">
                          {block.text}
                        </div>
                      ) : (
                        <div key={`rule-${idx}`} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                          <span className="font-medium leading-5 tracking-[0.01em] text-slate-700">{block.text}</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-[22px] border border-sky-100 bg-white p-3.5 shadow-[0_20px_48px_-36px_rgba(14,165,233,0.28)]">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700 dark:text-gray-200">
                      <Monitor className="h-4 w-4 text-sky-600" />
                      System Requirements
                    </div>
                    <ul className="mt-3 space-y-2 text-[12.5px] font-medium text-slate-700 dark:text-gray-300">
                      <li className="rounded-xl bg-slate-50 px-3 py-2">Camera access enabled for monitoring only</li>
                      <li className="rounded-xl bg-slate-50 px-3 py-2">Keep only one assessment tab open</li>
                      <li className="rounded-xl bg-slate-50 px-3 py-2">Use a supported desktop browser</li>
                    </ul>
                  </div>

                  <div className="rounded-[22px] border border-sky-100 bg-white p-3.5 shadow-[0_20px_48px_-36px_rgba(14,165,233,0.28)]">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700 dark:text-gray-200">
                      <AlertCircle className="h-4 w-4 text-sky-600" />
                      Important Notes
                    </div>
                    <ul className="mt-3 space-y-2 text-[12.5px] font-medium text-slate-700 dark:text-gray-300">
                      <li className="rounded-xl bg-slate-50 px-3 py-2">Your progress is auto-saved continuously</li>
                      <li className="rounded-xl bg-slate-50 px-3 py-2">Camera and AI proctoring status appears in the footer during the test</li>
                      <li className="rounded-xl bg-slate-50 px-3 py-2">Read every section carefully before the timer begins</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-2.5">
              <div className={`text-[13px] font-semibold ${rulesReady ? 'text-emerald-700' : 'text-sky-700 animate-pulse'}`}>
                {rulesReady ? 'Countdown complete. You may begin the assessment now.' : `Starting unlocks in ${rulesCountdown} seconds.`}
              </div>
              <button
                type="button"
                onClick={() => navigate('/student/assessments')}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'violation' && !isPaused && !isSubmitted && (
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
                  resetSecuritySetupProgress();
                  setIsPaused(true);
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
            <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-white">Assessment paused</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-gray-300">
              {violationMessage || 'Security checks must be completed again before you can resume. Your assessment timer is paused during this recheck.'}
            </p>
            <div className="mt-4 grid gap-3 text-xs text-slate-600 dark:text-gray-300 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <div className="text-slate-400">Warning count</div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">{totalWarnings}</div>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-400/30 dark:bg-sky-900/20">
                <div className="text-sky-600 dark:text-sky-300">Recheck time</div>
                <div className="text-lg font-semibold text-sky-700 dark:text-sky-100">{formatTime(securityRecheckRemainingSec * 1000)}</div>
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
                setIsPaused(true);
                setSecurityRecheckStartedAt((prev) => prev || Date.now());
                setSecurityRecheckRemainingSec((prev) => prev || securityRecheckTimeoutSec);
                securityRecheckAutoSubmitRef.current = false;
                resetSecuritySetupProgress();
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
          <div className={`fixed bottom-0 left-0 right-0 z-40 border-t shadow-2xl transition-colors ${
            footerHasIssue
              ? 'border-rose-300 bg-rose-700'
              : 'border-emerald-300 bg-emerald-700'
          }`}>
            <div className="px-4 py-1.5">
              <div className="mx-auto flex max-w-full flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    footerHasIssue
                      ? 'border border-white/45 bg-white text-rose-700 shadow-sm'
                      : 'border border-white/45 bg-white text-emerald-700 shadow-sm'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${footerHasIssue ? 'bg-rose-600 animate-pulse' : 'bg-emerald-600'}`} />
                    {footerHasIssue ? 'Attention needed' : 'Secure'}
                  </span>
                  {footerIssueItems.map((item) => (
                    <span
                      key={item.key}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-rose-950/30 px-2.5 py-1 text-[10px] font-bold text-white animate-pulse"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      {item.label}
                    </span>
                  ))}
                  <ProctoringFooter
                    enabled={aiProctoringEnabled}
                    status={proctoringStatus}
                    compact
                  />
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  {footerNoticeText && (
                    <span className="max-w-[36rem] truncate text-[10px] font-semibold text-white">{footerNoticeText}</span>
                  )}
                  {totalWarnings > 0 && (
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                      footerHasIssue
                        ? 'border-white/45 bg-white text-rose-700'
                        : 'border-white/35 bg-emerald-950/25 text-white'
                    }`}>
                      Warning {totalWarnings}
                    </span>
                  )}
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
          {aiProctoringEnabled && (
            <div
              ref={aiPreviewRef}
              onPointerDown={handleAiPreviewDragStart}
              className="fixed bottom-14 right-3 z-50 touch-none select-none overflow-hidden rounded-2xl border border-white/60 bg-slate-950 shadow-2xl ring-1 ring-slate-900/10 cursor-grab active:cursor-grabbing sm:bottom-16 sm:right-4"
              style={aiPreviewPosition ? {
                left: `${aiPreviewPosition.x}px`,
                top: `${aiPreviewPosition.y}px`,
                right: 'auto',
                bottom: 'auto',
              } : undefined}
              title="Drag camera preview"
            >
              <video
                ref={aiProctoringVideoRef}
                className="pointer-events-none h-20 w-28 scale-x-[-1] object-cover sm:h-24 sm:w-36"
                muted
                playsInline
                autoPlay
              />
              <span
                className={`absolute left-2 top-2 h-2 w-2 rounded-full ${
                  hasAiFooterIssue ? 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.9)]' : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
                }`}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

