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

/**
 * The microphone preview: the student's initials with a ring that follows the level, an equaliser meter and
 * the Test microphone button. `compact` is one row for the System check under the camera.
 * `micCheck`: useMicCheck().
 */
export function MicPanel({ micCheck, support, studentName = "", compact = false }) {
  const { mic, heard, barsRef, levelRef, test } = micCheck;
  const on = mic.state === "on";
  const status = on ? (heard ? "Sounds good. ANVI will hear you like this." : "Say a few words…") : mic.state === "error" ? "Not available" : "Not tested yet";

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
    </div>
  </div>;
}
