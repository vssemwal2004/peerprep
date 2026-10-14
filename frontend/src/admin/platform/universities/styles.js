// Class strings and prop helpers shared by the Universities pages. Visual language follows admin/quickprep/ui.jsx.
export { card, inputClass, primaryButton, secondaryButton } from '../../quickprep/ui';

export const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500';
export const dangerButton = `inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-rose-600/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
export const dangerOutlineButton = `inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/40 dark:bg-transparent dark:text-rose-400 dark:hover:bg-rose-500/10 ${focusRing}`;
export const ghostButton = `inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 ${focusRing}`;
export const selectClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/15';
export const mutedText = 'text-slate-500 dark:text-zinc-400';

export const tabPanelProps = (idBase, value) => ({ role: 'tabpanel', id: `${idBase}-panel-${value}`, 'aria-labelledby': `${idBase}-tab-${value}`, tabIndex: 0, className: 'focus:outline-none' });
