import { focus } from "../list/styles";

// Class strings of the pre-start phases and the rejoin lobby. One primary colour (the app's violet), soft
// borders, minimal shadows, 12-16 px radii. Every surface has a light and a dark variant (Tailwind
// `dark:`), so the window follows the app theme.

/** A card: soft border, near-flat. */
export const glass = "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-none";
/** Primary accent text. */
export const accentText = "text-violet-700 dark:text-violet-300";
/** Small uppercase label. */
export const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-zinc-400";

const buttonBase = `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors ${focus} disabled:cursor-not-allowed`;
export const primaryButton = (enabled) => `${buttonBase} h-10 px-5 text-sm ${enabled
  ? "bg-violet-600 text-white shadow-[0_1px_2px_rgba(76,29,149,0.25)] hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
  : "bg-slate-100 text-slate-400 dark:bg-white/[0.06] dark:text-zinc-500"}`;
export const secondaryButton = `${buttonBase} h-10 border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.07]`;
