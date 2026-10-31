import { AlertTriangle, Circle, Loader2, Mic, MicOff } from "lucide-react";
import { initialsOf } from "../room/callUtils";
import { focus } from "../list/styles";
import { METER_BARS } from "./useMicCheck";
import { AnimatedCheck } from "./motion";

import { glass } from "./styles";

// Shared pieces of the pre-start phases and the rejoin lobby (light and dark via Tailwind `dark:`).

/** One row of a check list: ok / bad / busy / idle. */
export function CheckRow({ state, title, detail, ...rest }) {
  const icon = state === "ok" ? <AnimatedCheck className="h-[18px] w-[18px]" />
    : state === "bad" ? <AlertTriangle className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" aria-hidden="true" />
      : state === "busy" ? <Loader2 className="h-[18px] w-[18px] animate-spin text-violet-500 motion-reduce:animate-none dark:text-violet-300" aria-hidden="true" />
        : <Circle className="h-[18px] w-[18px] text-slate-300 dark:text-zinc-600" aria-hidden="true" />;
  return <li {...rest} data-check-state={state} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
    <span className="mt-px flex">{icon}</span>
    <span className="min-w-0 text-sm"><span className="block font-medium text-slate-900 dark:text-zinc-100">{title}</span><span className="block text-[13px] leading-5 text-slate-500 dark:text-zinc-400">{detail}</span></span>
  </li>;
}

// An equaliser outline: each bar has its own height, so the lit meter reads as a voice, not a ruler.
const BAR_HEIGHTS = Array.from({ length: METER_BARS }, (_, index) => Math.round(40 + 60 * Math.abs(Math.sin(index * 0.55 + 0.4))));

/** The level meter: `barsRef` bars that useMicCheck lights (data-on) straight from the audio. */
export function LevelMeter({ barsRef, className = "h-6" }) {
  return <div ref={barsRef} aria-hidden="true" className={`flex items-end gap-[3px] ${className}`}>
    {BAR_HEIGHTS.map((height, index) => <span key={index} data-on="0" style={{ height: `${height}%` }}
      className="flex-1 origin-bottom scale-y-[0.22] rounded-[2px] bg-slate-200 transition-[transform,background-color] duration-100 ease-out data-[on=1]:scale-y-100 data-[on=1]:bg-emerald-500 motion-reduce:transition-none dark:bg-white/10 dark:data-[on=1]:bg-emerald-400" />)}
  </div>;
}

function MicAvatar({ studentName, size }) {
  return <span className="relative flex shrink-0 items-center justify-center">
    <span aria-hidden="true" className="absolute inset-0 rounded-full bg-emerald-400/30 motion-reduce:hidden"
      style={{ transform: "scale(calc(1 + var(--lvl, 0) * 0.3))", opacity: "min(1, calc(var(--lvl, 0) * 1.6))", transition: "transform 90ms linear" }} />
    <span className={`relative flex items-center justify-center rounded-full bg-violet-600 font-semibold tracking-wide text-white ring-4 ring-white dark:bg-violet-500 dark:ring-[#111318] ${size}`}>{initialsOf(studentName)}</span>
  </span>;
}

function TestButton({ mic, support, test }) {
  const on = mic.state === "on";
  return <button type="button" onClick={() => void test()} disabled={!support.ok || mic.state === "requesting" || on}
    className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-colors ${focus} disabled:cursor-not-allowed ${on
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"
      : "bg-violet-600 text-white hover:bg-violet-700 disabled:bg-slate-100 disabled:text-slate-400 dark:bg-violet-500 dark:hover:bg-violet-400 dark:disabled:bg-white/10 dark:disabled:text-zinc-500"}`}>
    {mic.state === "requesting" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : mic.state === "error" ? <MicOff className="h-4 w-4" aria-hidden="true" /> : on ? <span aria-hidden="true" className="relative flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-70 motion-reduce:hidden" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span> : <Mic className="h-4 w-4" aria-hidden="true" />}
    {on ? "Testing" : mic.state === "error" ? "Test again" : "Test microphone"}
  </button>;
}

/** Choose the microphone, when the device has more than one. */
function DevicePicker({ micCheck }) {
  const { devices, deviceId, selectDevice, mic } = micCheck;
  if (!Array.isArray(devices) || devices.length < 2) return null;
  return <label className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
    <span className="shrink-0 font-medium">Microphone</span>
    <select value={deviceId} onChange={(event) => void selectDevice(event.target.value)} disabled={mic.state === "requesting"} data-mic-device=""
      className={`min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 ${focus}`}>
      {!devices.some((device) => device.id === deviceId) && <option value="">Choose a microphone</option>}
      {devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}
    </select>
  </label>;
}

/**
 * The read-aloud check: a random sentence to read out, Start reading, and the result. The microphone is
 * verified only when it carried enough clear voice for the sentence (measured on this device).
 */
function ReadAloud({ micCheck }) {
  const { read, startReading, newSentence, silent, mic } = micCheck;
  const listening = read.state === "listening";
  const passed = read.state === "passed";
  const failed = read.state === "failed";
  const tone = passed ? "ring-emerald-200 bg-emerald-50/60 dark:ring-emerald-400/20 dark:bg-emerald-500/[0.06]"
    : failed ? "ring-amber-200 bg-amber-50/60 dark:ring-amber-400/25 dark:bg-amber-500/[0.06]"
      : "ring-violet-200 bg-violet-50/50 dark:ring-violet-400/20 dark:bg-violet-500/[0.06]";
  const message = passed ? "Microphone verified. ANVI can hear you clearly."
    : failed ? (read.reason === "none" ? "We couldn't hear you. Check that your microphone isn't muted, then try again." : "That was too short. Read the whole sentence aloud, then pause.")
      : listening ? "Listening… read the sentence aloud, then pause."
        : "Press Start reading, then read this sentence aloud in your normal voice.";
  return <div data-read-aloud={read.state} className={`mt-4 rounded-xl p-4 ring-1 ring-inset ${tone}`}>
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">Read this aloud</p>
    <p data-read-sentence="" className="mt-1.5 text-[17px] font-medium leading-7 text-slate-900 dark:text-white">“{read.sentence}”</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {passed ? <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><AnimatedCheck className="h-5 w-5" />Verified</span>
        : <button type="button" onClick={() => { if (failed) newSentence(); else startReading(); }} disabled={listening || silent || mic.state !== "on"} data-read-start=""
          className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-violet-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-violet-500 dark:hover:bg-violet-400 ${focus}`}>
          {listening ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
          {listening ? "Listening…" : failed ? "Try another sentence" : "Start reading"}
        </button>}
      <p role="status" className={`min-w-0 flex-1 text-[13px] leading-5 ${passed ? "text-emerald-700 dark:text-emerald-300" : failed ? "text-amber-800 dark:text-amber-200" : "text-slate-600 dark:text-zinc-300"}`}>{message}</p>
    </div>
  </div>;
}

/**
 * The microphone preview: the student's initials with a ring that follows the level, an equaliser meter and
 * the Test microphone button; the microphone picker, a muted-microphone warning and (pre-start) the
 * read-aloud check. `compact` is one row for the System check under the camera.
 * `micCheck`: useMicCheck().
 */
export function MicPanel({ micCheck, support, studentName = "", compact = false }) {
  const { mic, heard, barsRef, levelRef, test } = micCheck;
  const on = mic.state === "on";
  const status = on ? (micCheck.silent ? "No sound from this microphone" : heard ? "Sounds good. ANVI will hear you like this." : "Say a few words…") : mic.state === "error" ? "Not available" : "Not tested yet";
  const extras = on && <>
    <DevicePicker micCheck={micCheck} />
    {micCheck.silent && <p role="alert" data-mic-silent="" className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] leading-5 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-400/25">
      <MicOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{micCheck.check.detail}
    </p>}
    {micCheck.signal === "suspended" && !heard && <button type="button" onClick={() => void test()} data-mic-resume=""
      className={`mt-3 inline-flex h-8 items-center gap-2 rounded-lg bg-violet-600 px-3 text-[13px] font-semibold text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 ${focus}`}>
      <Mic className="h-4 w-4" aria-hidden="true" />Start sound check
    </button>}
    {micCheck.readRequired && <ReadAloud micCheck={micCheck} />}
  </>;

  if (compact) {
    return <div ref={levelRef} data-mic-panel="compact" className={`p-4 ${glass}`}>
      <div className="flex items-center gap-3">
        <MicAvatar studentName={studentName} size="h-10 w-10 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{on ? mic.label : "Microphone"}</p>
          <p className="truncate text-xs text-slate-500 dark:text-zinc-400">{status}</p>
        </div>
        <TestButton mic={mic} support={support} test={test} />
      </div>
      <LevelMeter barsRef={barsRef} className="mt-3 h-6" />
      {extras}
    </div>;
  }

  return <div ref={levelRef} className={`overflow-hidden ${glass}`}>
    <div className="flex flex-col items-center justify-center px-4 py-8 sm:py-10">
      <MicAvatar studentName={studentName} size="h-20 w-20 text-2xl" />
      <p className="mt-4 text-center text-sm text-slate-600 dark:text-zinc-400">{on ? status : "No camera needed. ANVI only listens."}</p>
    </div>
    <div className="border-t border-slate-100 px-4 py-3.5 dark:border-white/[0.06] sm:px-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${mic.state === "error" ? "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" : on ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300"}`}>
          {mic.state === "error" ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{on ? mic.label : "Microphone"}</p>
          <p className="truncate text-xs text-slate-500 dark:text-zinc-400">{on ? "On · speak to see the level" : mic.state === "error" ? "Not available" : "Not tested yet"}</p>
        </div>
        <TestButton mic={mic} support={support} test={test} />
      </div>
      <LevelMeter barsRef={barsRef} className="mt-3 h-6" />
      {extras}
    </div>
  </div>;
}
