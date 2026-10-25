import { useEffect, useRef, useState } from "react";

// The room follows the app theme (Tailwind `dark` class): frosted surfaces over a soft gradient
// backdrop, light by default and deep ink in dark mode. Ring colours are separate so a tile can swap
// them (ANVI's tile glows violet while she speaks).
export const surface = "bg-white/75 backdrop-blur-xl dark:bg-[#141821]/80";
export const surfaceRing = "ring-slate-900/[0.07] dark:ring-white/[0.07]";
export const surfaceShadow = "shadow-[0_1px_2px_rgba(15,23,42,0.05),0_24px_48px_-28px_rgba(76,29,149,0.28)] dark:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.7)]";
// Name plates and small chips that sit on a surface.
export const chip = "bg-white/85 text-slate-800 ring-1 ring-inset ring-slate-900/[0.06] backdrop-blur-md dark:bg-black/55 dark:text-white dark:ring-white/[0.06]";

/**
 * Questions not answered yet, from the live state: during the introduction all of them, while asking
 * question k of n the current one and those after it (n - k + 1), none once ANVI is closing. Null when
 * the total is unknown.
 */
export function unansweredOf({ phase, questionNumber, totalQuestions } = {}) {
  const total = Number(totalQuestions) || 0;
  if (phase === "closing" || phase === "done") return 0;
  if (total <= 0) return null;
  const current = Number(questionNumber) || 0;
  if (current <= 0) return total;
  return Math.max(0, Math.min(total, total - current + 1));
}

/** The End dialog's warning for `unanswered` questions (null: unknown). */
export function endWarningOf(unanswered) {
  const rejoin = "you can't rejoin this attempt.";
  if (!Number.isFinite(unanswered) || unanswered < 0) return `Questions you haven't answered will be marked as not answered, and ${rejoin}`;
  if (unanswered === 0) return "Your answers are saved. You can't rejoin this attempt.";
  if (unanswered === 1) return `You still have 1 unanswered question. It will be marked as not answered and ${rejoin}`;
  return `You still have ${unanswered} unanswered questions. They will be marked as not answered and ${rejoin}`;
}

// ANVI's line when a student asks to finish and voice ending is off ("…please use the End interview
// button…"), plus loose English / Hinglish variants, so the room can point at the button.
const END_HINT = [
  /\bend\s+interview\s+button\b/i,
  /\b(?:use|press|click|tap|select|hit)\b[^.?!]{0,40}\b(?:end|leave)\b[^.?!]{0,20}\bbutton\b/i,
  /\bend\b[^.?!]{0,30}\bbutton\b[^.?!]{0,30}\b(?:dabaa?|daba(?:iye|ein|o)|click\s+kar)/i,
];
export const pointsToEndButton = (text) => END_HINT.some((pattern) => pattern.test(String(text || "")));

/** "Aarav Sharma" -> "AS"; falls back to "You". */
export function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "You";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts.at(-1)[0]}`;
  return letters.toUpperCase();
}

/** 434 -> "07:14"; an hour or more -> "1:02:03". */
export function clockText(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${String(m).padStart(2, "0")}:${s}`;
}

/** Re-renders every `ms` with the current time. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** True while `query` matches; `fallback` when matchMedia is unavailable (tests, old browsers). */
export function useMediaQuery(query, fallback = false) {
  const read = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : fallback);
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener?.("change", onChange);
    return () => list.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}

/**
 * Reads `getLevel()` (0..~0.3 RMS) on every animation frame and writes the smoothed 0..1 value to the
 * element as the CSS variable `--lvl`, so voice-reactive styles never re-render React.
 */
export function useLevelVar(getLevel, gain = 4.5) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (!getLevel || typeof requestAnimationFrame !== "function") { element.style.setProperty("--lvl", "0"); return undefined; }
    let frame = 0;
    let smooth = 0;
    const draw = () => {
      const raw = Math.min(1, Math.max(0, Number(getLevel()) || 0) * gain);
      // Fast attack, slow release reads as speech rather than flicker.
      smooth += (raw - smooth) * (raw > smooth ? 0.45 : 0.08);
      element.style.setProperty("--lvl", smooth.toFixed(3));
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); element.style.setProperty("--lvl", "0"); };
  }, [getLevel, gain]);
  return ref;
}
