import { Captions, CaptionsOff, Check, Hand, Mic, MicOff, PanelRightClose, PanelRightOpen, PhoneOff, Repeat2 } from "lucide-react";
import { surface, surfaceRing, surfaceShadow } from "./callUtils";

const round = "group relative inline-flex h-12 w-12 items-center justify-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none dark:focus-visible:outline-violet-300";
const neutral = "bg-slate-900/[0.05] text-slate-700 hover:bg-slate-900/[0.09] hover:text-slate-900 dark:bg-white/[0.08] dark:text-zinc-100 dark:hover:bg-white/[0.14] dark:hover:text-white";
const on = "bg-violet-600 text-white shadow-md shadow-violet-600/25 hover:bg-violet-500 dark:bg-violet-300 dark:text-violet-950 dark:shadow-none dark:hover:bg-violet-200";
const danger = "bg-rose-600 text-white hover:bg-rose-500";
// A hybrid call has two more controls, so on phones every control shrinks a little and End is round.
const compactRound = "max-sm:h-11 max-sm:w-11";

function Key({ children }) {
  return <kbd className="pointer-events-none absolute -bottom-1 -right-1 hidden h-4 min-w-4 items-center justify-center rounded bg-slate-800/90 px-1 font-sans text-[10px] font-semibold leading-none text-white opacity-0 ring-1 ring-white/20 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-black/70 dark:text-zinc-300 dark:ring-white/10 sm:inline-flex">{children}</kbd>;
}

/**
 * Hybrid controls: Repeat question, then push-to-talk (hold the button, or Space) or, hands-free,
 * "Done answering". Pointer capture keeps a hold that slides off the button; Space or Enter on the
 * focused button holds it from the keyboard.
 */
function HybridControls({ controls, size }) {
  const { onRepeat, canRepeat, inputMode, onPttDown, onPttUp, pttHeld, onDone, canDone, canTalk } = controls;
  const holdKey = (event) => event.key === " " || event.key === "Enter";
  return <>
    <button type="button" onClick={() => onRepeat?.()} disabled={!canRepeat} aria-label="Repeat question" title="Repeat question"
      className={`${round} ${size} ${neutral}`}>
      <Repeat2 className="h-5 w-5" aria-hidden="true" />
    </button>
    {inputMode === "ptt"
      ? <button type="button" disabled={!canTalk} aria-pressed={Boolean(pttHeld)} aria-label="Hold to talk (Space)" title="Hold to talk (Space)"
        onPointerDown={(event) => { if (event.button !== undefined && event.button !== 0) return; event.currentTarget.setPointerCapture?.(event.pointerId); onPttDown?.(); }}
        onPointerUp={() => onPttUp?.()} onPointerCancel={() => onPttUp?.()} onLostPointerCapture={() => onPttUp?.()}
        onKeyDown={(event) => { if (!holdKey(event)) return; event.preventDefault(); if (!event.repeat) onPttDown?.(); }}
        onKeyUp={(event) => { if (!holdKey(event)) return; event.preventDefault(); onPttUp?.(); }}
        onContextMenu={(event) => event.preventDefault()}
        className={`${round} ${size} touch-none select-none ${pttHeld ? danger : on}`}>
        <Hand className="h-5 w-5" aria-hidden="true" />
        <Key>Space</Key>
      </button>
      : <button type="button" onClick={() => onDone?.()} disabled={!canDone} aria-label="Done answering" title="Done answering"
        className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none dark:focus-visible:outline-violet-300 max-sm:h-11 max-sm:w-11 max-sm:px-0 ${on}`}>
        <Check className="h-5 w-5" aria-hidden="true" /><span className="max-sm:sr-only">Done</span>
      </button>}
  </>;
}

/**
 * The call's round controls on a frosted dock. Every toggle states its current state with aria-pressed.
 * `hybrid`: the hybrid call's extra controls (absent for Live, which renders exactly as before).
 */
export default function ControlBar({ muted, canMute, onToggleMute, captionsOn, onToggleCaptions, panelOpen, onTogglePanel, onLeave, leaveDisabled, highlightLeave = false, hybrid = null }) {
  const size = hybrid ? compactRound : "";
  return (
    <div className="flex justify-center">
      <div role="toolbar" aria-label="Call controls" className={`inline-flex items-center justify-center ${hybrid ? "gap-2" : "gap-2.5"} rounded-full p-2 ring-1 sm:gap-3 ${surface} ${surfaceRing} ${surfaceShadow}`}>
        <button type="button" onClick={onToggleMute} disabled={!canMute} aria-pressed={muted}
          aria-label={muted ? "Unmute microphone (M)" : "Mute microphone (M)"} title={muted ? "Unmute (M)" : "Mute (M)"}
          className={`${round}${size ? ` ${size}` : ""} ${muted ? danger : neutral}`}>
          {muted ? <MicOff className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
          <Key>M</Key>
        </button>
        {hybrid && <HybridControls controls={hybrid} size={size} />}
        <button type="button" onClick={onToggleCaptions} aria-pressed={captionsOn}
          aria-label={captionsOn ? "Turn off live captions (C)" : "Turn on live captions (C)"} title={captionsOn ? "Turn off captions (C)" : "Turn on captions (C)"}
          className={`${round}${size ? ` ${size}` : ""} ${captionsOn ? on : neutral}`}>
          {captionsOn ? <Captions className="h-5 w-5" aria-hidden="true" /> : <CaptionsOff className="h-5 w-5" aria-hidden="true" />}
          <Key>C</Key>
        </button>
        <button type="button" onClick={onTogglePanel} aria-pressed={panelOpen} aria-controls="anvi-side-panel"
          aria-label={panelOpen ? "Hide question panel" : "Show question panel"} title={panelOpen ? "Hide panel" : "Question and transcript"}
          className={`${round}${size ? ` ${size}` : ""} ${panelOpen ? on : neutral}`}>
          {panelOpen ? <PanelRightClose className="h-5 w-5" aria-hidden="true" /> : <PanelRightOpen className="h-5 w-5" aria-hidden="true" />}
        </button>
        <span aria-hidden="true" className="mx-0.5 h-8 w-px bg-slate-900/10 dark:bg-white/10" />
        <button type="button" onClick={onLeave} disabled={leaveDisabled} aria-label="End and leave the interview" title="End and leave the interview"
          className={`inline-flex h-12 items-center gap-2 rounded-full bg-rose-600 px-5 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none dark:shadow-rose-950/40 dark:focus-visible:outline-rose-300 sm:px-6 ${highlightLeave ? "ring-4 ring-rose-400/50 motion-safe:animate-pulse" : ""}${hybrid ? " max-sm:h-11 max-sm:w-11 max-sm:justify-center max-sm:px-0" : ""}`}>
          <PhoneOff className="h-5 w-5" aria-hidden="true" />{hybrid ? <span className="max-sm:sr-only">End</span> : "End"}
        </button>
      </div>
    </div>
  );
}
