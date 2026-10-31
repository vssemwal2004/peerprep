import { useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Play, Square } from "lucide-react";
import { api } from "../../../../utils/api";
import { SPEECH_RATE, speechRateOf, timeStretch } from "../../../../student/anvi/anviTimeStretch";
import { AnviTile, Toggle, surfaceClass } from "../../ui";
import { Alert, buttonSecondary } from "../controls";
import { speechRateLabel } from "./tabs";

const TICKS = [
  { value: 0.85, label: "Slower" },
  { value: 1, label: "Normal" },
  { value: 1.2, label: "Faster" },
];

// ANVI's real voice: one cached clip from the server, fetched once per page.
let sampleLoad = null;
const defaultSampleApi = { load: () => api.aiInterviewRequest("/voice-sample") };
function loadSample(sampleApi) {
  sampleLoad ||= Promise.resolve()
    .then(() => sampleApi.load())
    .then((result) => {
      const bytes = Uint8Array.from(atob(String(result?.pcm || "")), (c) => c.charCodeAt(0));
      const samples = new Float32Array(bytes.length >> 1);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < samples.length; i += 1) samples[i] = view.getInt16(i * 2, true) / 0x8000;
      if (!samples.length) throw new Error("The voice sample is empty.");
      return { samples, sampleRate: Number(result.sampleRate) || 24000, text: String(result.text || "") };
    })
    .catch((error) => {
      sampleLoad = null;
      throw error;
    });
  return sampleLoad;
}

/** One voice (the server's TTS voice), its speed with a preview at that speed, and short acknowledgements. */
export default function VoiceCard({ data, onChange, readOnly, sampleApi = defaultSampleApi }) {
  const persona = data.anvi?.persona || {};
  const rate = speechRateOf(persona.speechRate);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [line, setLine] = useState("");
  const playing = useRef(null);
  const setPersona = (patch) =>
    onChange({ ...data, anvi: { ...(data.anvi || {}), persona: { ...persona, ...patch } } });
  const stop = () => {
    const current = playing.current;
    playing.current = null;
    if (!current) return;
    try { current.source.stop(); } catch { /* Already stopped. */ }
    current.context.close().catch(() => {});
  };
  useEffect(() => stop, []);
  const preview = async () => {
    if (playing.current) {
      stop();
      setState("idle");
      return;
    }
    setError("");
    setState("loading");
    try {
      const sample = await loadSample(sampleApi);
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("This browser cannot play audio.");
      const context = new AudioContextClass();
      const samples = timeStretch(sample.samples, rate, sample.sampleRate);
      const buffer = context.createBuffer(1, samples.length, sample.sampleRate);
      buffer.getChannelData(0).set(samples);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      const current = { context, source };
      source.onended = () => {
        if (playing.current !== current) return;
        stop();
        setState("idle");
      };
      playing.current = current;
      setLine(sample.text);
      source.start();
      setState("playing");
    } catch (err) {
      stop();
      setState("idle");
      setError(err?.message || "The voice preview could not be played.");
    }
  };
  return (
    <section data-field="speechRate" aria-labelledby="anvi-voice-heading" className={`${surfaceClass} overflow-hidden`}>
      <header className="flex flex-wrap items-center gap-4 border-b border-violet-100 bg-gradient-to-br from-violet-50/80 via-white to-fuchsia-50/50 px-5 py-4 dark:border-violet-500/15 dark:from-violet-500/10 dark:via-gray-900 dark:to-fuchsia-500/5">
        <AnviTile size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Your interviewer</p>
          <h3 id="anvi-voice-heading" className="mt-0.5 text-[15px] font-semibold leading-6 text-slate-900 dark:text-white">ANVI&apos;s voice</h3>
          <p data-anvi-voice className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600 dark:text-gray-300">
            <AudioLines size={15} aria-hidden="true" className="shrink-0 text-violet-500 dark:text-violet-400" />
            One natural voice for every interview, in Indian English.
          </p>
        </div>
      </header>
      <div className="space-y-6 p-5">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="anvi-speech-rate" className="text-[13px] font-medium text-slate-700 dark:text-gray-200">
              Speaking speed
            </label>
            <output htmlFor="anvi-speech-rate" data-speech-rate className="rounded-md bg-violet-50 px-2 py-0.5 text-sm font-semibold tabular-nums text-violet-800 dark:bg-violet-500/10 dark:text-violet-200">
              {speechRateLabel(rate)}
            </output>
          </div>
          <input
            id="anvi-speech-rate"
            type="range"
            min={SPEECH_RATE.min}
            max={SPEECH_RATE.max}
            step={SPEECH_RATE.step}
            value={rate}
            disabled={readOnly}
            aria-valuetext={speechRateLabel(rate)}
            onChange={(event) => {
              stop();
              setState("idle");
              setPersona({ speechRate: Math.round(Number(event.target.value) * 100) / 100 });
            }}
            className="w-full accent-violet-600"
          />
          <div aria-hidden="true" className="mt-1 flex justify-between text-xs text-slate-400">
            {TICKS.map((tick) => (
              <span key={tick.value}>{tick.label}</span>
            ))}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-gray-400">
            Slower suits first-year students; faster suits experienced candidates. The voice keeps its natural pitch,
            and changing the speed costs nothing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" data-voice-preview className={buttonSecondary} disabled={state === "loading"} onClick={preview}>
            {state === "loading" ? (
              <Loader2 size={15} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            ) : state === "playing" ? (
              <Square size={14} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
            {state === "playing" ? "Stop" : "Preview at this speed"}
          </button>
          {state === "playing" && line && (
            <p className="min-w-0 flex-1 text-sm italic text-slate-500 dark:text-gray-400">“{line}”</p>
          )}
        </div>
        {error && <Alert tone="warning">{error}</Alert>}
        <Toggle
          label="Short acknowledgements"
          description="ANVI says a brief “Okay” or “Got it” after an answer. Turn off to go straight on."
          checked={persona.acknowledgements !== false}
          onChange={(acknowledgements) => setPersona({ acknowledgements })}
          disabled={readOnly}
        />
      </div>
    </section>
  );
}
