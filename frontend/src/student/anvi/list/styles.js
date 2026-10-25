// Class strings shared by the student AI Interviews page and the booking sheet. Light and dark use the
// student shell's tokens (slate-50 page / #1a1a1a, white cards / #242424).

export const cardSurface = "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.08] dark:bg-[#242424] dark:shadow-none";

/** One bordered list of rows separated by dividers (no overflow clip, so row menus can open outside). */
export const listSurface = `${cardSurface} divide-y divide-slate-100 dark:divide-white/[0.06]`;

// index.css has a global `:focus-visible { outline: 2px solid sky !important }`. The `!` utilities below
// carry a class (higher specificity), so ANVI's violet focus ring wins without touching the global rule.
export const focus = "focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-violet-500";
/** For elements that show focus another way (a menu item's background, a focused dialog title). */
export const noOutline = "outline-none focus:!outline-none focus-visible:!outline-none";
const base = `inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition ${focus} disabled:cursor-not-allowed`;

export const btn = {
  primary: `${base} bg-violet-600 text-white shadow-[0_1px_2px_rgba(76,29,149,0.25)] hover:bg-violet-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none dark:bg-violet-500 dark:hover:bg-violet-400 dark:disabled:bg-white/[0.06] dark:disabled:text-zinc-500`,
  secondary: `${base} border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.07]`,
  soft: `${base} bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:bg-slate-100 disabled:text-slate-400 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20 dark:disabled:bg-white/[0.05] dark:disabled:text-zinc-500`,
  danger: `${base} bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50`,
  ghost: `${base} text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white`,
  icon: `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 ${focus} disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100`,
};
