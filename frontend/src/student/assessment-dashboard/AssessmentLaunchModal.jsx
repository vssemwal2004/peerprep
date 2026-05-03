import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Layers3, Loader2, Lock, MapPin, Maximize, Monitor, ShieldCheck, Video, X } from 'lucide-react';
import { formatDateTime, formatDurationMinutes } from './assessmentDashboardUtils';
import { api } from '../../utils/api';

export default function AssessmentLaunchModal({ assessment, open, onClose, onUnlock, onStart }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState('details');
  const [checkingStep, setCheckingStep] = useState('');
  const [detectedTabs, setDetectedTabs] = useState([]);
  const [securityState, setSecurityState] = useState({
    environment: false,
    camera: false,
    fullscreen: false,
    location: false,
    final: false,
  });
  const streamRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setError('');
      setSubmitting(false);
      setStep('details');
      setCheckingStep('');
      setDetectedTabs([]);
      setSecurityState({
        environment: false,
        camera: false,
        fullscreen: false,
        location: false,
        final: false,
      });
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }, [open]);

  const requiresPassword = Boolean(assessment?.passwordEnabled);
  const settings = assessment?.settings || {};
  const activeRules = [
    settings.enableFullscreen && 'Fullscreen enforcement',
    settings.tabSwitchDetection && `Tab switch monitoring${settings.tabSwitchLimit ? ` (${settings.tabSwitchLimit} allowed)` : ''}`,
    settings.cameraMonitoring && 'Camera verification and monitoring',
    settings.disableCopyPaste && 'Copy/paste blocking',
    settings.preventMultipleTabs && 'Duplicate assessment tab blocking',
    settings.restrictNavigation && 'Navigation restriction',
    settings.idleDetection && `Idle monitoring${settings.idleThresholdMin ? ` (${settings.idleThresholdMin} min)` : ''}`,
    settings.questionWatermark && 'Candidate watermarking',
    settings.audioMonitoring && 'Audio monitoring rule',
    settings.randomShuffle && 'Question shuffle',
    settings.autoSubmitOnEnd && 'Auto-submit on timer end',
  ].filter(Boolean);
  const instructionItems = [
    assessment?.instructions,
    ...(Array.isArray(assessment?.customInstructions) ? assessment.customInstructions : []),
  ].filter((item) => String(item || '').trim());
  const securitySteps = useMemo(() => ([
    { key: 'environment', title: '1. Clean Environment Check', required: true },
    { key: 'camera', title: '2. Camera Verification', required: Boolean(settings.cameraMonitoring) },
    { key: 'location', title: '3. Location Permission', required: settings.locationTracking !== false },
    { key: 'fullscreen', title: '4. Fullscreen Enforcement', required: Boolean(settings.enableFullscreen) },
    { key: 'final', title: '5. Final Verification', required: true },
  ]), [settings.cameraMonitoring, settings.enableFullscreen, settings.locationTracking]);
  const requiredKeys = securitySteps.filter((item) => item.required).map((item) => item.key);
  const nextRequired = requiredKeys.find((key) => !securityState[key]);
  const canContinueToRules = Boolean(!nextRequired && securityState.final);

  useEffect(() => {
    if (step !== 'security' || !assessment?._id) return undefined;
    const storageKey = `peerprep_assessment_tabs:${assessment._id}`;
    const readTabs = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
        const now = Date.now();
        const active = Object.entries(parsed)
          .filter(([, value]) => value?.lastSeen && now - value.lastSeen < 6000)
          .map(([id, value]) => ({ id, title: value.title || 'Assessment tab', current: value.path === window.location.pathname }));
        setDetectedTabs(active);
        const hasExternal = active.some((entry) => !entry.current);
        const focusOk = document.hasFocus() && !document.hidden;
        const envOk = focusOk && (!settings.preventMultipleTabs || !hasExternal);
        setSecurityState((prev) => ({ ...prev, environment: envOk }));
      } catch {
        setDetectedTabs([]);
      }
    };
    readTabs();
    const interval = setInterval(readTabs, 1000);
    const onVisibility = () => readTabs();
    window.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', onVisibility);
    };
  }, [step, assessment?._id, settings.preventMultipleTabs]);

  const markSetupStep = async (stepKey, meta) => {
    if (!assessment?._id) return;
    await api.markStudentAssessmentSetupStep(assessment._id, stepKey, meta);
  };

  const runCameraCheck = async () => {
    if (!settings.cameraMonitoring) {
      setSecurityState((prev) => ({ ...prev, camera: true }));
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
    setSecurityState((prev) => ({ ...prev, camera: true }));
    await markSetupStep('camera');
  };

  const runFullscreenCheck = async () => {
    if (!settings.enableFullscreen) {
      setSecurityState((prev) => ({ ...prev, fullscreen: true }));
      return;
    }
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
    const ok = Boolean(document.fullscreenElement);
    setSecurityState((prev) => ({ ...prev, fullscreen: ok }));
    if (!ok) throw new Error('Fullscreen is required before continuing.');
    await markSetupStep('fullscreen');
  };

  const runLocationCheck = async () => {
    if (settings.locationTracking === false) {
      setSecurityState((prev) => ({ ...prev, location: true }));
      return;
    }
    if (!navigator.geolocation) throw new Error('Location is not supported on this browser.');
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      });
    });
    const meta = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
    setSecurityState((prev) => ({ ...prev, location: true }));
    await markSetupStep('location', meta);
  };

  const runFinalCheck = async () => {
    const envOk = securityState.environment;
    const camOk = !settings.cameraMonitoring || securityState.camera;
    const fullOk = !settings.enableFullscreen || securityState.fullscreen;
    const locOk = settings.locationTracking === false || securityState.location;
    const ok = envOk && camOk && fullOk && locOk;
    setSecurityState((prev) => ({ ...prev, final: ok }));
    if (!ok) throw new Error('Complete all required checks before final verification.');
    await markSetupStep('final');
  };

  const runCurrentStep = async () => {
    if (!assessment) return;
    if (!nextRequired) return;
    setCheckingStep(nextRequired);
    setError('');
    try {
      if (nextRequired === 'environment') {
        const hasExternalTabs = detectedTabs.some((entry) => !entry.current);
        const envOk = document.hasFocus() && !document.hidden && (!settings.preventMultipleTabs || !hasExternalTabs);
        setSecurityState((prev) => ({ ...prev, environment: envOk }));
        if (!envOk) throw new Error('Close all extra assessment tabs and keep this window focused.');
        await markSetupStep('environment');
      } else if (nextRequired === 'camera') {
        await runCameraCheck();
      } else if (nextRequired === 'fullscreen') {
        await runFullscreenCheck();
      } else if (nextRequired === 'location') {
        await runLocationCheck();
      } else if (nextRequired === 'final') {
        await runFinalCheck();
      }
    } catch (err) {
      setError(err.message || 'Unable to verify this step.');
    } finally {
      setCheckingStep('');
    }
  };

  const handleUnlock = async () => {
    if (!assessment) return;
    if (requiresPassword && !password.trim()) {
      setError('Enter the assessment password.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onUnlock(password);
      setStep('security');
    } catch (err) {
      setError(err.message || 'Unable to start assessment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!assessment) return null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_38px_95px_-58px_rgba(15,23,42,0.5)] dark:border-gray-700 dark:bg-gray-900"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="min-h-0 overflow-y-auto px-4 pb-4 pt-5 sm:px-5">
              <div className="pr-10">
                <div className="inline-flex items-center rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-900/20 dark:text-sky-200">
                  {step === 'details' ? 'Launch Assessment' : step === 'security' ? 'Security Setup' : 'Rules & Regulations'}
                </div>
                <h3 className="mt-3 break-words text-xl font-black tracking-tight text-slate-950 dark:text-white">
                  {step === 'details' ? assessment.title : step === 'security' ? 'Security Setup' : 'Assessment Rules'}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-300">
                  {step === 'details'
                    ? 'Review the schedule and duration, then continue to secure verification.'
                    : step === 'security'
                      ? 'Complete all mandatory checks before moving forward.'
                      : 'Read all admin-defined rules before starting the assessment.'}
                </p>
              </div>

              {step === 'details' && (
                <>
                  <div className="mt-4 grid gap-2.5">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Schedule
                      </div>
                      <div className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{formatDateTime(assessment.startTime)}</div>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-3">
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                          <Clock3 className="h-3.5 w-3.5" />
                          Duration
                        </div>
                        <div className="mt-2 text-lg font-black text-slate-950 dark:text-white">{formatDurationMinutes(assessment.duration)}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                          <Layers3 className="h-3.5 w-3.5" />
                          Questions
                        </div>
                        <div className="mt-2 text-lg font-black text-slate-950 dark:text-white">{assessment.totalQuestions}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                          Total Marks
                        </div>
                        <div className="mt-2 text-lg font-black text-slate-950 dark:text-white">{assessment.totalMarks}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                      Active Rules
                    </div>
                    <div className="mt-2 grid max-h-40 gap-1.5 overflow-y-auto pr-1 text-sm text-slate-600 dark:text-gray-300">
                      {(activeRules.length ? activeRules : ['Standard assessment monitoring']).map((rule) => (
                        <div key={rule} className="flex items-start gap-2">
                          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                          <span>{rule}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {requiresPassword && (
                    <div className="mt-3">
                      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-gray-300">
                        <Lock className="h-3.5 w-3.5" />
                        Assessment Password
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setError('');
                        }}
                        placeholder="Enter password"
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                      {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
                    </div>
                  )}
                </>
              )}

              {step === 'security' && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-gray-100">
                    <ShieldCheck className="h-4 w-4 text-sky-600" />
                    Security Checks
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-gray-300">
                    {securitySteps.map((item) => (
                      <div key={item.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-slate-800 dark:text-gray-100">{item.title}</div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            !item.required
                              ? 'bg-slate-200 text-slate-600 dark:bg-gray-700 dark:text-gray-300'
                              : securityState[item.key]
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          }`}>
                            {!item.required ? 'Skipped' : securityState[item.key] ? 'Verified' : 'Pending'}
                          </span>
                        </div>
                        {item.key === 'environment' && (
                          <div className="mt-1 text-[11px] text-slate-500 dark:text-gray-400">
                            {detectedTabs.some((entry) => !entry.current) ? 'Extra assessment tab detected. Close it before continuing.' : 'Environment is being tracked in realtime.'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <video ref={videoRef} className="mt-3 h-0 w-0 opacity-0" playsInline muted />
                  {error && <div className="mt-3 text-xs font-medium text-rose-600">{error}</div>}
                </div>
              )}

              {step === 'rules' && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                    Rules & Regulations
                  </div>
                  <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1 text-sm text-slate-600 dark:text-gray-300">
                    {(instructionItems.length ? instructionItems : ['Read all rules carefully before starting the assessment.']).map((item, index) => (
                      <div key={`instruction-${index}`} className="flex items-start gap-2">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                        <span>{item}</span>
                      </div>
                    ))}
                    {(activeRules.length ? activeRules : ['Standard assessment monitoring']).map((rule) => (
                      <div key={`active-${rule}`} className="flex items-start gap-2">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                        <span>{rule}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:px-5">
              {step !== 'details' && (
                <button
                  type="button"
                  onClick={() => setStep(step === 'rules' ? 'security' : 'details')}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:text-white"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                Cancel
              </button>
              {step === 'details' && (
                <button
                  type="button"
                  onClick={handleUnlock}
                  disabled={submitting}
                  className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_20px_35px_-25px_rgba(15,23,42,0.75)] transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Verifying...' : 'Continue'}
                </button>
              )}
              {step === 'security' && (
                <button
                  type="button"
                  onClick={nextRequired ? runCurrentStep : () => setStep('rules')}
                  className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_20px_35px_-25px_rgba(15,23,42,0.75)] transition-colors hover:bg-slate-800"
                  disabled={Boolean(checkingStep)}
                >
                  {checkingStep ? (
                    <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Checking...</span>
                  ) : nextRequired ? (
                    <span className="inline-flex items-center gap-2">
                      {nextRequired === 'environment' && <Monitor className="h-4 w-4" />}
                      {nextRequired === 'camera' && <Video className="h-4 w-4" />}
                      {nextRequired === 'fullscreen' && <Maximize className="h-4 w-4" />}
                      {nextRequired === 'location' && <MapPin className="h-4 w-4" />}
                      {nextRequired === 'final' && <CheckCircle2 className="h-4 w-4" />}
                      Verify {nextRequired}
                    </span>
                  ) : (
                    'Continue'
                  )}
                </button>
              )}
              {step === 'rules' && (
                <button
                  type="button"
                  onClick={onStart}
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_20px_35px_-25px_rgba(5,150,105,0.65)] transition-colors hover:bg-emerald-500"
                >
                  {assessment.hasSubmissionInProgress ? 'Continue Test' : 'Start Test'}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
