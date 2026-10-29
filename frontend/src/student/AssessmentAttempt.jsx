
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { AnviMark } from '../components/AnviApproach';
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
  RotateCcw,
  ShieldCheck,
  Timer,
  Video,
} from 'lucide-react';
import CodeEditor from './CodeEditor';
import { COMPILER_LANGUAGES, getProblemSupportedLanguages } from '../admin/compiler/compilerUtils';
import AssessmentCodingProblemPanel from './assessment/AssessmentCodingProblemPanel';
import AssessmentLanguagePicker from './assessment/AssessmentLanguagePicker';
import AssessmentQuestionPalette from './assessment/AssessmentQuestionPalette';
import AssessmentMcqOptions from './assessment/AssessmentMcqOptions';
import { decodeLegacyCodeEntities, getCodeValidationMessage, getStarterCodeForLanguage } from './problemUtils';
import ProctoringFooter from '../features/assessment/student/components/ProctoringFooter';
import { ProctoringManager } from '../features/assessment/proctoring';
import { logAiProctoringViolation } from '../features/assessment/proctoring/services/proctoringApi';
import { AssessmentSaveProtocol, answerPayloadKey, answerPayloadSignature, isDraftForAttempt, isTransientSaveError, mergeLiveCodingDraft } from './assessment/assessmentSaveProtocol';
import { readAssessmentDraft, writeAssessmentDraft, deleteAssessmentDraft } from './assessment/assessmentDraftStore';
import { uploadAssessmentEvidence } from './assessment/assessmentEvidenceUpload';

const formatTime = (ms) => {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const FULLSCREEN_RECOVERY_SECONDS = 15;

// A static import would pull the 3 MB Monaco chunk into every attempt page,
// including MCQ-only tests; load it only when a coding section needs it.
const preloadMonacoEditor = (language) => import('../admin/compiler/MonacoCodeEditor')
  .then((module) => module.preloadMonacoEditor(language))
  .catch(() => {});

const CAMERA_CONSTRAINTS = Object.freeze({
  video: {
    width: { ideal: 640, max: 640 },
    height: { ideal: 480, max: 480 },
    frameRate: { ideal: 15, max: 15 },
    facingMode: 'user',
  },
  audio: false,
});

// "Open" = the track has not ended. "Live" additionally requires frames: a
// muted track (OS privacy toggle, another app, sleep) is open but black.
// Brief mutes during warm-up are handled by the monitor's 8 s grace, so only
// "open" decides whether a new stream must be requested.
const hasOpenCameraTrack = (stream) => Boolean(
  stream?.getVideoTracks?.().some((track) => track.readyState === 'live'),
);

const hasLiveCameraTrack = (stream) => Boolean(
  stream?.getVideoTracks?.().some((track) => track.readyState === 'live' && !track.muted),
);

const lockEscapeKey = () => {
  try {
    void navigator.keyboard?.lock?.(['Escape'])?.catch?.(() => {});
  } catch {
    // Keyboard Lock is Chromium-only; other browsers keep default Esc behaviour.
  }
};

/** Owns the 1 s countdown so the rest of the attempt page does not re-render every second. */
const AssessmentCountdown = memo(function AssessmentCountdown({ endAt, offset, running, onExpire }) {
  const [left, setLeft] = useState(() => (endAt ? endAt - (Date.now() + offset) : 0));
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);
  useEffect(() => {
    if (!endAt) return undefined;
    const tick = () => {
      const remaining = endAt - (Date.now() + offset);
      setLeft(remaining);
      return remaining;
    };
    tick();
    if (!running) return undefined;
    let fired = false;
    const timer = setInterval(() => {
      if (tick() <= 0 && !fired) {
        fired = true;
        onExpireRef.current?.();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [endAt, offset, running]);
  return <span className="text-xs font-bold tabular-nums">{formatTime(left)}</span>;
});

/** Keeps short-answer typing local so each keystroke re-renders only the textarea. */
const ShortAnswerInput = memo(function ShortAnswerInput({ value, commitKey, onCommit, disabled, registerFlush, maxLength }) {
  const [draft, setDraft] = useState(value || '');
  const pendingRef = useRef(null);
  const valueRef = useRef(value || '');
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);
  useEffect(() => {
    valueRef.current = value || '';
    if (pendingRef.current === null) setDraft(value || '');
  }, [value]);
  // Returns the committed text so a final submit can include it in the same
  // call; a refused commit (attempt limit, finalizing) reverts the box.
  const flush = useCallback(() => {
    if (pendingRef.current === null) return null;
    clearTimeout(pendingRef.current.timer);
    const text = pendingRef.current.text;
    pendingRef.current = null;
    if (onCommitRef.current?.(text) === false) {
      setDraft(valueRef.current);
      return null;
    }
    return { key: commitKey, text };
  }, [commitKey]);
  useEffect(() => {
    registerFlush?.(flush);
    return () => {
      flush();
      registerFlush?.(null);
    };
  }, [flush, registerFlush]);
  return (
    <textarea
      value={draft}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        if (pendingRef.current) clearTimeout(pendingRef.current.timer);
        pendingRef.current = { text, timer: setTimeout(flush, 250) };
      }}
      onBlur={flush}
      maxLength={maxLength}
      rows="7"
      className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-[0.94rem] leading-relaxed text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      disabled={disabled}
      placeholder="Type your response here..."
    />
  );
});

/**
 * Shown on the rules screen only when AI proctoring is enabled. It states the
 * exact policy the student will be held to, from the admin's own settings.
 */
function AnviProctoringCard({ settings = {}, snapshotsEnabled = false }) {
  const graceSec = Math.max(3, Math.min(60, Number(settings.faceOutOfFrameGraceSec) || 8));
  const quickChecks = [
    settings.detectMobile !== false && 'a mobile phone',
    settings.detectMultiplePersons !== false && 'another person in view',
    settings.detectNoFace !== false && 'no face in the camera',
  ].filter(Boolean);
  const flagged = [
    quickChecks.length > 0 && `After about 2–3 seconds: ${quickChecks.join(', ')}.`,
    settings.detectFaceOutOfFrame !== false && `Leaving the camera frame for ${graceSec} seconds in a row.`,
  ].filter(Boolean);
  const notFlagged = [
    'Eye and head movement.',
    'Looking down to think or write.',
  ];

  return (
    <section
      aria-labelledby="anvi-proctoring-title"
      className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/80 via-white to-white p-4 dark:border-violet-900/60 dark:from-violet-950/30 dark:via-slate-900 dark:to-slate-900"
    >
      <div className="flex items-center gap-3">
        <AnviMark className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="anvi-proctoring-title" className="text-sm font-semibold text-slate-900 dark:text-white">ANVI AI Proctoring</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> On
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Runs on your device. Only confirmed events are recorded{snapshotsEnabled ? ', with periodic snapshots for the examiner' : ''}.
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Flagged</div>
          <ul className="mt-1.5 space-y-1.5">
            {flagged.map((text) => (
              <li key={text} className="flex items-start gap-2 text-[13px] leading-5 text-slate-700 dark:text-slate-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Not flagged</div>
          <ul className="mt-1.5 space-y-1.5">
            {notFlagged.map((text) => (
              <li key={text} className="flex items-start gap-2 text-[13px] leading-5 text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-3 border-t border-violet-100 pt-2.5 text-xs leading-5 text-slate-500 dark:border-violet-900/50 dark:text-slate-400">
        A small camera preview stays in the corner. Keep your face visible and the room well lit.
      </p>
    </section>
  );
}

/** Reserves the image box so options never jump when the picture loads. */
function ReservedImage({ image, heightClass = 'h-72', className = '' }) {
  if (!image?.url) return null;
  const width = Number(image.width);
  const height = Number(image.height);
  const hasRatio = width > 0 && height > 0;
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800 ${hasRatio ? 'max-h-72' : heightClass} ${className}`}
      style={hasRatio ? { aspectRatio: `${width} / ${height}` } : undefined}
    >
      <img src={image.url} alt={image.alt || ''} decoding="async" className="max-h-full max-w-full object-contain" />
    </div>
  );
}

function sanitizeExecutionMessage(value) {
  return String(value ?? '')
    .replace(/judge\s*0/gi, 'compiler service')
    .replace(/judge0/gi, 'compiler service');
}

function createTerminalExecutionResult(error, {
  mode = 'run',
  language = '',
  input = '',
  sourceCode = '',
  fallbackMessage = 'Execution could not be completed.',
} = {}) {
  const message = sanitizeExecutionMessage(error?.message || fallbackMessage);
  const responseData = error?.response?.data || {};
  const terminalOutput = sanitizeExecutionMessage(responseData.stderr
    || responseData.compileOutput
    || responseData.compile_output
    || responseData.error
    || responseData.message
    || message);

  return {
    mode: 'system',
    action: mode,
    terminal: true,
    status: 'System Error',
    message: 'Execution could not be completed. Review the terminal output below.',
    input,
    output: '',
    stdout: '',
    stderr: terminalOutput,
    error: terminalOutput,
    terminalOutput,
    language,
    sourceCode,
    time: 0,
    memory: 0,
  };
}

/** The rotated watermark marks, shared by the problem pane and the image viewer. */
function WatermarkMarks({ columns, config }) {
  return columns.map((item) => (
    <div
      key={item.id}
      className="absolute select-none whitespace-nowrap font-black uppercase tracking-[0.22em]"
      style={{
        left: item.left,
        top: item.top,
        transform: `rotate(${config.angle}deg)`,
        color: config.color,
        opacity: config.opacity,
        fontSize: `${config.fontSize}px`,
      }}
    >
      {item.text}
    </div>
  ));
}

const buildSampleTestCases = (codingData = {}) => {
  const list = Array.isArray(codingData.sampleTestCases) && codingData.sampleTestCases.length
    ? codingData.sampleTestCases
    : (Array.isArray(codingData.examples) && codingData.examples.length
      ? codingData.examples
      : (Array.isArray(codingData.testCases)
        ? codingData.testCases.filter((testCase) => testCase?.hidden !== true)
        : ((codingData.sampleInput !== undefined || codingData.sampleOutput !== undefined)
          ? [{ input: codingData.sampleInput, output: codingData.sampleOutput }]
          : [])));
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

const COMPLETED_ASSESSMENT_STATUSES = new Set(['submitted', 'expired', 'violation', 'incomplete']);

const CAMERA_VIOLATION_TYPES = new Set([
  'camera_loss',
  'camera_no_face',
  'multiple_faces',
  'face_out_of_frame',
]);

const NON_BLOCKING_DETECTION_TYPES = new Set([
  ...CAMERA_VIOLATION_TYPES,
  'fullscreen_exit',
]);

const SOFT_FOOTER_WARNING_TYPES = new Set([
  ...CAMERA_VIOLATION_TYPES,
  'fullscreen_exit',
  'idle',
]);

// A window blur without the tab becoming hidden (Windows key, OS/antivirus
// popups, permission bubbles) only counts when focus stays away this long;
// repeated short blips still escalate to one tab switch.
const FOCUS_LOSS_CONFIRM_MS = 2000;
const FOCUS_BLIP_ESCALATE_COUNT = 3;
const FOCUS_BLIP_WINDOW_MS = 60000;
const CAMERA_MUTED_REACQUIRE_MS = 8000;
const CAMERA_RETRY_MIN_MS = 2000;
const CAMERA_RETRY_MAX_MS = 30000;
const LIVE_CODE_CHECKPOINT_MS = 750;
const ANSWER_CHECKPOINT_MS = 300;
const ANSWER_SYNC_DEBOUNCE_MS = 1200;

const RESTRICTED_ACTION_WARNING_MS = 15000;
const SCREENSHOT_WARNING_GRACE_MS = RESTRICTED_ACTION_WARNING_MS;
const FOCUS_LOSS_SCREENSHOT_GRACE_MS = 1000;
const FACE_CENTER_TOLERANCE_RATIO = 0.46;
const FACE_MIN_WIDTH_RATIO = 0.08;
const NETWORK_FAILURES_BEFORE_PAUSE = 2;
const AUTOSAVE_BASE_MS = Math.max(15000, Number(import.meta.env.VITE_ASSESSMENT_AUTOSAVE_MS || 25000));
const AUTOSAVE_JITTER_MS = Math.max(0, Number(import.meta.env.VITE_ASSESSMENT_AUTOSAVE_JITTER_MS || 10000));
const HEARTBEAT_BASE_MS = Math.max(10000, Number(import.meta.env.VITE_ASSESSMENT_HEARTBEAT_MS || 15000));
const HEARTBEAT_JITTER_MS = Math.max(0, Number(import.meta.env.VITE_ASSESSMENT_HEARTBEAT_JITTER_MS || 5000));

const nextJitteredDelay = (baseMs, jitterMs) => baseMs + (jitterMs > 0 ? Math.random() * jitterMs : 0);

const hasVeryWeakConnection = () => {
  if (typeof navigator === 'undefined') return false;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return false;
  const effectiveType = String(connection.effectiveType || '').toLowerCase();
  const downlink = Number(connection.downlink);
  const rtt = Number(connection.rtt);
  return effectiveType === 'slow-2g'
    || effectiveType === '2g'
    || (Number.isFinite(downlink) && downlink > 0 && downlink < 0.35)
    || (Number.isFinite(rtt) && rtt > 1500);
};

const detectBrowserInterference = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];
  const signals = new Set();
  if (navigator.webdriver) signals.add('Browser automation is active');
  const automationMarkers = [
    '__webdriver_evaluate',
    '__selenium_evaluate',
    '__selenium_unwrapped',
    '_Selenium_IDE_Recorder',
    'callPhantom',
    '_phantom',
    'domAutomation',
    'Cypress',
  ];
  if (automationMarkers.some((marker) => marker in window)) {
    signals.add('Automation or testing software injected controls into this page');
  }
  const extensionUrlPattern = /^(chrome|moz|safari-web)-extension:\/\//i;
  document.querySelectorAll('[src], [href]').forEach((node) => {
    const resourceUrl = node.getAttribute('src') || node.getAttribute('href') || '';
    if (extensionUrlPattern.test(resourceUrl)) {
      signals.add('A browser extension injected content into this page');
    }
  });
  performance.getEntriesByType?.('resource').forEach((entry) => {
    if (extensionUrlPattern.test(entry?.name || '')) {
      signals.add('A browser extension loaded a resource into this page');
    }
  });
  return [...signals];
};

const BLOCKED_INPUT_TYPES = new Set([
  'insertFromPaste',
  'insertFromDrop',
  'insertReplacementText',
]);

const isInternalCodeEditorEvent = (event) => Boolean(
  event?.target?.closest?.('[data-assessment-code-editor="internal"]'),
);

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

const getCodingDataFromQuestion = (question = {}) => (
  question?.problemDataSnapshot
  || question?.problemData
  || question?.coding?.problemData
  || question?.coding
  || {}
);

const getCodingLanguagesFromData = (codingData = {}) => {
  const languages = getProblemSupportedLanguages(codingData);
  if (!languages.length) return ['python'];
  const languageOrder = new Map(COMPILER_LANGUAGES.map((language, index) => [language.id, index]));
  return [...languages].sort((left, right) => (
    (languageOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (languageOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
  ));
};

const getCodingStarterCode = (question, language) => (
  getStarterCodeForLanguage(getCodingDataFromQuestion(question), language)
);

const getPassageKey = (question) => question?.passage?.passageId
  || (question?.passage?.text ? `${question.passage.title || ''}::${question.passage.text}` : '');

const hasAttemptedResponse = (value = {}, question = {}, type = '') => {
  if (type === 'mcq') {
    return Array.isArray(value.answer)
      ? value.answer.length > 0
      : value.answer !== undefined && value.answer !== null && value.answer !== '';
  }
  if (type === 'coding') {
    const sourceCode = String(value.code || '').trim();
    if (!sourceCode) return false;
    const language = value.language || getCodingLanguagesFromData(getCodingDataFromQuestion(question))[0];
    return sourceCode !== String(getCodingStarterCode(question, language) || '').trim();
  }
  return String(value.answer ?? '').trim().length > 0;
};

export default function AssessmentAttempt() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [assessment, setAssessment] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [answersMap, setAnswersMap] = useState({});
  const [markedMap, setMarkedMap] = useState({});
  const [activeSection, setActiveSection] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [mcqTimeLeft, setMcqTimeLeft] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [finalizing, setFinalizing] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [draftStorageAvailable, setDraftStorageAvailable] = useState(true);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [fullscreenExits, setFullscreenExits] = useState(0);
  const [copyPasteCount, setCopyPasteCount] = useState(0);
  const [cameraFlags, setCameraFlags] = useState(0);
  const [screenshotWarnings, setScreenshotWarnings] = useState(0);
  const [aiWarnings, setAiWarnings] = useState(0);
  const [violationScore, setViolationScore] = useState(0);
  const [pauseCount, setPauseCount] = useState(0);
  const [lastPauseAt, setLastPauseAt] = useState(null);
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
  const [environmentInterference, setEnvironmentInterference] = useState([]);
  const [faceStatus, setFaceStatus] = useState('idle');
  const [setupCheckingStep, setSetupCheckingStep] = useState('');
  const [locationData, setLocationData] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [allowedEndTime, setAllowedEndTime] = useState(null);
  const [securityRecheckStartedAt, setSecurityRecheckStartedAt] = useState(null);
  const [securityRecheckRemainingSec, setSecurityRecheckRemainingSec] = useState(0);
  const [violationMessage, setViolationMessage] = useState('');
  const [activeConsoleTab, setActiveConsoleTab] = useState('result');
  const [runResultMap, setRunResultMap] = useState({});
  const [submitResultMap, setSubmitResultMap] = useState({});
  const [isRunningMap, setIsRunningMap] = useState({});
  const [isSubmittingMap, setIsSubmittingMap] = useState({});
  const [runInputUsedMap, setRunInputUsedMap] = useState({});
  const [codeValueVersion, setCodeValueVersion] = useState(0);
  const [rulesCountdown, setRulesCountdown] = useState(30);
  const [rulesReady, setRulesReady] = useState(false);
  const [hasSeenRules, setHasSeenRules] = useState(false);
  const [cameraIndicator, setCameraIndicator] = useState('idle');
  const [cameraStreamReady, setCameraStreamReady] = useState(false);
  const [detectedTabs, setDetectedTabs] = useState([]);
  const [securityNotice, setSecurityNotice] = useState('');
  const [securityPopup, setSecurityPopup] = useState({
    open: false,
    title: '',
    message: '',
    tone: 'warning',
  });
  const [activeSessionConflict, setActiveSessionConflict] = useState(false);
  const [timedWarningRemainingSec, setTimedWarningRemainingSec] = useState(0);
  const [securityStatus, setSecurityStatus] = useState(CSE_STATUS_DEFAULTS);
  const [securityAction, setSecurityAction] = useState('warn');
  const [fullscreenRecovery, setFullscreenRecovery] = useState({ active: false, remaining: 0 });
  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof window === 'undefined') return 480;
    return Math.min(560, Math.max(320, Math.round(window.innerWidth * 0.34)));
  });
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [proctoringStatus, setProctoringStatus] = useState(null);
  const [, setNetworkStatus] = useState(() => (
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online'
  ));
  const [cameraPreviewExpanded, setCameraPreviewExpanded] = useState(false);
  const validationVideoRef = useRef(null);
  const monitorVideoRef = useRef(null);
  const monitorCanvasRef = useRef(null);
  const questionScrollRef = useRef(null);
  const cameraAcquireRef = useRef(null);
  const cameraRetryRef = useRef({ nextAt: 0, delay: CAMERA_RETRY_MIN_MS });
  const cameraMutedSinceRef = useRef(0);
  const cameraNoticeRef = useRef('');
  const cameraLossReportedRef = useRef(false);
  const liveCheckpointTimerRef = useRef(null);
  const answerCheckpointTimerRef = useRef(null);
  const shortAnswerFlushRef = useRef(null);
  const focusLossTimerRef = useRef(null);
  const focusBlipsRef = useRef([]);
  const tabSwitchesRef = useRef(0);
  const totalWarningsRef = useRef(0);
  const proctoringStatusRef = useRef(null);
  const showSecurityPopupRef = useRef(null);
  const timeUpSubmitRef = useRef(false);
  const timeUpRetryTimerRef = useRef(null);
  const submitRetryTimerRef = useRef(null);
  const tabsSignatureRef = useRef('');
  const splitContainerRef = useRef(null);
  const problemPaneRef = useRef(null);
  const editorPaneRef = useRef(null);
  const dragFrameRef = useRef(null);
  const streamRef = useRef(null);
  const violationThrottleRef = useRef({});
  const lastDuplicateTabViolationRef = useRef(0);
  const fullscreenExitTimerRef = useRef(null);
  const fullscreenCountdownRef = useRef(null);
  const heartbeatFailureRef = useRef(0);
  const consecutiveNetworkFailuresRef = useRef(0);
  const networkPauseStartedAtRef = useRef(null);
  const restrictedActionGraceUntilRef = useRef(0);
  const restrictedActionNoticeRef = useRef('Restricted action recorded as a warning. Continue the assessment.');
  const timedWarningTimerRef = useRef(null);
  const screenshotGraceUntilRef = useRef(0);
  const focusLossScreenshotGraceUntilRef = useRef(0);
  const lastScreenshotWarningAtRef = useRef(0);
  const lastFocusLossAtRef = useRef(0);
  const thresholdNoticeRef = useRef({});
  const popupThrottleRef = useRef({});
  const securityStatusRef = useRef(CSE_STATUS_DEFAULTS);
  const violationScoreRef = useRef(0);
  const pauseCountRef = useRef(0);
  const securityRecheckAutoSubmitRef = useRef(false);
  const fullscreenAutoSubmitRef = useRef(false);
  const submissionInFlightRef = useRef(false);
  const autoSaveInFlightRef = useRef(false);
  const autoSavePromiseRef = useRef(null);
  const answersDirtyRef = useRef(false);
  const autoSavePayloadRef = useRef(null);
  const buildLatestAnswersRef = useRef(null);
  const saveProtocolRef = useRef(null);
  const draftAnswersRef = useRef({});
  const activeDraftKeyRef = useRef('');
  const answerRevisionRef = useRef(0);
  const savedAnswerSignaturesRef = useRef(new Map());
  const heartbeatInFlightRef = useRef(false);
  const evidenceInFlightRef = useRef(false);
  const handleSubmitRef = useRef(null);
  const recordViolationRef = useRef(null);
  const faceDetectorRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  const audioDataRef = useRef(null);
  const monitoringCooldownRef = useRef({});
  const cameraViolationStreakRef = useRef({ type: '', count: 0, at: 0 });
  const proctoringManagerRef = useRef(null);
  const aiSecurityNoticeRef = useRef('');
  const lastTabShortcutAtRef = useRef(0);
  const liveCodingCodeRef = useRef({});
  const liveCodingLanguageRef = useRef({});
  const idleTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const tabInstanceIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const assessmentSessionIdRef = useRef((() => {
    const key = `peerprep_assessment_session:${id}`;
    try {
      const existing = sessionStorage.getItem(key);
      if (existing) return existing;
      const created = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem(key, created);
      return created;
    } catch {
      return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  })());
  const rulesSeenStorageKey = `peerprep_assessment_rules_seen:${id}`;
  const activeSessionStorageKey = `peerprep_assessment_active_session:${id}`;
  const draftStorageKey = `peerprep_assessment_answer_draft:${id}`;

  useEffect(() => {
    saveProtocolRef.current = null;
    liveCodingCodeRef.current = {};
    liveCodingLanguageRef.current = {};
  }, [id]);

  useEffect(() => {
    const languages = new Set();
    (assessment?.sections || []).forEach((sectionItem) => {
      if (sectionItem?.type !== 'coding') return;
      (sectionItem.questions || []).forEach((questionItem) => {
        getCodingLanguagesFromData(getCodingDataFromQuestion(questionItem)).forEach((language) => languages.add(language));
      });
    });
    if (!languages.size) return undefined;
    const run = () => languages.forEach((language) => { void preloadMonacoEditor(language); });
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const handle = setTimeout(run, 500);
    return () => clearTimeout(handle);
  }, [assessment?.sections]);

  const answerKey = (sectionIndex, questionIndex) => `${sectionIndex}-${questionIndex}`;
  const isSubmitted = COMPLETED_ASSESSMENT_STATUSES.has(submission?.status);
  const secureActive = phase === 'active' && !isSubmitted;
  const securitySettings = useMemo(() => assessment?.settings || {}, [assessment?.settings]);
  const watermarkConfig = useMemo(() => {
    const type = securitySettings.watermarkTextType || 'platform';
    const student = candidate || submission?.studentSnapshot || {};
    let storedName = '';
    let storedEmail = '';
    try {
      storedName = localStorage.getItem('studentName') || '';
      storedEmail = localStorage.getItem('studentEmail') || '';
    } catch {
      // The authenticated candidate payload remains the primary identity source.
    }
    let text = 'PeerPrep';
    if (type === 'candidate_name') text = student.name || submission?.studentName || storedName || 'Candidate';
    else if (type === 'candidate_email') text = student.email || submission?.studentEmail || storedEmail || 'candidate@peerprep';
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
  }, [securitySettings, submission, candidate]);
  const fullscreenRequired = Boolean(securitySettings.enableFullscreen);
  const aiProctoringEnabled = Boolean(securitySettings.aiProctoring?.enabled);
  // Assessment policy: eye/head movement is never flagged, and face detection
  // runs at most every 700 ms so ML inference does not compete with typing.
  const aiProctoringSettings = useMemo(() => {
    const stored = securitySettings.aiProctoring || {};
    return {
      ...stored,
      detectLookingAway: false,
      detectionIntervalMs: Math.max(700, Number(stored.detectionIntervalMs) || 0),
    };
  }, [securitySettings.aiProctoring]);
  const cameraRequired = Boolean(securitySettings.cameraMonitoring || aiProctoringEnabled);
  const locationRequired = securitySettings.locationTracking !== false;
  const environmentRequired = securitySettings.environmentCheck !== false;
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
  const configuredSecurityRecheckTimeoutSec = Number(securitySettings.securityRecheckTimeoutSec);
  const securityRecheckTimeoutSec = Number.isFinite(configuredSecurityRecheckTimeoutSec)
    ? Math.min(1800, Math.max(30, configuredSecurityRecheckTimeoutSec))
    : 180;
  const idleDetection = Boolean(securitySettings.idleDetection);
  const idleThresholdMs = Math.max(1, Number(securitySettings.idleThresholdMin || 5)) * 60 * 1000;
  const idleAction = securitySettings.idleAction || 'warn';
  const sectionWiseLock = Boolean(securitySettings.sectionWiseLock);
  const sectionGraceSec = Number(securitySettings.sectionGraceSec || 10);
  const perMcqTimingEnabled = Boolean(securitySettings.perMcqTimingEnabled);
  const perMcqTimeSec = Math.min(3600, Math.max(10, Number(securitySettings.perMcqTimeSec || 60)));
  const totalViolations = tabSwitches + fullscreenExits + cameraFlags + copyPasteCount;
  const totalWarnings = totalViolations + screenshotWarnings + aiWarnings;
  const forcePauseActive = isPaused && phase === 'violation' && !isSubmitted;
  const securityRecheckActive = isPaused && !isSubmitted && (phase === 'violation' || phase === 'validation');
  const setupSteps = useMemo(() => {
    const steps = [];
    if (!securityRecheckActive && environmentRequired) steps.push({ key: 'environment', title: 'Clean Environment Check', icon: <Monitor className="h-4 w-4" /> });
    if (cameraRequired) steps.push({ key: 'camera', title: 'Camera Verification', icon: <Video className="h-4 w-4" /> });
    if (!securityRecheckActive && locationRequired) steps.push({ key: 'location', title: 'Location Permission', icon: <MapPin className="h-4 w-4" /> });
    if (fullscreenRequired) steps.push({ key: 'fullscreen', title: 'Enable Full Screen', icon: <Maximize className="h-4 w-4" /> });
    steps.push({ key: 'final', title: 'Final Verification', icon: <ShieldCheck className="h-4 w-4" /> });
    return steps.map((step, index) => ({ ...step, id: index + 1 }));
  }, [cameraRequired, environmentRequired, fullscreenRequired, locationRequired, securityRecheckActive]);
  const completedSetupStepSet = useMemo(() => new Set(completedSetupSteps), [completedSetupSteps]);
  const setupStepIsDone = useCallback((key) => {
    return completedSetupStepSet.has(key);
  }, [completedSetupStepSet]);
  const currentSetupStepKey = setupSteps.find((item) => item.id === validationStep)?.key || setupSteps[0]?.key;
  const currentSetupStepNumber = setupSteps.find((item) => item.id === validationStep)?.id || validationStep;
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

  const buildAnswersPayload = useCallback((sourceMap = answersMap) => (
    Object.entries(sourceMap).map(([key, value]) => {
      const [sectionIndex, questionIndex] = key.split('-').map(Number);
      const displayQuestion = assessment?.sections?.[sectionIndex]?.questions?.[questionIndex];
      const originSectionIndex = Number(displayQuestion?.__originSectionIndex ?? sectionIndex);
      const originQuestionIndex = Number(displayQuestion?.__originQuestionIndex ?? questionIndex);
      const { codeByLanguage: _codeByLanguage, ...payload } = value;
      const isCodingQuestion = (assessment?.sections?.[sectionIndex]?.type === 'coding')
        || ((displayQuestion?.type || '') === 'coding');
      const liveCode = liveCodingCodeRef.current[key];
      if (isCodingQuestion && typeof liveCode === 'string') {
        payload.code = decodeLegacyCodeEntities(liveCode);
      } else if (typeof payload.code === 'string') {
        payload.code = decodeLegacyCodeEntities(payload.code);
      }
      return { sectionIndex: originSectionIndex, questionIndex: originQuestionIndex, ...payload };
    })
  ), [answersMap, assessment]);

  const answersArray = useMemo(() => buildAnswersPayload(), [buildAnswersPayload]);
  buildLatestAnswersRef.current = buildAnswersPayload;

  // Keep the local draft current before callbacks or a final-submit checkpoint run.
  draftAnswersRef.current = mergeLiveCodingDraft(answersMap, liveCodingCodeRef.current, liveCodingLanguageRef.current);

  useEffect(() => {
    if (phase === 'active' && !saveProtocolRef.current?.finalizing) {
      answerRevisionRef.current += 1;
      answersDirtyRef.current = true;
      if (answersArray.some((answer) => savedAnswerSignaturesRef.current.get(answerPayloadKey(answer)) !== answerPayloadSignature(answer))) {
        setSaveStatus((previous) => (previous === 'local_pending' ? previous : 'local_pending'));
      }
    }
  }, [answersArray, phase]);

  // The server ignores the client violation list and heartbeat snapshot on
  // saves; sending them only grew every request and IndexedDB checkpoint.
  useEffect(() => {
    autoSavePayloadRef.current = {
      assessmentId: assessment?._id,
      answers: answersArray,
      status: 'in_progress',
      tabSwitches,
      fullscreenExits,
      copyPasteCount,
      cameraFlags,
      violationScore,
      pauseCount,
      lastPauseAt,
      sessionId: assessmentSessionIdRef.current,
    };
  }, [assessment?._id, answersArray, tabSwitches, fullscreenExits, copyPasteCount, cameraFlags, violationScore, pauseCount, lastPauseAt]);

  // IndexedDB is independent of network autosave. Protocol checkpoints serialize
  // draft + pending request writes, including an ambiguous response after a reload.
  // Debounced: every checkpoint deep-clones all answers.
  const flushAnswerCheckpoint = useCallback(() => {
    if (answerCheckpointTimerRef.current) {
      clearTimeout(answerCheckpointTimerRef.current);
      answerCheckpointTimerRef.current = null;
    }
    if (liveCheckpointTimerRef.current) {
      clearTimeout(liveCheckpointTimerRef.current);
      liveCheckpointTimerRef.current = null;
    }
    draftAnswersRef.current = mergeLiveCodingDraft(draftAnswersRef.current, liveCodingCodeRef.current, liveCodingLanguageRef.current);
    return saveProtocolRef.current?.checkpoint();
  }, []);

  const scheduleLiveCodeCheckpoint = useCallback(() => {
    if (liveCheckpointTimerRef.current) return;
    liveCheckpointTimerRef.current = setTimeout(() => {
      liveCheckpointTimerRef.current = null;
      setSaveStatus((previous) => (previous === 'local_pending' ? previous : 'local_pending'));
      void flushAnswerCheckpoint();
    }, LIVE_CODE_CHECKPOINT_MS);
  }, [flushAnswerCheckpoint]);

  useEffect(() => {
    if (phase !== 'active' || !submission?._id || saveProtocolRef.current?.finalizing) return undefined;
    clearTimeout(answerCheckpointTimerRef.current);
    answerCheckpointTimerRef.current = setTimeout(() => {
      answerCheckpointTimerRef.current = null;
      void saveProtocolRef.current?.checkpoint();
    }, ANSWER_CHECKPOINT_MS);
    return undefined;
  }, [answersMap, phase, submission?._id]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') void flushAnswerCheckpoint();
    };
    const flush = () => { void flushAnswerCheckpoint(); };
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', flush);
      if (answerCheckpointTimerRef.current || liveCheckpointTimerRef.current) void flushAnswerCheckpoint();
    };
  }, [flushAnswerCheckpoint]);
  const flatQuestions = useMemo(() => {
    const list = [];
    let mcqCount = 0;
    let codingCount = 0;
    (assessment?.sections || []).forEach((sec, secIdx) => {
      (sec.questions || []).forEach((question, qIdx) => {
        const kind = sec?.type === 'coding' ? 'coding' : 'mcq';
        if (kind === 'coding') codingCount += 1;
        else mcqCount += 1;
        list.push({
          sectionIndex: secIdx,
          questionIndex: qIdx,
          section: sec,
          question,
          number: list.length + 1,
          kind,
          typeNumber: kind === 'coding' ? codingCount : mcqCount,
        });
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

  // Section locks only need coarse time; a 5 s clock keeps the page from
  // re-rendering every second (the visible countdown owns its own ticker).
  const [lockClock, setLockClock] = useState(() => Date.now());
  useEffect(() => {
    if (!sectionWiseLock || phase !== 'active' || isPaused) return undefined;
    setLockClock(Date.now());
    const timer = setInterval(() => setLockClock(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [sectionWiseLock, phase, isPaused]);

  const elapsedAssessmentMs = useMemo(() => {
    if (!assessment?.duration) return 0;
    const totalDurationMs = Math.max(0, Number(assessment.duration || 0)) * 60 * 1000;
    const remainingMs = allowedEndTime ? allowedEndTime - (lockClock + offset) : timeLeft;
    return Math.max(0, totalDurationMs - remainingMs);
  }, [assessment?.duration, allowedEndTime, lockClock, offset, timeLeft]);

  const isSectionLocked = useCallback((sectionIndex) => {
    if (!sectionWiseLock) return false;
    const plan = sectionLockPlan[sectionIndex];
    if (!plan) return false;
    return elapsedAssessmentMs > plan.endsAtMs + (sectionGraceSec * 1000);
  }, [sectionWiseLock, sectionLockPlan, elapsedAssessmentMs, sectionGraceSec]);

  const sectionSummaries = useMemo(() => {
    let mcqStart = 0;
    let codingStart = 0;
    return (assessment?.sections || []).map((sec, index) => {
      const count = sec?.questions?.length || 0;
      const isCodingSection = sec?.type === 'coding';
      const start = (isCodingSection ? codingStart : mcqStart) + 1;
      const end = count > 0 ? start + count - 1 : start;
      if (isCodingSection) codingStart += count;
      else mcqStart += count;
      return {
        index,
        count,
        start,
        end,
        label: sec?.sectionName || `Section ${index + 1}`,
        typeLabel: formatSectionTypeLabel(sec?.type),
      };
    });
  }, [assessment?.sections]);

  const currentFlatIndex = useMemo(() => (
    flatQuestions.findIndex((item) => item.sectionIndex === activeSection && item.questionIndex === activeQuestion)
  ), [flatQuestions, activeSection, activeQuestion]);

  const totalQuestions = flatQuestions.length;
  const questionTypeTotals = useMemo(() => flatQuestions.reduce((totals, item) => {
    totals[item.kind] += 1;
    return totals;
  }, { mcq: 0, coding: 0 }), [flatQuestions]);
  const currentQuestionItem = currentFlatIndex >= 0 ? flatQuestions[currentFlatIndex] : null;
  const currentTypeQuestionNumber = currentQuestionItem?.typeNumber || 1;
  const currentQuestionKind = currentQuestionItem?.kind || 'mcq';
  const currentTypeQuestionTotal = questionTypeTotals[currentQuestionKind] || 0;
  const currentQuestionTypeLabel = currentQuestionKind === 'coding' ? 'Coding' : 'MCQ / Short';
  const currentPassageKey = getPassageKey(currentQuestionItem?.question);
  const currentPassageFlatIndexes = currentPassageKey
    ? flatQuestions.map((item, index) => (
      item.sectionIndex === currentQuestionItem?.sectionIndex && getPassageKey(item.question) === currentPassageKey ? index : -1
    )).filter((index) => index >= 0)
    : [];
  const currentNavigationStartIndex = currentPassageFlatIndexes.length ? Math.min(...currentPassageFlatIndexes) : currentFlatIndex;
  const currentNavigationEndIndex = currentPassageFlatIndexes.length ? Math.max(...currentPassageFlatIndexes) : currentFlatIndex;
  const hasPrevQuestion = currentNavigationStartIndex > 0;
  const hasNextQuestion = currentNavigationEndIndex >= 0 && currentNavigationEndIndex < totalQuestions - 1;

  const questionStatus = useCallback((secIdx, qIdx) => {
    const key = `${secIdx}-${qIdx}`;
    const value = answersMap[key] || {};
    const section = assessment?.sections?.[secIdx];
    let answered = false;
    if (section?.type === 'mcq') {
      answered = Array.isArray(value.answer)
        ? value.answer.length > 0
        : value.answer !== undefined && value.answer !== null && value.answer !== '';
    } else if (section?.type === 'coding') {
      const question = section.questions?.[qIdx];
      const codingData = getCodingDataFromQuestion(question);
      const language = value.language || codingData.supportedLanguages?.[0] || 'javascript';
      const starterCode = getStarterCodeForLanguage(codingData, language);
      const submittedCode = String(value.code || '').trim();
      answered = Boolean(submittedCode) && submittedCode !== String(starterCode || '').trim();
    } else if (section) {
      answered = Boolean(value.answer) && String(value.answer).trim().length > 0;
    }
    // An answered question stays green even when marked; the mark is a flag on top.
    if (markedMap[key]) return answered ? 'answered_review' : 'review';
    return answered ? 'answered' : 'unanswered';
  }, [answersMap, markedMap, assessment]);

  const attemptedQuestionCounts = useMemo(() => Object.entries(answersMap).reduce((counts, [key, value]) => {
    const [sectionIndex, questionIndex] = key.split('-').map(Number);
    const sectionItem = assessment?.sections?.[sectionIndex];
    const questionItem = sectionItem?.questions?.[questionIndex];
    const type = questionItem?.type || sectionItem?.type;
    if (type && hasAttemptedResponse(value, questionItem, type)) counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {}), [answersMap, assessment]);

  useEffect(() => {
    securityStatusRef.current = securityStatus;
  }, [securityStatus]);

  useEffect(() => {
    tabSwitchesRef.current = tabSwitches;
    totalWarningsRef.current = totalWarnings;
  }, [tabSwitches, totalWarnings]);

  useEffect(() => {
    proctoringStatusRef.current = proctoringStatus;
  }, [proctoringStatus]);

  // Returns the previous object when nothing changed so no-op status writes
  // (heartbeats, camera samples) don't re-render the whole attempt page.
  const patchSecurityStatus = useCallback((patch) => setSecurityStatus((previous) => (
    Object.keys(patch).every((key) => previous[key] === patch[key]) ? previous : { ...previous, ...patch }
  )), []);

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
    const notice = event.message || 'Camera attention needed. Please adjust and continue.';
    aiSecurityNoticeRef.current = notice;
    setSecurityNotice(notice);
    setAiWarnings((prev) => prev + 1);

    try {
      // Without sessionId the server rejects every AI violation (409) once the
      // heartbeat has registered this session.
      await logAiProctoringViolation({
        assessmentId: assessment._id,
        submissionId: saveProtocolRef.current?.submissionId || submission?._id,
        sessionId: assessmentSessionIdRef.current,
        attemptGeneration: saveProtocolRef.current?.generation || 1,
        violation: event,
      });
    } catch (err) {
      console.warn('AI proctoring violation logging failed; assessment will continue.', err);
    }

    if (limitExceeded) {
      const repeatedNotice = `${event.message || 'Camera attention needed.'} Repeated AI violation detected.`;
      aiSecurityNoticeRef.current = repeatedNotice;
      setSecurityNotice(repeatedNotice);
    }
  }, [assessment?._id, submission?._id]);

  // Model download/inference problems are system health, not student behaviour:
  // log them, never show them as a security warning.
  const handleAiProctoringError = useCallback((error) => {
    console.warn('AI Proctoring error', error);
  }, []);

  const clampLeftWidth = (value, containerWidth = splitContainerRef.current?.getBoundingClientRect().width) => {
    if (!containerWidth) return value;
    const min = 320;
    const max = Math.max(min, Math.min(680, containerWidth - 360));
    return Math.min(max, Math.max(min, value));
  };

  const handleSave = useCallback(async () => {
    const protocol = saveProtocolRef.current;
    if (!assessment || isSubmitted || phase !== 'active' || submissionInFlightRef.current || protocol?.finalizing || !protocol
      || (!answersDirtyRef.current && !protocol.pendingBatch) || autoSaveInFlightRef.current) return;
    const currentPayload = { ...autoSavePayloadRef.current, answers: buildLatestAnswersRef.current?.() || [] };
    const pendingAnswers = (currentPayload?.answers || []).filter((answer) => (
      savedAnswerSignaturesRef.current.get(answerPayloadKey(answer)) !== answerPayloadSignature(answer)
    ));
    if (pendingAnswers.length === 0 && !protocol.pendingBatch) {
      answersDirtyRef.current = false;
      return;
    }

    const sentRevision = answerRevisionRef.current;
    autoSaveInFlightRef.current = true;
    setSaving(true);
    try {
      const savePromise = protocol.save({
        ...currentPayload,
        answers: pendingAnswers,
      });
      autoSavePromiseRef.current = savePromise;
      const result = await savePromise;
      if (result?.submissionReceipt || result?.receipt) {
        await handleSubmitRef.current?.(true);
        return;
      }
      const latestAnswers = autoSavePayloadRef.current?.answers || [];
      const hasNewChanges = latestAnswers.some((answer) => (
        savedAnswerSignaturesRef.current.get(answerPayloadKey(answer)) !== answerPayloadSignature(answer)
      ));
      answersDirtyRef.current = answerRevisionRef.current !== sentRevision || hasNewChanges;
      if (hasNewChanges) setSaveStatus('local');
    } catch (err) {
      if (err?.response?.status === 409 && err?.response?.data?.code === 'ACTIVE_ASSESSMENT_SESSION') {
        setActiveSessionConflict(true);
        return;
      }
      setSaveError(err.message || 'Answers are waiting to sync. Keep this page open.');
    } finally {
      autoSavePromiseRef.current = null;
      autoSaveInFlightRef.current = false;
      if (!submissionInFlightRef.current) setSaving(false);
    }
  }, [assessment, isSubmitted, phase]);

  const handleSubmit = useCallback(async (auto = false, autoMessage = '') => {
    if (!assessment || submissionInFlightRef.current || !saveProtocolRef.current) return false;
    if (!auto && !saveProtocolRef.current.finalizing && assessment.settings?.questionSelectionEnabled) {
      const attemptedByType = Object.entries(answersMap).reduce((counts, [key, value]) => {
        const [sectionIndex, questionIndex] = key.split('-').map(Number);
        const sectionItem = assessment.sections?.[sectionIndex];
        const questionItem = sectionItem?.questions?.[questionIndex];
        const type = questionItem?.type || sectionItem?.type;
        if (type && hasAttemptedResponse(value, questionItem, type)) counts[type] = (counts[type] || 0) + 1;
        return counts;
      }, {});
      const missingType = Object.entries(assessment.settings?.questionAttemptRequirements || {}).find(([type, required]) => (
        Number(required) > 0 && Number(attemptedByType[type] || 0) < Number(required)
      ));
      if (missingType) {
        const [type, required] = missingType;
        toast.error(`Answer ${required} ${type.replace('_', ' ')} question${Number(required) === 1 ? '' : 's'} before submitting.`);
        return false;
      }
    }
    submissionInFlightRef.current = true;
    if (submitRetryTimerRef.current) {
      clearTimeout(submitRetryTimerRef.current);
      submitRetryTimerRef.current = null;
    }
    setShowSubmitConfirm(false);
    setFinalizing(true);
    setSaving(true);
    let submissionCompleted = false;
    let finalAnswersAccepted = true;
    try {
      // Commit typing that is still debounced in the short-answer box or editor.
      const pendingShortAnswer = shortAnswerFlushRef.current?.();
      await flushAnswerCheckpoint();
      const latestAnswers = buildAnswersPayload(pendingShortAnswer?.key
        ? { ...answersMap, [pendingShortAnswer.key]: { ...(answersMap[pendingShortAnswer.key] || {}), answer: pendingShortAnswer.text } }
        : answersMap);
      const result = await saveProtocolRef.current.submit({
        assessmentId: assessment._id,
        answers: latestAnswers,
        status: 'submitted',
        tabSwitches,
        fullscreenExits,
        copyPasteCount,
        cameraFlags,
        violationScore,
        pauseCount,
        lastPauseAt,
        sessionId: assessmentSessionIdRef.current,
      });
      finalAnswersAccepted = result?.answersAccepted !== false;
      submissionCompleted = true;
    } catch (err) {
      if (err?.response?.status === 409 && err?.response?.data?.code === 'ACTIVE_ASSESSMENT_SESSION') {
        setActiveSessionConflict(true);
        return false;
      }
      if (isTransientSaveError(err)) {
        // End-of-exam rush: the protocol already retried with backoff. Try once
        // more in the background, with jitter, before asking the student.
        if (!submitRetryTimerRef.current) {
          submitRetryTimerRef.current = setTimeout(() => {
            submitRetryTimerRef.current = null;
            void handleSubmitRef.current?.(true, 'Assessment submitted successfully');
          }, 4000 + Math.random() * 4000);
        }
        toast.info('The server is busy. Your answers are locked and submission will be retried automatically.');
        return false;
      }
      toast.error(err.message || 'Failed to submit assessment');
      return false;
    } finally {
      submissionInFlightRef.current = false;
      setSaving(false);
    }

    if (!submissionCompleted) return false;

    answersDirtyRef.current = false;
    // The server has the attempt; draft cleanup must not delay the redirect.
    if (finalAnswersAccepted) void deleteAssessmentDraft(activeDraftKeyRef.current || draftStorageKey);

    // Cleanup/proctoring must never prevent the mandatory feedback redirect
    // after the server has already accepted the assessment submission.
    try {
      stopAiProctoring();
    } catch (cleanupError) {
      console.warn('Assessment cleanup after submit failed:', cleanupError);
    }
    if (finalAnswersAccepted) {
      toast.success(auto ? (autoMessage || 'Time is up. Assessment auto-submitted.') : 'Assessment submitted successfully');
    } else {
      toast.info('The assessment had already ended. Your last server-saved answers were submitted; newer device edits were not accepted.');
    }
    navigate(`/student/assessment/${assessment._id}/feedback`, { replace: true });
    return true;
  }, [assessment, answersMap, buildAnswersPayload, flushAnswerCheckpoint, tabSwitches, fullscreenExits, copyPasteCount, cameraFlags, violationScore, pauseCount, lastPauseAt, stopAiProctoring, toast, navigate, draftStorageKey]);

  const triggerForcePause = useCallback((type, message, serverState = {}) => {
    if (type !== 'tab_switch') {
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
    requestAnimationFrame(() => window.dispatchEvent(new Event('peerprep:focus-code-editor')));
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
    focusLossScreenshotGraceUntilRef.current = now + FOCUS_LOSS_SCREENSHOT_GRACE_MS;
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
      eventId: globalThis.crypto?.randomUUID?.() || `violation-${now}-${Math.random().toString(16).slice(2)}`,
      type,
      message,
      at: new Date().toISOString(),
      meta: { ...meta, weight },
    };
    setViolationScore((prev) => prev + weight);
    setViolationMessage(message);
    setSecurityNotice(message);

    if (type === 'tab_switch') setTabSwitches((prev) => prev + 1);
    if (type === 'fullscreen_exit') setFullscreenExits((prev) => prev + 1);
    if (['camera_loss', 'camera_no_face', 'multiple_faces', 'face_out_of_frame'].includes(type)) setCameraFlags((prev) => prev + 1);
    if (type === 'copy_paste' || type === 'context_menu') setCopyPasteCount((prev) => prev + 1);

    try {
      const violationBody = {
        eventId: entry.eventId,
        submissionId: saveProtocolRef.current?.submissionId,
        sessionId: assessmentSessionIdRef.current,
        attemptGeneration: saveProtocolRef.current?.generation || 1,
        type,
        message,
        timestamp: entry.at,
        meta: entry.meta,
      };
      let result;
      try {
        result = await api.logStudentAssessmentViolation(assessment._id, violationBody);
      } catch (firstError) {
        // Server busy (per-client cap): retry once with the same eventId, so the
        // server records it at most once.
        if (firstError?.response?.status !== 429) throw firstError;
        await new Promise((resolve) => setTimeout(resolve, 1200 + Math.random() * 800));
        result = await api.logStudentAssessmentViolation(assessment._id, violationBody);
      }
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
        if (!meta.deferAutoSubmit) {
          toast.error('Violation limit reached. Assessment auto-submitted.');
          await handleSubmit(true);
        }
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
      return null;
    } finally {
      setTimeout(() => {
        handleSave();
      }, 0);
    }
  }, [isSubmitted, assessment?._id, securitySettings, handleSave, handleSubmit, toast, triggerForcePause, showSecurityPopup]);

  // Long-lived listeners and timers call through these refs, so an answer
  // change (which recreates both callbacks) no longer tears them down.
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
    recordViolationRef.current = recordViolation;
    showSecurityPopupRef.current = showSecurityPopup;
  }, [handleSubmit, recordViolation, showSecurityPopup]);

  useEffect(() => () => {
    if (submitRetryTimerRef.current) clearTimeout(submitRetryTimerRef.current);
    if (timeUpRetryTimerRef.current) clearTimeout(timeUpRetryTimerRef.current);
  }, []);

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
    // Measure once: reading layout on every pointermove forced a sync reflow.
    const containerWidth = splitContainerRef.current.getBoundingClientRect().width;
    const startWidth = clampLeftWidth(leftWidth, containerWidth);
    let nextWidth = startWidth;

    // Write the CSS variable directly during the drag and commit React state
    // once on release, instead of re-rendering the whole page every frame.
    const schedule = (value) => {
      nextWidth = clampLeftWidth(value, containerWidth);
      if (dragFrameRef.current) return;
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        problemPaneRef.current?.style.setProperty('--assessment-problem-width', `${nextWidth}px`);
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
      problemPaneRef.current?.style.setProperty('--assessment-problem-width', `${nextWidth}px`);
      setLeftWidth(nextWidth);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

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
      const attemptAssessment = data.assessment;
      setAssessment(attemptAssessment);
      setSubmission(data.submission);
      setCandidate(data.candidate || null);
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
        initialAnswers[answerKey(mapped.displaySectionIndex, mapped.displayQuestionIndex)] = {
          ...displayAnswer,
        };
      });
      savedAnswerSignaturesRef.current = new Map((data.submission?.answers || []).map((answer) => [
        answerPayloadKey(answer), answerPayloadSignature(answer),
      ]));
      let restoredLocalDraft = false;
      const scopedDraftKey = `${draftStorageKey}:${String(data.submission?._id || '')}`;
      activeDraftKeyRef.current = scopedDraftKey;
      // A server-side auto-submit leaves the local draft behind; on shared lab
      // machines the next student could read it from browser storage.
      if (COMPLETED_ASSESSMENT_STATUSES.has(String(data.submission?.status || '').toLowerCase())) {
        void deleteAssessmentDraft(scopedDraftKey);
      }
      const localDraft = await readAssessmentDraft(scopedDraftKey) || await readAssessmentDraft(draftStorageKey);
      const canRecover = isDraftForAttempt(localDraft, data.submission, assessmentSessionIdRef.current);
      if (canRecover && localDraft.answersMap && typeof localDraft.answersMap === 'object') {
        const serverSavedAt = new Date(data.submission?.lastSavedAt || 0).getTime();
        const priorSignatures = new Map(Array.isArray(localDraft.savedSignatures)
          ? localDraft.savedSignatures.filter((entry) => Array.isArray(entry) && entry.length === 2) : []);
        Object.entries(localDraft.answersMap).forEach(([key, value]) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return;
          const [sectionIndex, questionIndex] = key.split('-').map(Number);
          const questionItem = attemptAssessment?.sections?.[sectionIndex]?.questions?.[questionIndex];
          if (!questionItem) return;
          const originKey = `${Number(questionItem.__originSectionIndex ?? sectionIndex)}-${Number(questionItem.__originQuestionIndex ?? questionIndex)}`;
          // Only restore unacknowledged edits; never replace newer server answers
          // with the entire old display-state snapshot.
          const dirty = localDraft.protocol
            ? priorSignatures.get(originKey) !== answerPayloadSignature(value)
            : Number(localDraft.updatedAt || 0) > serverSavedAt;
          if (dirty) {
            initialAnswers[key] = value;
            restoredLocalDraft = true;
          }
        });
      }
      (attemptAssessment?.sections || []).forEach((sectionItem, displaySectionIndex) => {
        if (sectionItem?.type !== 'coding') return;
        (sectionItem.questions || []).forEach((questionItem, displayQuestionIndex) => {
          const key = answerKey(displaySectionIndex, displayQuestionIndex);
          const existingAnswer = initialAnswers[key] || {};
          const codingData = getCodingDataFromQuestion(questionItem);
          const languages = getCodingLanguagesFromData(codingData);
          const language = existingAnswer.language || languages[0];
          const hasCode = typeof existingAnswer.code === 'string' && existingAnswer.code.trim();
          const initialCode = hasCode ? existingAnswer.code : getStarterCodeForLanguage(codingData, language);
          liveCodingCodeRef.current[key] = initialCode;
          liveCodingLanguageRef.current[key] = language;
          initialAnswers[key] = {
            ...existingAnswer,
            language,
            code: initialCode,
            codeByLanguage: {
              ...(existingAnswer.codeByLanguage || {}),
              [language]: initialCode,
            },
          };
        });
      });
      draftAnswersRef.current = initialAnswers;
      let protocol;
      protocol = new AssessmentSaveProtocol({
        server: data.submission || {},
        recovered: canRecover ? localDraft.protocol : undefined,
        sendSave: (body) => api.saveStudentAssessmentProgress(id, body),
        sendSubmit: (body) => api.submitStudentAssessment(body),
        onAcknowledged: (answers) => {
          if (protocol && saveProtocolRef.current !== protocol) return;
          answers.forEach((answer) => savedAnswerSignaturesRef.current.set(answerPayloadKey(answer), answerPayloadSignature(answer)));
        },
        onState: (state, saveFailure) => {
          if (protocol && saveProtocolRef.current !== protocol) return;
          setSaveStatus(state);
          setSaveError(saveFailure?.message || '');
          if (state.startsWith('submit')) setFinalizing(true);
          if (state === 'validation_failed') setFinalizing(false);
        },
        persist: async (state) => {
          if (protocol && saveProtocolRef.current !== protocol) return;
          const localRevision = answerRevisionRef.current;
          const stored = await writeAssessmentDraft(scopedDraftKey, {
            submissionId: String(data.submission?._id || ''),
            attemptGeneration: Number(data.submission?.attemptGeneration || 1),
            sessionId: assessmentSessionIdRef.current,
            updatedAt: Date.now(),
            answersMap: JSON.parse(JSON.stringify(draftAnswersRef.current)),
            savedSignatures: [...savedAnswerSignaturesRef.current],
            protocol: state,
          });
          setDraftStorageAvailable(stored);
          if (stored && localRevision === answerRevisionRef.current) {
            setSaveStatus((previous) => previous === 'local_pending' ? 'local' : previous);
          }
        },
      });
      saveProtocolRef.current = protocol;
      setFinalizing(protocol.finalizing);
      setSaveStatus(protocol.finalizing ? 'submit_failed' : restoredLocalDraft ? 'local' : 'saved');
      answerRevisionRef.current = 0;
      answersDirtyRef.current = restoredLocalDraft || Boolean(protocol.pendingBatch);
      setAnswersMap(initialAnswers);
      setTabSwitches(data.submission?.tabSwitches || 0);
      setFullscreenExits(data.submission?.fullscreenExits || 0);
      setCopyPasteCount(data.submission?.copyPasteCount || 0);
      setCameraFlags(data.submission?.cameraFlags || 0);
      setViolationScore(data.submission?.violationScore || 0);
      setPauseCount(data.submission?.pauseCount || 0);
      setLastPauseAt(data.submission?.lastPauseAt || null);
      setLocationData(data.submission?.securitySetup?.location || null);
      syncCompletedSecuritySteps(data.completedSecuritySteps || []);
      const loadedTimeoutSec = Math.min(
        1800,
        Math.max(30, Number(data.securityRecheckTimeoutSec || data.assessment?.settings?.securityRecheckTimeoutSec || 180) || 180),
      );
      const pauseStartMs = data.submission?.pauseStartedAt ? new Date(data.submission.pauseStartedAt).getTime() : null;
      const hasActiveSecurityPause = data.submission?.status !== 'submitted'
        && data.submission?.securityPauseReason === 'tab_switch'
        && Number.isFinite(pauseStartMs);
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
  }, [id, rulesSeenStorageKey, draftStorageKey, syncCompletedSecuritySteps]);

  useEffect(() => {
    loadAssessment();
  }, [loadAssessment]);

  // If a completed assessment URL is reopened or refreshed, keep the student
  // in the mandatory feedback flow instead of showing the locked attempt UI.
  useEffect(() => {
    if (!assessment?._id || !submission?.submittedAt) return;
    if (!COMPLETED_ASSESSMENT_STATUSES.has(String(submission.status || '').toLowerCase())) return;
    navigate(`/student/assessment/${assessment._id}/feedback`, { replace: true });
  }, [assessment?._id, submission?.status, submission?.submittedAt, navigate]);

  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const markOffline = () => {
      consecutiveNetworkFailuresRef.current = NETWORK_FAILURES_BEFORE_PAUSE;
      setNetworkStatus('offline');
    };
    const verifyConnection = () => {
      if (navigator.onLine === false) {
        markOffline();
        return;
      }
      setNetworkStatus(hasVeryWeakConnection() ? 'weak' : 'reconnecting');
    };

    if (navigator.onLine === false) markOffline();
    else if (hasVeryWeakConnection()) setNetworkStatus('weak');

    window.addEventListener('offline', markOffline);
    window.addEventListener('online', verifyConnection);
    connection?.addEventListener?.('change', verifyConnection);
    return () => {
      window.removeEventListener('offline', markOffline);
      window.removeEventListener('online', verifyConnection);
      connection?.removeEventListener?.('change', verifyConnection);
    };
  }, []);

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
        const sortedTabs = activeEntries.sort((a, b) => Number(b.current) - Number(a.current));
        // lastSeen changes on every beat; only tab identity matters for the UI.
        const signature = sortedTabs.map((entry) => `${entry.id}:${entry.current ? 1 : 0}:${entry.title}`).join('|');
        if (signature !== tabsSignatureRef.current) {
          tabsSignatureRef.current = signature;
          setDetectedTabs(sortedTabs);
        }
        patchSecurityStatus({ duplicateTab: preventMultipleTabs && activeEntries.some((entry) => !entry.current) });
        return Object.fromEntries(activeEntries.map((entry) => [entry.id, {
          title: entry.title,
          path: entry.path,
          lastSeen: entry.lastSeen,
        }]));
      } catch {
        if (tabsSignatureRef.current !== 'fallback') {
          tabsSignatureRef.current = 'fallback';
          setDetectedTabs([{ id: instanceId, title: assessment.title || 'Assessment tab', path: window.location.pathname, lastSeen: Date.now(), current: true }]);
        }
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
          patchSecurityStatus({ duplicateTab: true });
        }
      }
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
  }, [assessment?._id, assessment?.title, activeSessionStorageKey, phase, preventMultipleTabs, patchSecurityStatus]);

  // Start every question at the top, before paint. The coding problem panel's
  // inner body is the element that actually scrolls.
  useLayoutEffect(() => {
    questionScrollRef.current?.scrollTo?.({ top: 0 });
    problemPaneRef.current?.querySelector?.('[data-problem-scroll]')?.scrollTo?.({ top: 0 });
  }, [activeSection, activeQuestion]);

  // Starts once per attempt. Transient failures are retried by the save
  // protocol (finalizing stays on); if a submit is refused outright and the
  // exam becomes editable again at 00:00, try again every 10 s.
  const handleTimeUp = useCallback(() => {
    if (!autoSubmitOnEnd || timeUpSubmitRef.current) return;
    timeUpSubmitRef.current = true;
    const attempt = async () => {
      timeUpRetryTimerRef.current = null;
      const submitted = await handleSubmitRef.current?.(true);
      if (submitted || saveProtocolRef.current?.finalizing) return;
      timeUpRetryTimerRef.current = setTimeout(attempt, 10000);
    };
    void attempt();
  }, [autoSubmitOnEnd]);

  // Preload the next question's images so its options don't shift on arrival.
  useEffect(() => {
    const nextQuestion = flatQuestions[currentNavigationEndIndex + 1]?.question;
    if (!nextQuestion) return;
    [
      nextQuestion.questionImage?.url,
      nextQuestion.passage?.image?.url,
      ...(nextQuestion.optionImages || []).map((image) => image?.url),
    ].filter(Boolean).forEach((url) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
    });
  }, [currentNavigationEndIndex, flatQuestions]);

  useEffect(() => {
    if (!securityRecheckActive || !securityRecheckStartedAt) return undefined;
    const tick = () => {
      const elapsedSec = Math.floor((Date.now() - securityRecheckStartedAt) / 1000);
      const remaining = Math.max(0, securityRecheckTimeoutSec - elapsedSec);
      setSecurityRecheckRemainingSec(remaining);
      if (remaining <= 0 && !securityRecheckAutoSubmitRef.current) {
        securityRecheckAutoSubmitRef.current = true;
        toast.error('Security recheck time expired. Assessment is being auto-submitted.');
        void handleSubmitRef.current?.(true);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [securityRecheckActive, securityRecheckStartedAt, securityRecheckTimeoutSec, toast]);

  useEffect(() => {
    return () => {
      if (timedWarningTimerRef.current) clearInterval(timedWarningTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!secureActive || isSubmitted) return undefined;
    let cancelled = false;
    let timer;
    const tick = async () => {
      await handleSave();
      if (!cancelled) {
        timer = setTimeout(tick, nextJitteredDelay(AUTOSAVE_BASE_MS, AUTOSAVE_JITTER_MS));
      }
    };
    timer = setTimeout(tick, nextJitteredDelay(AUTOSAVE_BASE_MS, AUTOSAVE_JITTER_MS));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [secureActive, isSubmitted, handleSave]);

  // Sync shortly after each answer change instead of only on the 25-35 s
  // timer, so a time-up submit never loses the last answers. Batches carry
  // only changed answers; the timer above stays as the fallback.
  useEffect(() => {
    if (!secureActive || isSubmitted || saveProtocolRef.current?.finalizing || !answersDirtyRef.current) return undefined;
    const timer = setTimeout(() => { void handleSave(); }, ANSWER_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [answersMap, secureActive, isSubmitted, handleSave]);

  useEffect(() => {
    const retry = () => {
      if (saveProtocolRef.current?.finalizing) void handleSubmitRef.current?.(true, 'Assessment submitted successfully');
      else void handleSave();
    };
    window.addEventListener('online', retry);
    const warnBeforeClose = (event) => {
      if (!answersDirtyRef.current && !saveProtocolRef.current?.pendingBatch && !saveProtocolRef.current?.pendingFinal) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeClose);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('beforeunload', warnBeforeClose);
    };
  }, [handleSave]);

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
    const reportTabViolation = (source, extraMeta = {}) => {
      const now = Date.now();
      if (now - lastFocusLossAtRef.current < 1000) return;
      lastFocusLossAtRef.current = now;
      const message = 'Tab switch or focus loss detected. Return to the assessment window.';
      const meta = {
        limit: tabSwitchLimit || null,
        warnAt: tabSwitchWarnAt || null,
        action: tabSwitchAction,
        nextCount: tabSwitchesRef.current + 1,
        source,
        localPopupShown: true,
        ...extraMeta,
      };
      showSecurityPopupRef.current?.('tab_switch', message, meta);
      void recordViolationRef.current?.('tab_switch', message, meta);
    };
    const clearFocusLossTimer = () => {
      if (!focusLossTimerRef.current) return false;
      clearTimeout(focusLossTimerRef.current);
      focusLossTimerRef.current = null;
      return true;
    };
    const reportFocusLoss = (source) => {
      const now = Date.now();
      const screenshotWarningActive = now < focusLossScreenshotGraceUntilRef.current
        || now - lastScreenshotWarningAtRef.current < FOCUS_LOSS_SCREENSHOT_GRACE_MS;
      if (screenshotWarningActive) {
        patchSecurityStatus({ tabActive: true });
        setSecurityNotice(restrictedActionNoticeRef.current);
        return;
      }
      const active = document.hasFocus() && !document.hidden;
      patchSecurityStatus({ tabActive: active });
      if (active) return;
      // The tab really went to the background: count it immediately.
      if (document.hidden) {
        clearFocusLossTimer();
        reportTabViolation(source);
        return;
      }
      // Window blur only: count it if focus does not come back within 2 s.
      if (focusLossTimerRef.current) return;
      focusLossTimerRef.current = setTimeout(() => {
        focusLossTimerRef.current = null;
        // Already counted by the keyboard shortcut or hidden-tab path.
        if (Date.now() - lastFocusLossAtRef.current < FOCUS_LOSS_CONFIRM_MS + 500) return;
        if (!document.hasFocus() || document.hidden) reportTabViolation(source);
      }, FOCUS_LOSS_CONFIRM_MS);
    };
    const handleTabShortcut = (event) => {
      const key = String(event.key || '').toLowerCase();
      const code = String(event.code || '').toLowerCase();
      const browserTabShortcut = (event.ctrlKey || event.metaKey)
        && (key === 'tab' || key === 'pageup' || key === 'pagedown');
      const operatingSystemSwitch = event.altKey
        && (key === 'tab' || key === 'escape' || code === 'tab');
      if (!browserTabShortcut && !operatingSystemSwitch) return;

      const now = Date.now();
      if (now - lastTabShortcutAtRef.current < 700) return;
      lastTabShortcutAtRef.current = now;
      const shortcut = [
        event.ctrlKey ? 'Ctrl' : '',
        event.metaKey ? 'Meta' : '',
        event.altKey ? 'Alt' : '',
        event.shiftKey ? 'Shift' : '',
        event.key,
      ].filter(Boolean).join('+');
      reportTabViolation('keyboard_tab_switch', { shortcut });
    };
    const handleVisibility = () => reportFocusLoss('visibilitychange');
    const handleBlur = () => reportFocusLoss('window_blur');
    const handlePageHide = () => reportFocusLoss('pagehide');
    const handleFocus = () => {
      const now = Date.now();
      if (clearFocusLossTimer() && now - lastFocusLossAtRef.current >= FOCUS_LOSS_CONFIRM_MS + 500) {
        // Focus came back within the grace window: log the blip for audit and
        // escalate only when blips repeat.
        focusBlipsRef.current = [...focusBlipsRef.current.filter((at) => now - at < FOCUS_BLIP_WINDOW_MS), now];
        if (focusBlipsRef.current.length >= FOCUS_BLIP_ESCALATE_COUNT) {
          focusBlipsRef.current = [];
          reportTabViolation('repeated_focus_loss', { blips: FOCUS_BLIP_ESCALATE_COUNT });
        } else if (assessment?._id) {
          void api.logStudentAssessmentMonitoring(assessment._id, {
            submissionId: saveProtocolRef.current?.submissionId,
            sessionId: assessmentSessionIdRef.current,
            attemptGeneration: saveProtocolRef.current?.generation || 1,
            event: {
              eventId: globalThis.crypto?.randomUUID?.() || `focus-blip-${now}`,
              type: 'focus_blip',
              at: new Date(now).toISOString(),
              message: `Brief focus loss (under ${FOCUS_LOSS_CONFIRM_MS / 1000}s).`,
              meta: {},
            },
          }).catch(() => {});
        }
      }
      patchSecurityStatus({ tabActive: document.hasFocus() && !document.hidden });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('keydown', handleTabShortcut, true);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      clearFocusLossTimer();
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('keydown', handleTabShortcut, true);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [secureActive, tabGuardEnabled, tabSwitchLimit, tabSwitchWarnAt, tabSwitchAction, assessment?._id, patchSecurityStatus]);

  useEffect(() => {
    if (!secureActive || !preventMultipleTabs) return;
    const duplicateCount = detectedTabs.filter((tab) => !tab.current).length;
    if (duplicateCount > 0 && Date.now() - lastDuplicateTabViolationRef.current > 8000) {
      lastDuplicateTabViolationRef.current = Date.now();
      void recordViolationRef.current?.('duplicate_tab', 'Duplicate assessment tab detected. Close all other assessment tabs.', {
        duplicateCount,
        source: 'duplicate_tab_guard',
      });
    }
  }, [secureActive, preventMultipleTabs, detectedTabs]);

  useEffect(() => {
    if (!secureActive || (!copyBlockEnabled && !screenshotProtectionEnabled)) return undefined;
    const stopRestrictedEvent = (event, type, message, meta = {}) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const violationMeta = {
        source: event.type,
        ...meta,
        localPopupShown: true,
      };
      showSecurityPopupRef.current?.(type, message, violationMeta);
      void recordViolationRef.current?.(type, message, {
        ...violationMeta,
      });
    };
    const handleCopy = (event) => {
      if (!copyBlockEnabled) return;
      if (isInternalCodeEditorEvent(event)) return;
      stopRestrictedEvent(event, 'copy_paste', 'Copy action blocked by assessment rules.');
    };
    const handleCut = (event) => {
      if (!copyBlockEnabled) return;
      if (isInternalCodeEditorEvent(event)) return;
      stopRestrictedEvent(event, 'copy_paste', 'Cut action blocked by assessment rules.');
    };
    const handlePaste = (event) => {
      if (!copyBlockEnabled) return;
      if (isInternalCodeEditorEvent(event)) return;
      stopRestrictedEvent(event, 'copy_paste', 'Paste action blocked by assessment rules.');
    };
    const handleContextMenu = (event) => {
      if (!blockRightClick) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const warningCount = totalWarningsRef.current + 1;
      showTimedSecurityWarning({
        title: 'Right-click blocked',
        message: `Right-click is disabled for this assessment. Warning count: ${warningCount}.`,
        tone: 'warning',
        notice: 'Right-click attempt recorded as a warning. Continue the assessment.',
      });
      void recordViolationRef.current?.('context_menu', 'Right-click menu blocked by assessment rules.', {
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
      if (isInternalCodeEditorEvent(event)) return;
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
        void recordViolationRef.current?.('other', 'Screenshot keyboard shortcut detected and blocked where supported by the browser.', {
          source: 'screenshot_shortcut',
          shortcut: event.code || event.key,
          warningOnly: true,
          localPopupShown: true,
        });
        return;
      }
      if (!copyBlockEnabled) return;
      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      const platform = String(navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
      const windowsClipboardHistory = platform.includes('win') && event.metaKey && key === 'v';
      if (windowsClipboardHistory) {
        stopRestrictedEvent(event, 'copy_paste', 'Windows clipboard history is blocked during this assessment.', {
          source: 'windows_clipboard_history',
          shortcut: 'Windows+V',
        });
        return;
      }
      const internalEditorShortcut = isInternalCodeEditorEvent(event)
        && ctrlOrMeta
        && ['a', 'c', 'v', 'x'].includes(key);
      if (internalEditorShortcut) return;
      // Ctrl+S is a programmer's reflex, not a cheating attempt: swallow it
      // and reassure instead of raising a violation popup mid-typing.
      if (isInternalCodeEditorEvent(event) && ctrlOrMeta && key === 's' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        void flushAnswerCheckpoint();
        toast.info('Your code is saved automatically.');
        return;
      }
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
  }, [secureActive, copyBlockEnabled, screenshotProtectionEnabled, blockRightClick, showScreenshotBlockedPopup, showTimedSecurityWarning, flushAnswerCheckpoint, toast]);

  useEffect(() => {
    if (!secureActive || !idleDetection) return undefined;
    const markActivity = () => {
      lastActivityRef.current = Date.now();
      setSecurityStatus((prev) => (prev.idle ? { ...prev, idle: false } : prev));
    };
    const checkIdle = () => {
      // A student the real face model sees in front of the camera is thinking,
      // not idle. (The frame-variance fallback can't tell, so it doesn't count.)
      const aiStatus = proctoringStatusRef.current;
      if (aiProctoringEnabled && aiStatus?.faceModel === 'ready' && aiStatus?.face === 'ok') {
        lastActivityRef.current = Date.now();
        return;
      }
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor < idleThresholdMs) return;
      lastActivityRef.current = Date.now();
      patchSecurityStatus({ idle: true });
      const message = 'No activity detected. Please stay active in the assessment window.';
      void recordViolationRef.current?.('idle', message, {
        source: 'idle_detection',
        idleForMs: idleFor,
        action: idleAction,
        // Shown in the footer either way; it only carries weight when the
        // admin chose an action stronger than "warn".
        ...(idleAction === 'warn' ? { warningOnly: true } : {}),
      });
    };
    // Capture phase: scroll and wheel inside the question/problem panes do not
    // bubble to window, so reading a long question used to count as idle.
    const activityEvents = ['pointermove', 'keydown', 'pointerdown', 'wheel', 'scroll', 'touchstart', 'input', 'focusin'];
    activityEvents.forEach((eventName) => {
      document.addEventListener(eventName, markActivity, { passive: true, capture: true });
    });
    idleTimerRef.current = setInterval(checkIdle, 5000);
    return () => {
      activityEvents.forEach((eventName) => {
        document.removeEventListener(eventName, markActivity, { capture: true });
      });
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    };
  }, [secureActive, idleDetection, idleThresholdMs, idleAction, aiProctoringEnabled, patchSecurityStatus]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setValidationState((prev) => ({
        ...prev,
        fullscreen: active,
      }));
      patchSecurityStatus({ fullscreen: !fullscreenRequired || active });
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [fullscreenRequired, patchSecurityStatus]);

  useEffect(() => {
    const clearFullscreenTimers = () => {
      if (fullscreenExitTimerRef.current) clearTimeout(fullscreenExitTimerRef.current);
      if (fullscreenCountdownRef.current) clearInterval(fullscreenCountdownRef.current);
      fullscreenExitTimerRef.current = null;
      fullscreenCountdownRef.current = null;
    };

    if (!secureActive || !fullscreenRequired) {
      clearFullscreenTimers();
      fullscreenAutoSubmitRef.current = false;
      return undefined;
    }

    const handleFullscreenEnforcement = () => {
      if (document.fullscreenElement) {
        lockEscapeKey();
        clearFullscreenTimers();
        fullscreenAutoSubmitRef.current = false;
        setFullscreenRecovery({ active: false, remaining: 0 });
        setSecurityStatus((prev) => ({ ...prev, fullscreen: true }));
        setSecurityNotice((prev) => (String(prev || '').toLowerCase().includes('fullscreen') ? '' : prev));
        return;
      }

      if (fullscreenExitTimerRef.current || fullscreenAutoSubmitRef.current) return;

      const deadline = Date.now() + (FULLSCREEN_RECOVERY_SECONDS * 1000);
      setSecurityStatus((prev) => ({ ...prev, fullscreen: false }));
      setFullscreenRecovery({ active: true, remaining: FULLSCREEN_RECOVERY_SECONDS });
      setSecurityNotice(`Fullscreen is required. Re-enter within ${FULLSCREEN_RECOVERY_SECONDS} seconds or the assessment will be submitted.`);

      fullscreenCountdownRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setFullscreenRecovery((prev) => (prev.active ? { ...prev, remaining } : prev));
      }, 250);

      fullscreenExitTimerRef.current = setTimeout(() => {
        clearFullscreenTimers();
        if (document.fullscreenElement || isSubmitted || fullscreenAutoSubmitRef.current) return;

        fullscreenAutoSubmitRef.current = true;
        setFullscreenRecovery({ active: true, remaining: 0 });
        setSecurityNotice('Fullscreen was not restored. Submitting assessment now.');

        void (async () => {
          await recordViolationRef.current?.(
            'fullscreen_exit',
            'Fullscreen was not restored within 15 seconds. Assessment auto-submitted.',
            {
              timeoutSec: FULLSCREEN_RECOVERY_SECONDS,
              source: 'fullscreen_timeout',
              escalated: true,
              deferAutoSubmit: true,
            },
          );
          await handleSubmitRef.current?.(
            true,
            'Fullscreen was not restored. Assessment auto-submitted.',
          );
        })();
      }, FULLSCREEN_RECOVERY_SECONDS * 1000);
    };

    document.addEventListener('fullscreenchange', handleFullscreenEnforcement);
    handleFullscreenEnforcement();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenEnforcement);
      clearFullscreenTimers();
    };
  }, [secureActive, fullscreenRequired, isSubmitted]);

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

  const setMonitorVideoElement = useCallback((element) => {
    monitorVideoRef.current = element;
    if (element && streamRef.current && element.srcObject !== streamRef.current) {
      element.srcObject = streamRef.current;
      element.play().catch(() => {});
    }
  }, []);

  const attachStream = useCallback((stream) => {
    [validationVideoRef.current, monitorVideoRef.current].forEach((video) => {
      if (video && video.srcObject !== stream) {
        video.srcObject = stream;
        video.play().catch(() => {});
      }
    });
  }, []);

  // Single shared camera stream for the whole attempt. Concurrent callers share
  // one getUserMedia request; track end/mute events trigger a re-check.
  const acquireCamera = useCallback(async () => {
    if (hasOpenCameraTrack(streamRef.current)) return streamRef.current;
    if (cameraAcquireRef.current) return cameraAcquireRef.current;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API is not available in this browser.');
    cameraAcquireRef.current = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        streamRef.current?.getTracks?.().forEach((track) => track.stop());
        streamRef.current = stream;
        const requestCheck = () => window.dispatchEvent(new Event('peerprep:camera-check'));
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener('ended', requestCheck);
          track.addEventListener('mute', requestCheck);
          track.addEventListener('unmute', requestCheck);
        });
        cameraMutedSinceRef.current = 0;
        cameraRetryRef.current = { nextAt: 0, delay: CAMERA_RETRY_MIN_MS };
        attachStream(stream);
        void proctoringManagerRef.current?.replaceStream?.(stream);
        setCameraStreamReady(true);
        return stream;
      } finally {
        cameraAcquireRef.current = null;
      }
    })();
    return cameraAcquireRef.current;
  }, [attachStream]);

  // The manager is created once per attempt and survives camera blips and the
  // pause/re-check flow: disposing it used to reload both AI models (up to 15 s
  // of "Face AI loading") every time the camera hiccuped.
  useEffect(() => {
    if (isSubmitted || !aiProctoringEnabled) {
      stopAiProctoring();
      return;
    }
    if (proctoringManagerRef.current) return;
    if (!secureActive || !assessment?._id || !submission?._id || !cameraStreamReady) return;
    if (!hasOpenCameraTrack(streamRef.current) || !monitorVideoRef.current) return;

    const manager = new ProctoringManager({
      assessmentId: assessment._id,
      submissionId: submission._id,
      settings: aiProctoringSettings,
      videoElement: monitorVideoRef.current,
      stream: streamRef.current,
      requireExistingStream: true,
      onStatusChange: setProctoringStatus,
      onViolationConfirmed: handleAiViolationConfirmed,
      onError: handleAiProctoringError,
    });

    proctoringManagerRef.current = manager;
    setProctoringStatus(manager.getStatus());
    void manager.start();
  }, [
    secureActive,
    isSubmitted,
    aiProctoringEnabled,
    aiProctoringSettings,
    assessment?._id,
    submission?._id,
    cameraStreamReady,
    stopAiProctoring,
    handleAiViolationConfirmed,
    handleAiProctoringError,
  ]);

  // Outside the active phase (pause / re-verification) detection must not
  // produce violations, but the models stay loaded.
  useEffect(() => {
    proctoringManagerRef.current?.setPaused?.(!secureActive);
  }, [secureActive]);

  useEffect(() => {
    const manager = proctoringManagerRef.current;
    if (!cameraStreamReady || !manager || !streamRef.current) return;
    if (manager.stream === streamRef.current) return;
    void manager.replaceStream?.(streamRef.current);
  }, [cameraStreamReady]);

  useEffect(() => {
    if (!aiSecurityNoticeRef.current || !proctoringStatus) return;
    const aiIssueActive = Boolean(
      ['missing', 'out_of_frame', 'multiple'].includes(proctoringStatus.face)
      || proctoringStatus.mobile === 'detected'
      || proctoringStatus.person === 'multiple'
      || ['blocked', 'error'].includes(proctoringStatus.camera),
    );
    if (aiIssueActive) return;
    const previousAiNotice = aiSecurityNoticeRef.current;
    aiSecurityNoticeRef.current = '';
    setSecurityNotice((current) => (current === previousAiNotice ? '' : current));
  }, [proctoringStatus]);

  useEffect(() => {
    if (!secureActive || !cameraRequired) {
      setCameraIndicator('idle');
      patchSecurityStatus({ cameraActive: !cameraRequired });
      return undefined;
    }
    let intervalId;
    let cancelled = false;
    const video = monitorVideoRef.current;
    const canvas = monitorCanvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!aiProctoringEnabled && !faceDetectorRef.current && typeof window !== 'undefined' && 'FaceDetector' in window) {
      try {
        faceDetectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
      } catch {
        faceDetectorRef.current = null;
      }
    }
    // Samples are 2.5 s apart. Nothing reaches the UI until a streak is
    // confirmed: no face / multiple faces ~2.5 s, out of frame ~8-10 s.
    const confirmationsNeeded = (type) => {
      if (type === 'camera_loss') return 1;
      if (type === 'face_out_of_frame') return 4;
      return 2;
    };
    const showCameraNotice = (message) => {
      cameraNoticeRef.current = message;
      setSecurityNotice(message);
    };
    const emitCameraViolation = (type, message, meta = {}) => {
      const streak = cameraViolationStreakRef.current;
      const sameType = streak.type === type && Date.now() - streak.at < 10000;
      const nextCount = sameType ? streak.count + 1 : 1;
      cameraViolationStreakRef.current = { type, count: nextCount, at: Date.now() };
      if (nextCount < confirmationsNeeded(type)) return;
      setCameraIndicator('warning');
      patchSecurityStatus({ cameraActive: type !== 'camera_loss' });
      showCameraNotice(message);
      if (type === 'camera_no_face') setFaceStatus('idle');
      // One camera_loss per outage, not one per reconnect attempt.
      if (type === 'camera_loss') {
        if (cameraLossReportedRef.current) return;
        cameraLossReportedRef.current = true;
      } else if (nextCount !== confirmationsNeeded(type)) {
        return;
      }
      void recordViolationRef.current?.(type, message, {
        ...meta,
        source: 'camera_monitor',
        persistent: true,
        warningOnly: true,
      });
    };
    const markCameraNormal = () => {
      cameraViolationStreakRef.current = { type: '', count: 0, at: Date.now() };
      cameraLossReportedRef.current = false;
      setCameraIndicator((previous) => (previous === 'normal' ? previous : 'normal'));
      patchSecurityStatus({ cameraActive: true });
      setFaceStatus((previous) => (previous === 'detected' ? previous : 'detected'));
      // Only clear the notice this monitor set, never a tab/AI/fullscreen one.
      if (cameraNoticeRef.current) {
        const ownNotice = cameraNoticeRef.current;
        cameraNoticeRef.current = '';
        setSecurityNotice((current) => (current === ownNotice ? '' : current));
      }
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
      if (!video || !canvas || !ctx) return;
      // With AI proctoring on, the AI manager owns face/person/phone policy;
      // a second detector here only produced conflicting, un-debounced warnings.
      if (aiProctoringEnabled) {
        markCameraNormal();
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
    // Always-alive loop: a failed reconnect used to stop polling for good,
    // leaving the camera dead until some unrelated state change.
    const tick = async () => {
      if (cancelled || document.hidden) return;
      const tracks = streamRef.current?.getVideoTracks?.() || [];
      const liveTrack = tracks.find((track) => track.readyState === 'live');
      // Windows privacy toggles, another app or sleep can mute a track without
      // ending it: frames go black. That is a camera interruption, not "no face".
      if (liveTrack?.muted) {
        if (!cameraMutedSinceRef.current) cameraMutedSinceRef.current = Date.now();
        if (Date.now() - cameraMutedSinceRef.current < CAMERA_MUTED_REACQUIRE_MS) return;
        streamRef.current?.getTracks?.().forEach((track) => track.stop());
      } else {
        cameraMutedSinceRef.current = 0;
      }
      if (!hasOpenCameraTrack(streamRef.current)) {
        setCameraStreamReady(false);
        const retry = cameraRetryRef.current;
        if (Date.now() < retry.nextAt) return;
        try {
          await acquireCamera();
        } catch (error) {
          cameraRetryRef.current = {
            nextAt: Date.now() + retry.delay,
            delay: Math.min(CAMERA_RETRY_MAX_MS, retry.delay * 2),
          };
          if (!cancelled) {
            emitCameraViolation('camera_loss', 'Camera stopped. Reconnecting... If another app is using the camera, close it.', {
              error: error?.name || 'camera_unavailable',
            });
          }
          return;
        }
        if (cancelled) return;
      }
      setCameraStreamReady(true);
      attachStream(streamRef.current);
      await sampleFrame();
    };
    const kick = () => {
      cameraRetryRef.current = { ...cameraRetryRef.current, nextAt: 0 };
      void tick();
    };
    intervalId = setInterval(() => { void tick(); }, 2500);
    window.addEventListener('peerprep:camera-check', kick);
    document.addEventListener('visibilitychange', kick);
    navigator.mediaDevices?.addEventListener?.('devicechange', kick);
    void tick();
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('peerprep:camera-check', kick);
      document.removeEventListener('visibilitychange', kick);
      navigator.mediaDevices?.removeEventListener?.('devicechange', kick);
    };
  }, [secureActive, cameraRequired, aiProctoringEnabled, acquireCamera, attachStream, patchSecurityStatus]);

  useEffect(() => {
    if (!secureActive || !cameraRequired || !assessment?._id) return undefined;
    const intervalSec = Math.max(15, Number(securitySettings.cameraSnapshotInterval || 120) || 120);
    const timer = setInterval(() => {
      if (evidenceInFlightRef.current || saveProtocolRef.current?.finalizing) return;
      const video = monitorVideoRef.current;
      if (!video || video.readyState < 2) return;
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      evidenceInFlightRef.current = true;
      void uploadAssessmentEvidence({
        canvas,
        context: { submissionId: saveProtocolRef.current?.submissionId, sessionId: assessmentSessionIdRef.current, attemptGeneration: saveProtocolRef.current?.generation || 1 },
        requestUpload: (body) => api.createStudentAssessmentEvidenceUpload(assessment._id, body),
        recordEvidence: (body) => api.logStudentAssessmentMonitoring(assessment._id, body),
      }).catch(() => {}).finally(() => { evidenceInFlightRef.current = false; });
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
        submissionId: saveProtocolRef.current?.submissionId,
        sessionId: assessmentSessionIdRef.current,
        attemptGeneration: saveProtocolRef.current?.generation || 1,
        eventId: globalThis.crypto?.randomUUID?.() || `audio-${now}`,
        event: {
          type: 'audio_threshold',
          eventId: globalThis.crypto?.randomUUID?.() || `audio-${now}`,
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
    if (!secureActive || isSubmitted) return undefined;
    const sendHeartbeat = async () => {
      if (heartbeatInFlightRef.current) return;
      heartbeatInFlightRef.current = true;
      const screenshotGraceActive = Date.now() < screenshotGraceUntilRef.current;
      const restrictedWarningActive = Date.now() < restrictedActionGraceUntilRef.current;
      const screenshotWarningRecent = Date.now() - lastScreenshotWarningAtRef.current < SCREENSHOT_WARNING_GRACE_MS;
      const warningGraceActive = screenshotGraceActive || restrictedWarningActive || screenshotWarningRecent;
      const fullscreenRecoveryActive = Boolean(fullscreenRecovery.active);
      const status = {
        fullscreen: warningGraceActive || fullscreenRecoveryActive || !fullscreenRequired || Boolean(document.fullscreenElement),
        tabActive: warningGraceActive || !tabGuardEnabled || (document.hasFocus() && !document.hidden),
        cameraActive: !cameraRequired || hasLiveCameraTrack(streamRef.current),
        idle: Boolean(securityStatusRef.current.idle),
        duplicateTab: Boolean(securityStatusRef.current.duplicateTab),
      };
      patchSecurityStatus(status);
      try {
        const result = await api.sendStudentAssessmentHeartbeat(assessment._id, {
          submissionId: saveProtocolRef.current?.submissionId,
          attemptGeneration: saveProtocolRef.current?.generation || 1,
          status,
          violationScore: violationScoreRef.current,
          pauseCount: pauseCountRef.current,
          cameraFlags,
          networkPauseStartedAt: networkPauseStartedAtRef.current,
          sessionId: assessmentSessionIdRef.current,
        });
        consecutiveNetworkFailuresRef.current = 0;
        networkPauseStartedAtRef.current = null;
        setNetworkStatus('online');
        if (result?.allowedEnd && result?.serverTime) {
          const serverTime = new Date(result.serverTime).getTime();
          const allowedEnd = new Date(result.allowedEnd).getTime();
          if (Number.isFinite(serverTime) && Number.isFinite(allowedEnd)) {
            // Sub-second clock jitter must not restart the countdown.
            const nextOffset = serverTime - Date.now();
            setOffset((previous) => (Math.abs(previous - nextOffset) < 1000 ? previous : nextOffset));
            setAllowedEndTime(allowedEnd);
          }
        }
        if (typeof result?.violationScore === 'number') setViolationScore(result.violationScore);
        if (typeof result?.pauseCount === 'number') setPauseCount(result.pauseCount);
        if (result?.lastPauseAt) setLastPauseAt(result.lastPauseAt);
        // Inconsistent heartbeats are retained server-side for audit; they are
        // not shown to the student as another warning.
        if (result?.inconsistent && warningGraceActive) {
          setSecurityNotice(restrictedActionNoticeRef.current);
          return;
        }
      } catch (err) {
        if (err?.response?.status === 409 && err?.response?.data?.code === 'ACTIVE_ASSESSMENT_SESSION') {
          setActiveSessionConflict(true);
          setSecurityNotice('This assessment is active in another tab, browser, or device.');
          return;
        }
        // "Server busy" is load shedding, not a weak student connection.
        if (err?.response?.status === 429) return;
        consecutiveNetworkFailuresRef.current += 1;
        if (navigator.onLine === false) {
          setNetworkStatus('offline');
        } else if (consecutiveNetworkFailuresRef.current >= NETWORK_FAILURES_BEFORE_PAUSE) {
          setNetworkStatus('weak');
        }
        if (warningGraceActive) {
          setSecurityNotice(restrictedActionNoticeRef.current);
          return;
        }
        if (Date.now() - heartbeatFailureRef.current > 12000) {
          heartbeatFailureRef.current = Date.now();
          setSecurityNotice('The server connection is unstable. Keep this assessment tab open while reconnection is attempted.');
          void api.logStudentAssessmentMonitoring(assessment._id, {
            submissionId: saveProtocolRef.current?.submissionId,
            sessionId: assessmentSessionIdRef.current,
            attemptGeneration: saveProtocolRef.current?.generation || 1,
            event: {
              eventId: globalThis.crypto?.randomUUID?.() || `heartbeat-warning-${Date.now()}`,
              type: 'heartbeat_connection_warning',
              at: new Date().toISOString(),
              message: 'Security heartbeat request failed during assessment.',
              meta: { source: 'heartbeat_request' },
            },
          }).catch(() => {});
        }
      } finally {
        heartbeatInFlightRef.current = false;
      }
    };
    let cancelled = false;
    let timer;
    const tick = async () => {
      await sendHeartbeat();
      if (!cancelled) {
        timer = setTimeout(tick, nextJitteredDelay(HEARTBEAT_BASE_MS, HEARTBEAT_JITTER_MS));
      }
    };
    timer = setTimeout(tick, Math.random() * Math.min(5000, HEARTBEAT_BASE_MS));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [secureActive, isSubmitted, assessment?._id, fullscreenRequired, fullscreenRecovery.active, tabGuardEnabled, cameraRequired, cameraFlags, patchSecurityStatus]);

  const wouldExceedQuestionAttemptLimit = (sectionIndex, questionIndex, nextValue) => {
    const sectionItem = assessment?.sections?.[sectionIndex];
    const questionItem = sectionItem?.questions?.[questionIndex];
    const type = questionItem?.type || sectionItem?.type;
    const limit = Number(assessment?.settings?.questionAttemptRequirements?.[type] || 0);
    if (!limit || !questionItem) return false;
    const key = answerKey(sectionIndex, questionIndex);
    const currentValue = answersMap[key] || {};
    if (hasAttemptedResponse(currentValue, questionItem, type) || !hasAttemptedResponse(nextValue, questionItem, type)) return false;
    const attempted = Object.entries(answersMap).reduce((total, [entryKey, entryValue]) => {
      if (entryKey === key) return total;
      const [entrySectionIndex, entryQuestionIndex] = entryKey.split('-').map(Number);
      const entrySection = assessment?.sections?.[entrySectionIndex];
      const entryQuestion = entrySection?.questions?.[entryQuestionIndex];
      const entryType = entryQuestion?.type || entrySection?.type;
      return total + (entryType === type && hasAttemptedResponse(entryValue, entryQuestion, entryType) ? 1 : 0);
    }, 0);
    return attempted >= limit;
  };

  // Returns false when the change was refused, so uncontrolled inputs can
  // revert instead of showing text that was never saved.
  const updateAnswer = (sectionIndex, questionIndex, value) => {
    if (saveProtocolRef.current?.finalizing || isSubmitted) return false;
    const key = answerKey(sectionIndex, questionIndex);
    const nextValue = { ...(answersMap[key] || {}), ...value };
    if (wouldExceedQuestionAttemptLimit(sectionIndex, questionIndex, nextValue)) {
      const type = assessment?.sections?.[sectionIndex]?.type || 'question';
      const limit = Number(assessment?.settings?.questionAttemptRequirements?.[type] || 0);
      toast.error(`You can attempt only ${limit} ${type.replace('_', ' ')} question${limit === 1 ? '' : 's'}. Clear another response to change your choice.`);
      return false;
    }
    setAnswersMap((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...value },
    }));
    return true;
  };

  const updateCodingLanguage = (sectionIndex, questionIndex, nextLanguage) => {
    if (saveProtocolRef.current?.finalizing || isSubmitted) return;
    const sectionItem = assessment?.sections?.[sectionIndex];
    const questionItem = sectionItem?.questions?.[questionIndex];
    if (!questionItem || sectionItem?.type !== 'coding') {
      updateAnswer(sectionIndex, questionIndex, { language: nextLanguage });
      return;
    }

    const key = answerKey(sectionIndex, questionIndex);
    const currentAnswer = answersMap[key] || {};
    const currentLanguage = liveCodingLanguageRef.current[key]
      || currentAnswer.language
      || getCodingLanguagesFromData(getCodingDataFromQuestion(questionItem))[0];
    if (!nextLanguage || nextLanguage === currentLanguage) return;
    const liveCurrentCode = liveCodingCodeRef.current[key];
    const currentCode = typeof liveCurrentCode === 'string' ? liveCurrentCode : (currentAnswer.code || '');
    const preparedDrafts = {
      ...(currentAnswer.codeByLanguage || {}),
      [currentLanguage]: currentCode,
    };
    const preparedNextCode = typeof preparedDrafts[nextLanguage] === 'string'
      ? preparedDrafts[nextLanguage]
      : getCodingStarterCode(questionItem, nextLanguage);
    liveCodingLanguageRef.current[key] = nextLanguage;
    liveCodingCodeRef.current[key] = preparedNextCode;

    setAnswersMap((prev) => {
      const existingAnswer = prev[key] || {};
      const codeByLanguage = {
        ...(existingAnswer.codeByLanguage || {}),
        ...preparedDrafts,
      };
      const nextDraft = typeof codeByLanguage[nextLanguage] === 'string'
        ? codeByLanguage[nextLanguage]
        : preparedNextCode;
      return {
        ...prev,
        [key]: {
          ...existingAnswer,
          language: nextLanguage,
          code: nextDraft,
          codeByLanguage: {
            ...codeByLanguage,
            [nextLanguage]: nextDraft,
          },
        },
      };
    });
  };

  // Esc closes Monaco's suggestion/find widgets; without Keyboard Lock the same
  // key also exits fullscreen and starts the auto-submit countdown.
  const requestFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
      return document.documentElement.requestFullscreen().then(lockEscapeKey).catch(() => {
        toast.info('Fullscreen is not available on this device.');
      });
    }
    return Promise.resolve();
  };

  const markSetupStep = (step, meta) => api.markStudentAssessmentSetupStep(assessment._id, step, meta, {
    submissionId: saveProtocolRef.current?.submissionId,
    sessionId: assessmentSessionIdRef.current,
    attemptGeneration: saveProtocolRef.current?.generation || 1,
  });

  const ensureCamera = async () => {
    try {
      const stream = await acquireCamera();
      attachStream(stream);
      setCameraStreamReady(true);
      return true;
    } catch {
      setCameraStreamReady(false);
      return false;
    }
  };

  const verifyCameraFeed = async () => {
    const video = validationVideoRef.current;
    const stream = streamRef.current;
    const hasLiveTrack = Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === 'live'));
    if (!video || !hasLiveTrack) return false;

    return new Promise((resolve) => {
      const frameReady = () => video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
      if (frameReady()) {
        resolve(true);
        return;
      }
      const timeout = setTimeout(() => {
        cleanup();
        resolve(frameReady());
      }, 4000);
      const handleReady = () => {
        if (!frameReady()) return;
        cleanup();
        resolve(true);
      };
      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener('loadeddata', handleReady);
        video.removeEventListener('canplay', handleReady);
      };
      video.addEventListener('loadeddata', handleReady);
      video.addEventListener('canplay', handleReady);
      void video.play().catch(() => {});
    });
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
          result = await markSetupStep('fullscreen');
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

  const handleOpenSecureAssessmentTab = () => {
    const secureUrl = new URL(window.location.href);
    secureUrl.searchParams.set('secure', '1');

    const secureWindow = window.open(
      secureUrl.toString(),
      `peerprep-secure-assessment-${assessment?._id || id}`,
      'popup=yes,width=1440,height=960',
    );

    if (!secureWindow) {
      setValidationMessage('The secure assessment tab was blocked. Allow pop-ups for PeerPrep, then try again.');
      return;
    }

    try {
      secureWindow.opener = null;
      secureWindow.focus();
    } catch {
      // The secure tab is still usable when the browser blocks window controls.
    }

    setSecurityNotice('Secure assessment tab opened. Continue the fullscreen check in that window.');
    setTimeout(() => navigate('/student/assessments', { replace: true }), 250);
  };

  const handleEnvironmentCheck = async () => {
    setSetupCheckingStep('environment');
    const interference = environmentRequired ? detectBrowserInterference() : [];
    setEnvironmentInterference(interference);
    const focusOk = !environmentRequired || (document.hasFocus() && !document.hidden);
    const duplicateAssessmentTabs = detectedTabs.filter((tab) => !tab.current);
    const tabsOk = !preventMultipleTabs || duplicateAssessmentTabs.length === 0;
    const ok = focusOk && tabsOk && interference.length === 0;
    setValidationState((prev) => ({ ...prev, environment: ok }));
    if (ok) {
      try {
        let result = null;
        if (assessment?._id) {
          result = await markSetupStep('environment');
        }
        syncCompletedSecuritySteps(result?.completedSecuritySteps || ['environment']);
        setValidationMessage('');
      } catch (err) {
        setValidationState((prev) => ({ ...prev, environment: false }));
        setValidationMessage(err.message || 'Environment step could not be verified by server.');
      } finally {
        setSetupCheckingStep('');
      }
    } else if (interference.length > 0) {
      setValidationMessage(`Browser interference detected: ${interference.join('; ')}. Disable the responsible extension or automation tool, reload this page, and run the environment check again.`);
      setSetupCheckingStep('');
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
      const feedOk = !cameraRequired || await verifyCameraFeed();
      setValidationState((prev) => ({ ...prev, camera: feedOk, face: feedOk }));
      setFaceStatus(feedOk ? 'detected' : 'idle');
      if (feedOk) {
        try {
          let result = null;
          if (assessment?._id) {
            result = await markSetupStep('camera');
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
        setValidationMessage('Camera permission is active, but a live video frame was not received. Check whether another app is using the camera and try again.');
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
        result = await markSetupStep('location', meta);
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
    const interference = environmentRequired ? detectBrowserInterference() : [];
    setEnvironmentInterference(interference);
    const fullscreenOk = !fullscreenRequired || Boolean(document.fullscreenElement);
    const focusOk = document.hasFocus() && !document.hidden;
    const tabsOk = !preventMultipleTabs || detectedTabs.filter((tab) => !tab.current).length === 0;
    const cameraOk = !cameraRequired || validationState.camera;
    const locationOk = !locationRequired || securityRecheckActive || Boolean(validationState.location);
    const ok = fullscreenOk && focusOk && tabsOk && cameraOk && locationOk && interference.length === 0;
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
          result = await markSetupStep('final');
        }
        syncCompletedSecuritySteps(result?.completedSecuritySteps || ['final']);
        setValidationMessage('');
        if (isPaused) {
          void startAssessment({ verifiedFinalStep: true });
        } else {
          setPhase('rules');
        }
      } catch (err) {
        setValidationMessage(err.message || 'Final verification could not be completed.');
        setValidationState((prev) => ({ ...prev, final: false }));
      } finally {
        setSetupCheckingStep('');
      }
    } else if (interference.length > 0) {
      setValidationMessage(`Browser interference detected: ${interference.join('; ')}. Disable it, reload this page, and repeat the environment and final checks.`);
    } else if (!tabsOk) {
      setValidationMessage('A duplicate assessment tab is still active. Close it and run the final check again.');
    } else {
      setValidationMessage(
        securityRecheckActive
          ? 'Please ensure focus, duplicate tabs, camera, and fullscreen checks are satisfied.'
          : 'Please ensure all required focus, camera, fullscreen, and location checks are satisfied.',
      );
    }
  };

  const startAssessment = async ({ verifiedFinalStep = false } = {}) => {
    if (!verifiedFinalStep && !setupStepIsDone('final')) {
      toast.error('Complete the final system check before starting.');
      setPhase('validation');
      return;
    }
    try {
      if (fullscreenRequired) await requestFullscreen();
      if (fullscreenRequired && !document.fullscreenElement) {
        toast.error('Fullscreen is required before the assessment can start.');
        return;
      }
      if (cameraRequired) {
        const cameraReady = await ensureCamera();
        if (!cameraReady) {
          toast.error('Camera access is required before this assessment and AI proctoring can start.');
          setPhase('validation');
          return;
        }
      }
      const data = await api.beginStudentAssessment(assessment._id, assessmentSessionIdRef.current, saveProtocolRef.current?.generation || 1, saveProtocolRef.current?.submissionId);
      const serverTime = new Date(data.serverTime).getTime();
      const serverAllowedEnd = new Date(data.allowedEnd).getTime();
      setOffset(serverTime - Date.now());
      setTimeLeft(serverAllowedEnd - serverTime);
      setAllowedEndTime(serverAllowedEnd);
      setSubmission(data.submission);
      if (data.candidate) setCandidate(data.candidate);
      setIsPaused(false);
      setSecurityRecheckStartedAt(null);
      setSecurityRecheckRemainingSec(0);
      securityRecheckAutoSubmitRef.current = false;
      setSecurityStatus({
        fullscreen: !fullscreenRequired || Boolean(document.fullscreenElement),
        cameraActive: !cameraRequired || hasLiveCameraTrack(streamRef.current),
        tabActive: document.hasFocus() && !document.hidden,
        idle: false,
        duplicateTab: false,
      });
      setSecurityAction('warn');
      localStorage.setItem(rulesSeenStorageKey, '1');
      setHasSeenRules(true);
      if (fullscreenRequired && document.fullscreenElement) lockEscapeKey();
      // The server sends the question paper only once the timer has started.
      if (!assessment?.sections?.some((sectionItem) => sectionItem?.questions?.length)) {
        await loadAssessment();
        return;
      }
      setPhase('active');
    } catch (err) {
      if (err?.response?.status === 409 && err?.response?.data?.code === 'ACTIVE_ASSESSMENT_SESSION') {
        setActiveSessionConflict(true);
        return;
      }
      if (err?.response?.status === 409) {
        toast.error(err.message || 'Security recheck time expired. Assessment was auto-submitted.');
        navigate('/student/assessments');
        return;
      }
      toast.error(err.message || 'Unable to start assessment.');
    }
  };


  const handleRunCoding = (sourceOverride) => {
    if (!assessment || isSubmitted || saveProtocolRef.current?.finalizing) return;
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
    const sourceCode = decodeLegacyCodeEntities(typeof sourceOverride === 'string'
      ? sourceOverride
      : (liveCodingCodeRef.current[key] ?? answersMap[key]?.code ?? ''));
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
    const comparableTestCases = testCases
      .filter((entry) => entry?.kind !== 'custom')
      .slice(0, 12)
      .map((entry) => ({
        input: entry?.input ?? '',
        expectedOutput: entry?.expectedOutput ?? entry?.output ?? '',
      }));

    setRunInputUsedMap((prev) => ({ ...prev, [key]: runInput }));
    setIsRunningMap((prev) => ({ ...prev, [key]: true }));

    api.runStudentProblem(problemId, {
      language,
      sourceCode,
      customInput: runInput,
      ...(comparableTestCases.length > 0
        ? { testCases: comparableTestCases }
        : {}),
      ...(comparableTestCases.length === 0 && activeTestCase?.expectedOutput !== null && activeTestCase?.expectedOutput !== undefined
        ? { expectedOutput: activeTestCase.expectedOutput }
        : {}),
      assessmentId: assessment?._id,
    }).then(async (queuedJob) => {
      let completedRun = queuedJob;
      if (queuedJob?.jobId) {
        toast.info('Run received. Waiting for execution result.');
        completedRun = await api.waitForExecutionResult(queuedJob.jobId, {
          intervalMs: 1000,
          onStillQueued: () => toast.info('Many students are running code right now. Your run is in the queue and will finish shortly.'),
        });
      }

      const response = completedRun?.result?.response || completedRun;
      setRunResultMap((prev) => ({ ...prev, [key]: { ...response, mode: response?.mode || 'run' } }));
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
      setRunResultMap((prev) => ({
        ...prev,
        [key]: createTerminalExecutionResult(error, {
          mode: 'run',
          language,
          input: runInput,
          sourceCode,
          fallbackMessage: 'Failed to run code.',
        }),
      }));
      setActiveConsoleTab('result');
    }).finally(() => {
      setIsRunningMap((prev) => ({ ...prev, [key]: false }));
    });
  };

  const handleSubmitCoding = (sourceOverride) => {
    if (saveProtocolRef.current?.finalizing) return;
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
    const sourceCode = decodeLegacyCodeEntities(typeof sourceOverride === 'string'
      ? sourceOverride
      : (liveCodingCodeRef.current[key] ?? answersMap[key]?.code ?? ''));
    const validationMessage = getCodeValidationMessage(
      sourceCode,
      getStarterCodeForLanguage(codingData, language),
      'submit',
    );
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }
    const nextCodingAnswer = {
      ...(answersMap[key] || {}),
      language,
      code: sourceCode,
    };
    if (wouldExceedQuestionAttemptLimit(activeSection, activeQuestion, nextCodingAnswer)) {
      const limit = Number(assessment?.settings?.questionAttemptRequirements?.coding || 0);
      toast.error(`You can attempt only ${limit} coding question${limit === 1 ? '' : 's'}. Clear another response to change your choice.`);
      return;
    }

    setAnswersMap((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        language,
        code: sourceCode,
        codeByLanguage: {
          ...(prev[key]?.codeByLanguage || {}),
          [language]: sourceCode,
        },
      },
    }));

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
          onStillQueued: () => toast.info('Your submission is saved and queued. The verdict will appear when it is judged.'),
        });
      }

      const response = completedSubmission?.result?.response || completedSubmission;
      setSubmitResultMap((prev) => ({ ...prev, [key]: { ...response, mode: response?.mode || 'submit' } }));
      setRunResultMap((prev) => ({ ...prev, [key]: { ...response, mode: response?.mode || 'submit' } }));
      setActiveConsoleTab('result');
      toast.success(`Submission finished with verdict ${response.status || 'Completed'}`);
    }).catch((error) => {
      const terminalResult = createTerminalExecutionResult(error, {
        mode: 'submit',
        language,
        sourceCode,
        fallbackMessage: 'Failed to submit code.',
      });
      setSubmitResultMap((prev) => ({
        ...prev,
        [key]: terminalResult,
      }));
      setRunResultMap((prev) => ({
        ...prev,
        [key]: terminalResult,
      }));
      setActiveConsoleTab('result');
    }).finally(() => {
      setIsSubmittingMap((prev) => ({ ...prev, [key]: false }));
    });
  };

  const handleResetCoding = () => {
    if (saveProtocolRef.current?.finalizing || isSubmitted) return;
    const key = answerKey(activeSection, activeQuestion);
    const section = assessment?.sections?.[activeSection];
    if (!section || section.type !== 'coding') return;
    const question = section?.questions?.[activeQuestion];
    const codingData = getCodingDataFromQuestion(question);
    const supported = getCodingLanguagesFromData(codingData);
    const language = answersMap[key]?.language || supported[0];
    const starterCode = getStarterCodeForLanguage(codingData, language);
    liveCodingLanguageRef.current[key] = language;
    liveCodingCodeRef.current[key] = starterCode;
    setCodeValueVersion((current) => current + 1);
    setRunResultMap((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSubmitResultMap((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setActiveConsoleTab('testcase');
    setAnswersMap((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        language,
        code: starterCode,
        codeByLanguage: {
          ...(prev[key]?.codeByLanguage || {}),
          [language]: starterCode,
        },
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
    const target = flatQuestions[currentNavigationEndIndex + 1];
    if (target) navigateToQuestion(target.sectionIndex, target.questionIndex);
  };

  const goToPrevQuestion = () => {
    const target = flatQuestions[currentNavigationStartIndex - 1];
    if (target) navigateToQuestion(target.sectionIndex, target.questionIndex);
  };

  useEffect(() => {
    const isTimedMcq = perMcqTimingEnabled && assessment?.sections?.[activeSection]?.type === 'mcq';
    setMcqTimeLeft(isTimedMcq ? perMcqTimeSec : 0);
  }, [perMcqTimingEnabled, perMcqTimeSec, assessment?.sections, activeSection, activeQuestion]);

  useEffect(() => {
    const isTimedMcq = perMcqTimingEnabled && assessment?.sections?.[activeSection]?.type === 'mcq';
    if (!isTimedMcq || phase !== 'active' || isSubmitted || mcqTimeLeft <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setMcqTimeLeft((current) => {
        if (current > 1) return current - 1;
        const target = flatQuestions[currentNavigationEndIndex + 1];
        if (target) window.setTimeout(() => {
          setActiveSection(target.sectionIndex);
          setActiveQuestion(target.questionIndex);
        }, 0);
        return 0;
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [perMcqTimingEnabled, assessment?.sections, activeSection, phase, isSubmitted, mcqTimeLeft, flatQuestions, currentNavigationEndIndex]);

  const clearResponse = () => {
    if (saveProtocolRef.current?.finalizing || isSubmitted) return;
    const section = assessment?.sections?.[activeSection];
    const key = answerKey(activeSection, activeQuestion);
    if (!section) return;
    if (section.type === 'mcq') {
      setAnswersMap((prev) => ({
        ...prev,
        [key]: { ...prev[key], answer: null },
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

  // The tile is already green from local state; this clears the review flag,
  // pushes the answer to the server now, and confirms on the last question.
  const saveAndNext = () => {
    const key = answerKey(activeSection, activeQuestion);
    setMarkedMap((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    shortAnswerFlushRef.current?.();
    setTimeout(() => { void handleSave(); }, 0);
    if (hasNextQuestion) goToNextQuestion();
    else toast.success('Answer saved');
  };

  const updateAnswerRef = useRef(updateAnswer);
  updateAnswerRef.current = updateAnswer;
  // Stable identity so memoized option lists skip unrelated re-renders.
  const handleOptionChange = useCallback((sectionIndex, questionIndex, answer) => {
    updateAnswerRef.current(sectionIndex, questionIndex, { answer });
  }, []);
  const handleShortAnswerCommit = useCallback((sectionIndex, questionIndex, text) => (
    updateAnswerRef.current(sectionIndex, questionIndex, { answer: text })
  ), []);
  const registerShortAnswerFlush = useCallback((flush) => {
    shortAnswerFlushRef.current = flush;
  }, []);

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
  // The image viewer is portaled out of the problem pane, so it carries its own copy of the watermark.
  const lightboxWatermark = useMemo(() => (watermarkConfig.enabled
    ? <WatermarkMarks columns={watermarkColumns} config={watermarkConfig} />
    : null), [watermarkColumns, watermarkConfig]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-950" role="status" aria-label="Loading assessment">
        <div className="h-16 border-b border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="mx-auto flex h-full max-w-[1800px] items-center justify-between px-5">
            <div className="h-5 w-44 animate-pulse rounded-md bg-slate-200 dark:bg-gray-700" />
            <div className="h-9 w-28 animate-pulse rounded-xl bg-slate-200 dark:bg-gray-700" />
          </div>
        </div>
        <div className="mx-auto grid max-w-[1800px] gap-4 p-4 lg:h-[calc(100vh-4rem)] lg:grid-cols-[minmax(20rem,38%)_minmax(0,1fr)_3.5rem]">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <div className="h-7 w-2/3 animate-pulse rounded-md bg-slate-200 dark:bg-gray-700" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100 dark:bg-gray-800" />
            <div className="space-y-3 pt-4">
              {[100, 92, 96, 72].map((width) => (
                <div key={width} className="h-4 animate-pulse rounded bg-slate-100 dark:bg-gray-800" style={{ width: `${width}%` }} />
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="flex h-14 items-center gap-3 border-b border-slate-200 px-4 dark:border-gray-800">
              <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-200 dark:bg-gray-700" />
              <div className="ml-auto h-9 w-24 animate-pulse rounded-lg bg-slate-200 dark:bg-gray-700" />
            </div>
            <div className="space-y-4 p-6">
              {[78, 62, 84, 48, 70, 56].map((width) => (
                <div key={width} className="h-4 animate-pulse rounded bg-slate-100 dark:bg-gray-800" style={{ width: `${width}%` }} />
              ))}
            </div>
          </div>
          <div className="hidden animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:block" />
        </div>
        <span className="sr-only">Preparing your assessment and code editor</span>
      </div>
    );
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
  const passageQuestionEntries = currentPassageKey
    ? (section?.questions || []).map((item, questionIndex) => ({ question: item, questionIndex })).filter(({ question: item }) => {
      return getPassageKey(item) === currentPassageKey;
    })
    : [];
  const isPassageSet = section?.type === 'mcq' && passageQuestionEntries.length > 0;
  const isMarked = markedMap[answerKey(activeSection, activeQuestion)];
  const questionMarks = question?.marks ?? question?.points ?? section?.marksPerQuestion ?? 0;
  const passageSetMarks = isPassageSet
    ? passageQuestionEntries.reduce((total, entry) => total + Number(entry.question?.marks ?? entry.question?.points ?? section?.marksPerQuestion ?? 0), 0)
    : questionMarks;
  const isCoding = section?.type === 'coding';
  const codingData = isCoding ? getCodingDataFromQuestion(question) : null;
  const codingLanguages = isCoding ? getCodingLanguagesFromData(codingData) : [];
  const activeLanguage = isCoding
    ? (answersMap[answerKey(activeSection, activeQuestion)]?.language || codingLanguages[0])
    : '';
  const activeAnswerKey = answerKey(activeSection, activeQuestion);
  const codeResult = runResultMap[activeAnswerKey] || submitResultMap[activeAnswerKey] || null;
  const isRunning = Boolean(isRunningMap[activeAnswerKey]);
  const isSubmitting = Boolean(isSubmittingMap[activeAnswerKey]);
  const runInputUsed = runInputUsedMap[activeAnswerKey] ?? null;
  const currentSectionLabel = section?.sectionName || `Section ${activeSection + 1}`;
  const breadcrumbLabel = `${currentSectionLabel} / ${currentQuestionTypeLabel} ${currentTypeQuestionNumber}`;
  const currentAttemptType = question?.type || section?.type || currentQuestionKind;
  const currentAttemptLimit = Number(assessment?.settings?.questionAttemptRequirements?.[currentAttemptType] || 0);
  const currentAttemptedCount = Number(attemptedQuestionCounts[currentAttemptType] || 0);
  // The briefing groups each rule once, by what the student does, instead of
  // repeating the generic and the settings-driven variants of the same rule.
  const briefingConductRules = [
    fullscreenRequired && 'Stay in fullscreen for the whole test.',
    tabGuardEnabled && `Do not switch tabs or windows. Every switch is recorded${tabSwitchLimit ? ` (limit: ${tabSwitchLimit})` : ''}.`,
    preventMultipleTabs && 'Keep only this assessment tab open.',
    cameraRequired && 'Keep your camera on and your face clearly visible.',
    copyBlockEnabled ? 'Copy, paste, printing and keyboard shortcuts are blocked.' : 'Do not use keyboard shortcuts.',
    'Do not refresh or close this page.',
  ].filter(Boolean);
  const briefingFlowRules = [
    'Complete the test in one sitting.',
    securitySettings.randomShuffle && 'Questions may appear in a different order for each student.',
    securitySettings.restrictNavigation && (allowSectionReview
      ? 'You can review questions only inside your current section. Earlier sections cannot be reopened.'
      : 'You cannot go back. Once you move forward, earlier questions cannot be reopened.'),
    'Your answers are saved automatically as you work.',
    securitySettings.autoSubmitOnEnd && 'The test submits automatically when the timer reaches zero.',
  ].filter(Boolean);
  const briefingInstructorNotes = [
    ...(assessment.instructions ? [assessment.instructions] : []),
    ...(assessment.customInstructions || []),
  ].map((text) => String(text || '').trim()).filter(Boolean);
  const briefingRequirements = [
    'A desktop or laptop with a supported browser',
    cameraRequired && 'Camera access',
    locationRequired && 'Location access during setup',
    fullscreenRequired && 'Fullscreen allowed for this site',
  ].filter(Boolean);
  const showAssessmentWorkspace = phase === 'active' || isSubmitted;
  const isSecureAssessmentTab = new URLSearchParams(window.location.search).get('secure') === '1';

  const questionNavigatorPanel = (
    <AssessmentQuestionPalette
      assessmentTitle={assessment?.title || 'Assessment'}
      questions={flatQuestions}
      activeSection={activeSection}
      activeQuestion={activeQuestion}
      questionStatus={questionStatus}
      canNavigate={canNavigateToQuestion}
      onNavigate={navigateToQuestion}
      onSubmit={() => setShowSubmitConfirm(true)}
      showSubmit={false}
      isSubmitted={isSubmitted}
      saving={saving}
      dockable={isCoding}
      navigationRevision={`${restrictNavigation}:${allowSectionReview}:${sectionLockPlan.map((_, index) => (isSectionLocked(index) ? '1' : '0')).join('')}`}
    />
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
  // Only confirmed student-behaviour issues turn the footer red; AI model
  // loading/fallback and eye movement are never shown as a warning.
  const aiFooterIssueStates = {
    camera: ['blocked', 'error'],
    face: ['missing', 'out_of_frame', 'multiple'],
    mobile: ['detected'],
    person: ['multiple'],
  };
  const hasAiFooterIssue = Boolean(
    aiProctoringEnabled
      && proctoringStatus
      && Object.entries(aiFooterIssueStates).some(([key, states]) => states.includes(proctoringStatus[key])),
  );
  const saveIndicator = !draftStorageAvailable && saveStatus !== 'saved'
    ? { tone: 'warn', text: 'Keep this page open until saved' }
    : saveStatus === 'saved'
      ? { tone: 'ok', text: 'All answers saved' }
      : ['unsaved', 'retrying', 'validation_failed'].includes(saveStatus)
        ? { tone: 'warn', text: 'Sync pending' }
        : saveStatus.startsWith('submit')
          ? { tone: 'muted', text: 'Submitting…' }
          : { tone: 'muted', text: 'Saving…' };
  const rulesSections = assessment.sections?.length
    ? assessment.sections.map((sec) => ({
      sectionName: sec?.sectionName,
      type: sec?.type,
      questionCount: sec?.questions?.length || 0,
      marksEach: Number(sec?.marksPerQuestion || sec?.questions?.[0]?.points || sec?.questions?.[0]?.marks || 0) || 0,
      totalMarks: Number(sec?.totalMarks || 0),
    }))
    : (assessment.sectionSummary || []).map((sec) => ({
      sectionName: sec?.sectionName,
      type: sec?.type,
      questionCount: Number(sec?.questionCount || 0),
      marksEach: Number(sec?.marksPerQuestion || 0),
      totalMarks: Number(sec?.totalMarks || 0),
    }));
  const rulesTypeTotals = assessment.sections?.length
    ? questionTypeTotals
    : rulesSections.reduce((totals, sec) => {
      totals[sec.type === 'coding' ? 'coding' : 'mcq'] += sec.questionCount;
      return totals;
    }, { mcq: 0, coding: 0 });
  const briefingQuestionCount = rulesTypeTotals.mcq + rulesTypeTotals.coding;
  const briefingQuestionMix = [
    rulesTypeTotals.mcq > 0 && `${rulesTypeTotals.mcq} MCQ/short`,
    rulesTypeTotals.coding > 0 && `${rulesTypeTotals.coding} coding`,
  ].filter(Boolean).join(' · ');
  const briefingProgress = rulesReady ? 100 : Math.min(100, Math.max(0, ((30 - rulesCountdown) / 30) * 100));
  const footerIssueItems = securityStatusItems.filter((item) => item.enabled && !item.ok);
  const footerHasIssue = Boolean(securityNotice || hasAiFooterIssue || footerIssueItems.length || (cameraStatusLine && !cameraStatusLine.ok));
  const footerNoticeText = securityNotice
    || (cameraStatusLine && !cameraStatusLine.ok ? cameraStatusLine.text : '')
    || (hasAiFooterIssue ? 'AI proctoring needs attention. Please adjust and continue.' : '');

  return (
    <div className="relative min-h-screen bg-[#f2f2f2] font-sans text-slate-900 dark:bg-[#1a1a1a] dark:text-gray-100 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      {finalizing && !isSubmitted && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/65 p-5" role="dialog" aria-modal="true" aria-labelledby="submission-progress-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-xl dark:bg-gray-900 dark:text-white">
            <h2 id="submission-progress-title" className="text-lg font-semibold">{saveStatus === 'submit_failed' ? 'Submission needs confirmation' : 'Submitting your assessment'}</h2>
            <p className="mt-3 text-sm leading-6">Your final answers are locked. Keep this page open until the server confirms your submission.</p>
            {saveStatus === 'submit_failed' ? <>
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{saveError || 'A submission was pending when this page reopened. Retry to confirm it.'}</p>
              <button type="button" disabled={saving} className="mt-4 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void handleSubmit(true, 'Assessment submitted successfully')}>Retry submission</button>
            </> : <Loader2 className="mt-4 h-5 w-5 animate-spin" aria-label="Waiting for server confirmation" />}
          </div>
        </div>
      )}
      {showAssessmentWorkspace && watermarkConfig.enabled && !isCoding && (
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
          <div className="max-w-md rounded-[28px] border border-white/80 bg-white/90 p-8 shadow-[0_30px_90px_-45px_rgba(15,23,42,0.35)] backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
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
      <header className="sticky top-0 z-40 shrink-0 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-white/[0.07] dark:bg-[#202022]/95">
        <div className="flex min-h-[56px] w-full flex-wrap items-center gap-3 px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToPrevQuestion}
              disabled={!hasPrevQuestion}
              title={hasPrevQuestion ? 'Previous question' : 'No previous question'}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">{assessment.title}</div>
              <div className="text-[10px] text-slate-500 dark:text-gray-400">{breadcrumbLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-sky-100 bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-800 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-200">
            {currentQuestionTypeLabel} {currentTypeQuestionNumber}/{currentTypeQuestionTotal || 1}
          </div>
          {currentAttemptLimit > 0 && (
            <div className="flex items-center gap-1.5 rounded-xl border border-violet-100 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-800 dark:border-violet-900/40 dark:bg-violet-900/20 dark:text-violet-200">
              Attempted {currentAttemptedCount}/{currentAttemptLimit}
            </div>
          )}
          {perMcqTimingEnabled && section?.type === 'mcq' && (
            <div className={`flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold tabular-nums ${mcqTimeLeft <= 10 ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'}`}>
              <Timer className="h-3.5 w-3.5" /> MCQ {formatTime(mcqTimeLeft * 1000)}
            </div>
          )}
          <div className="flex flex-1 items-center justify-end gap-2">
            <button
              type="button"
              onClick={goToNextQuestion}
              disabled={!hasNextQuestion}
              title="Next question"
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {!isSubmitted && (
              <span
                role="status"
                aria-live="polite"
                title={saveError || undefined}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold ${
                  saveIndicator.tone === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : saveIndicator.tone === 'warn'
                      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
                      : 'border-slate-200 bg-white text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400'
                }`}
              >
                {saveIndicator.tone === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : saveIndicator.tone === 'muted' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {saveIndicator.text}
                {saveStatus === 'unsaved' && (
                  <button type="button" className="font-bold underline" onClick={() => void handleSave()}>Retry</button>
                )}
              </span>
            )}
            <div className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-950 px-3 text-white shadow-sm dark:border-gray-700">
              <Clock className="h-3.5 w-3.5 text-sky-300" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Time left</span>
              <AssessmentCountdown
                endAt={allowedEndTime}
                offset={offset}
                running={secureActive && !isPaused}
                onExpire={handleTimeUp}
              />
            </div>
            {isCoding && (
              <AssessmentLanguagePicker
                languages={codingLanguages}
                value={activeLanguage}
                onChange={(language) => updateCodingLanguage(activeSection, activeQuestion, language)}
                disabled={isRunning || isSubmitting || isSubmitted}
              />
            )}
            {isCoding && (
              <button
                type="button"
                onClick={handleResetCoding}
                disabled={isRunning || isSubmitting || isSubmitted}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                aria-label="Reset assessment code"
                title="Reset code"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSubmitConfirm(true)}
              disabled={isSubmitted || finalizing}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isSubmitted ? 'Submitted' : 'Submit assessment'}
            </button>
          </div>
        </div>
      </header>
      {isCoding ? (
        <div className={`w-full p-2 pb-16 dark:!bg-[#1a1a1a] lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:pb-2 ${
          cameraStatusLine && !cameraStatusLine.ok
            ? 'bg-rose-50'
            : 'bg-[#f2f2f2]'
        }`}>
          <div className="mx-auto flex h-full max-w-[1800px] flex-col gap-2 lg:flex-row lg:min-h-0 lg:overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden min-w-0">
              <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row lg:min-h-0">
                <section
                  ref={problemPaneRef}
                  style={{ '--assessment-problem-width': `${leftWidth}px` }}
                  className={`relative min-h-[520px] w-full min-w-0 shrink-0 overflow-hidden rounded-lg bg-white lg:h-full lg:min-h-0 lg:w-[var(--assessment-problem-width)] lg:min-w-[320px] lg:basis-[var(--assessment-problem-width)] dark:bg-[#282828] ${cameraStatusLine && !cameraStatusLine.ok ? 'border border-rose-300' : 'border border-zinc-200 dark:border-zinc-700'}`}
                >
                  {showAssessmentWorkspace && watermarkConfig.enabled && (
                    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden="true">
                      <WatermarkMarks columns={watermarkColumns} config={watermarkConfig} />
                    </div>
                  )}
                  <AssessmentCodingProblemPanel
                    question={question}
                    codingData={codingData || {}}
                    language={activeLanguage}
                    marks={questionMarks}
                    sectionLabel={currentSectionLabel}
                    watermark={lightboxWatermark}
                  />
                </section>

                <button
                  type="button"
                  onPointerDown={handleResizeStart}
                  className="group relative hidden w-2 shrink-0 cursor-col-resize items-center justify-center transition-colors lg:flex"
                  aria-label="Resize panels"
                >
                  <div className="absolute inset-y-4 left-1/2 w-1 -translate-x-1/2 rounded-full bg-zinc-300 transition-colors group-hover:bg-[#ffa116] dark:bg-zinc-700" />
                </button>

                <section ref={editorPaneRef} className={`flex min-h-[520px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-white dark:bg-[#282828] lg:min-h-0 ${
                  cameraStatusLine && !cameraStatusLine.ok ? 'border border-rose-300' : 'border border-zinc-200 dark:border-zinc-700'
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
                        onCodeChange={(code) => {
                          if (saveProtocolRef.current?.finalizing) return;
                          // CodeEditor flushes a pending commit through the
                          // handler of the language it was typed in. After a
                          // language switch that text must only update its own
                          // draft, never switch the answer back.
                          const committedLanguage = answerValue.language || codingLanguages[0];
                          setAnswersMap((prev) => {
                            const existing = prev[key] || {};
                            const stillActive = (existing.language || committedLanguage) === committedLanguage;
                            return {
                              ...prev,
                              [key]: {
                                ...existing,
                                ...(stillActive ? { language: committedLanguage, code } : {}),
                                codeByLanguage: {
                                  ...(existing.codeByLanguage || {}),
                                  [committedLanguage]: code,
                                },
                              },
                            };
                          });
                        }}
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
                        consoleActions
                        internalClipboardOnly={copyBlockEnabled}
                        blockContextMenu={blockRightClick}
                        clipboardScope={`assessment:${assessment?._id || id}:submission:${submission?._id || 'active'}`}
                        editorKey={key}
                        valueVersion={codeValueVersion}
                        onLiveCodeChange={(code) => {
                          if (saveProtocolRef.current?.finalizing) return;
                          // The ref is the source of truth for payloads; the
                          // IndexedDB checkpoint is throttled so a keystroke
                          // never re-renders this page.
                          liveCodingCodeRef.current[key] = code;
                          answersDirtyRef.current = true;
                          answerRevisionRef.current += 1;
                          scheduleLiveCodeCheckpoint();
                        }}
                        executionMode={codingData?.category === 'SQL' ? 'sql' : 'code'}
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
        <div className={`w-full px-3 py-3 pb-16 dark:!bg-gray-950 md:px-4 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:pb-3 ${
          cameraStatusLine && !cameraStatusLine.ok
            ? 'bg-[linear-gradient(180deg,#fff5f5_0%,#ffffff_40%,#fff7f7_100%)]'
            : 'bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,0.98)_40%,rgba(248,250,252,1)_100%)]'
        }`}>
          <div className="flex h-full flex-col gap-3 lg:flex-row lg:min-h-0 lg:overflow-hidden">
            <section className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_18px_48px_-36px_rgba(8,145,178,0.22)] dark:bg-gray-900 lg:min-h-0 ${
              cameraStatusLine && !cameraStatusLine.ok ? 'border border-rose-300 shadow-[0_0_0_1px_rgba(244,63,94,0.08),0_18px_48px_-36px_rgba(225,29,72,0.34)]' : 'border border-cyan-100 dark:border-gray-700'
            }`}>
              <div className="shrink-0 border-b border-cyan-100 bg-[linear-gradient(180deg,#f2fbff_0%,#ffffff_100%)] px-6 py-4 dark:border-gray-700 dark:bg-none dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
                      <span className="rounded-md bg-cyan-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">{isPassageSet ? `Passage set · ${passageQuestionEntries.length} questions` : `${currentQuestionTypeLabel} ${currentTypeQuestionNumber}/${currentTypeQuestionTotal || 1}`}</span><span className="rounded-md border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-900/20 dark:text-cyan-300">Marks: {passageSetMarks}</span><span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">{section?.type === 'mcq' ? 'MCQ' : 'Short Answer'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Only this body scrolls; the badge strip and action bar stay put. */}
              <div ref={questionScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              {question?.passage?.text && (
                <div className="mx-5 mt-4 rounded-xl border border-cyan-100 bg-cyan-50/50 p-4 dark:border-cyan-900/40 dark:bg-cyan-950/20 md:mx-6">
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">{question.passage.title || 'Reading passage'}</p>
                  <ReservedImage image={question.passage.image} heightClass="h-64" className="mt-3" />
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-gray-200">{question.passage.text}</p>
                </div>
              )}

              {isPassageSet ? (
                <div className="space-y-4 px-5 py-5 md:px-6">
                  {passageQuestionEntries.map(({ question: passageQuestion, questionIndex }, setIndex) => {
                    const response = answersMap[answerKey(activeSection, questionIndex)]?.answer;
                    const status = questionStatus(activeSection, questionIndex);
                    return (
                      <section key={passageQuestion.questionId || questionIndex} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/40">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Question {setIndex + 1} of {passageQuestionEntries.length}</p><h2 className="mt-2 whitespace-pre-wrap break-words text-base font-bold leading-snug text-slate-900 [overflow-wrap:anywhere] dark:text-white">{passageQuestion.questionText || 'Question'}</h2></div>
                          <div className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status === 'answered' || status === 'answered_review' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-white text-slate-500 dark:bg-gray-900 dark:text-gray-400'}`}>{status === 'answered' || status === 'answered_review' ? 'Answered' : 'Not answered'}</span><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-gray-900 dark:text-gray-300">{passageQuestion.marks ?? passageQuestion.points ?? section?.marksPerQuestion ?? 0} marks</span></div>
                        </div>
                        <ReservedImage image={passageQuestion.questionImage} className="mt-4" />
                        <AssessmentMcqOptions question={passageQuestion} answer={response} sectionIndex={activeSection} questionIndex={questionIndex} onChange={handleOptionChange} disabled={isSubmitted || (perMcqTimingEnabled && mcqTimeLeft <= 0)} />
                      </section>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="px-5 pt-4 md:px-6">
                    <div className="whitespace-pre-wrap break-words text-lg font-bold leading-snug text-slate-900 [overflow-wrap:anywhere] dark:text-white md:text-[1.15rem]">{question?.questionText || 'Question'}</div>
                    <ReservedImage image={question?.questionImage} className="mt-4" />
                  </div>
                  {section?.type === 'mcq' && <div className="px-5 pb-5 md:px-6"><AssessmentMcqOptions question={question} answer={answersMap[answerKey(activeSection, activeQuestion)]?.answer} sectionIndex={activeSection} questionIndex={activeQuestion} onChange={handleOptionChange} disabled={isSubmitted || (perMcqTimingEnabled && mcqTimeLeft <= 0)} /></div>}
                </>
              )}

              {(section?.type === 'short' || section?.type === 'one_line') && (
                <div className="px-6 pb-4 pt-2">
                  <ShortAnswerInput
                    key={activeAnswerKey}
                    commitKey={activeAnswerKey}
                    value={answersMap[activeAnswerKey]?.answer || ''}
                    onCommit={(text) => handleShortAnswerCommit(activeSection, activeQuestion, text)}
                    registerFlush={registerShortAnswerFlush}
                    maxLength={section?.type === 'one_line' ? 500 : 10000}
                    disabled={isSubmitted}
                  />
                </div>
              )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-cyan-100 bg-[linear-gradient(180deg,#ffffff_0%,#f6fbfd_100%)] px-5 py-4 md:px-6 dark:border-gray-700 dark:bg-none dark:bg-gray-900">
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
                  title={hasNextQuestion ? 'Save and go to the next question' : 'Save this answer'}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-5 py-2 text-xs font-bold text-white transition-all hover:bg-emerald-500 shadow-md shadow-emerald-200 dark:shadow-none"
                >
                  {hasNextQuestion ? <>Save & Next <ChevronRight className="h-3.5 w-3.5" /></> : <>Save <CheckCircle2 className="h-3.5 w-3.5" /></>}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-3 py-3 backdrop-blur-sm sm:px-4">
          <div className="flex max-h-[94vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_28px_90px_-48px_rgba(15,23,42,0.55)] dark:border-slate-700 dark:bg-slate-950">
            <div className="border-b border-slate-200 bg-white px-4 pb-3 pt-4 dark:border-slate-800 dark:bg-slate-950 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    Security Setup
                  </div>
                  <h2 className="mt-2 text-[1.35rem] font-bold tracking-tight text-slate-950 dark:text-white sm:text-[1.5rem]">Pre-Test Security Check</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400">
                    {securityRecheckActive ? 'Your timer is paused while you complete these checks.' : 'Complete each required check to continue.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {securityRecheckActive && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      Recheck time {formatTime(securityRecheckRemainingSec * 1000)}
                    </div>
                  )}
                  <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    Step {validationStep} of {setupSteps.length}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Required Checks
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {setupSteps.map((step) => {
                    const isActive = validationStep === step.id;
                    const done = setupStepIsDone(step.key);
                    const locked = step.id > validationStep && !done;
                    const checking = setupCheckingStep === step.key;
                    return (
                      <div
                        key={step.id}
                        className={`flex min-h-[52px] items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                          done
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : isActive
                              ? 'border-slate-300 bg-white text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white'
                              : 'border-slate-200 bg-white/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400'
                        }`}
                      >
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                          done ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50' : isActive ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                        }`}>
                          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <CheckCircle2 className="h-4 w-4" /> : locked ? <span className="h-2 w-2 rounded-full bg-current" /> : step.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{step.title}</div>
                          {isActive && !done && <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Current step</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-4 py-4 dark:bg-slate-950 sm:px-5">
              {currentSetupStepKey === 'environment' && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Step {currentSetupStepNumber}: Clean Environment Check</div>
                  <p className="text-sm text-slate-600 dark:text-gray-300">Keep this assessment tab open and close any other PeerPrep assessment tabs.</p>
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
                      ['Browser environment ready', validationState.environment],
                    ].map(([label, ok]) => (
                      <div key={label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-1.5 dark:border-gray-700 dark:bg-gray-900">
                        <span>{label}</span>
                        <span className={ok ? 'text-emerald-600' : 'text-amber-600'}>{ok ? 'OK' : 'Pending'}</span>
                      </div>
                    ))}
                  </div>
                  {validationState.environment && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Environment confirmed.
                    </div>
                  )}
                  {environmentInterference.length > 0 && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                      {environmentInterference.map((signal) => <div key={signal}>{signal}</div>)}
                    </div>
                  )}
                </div>
              )}

              {currentSetupStepKey === 'camera' && (
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-bold text-slate-800 dark:text-white">Step {currentSetupStepNumber}: Camera Verification</div>
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
                            {faceStatus === 'detected' ? 'Feed ready' : faceStatus === 'detecting' ? 'Connecting' : 'Waiting'}
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                          Allow camera access and confirm that the live preview is visible. Face and object monitoring starts automatically after the assessment begins.
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            ['Camera', validationState.camera ? 'Ready' : 'Pending'],
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
                  {validationState.camera && validationState.face && (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" /> Live camera feed verified successfully.
                    </div>
                  )}
                </div>
              )}

              {currentSetupStepKey === 'location' && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Step {currentSetupStepNumber}: Location Permission</div>
                  <p className="text-sm text-slate-600 dark:text-gray-300">Allow location access to complete this check.</p>
                  {locationData ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                      <div>Latitude: {Number(locationData.latitude).toFixed(6)}</div>
                      <div>Longitude: {Number(locationData.longitude).toFixed(6)}</div>
                      <div>Accuracy: {Math.round(Number(locationData.accuracy || 0))} m</div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 dark:text-gray-400">Location is not captured yet.</div>
                  )}
                  {validationState.location && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Location verified.
                    </div>
                  )}
                </div>
              )}

              {currentSetupStepKey === 'fullscreen' && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Step {currentSetupStepNumber}: Fullscreen Mode Activation</div>
                  <p className="text-sm text-slate-600 dark:text-gray-300">{isSecureAssessmentTab ? 'Enable fullscreen to continue.' : 'Open the secure assessment window to continue.'}</p>
                  {!isSecureAssessmentTab && fullscreenRequired && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                      If browser extensions interfere with this assessment, open it in a private window and try again.
                    </div>
                  )}
                  {(!fullscreenRequired || validationState.fullscreen) && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Fullscreen check complete.
                    </div>
                  )}
                </div>
              )}

              {currentSetupStepKey === 'final' && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Step {currentSetupStepNumber}: Final System Check</div>
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
                    {!securityRecheckActive && locationRequired && (
                      <div className="flex items-center justify-between">
                        <span>Location permission</span>
                        <span className={validationState.location ? 'text-emerald-600' : 'text-rose-600'}>
                          {validationState.location ? 'Granted' : 'Pending'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
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

              <div className="sticky bottom-0 mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-slate-200 bg-slate-50 pt-4 dark:border-slate-800 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={() => setValidationStep((prev) => Math.max(1, prev - 1))}
                  disabled={validationStep === 1 || Boolean(setupCheckingStep)}
                  className="justify-self-start rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={{ environment: handleEnvironmentCheck, camera: handleCameraCheck, location: handleLocationCheck, fullscreen: fullscreenRequired && !isSecureAssessmentTab ? handleOpenSecureAssessmentTab : handleEnableFullscreen, final: handleFinalCheck }[currentSetupStepKey]}
                  disabled={Boolean(setupCheckingStep)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 justify-self-center whitespace-nowrap rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {setupCheckingStep === currentSetupStepKey && <Loader2 className="h-4 w-4 animate-spin" />}
                  {{ environment: 'Run environment check', camera: 'Verify camera', location: 'Verify location', fullscreen: fullscreenRequired && !isSecureAssessmentTab ? 'Open secure tab' : 'Enable fullscreen', final: 'Run final check' }[currentSetupStepKey]}
                </button>
                {currentSetupStepKey !== 'final' ? (
                  <button
                    type="button"
                    onClick={() => setValidationStep((prev) => Math.min(setupSteps.length, prev + 1))}
                    disabled={!setupStepIsDone(currentSetupStepKey) || Boolean(setupCheckingStep)}
                    className="justify-self-end rounded-xl border border-sky-600 px-4 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 dark:disabled:border-slate-700"
                  >
                    Continue
                  </button>
                ) : (
                  <span className="justify-self-end text-right text-xs text-slate-500 dark:text-slate-400">{isPaused ? 'Assessment resumes after verification' : 'Instructions open after verification'}</span>
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
                disabled={finalizing}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSubmit(false);
                }}
                disabled={finalizing}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-400"
              >
                {finalizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {finalizing ? 'Submitting...' : 'Yes, Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {securityPopup.open && secureActive && (
        <div className="pointer-events-none fixed right-3 top-20 z-[80] w-[min(28rem,calc(100vw-1.5rem))]" role="status" aria-live="polite">
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
            <div className="pointer-events-auto mt-4 flex justify-end">
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

      {activeSessionConflict && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="active-session-title">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-900 dark:bg-gray-900">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-900/25 dark:text-rose-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2 id="active-session-title" className="mt-4 text-lg font-bold text-slate-900 dark:text-white">Assessment already active</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-gray-300">
              This account is currently taking the assessment in another tab, browser, or device. Close the other assessment and wait up to 30 seconds before trying again.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => navigate('/student/assessments')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-gray-700 dark:text-gray-200">
                Back to assessments
              </button>
              <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500">
                Check again
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'rules' && !isSubmitted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="assessment-briefing-title">
          <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 dark:bg-slate-950 dark:ring-white/10 sm:max-h-[calc(100dvh-3rem)]">
            <header className="border-b border-slate-200 px-5 pb-5 pt-5 dark:border-slate-800 sm:px-7">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-600 dark:text-sky-400">Before you begin</p>
              <h2 id="assessment-briefing-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl">
                {assessment.title || 'Assessment instructions'}
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-800 sm:grid-cols-4">
                {[
                  { icon: Clock, label: 'Duration', value: `${assessment.duration} min` },
                  { icon: Hash, label: 'Questions', value: briefingQuestionCount, hint: briefingQuestionMix },
                  { icon: Layers, label: 'Total marks', value: assessment.totalMarks || 0 },
                  { icon: BookOpen, label: 'Sections', value: rulesSections.length },
                ].map(({ icon: Icon, label, value, hint }) => (
                  <div key={label} className="bg-white px-4 py-3 dark:bg-slate-900">
                    <dt className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{value}</dd>
                    {hint && <dd className="truncate text-[11px] text-slate-500 dark:text-slate-400">{hint}</dd>}
                  </div>
                ))}
              </dl>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              {briefingInstructorNotes.length > 0 && (
                <section className="mb-6 rounded-xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900 dark:bg-sky-950/30">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-200">
                    <AlertCircle className="h-4 w-4" />
                    From your instructor
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-[13px] leading-5 text-slate-700 dark:text-slate-300">
                    {briefingInstructorNotes.map((text, idx) => (
                      <li key={`note-${idx}`} className="whitespace-pre-line">{text}</li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                <div className="space-y-6">
                  <section>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Sections</h3>
                    <ol className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                      {rulesSections.map((sec, idx) => {
                        const summary = sectionSummaries[idx];
                        const questionCount = sec.questionCount;
                        const marksEach = sec.marksEach;
                        const totalSectionMarks = sec.totalMarks || (questionCount * marksEach);
                        const sectionType = summary?.typeLabel || formatSectionTypeLabel(sec?.type);
                        const sectionLabel = sec?.sectionName || `Section ${idx + 1}`;

                        return (
                          <li key={`${sectionLabel}-${idx}`} className="flex items-center gap-3 px-3.5 py-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{sectionLabel}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {sectionType} · Q{summary?.start || 1}–Q{summary?.end || questionCount}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{totalSectionMarks} {totalSectionMarks === 1 ? 'mark' : 'marks'}</div>
                              <div className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                                {questionCount} × {marksEach} {marksEach === 1 ? 'mark' : 'marks'}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </section>

                  <section>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <Monitor className="h-4 w-4 text-slate-400" />
                      What you need
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {briefingRequirements.map((text) => (
                        <li key={text} className="flex items-start gap-2 text-[13px] leading-5 text-slate-700 dark:text-slate-300">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                          <span>{text}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>

                <div>
                  <section>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <ShieldCheck className="h-4 w-4 text-slate-400" />
                      Rules
                    </h3>
                    <div className="mt-2 grid gap-5 sm:grid-cols-2">
                      {[
                        ['During the test', briefingConductRules],
                        ['Questions and time', briefingFlowRules],
                      ].map(([title, rules]) => (
                        <div key={title}>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
                          <ul className="mt-2 space-y-2">
                            {rules.map((text) => (
                              <li key={text} className="flex items-start gap-2.5 text-[13px] leading-5 text-slate-700 dark:text-slate-300">
                                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                                <span>{text}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>

              {aiProctoringEnabled && (
                <div className="mt-6">
                  <AnviProctoringCard
                    settings={aiProctoringSettings}
                    snapshotsEnabled={cameraRequired}
                  />
                </div>
              )}
            </div>

            <footer className="relative border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-7">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                <div className="h-full bg-sky-500 transition-[width] duration-1000 ease-linear" style={{ width: `${briefingProgress}%` }} />
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {rulesReady
                    ? 'All set. You can start the assessment now.'
                    : `Please read the instructions. You can start in ${rulesCountdown} seconds.`}
                </p>
                <button
                  type="button"
                  onClick={() => { void startAssessment(); }}
                  disabled={!rulesReady}
                  className={`inline-flex min-w-[180px] items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${
                    rulesReady
                      ? 'bg-sky-600 text-white shadow-sm hover:bg-sky-500'
                      : 'cursor-not-allowed bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {rulesReady ? (
                    <>
                      Start assessment
                      <ChevronRight className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      <Timer className="h-4 w-4" />
                      <span className="tabular-nums">Start in {rulesCountdown}s</span>
                    </>
                  )}
                </button>
              </div>
            </footer>
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
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950 px-4">
          <div className="w-full max-w-lg rounded-[28px] border border-rose-200 bg-white p-7 shadow-2xl dark:border-rose-800 dark:bg-gray-900">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm font-semibold">Fullscreen is required</span>
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">Assessment paused and hidden</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-gray-300">
              Re-enter fullscreen to continue. If fullscreen is not restored within 15 seconds, your assessment will be submitted automatically.
            </p>
            <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4 text-center dark:border-rose-800 dark:bg-rose-900/20">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500">Auto-submit in</div>
              <div className="mt-1 text-4xl font-black tabular-nums text-rose-700 dark:text-rose-300">
                {fullscreenRecovery.remaining || 0}s
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await requestFullscreen();
                const active = Boolean(document.fullscreenElement);
                if (!active) {
                  setSecurityNotice('Fullscreen could not be enabled. Allow fullscreen permission and try again before the countdown ends.');
                }
              }}
              disabled={fullscreenRecovery.remaining <= 0}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Maximize className="h-4 w-4" />
              {fullscreenRecovery.remaining > 0 ? 'Re-enter Fullscreen' : 'Submitting Assessment...'}
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
          <div className={`fixed bottom-0 left-0 right-0 z-40 border-t shadow-2xl transition-colors lg:static lg:shrink-0 ${
            footerHasIssue
              ? 'border-rose-300 bg-rose-700'
              : 'border-emerald-300 bg-emerald-700'
          }`}>
            <div className={`py-1.5 pl-4 ${cameraRequired ? 'pr-14' : 'pr-4'}`}>
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
        </>
      )}
      {/* One visible self-view for the whole attempt (incl. pause/re-check).
          Hidden 1x1 off-screen videos could be paused by the browser, and
          students read any red camera chip as "my camera died". Minimising
          only shrinks it; it is never unmounted while the attempt runs. */}
      {cameraRequired && !isSubmitted && ['active', 'violation', 'validation'].includes(phase) && (
        <div className={`fixed z-[45] overflow-hidden rounded-md border border-white/50 bg-black shadow-lg transition-[width,height] duration-200 ${
          cameraPreviewExpanded ? 'bottom-12 right-3 h-[90px] w-[120px]' : 'bottom-1 right-2 h-[30px] w-[40px]'
        }`}>
          <video
            ref={setMonitorVideoElement}
            onPause={(event) => { event.currentTarget.play().catch(() => {}); }}
            className="h-full w-full -scale-x-100 object-cover"
            muted
            playsInline
            autoPlay
          />
          <button
            type="button"
            onClick={() => setCameraPreviewExpanded((value) => !value)}
            className={cameraPreviewExpanded
              ? 'absolute right-0.5 top-0.5 rounded bg-black/55 px-1 text-[10px] font-bold leading-4 text-white'
              : 'absolute inset-0 text-transparent'}
            aria-label={cameraPreviewExpanded ? 'Shrink camera preview' : 'Enlarge camera preview'}
            title={cameraPreviewExpanded ? 'Shrink camera preview' : 'Enlarge camera preview'}
          >
            {cameraPreviewExpanded ? '–' : '+'}
          </button>
          <canvas ref={monitorCanvasRef} className="hidden" />
        </div>
      )}
    </div>
  );
}

