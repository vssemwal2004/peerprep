import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, Radio, Timer } from "lucide-react";
import { api } from "../../../../utils/api";
import { Alert, Card, SelectField, buttonGhost, buttonSecondary } from "../controls";
import { DURATIONS, audioReadiness, durationGuidance, readDuration, writeDuration } from "./hybrid";

const DURATION_OPTIONS = [
  { value: "", label: "Not set (no fixed length)" },
  ...DURATIONS.map((minutes) => ({ value: String(minutes), label: `${minutes} minutes` })),
];

/** Interview length (anvi.durationMinutes) and how the planned questions fit it. */
export function DurationCard({ data, onChange, summary }) {
  const minutes = readDuration(data);
  const guidance = durationGuidance(data, minutes);
  // The server's own range wins when the last check returned one for this duration.
  const range = summary?.durationMinutes === minutes && summary?.durationQuestionRange ? summary.durationQuestionRange : guidance;
  return (
    <Card data-field="duration" icon={Timer} title="Interview length" description="Sets how many questions each student is asked, when the interview wraps up and the AI budget per student.">
      <div className="space-y-4">
        <div className="max-w-xs">
          <SelectField
            label="Duration"
            field="durationMinutes"
            value={minutes ? String(minutes) : ""}
            options={DURATION_OPTIONS}
            hint={minutes ? `Suits ${range.min} to ${range.max} questions.` : "Without a length, ANVI uses the usual timing for the questions you add."}
            onChange={(value) => onChange(writeDuration(data, value))}
          />
        </div>
        {guidance && (
          <p data-duration-guidance className="text-sm text-slate-600 dark:text-gray-300">
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{guidance.planned}</span>{" "}
            question{guidance.planned === 1 ? "" : "s"} planned for {minutes} minutes (guidance {range.min}–{range.max}).
          </p>
        )}
        {guidance?.warning && (
          <p data-duration-warning role="status" className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
            {guidance.warning}
          </p>
        )}
      </div>
    </Card>
  );
}

const TONE_STYLES = {
  ready: ["text-emerald-700 dark:text-emerald-300", CheckCircle2],
  failed: ["text-rose-700 dark:text-rose-300", AlertTriangle],
  queued: ["text-sky-700 dark:text-sky-300", Clock3],
  off: ["text-slate-600 dark:text-gray-300", Radio],
  none: ["text-slate-600 dark:text-gray-300", Clock3],
};
const defaultAudioApi = {
  status: (id) => api.getInterviewAudioStatus(id),
  regenerate: (id) => api.regenerateInterviewAudio(id),
};
const POLL_MS = 5000;

/** Cost-saving mode for this server, and the published revision's question audio with Regenerate. */
export function AudioCard({ interviewId, published, readOnly, audioApi = defaultAudioApi }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = Boolean(interviewId && published);
  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      setStatus(await audioApi.status(interviewId));
      setError("");
    } catch (err) {
      setError(err?.message || "Question audio status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [active, audioApi, interviewId]);
  useEffect(() => {
    load();
  }, [load]);
  // Refresh while clips are queued or being generated.
  const pending = status?.enabled && ["pending", "running"].includes(status?.status);
  useEffect(() => {
    if (!active || !pending) return undefined;
    const timer = setTimeout(load, POLL_MS);
    return () => clearTimeout(timer);
  }, [active, pending, status, load]);
  const regenerate = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await audioApi.regenerate(interviewId);
      if (next) setStatus(next);
      setNotice("Question audio is queued. Failed clips are retried now.");
    } catch (err) {
      setError(err?.message || "Question audio could not be regenerated.");
    } finally {
      setBusy(false);
    }
  };
  const view = active ? audioReadiness(status) : null;
  const [toneClass, ToneIcon] = TONE_STYLES[view?.tone] || TONE_STYLES.none;
  return (
    <Card
      data-field="audio"
      icon={RefreshCw}
      title="Question audio"
      description="ANVI's voice for every question and prepared follow-up is made once, after you publish, and played to every student."
    >
      <div className="space-y-4" aria-live="polite">
        {!active ? (
          <p data-audio-status="unpublished" className="text-sm text-slate-600 dark:text-gray-300">
            Question audio is generated in the background after you publish. A publish never waits for it.
          </p>
        ) : loading && !status ? (
          <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-300">
            <Loader2 size={15} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            Checking question audio…
          </p>
        ) : (
          status && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">ANVI audio</dt>
                <dd data-hybrid-status className="mt-0.5 font-medium text-slate-900 dark:text-white">
                  {status.enabled ? "On for this server" : "Off on this server"}
                </dd>
              </div>
              {status.enabled && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">Question audio</dt>
                  <dd data-audio-status={view.tone} className={`mt-0.5 flex items-center gap-1.5 font-medium ${toneClass}`}>
                    <ToneIcon size={15} aria-hidden="true" className="shrink-0" />
                    {view.label}
                  </dd>
                  {view.detail && <p className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-gray-400">{view.detail}</p>}
                </div>
              )}
            </dl>
          )
        )}
        {error && <Alert tone="error">{error}</Alert>}
        {notice && !error && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
        {active && (
          <div className="flex flex-wrap gap-2">
            {status?.enabled && (
              <button type="button" data-audio-regenerate className={buttonSecondary} disabled={readOnly || busy} onClick={regenerate}>
                {busy ? <Loader2 size={15} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <RefreshCw size={15} aria-hidden="true" />}
                {busy ? "Queuing…" : "Regenerate audio"}
              </button>
            )}
            <button type="button" className={buttonGhost} disabled={loading} onClick={load}>
              Refresh
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
