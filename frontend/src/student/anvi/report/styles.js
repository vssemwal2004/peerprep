// Class strings of the on-screen ANVI report. One brand primary (PeerPrep blue, Tailwind `sky`), neutral
// slate / zinc greys, and green / amber / red only where a value means something. Every class has a light and
// a dark value so the report follows the app theme (Tailwind `dark` class). The PDF has its own palette
// (pdf/theme.js) with the same roles; the print fallback uses print.js.

export const reportFont = "font-['Inter',ui-sans-serif,system-ui,sans-serif] antialiased";
export const reportCard = "rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/[0.08] dark:bg-[#242424] dark:shadow-none sm:p-6";
export const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-zinc-400";
export const cardTitle = "text-[15px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-zinc-50";
export const muted = "text-slate-500 dark:text-zinc-400";
export const body = "text-slate-700 dark:text-zinc-200";
export const focusRing = "focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-sky-500";

/** Tone → classes for chips, icon tiles and text. `brand` is the primary; the rest are semantic. */
export const TONES = {
  brand: {
    chip: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/25",
    tile: "bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
    text: "text-sky-700 dark:text-sky-300",
    ring: "text-sky-500 dark:text-sky-400",
    bar: "bg-sky-500 dark:bg-sky-400",
  },
  positive: {
    chip: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/25",
    tile: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "text-emerald-500 dark:text-emerald-400",
    bar: "bg-emerald-500 dark:bg-emerald-400",
  },
  caution: {
    chip: "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-400/25",
    tile: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
    text: "text-amber-700 dark:text-amber-300",
    ring: "text-amber-500 dark:text-amber-400",
    bar: "bg-amber-500 dark:bg-amber-400",
  },
  critical: {
    chip: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-400/25",
    tile: "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
    text: "text-rose-700 dark:text-rose-300",
    ring: "text-rose-500 dark:text-rose-400",
    bar: "bg-rose-500 dark:bg-rose-400",
  },
  neutral: {
    chip: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-200 dark:ring-white/10",
    tile: "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300",
    text: "text-slate-600 dark:text-zinc-300",
    ring: "text-slate-400 dark:text-zinc-500",
    bar: "bg-slate-400 dark:bg-zinc-500",
  },
};
export const toneClasses = (tone) => TONES[tone] || TONES.neutral;

/** Key point verdict chips: covered (green), partly (amber), missed (red). */
export const VERDICT_CHIPS = {
  matched: "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-400/[0.08] dark:text-emerald-100",
  partial: "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/[0.08] dark:text-amber-100",
  missed: "border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-400/25 dark:bg-rose-400/[0.08] dark:text-rose-100",
};
export const VERDICT_ICON_TONES = {
  matched: "bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950",
  partial: "bg-amber-500 text-white dark:bg-amber-400 dark:text-amber-950",
  missed: "bg-rose-600 text-white dark:bg-rose-400 dark:text-rose-950",
};
