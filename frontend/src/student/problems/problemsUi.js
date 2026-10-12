import { DIFFICULTY_THEME } from '../../utils/difficultyTheme.js';
// Shared surfaces for the practice library. They match the student dashboard's cards so the two
// pages read as one product.
export const card = 'rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#232325] dark:shadow-none';
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#1a1a1a]';
export const fieldBase = 'h-10 rounded-xl border border-[#e4e7ec] bg-white text-[13px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-[#1f1f21] dark:text-zinc-100 dark:focus:border-sky-500/60 dark:focus:ring-sky-500/15';

export const DIFFICULTY = DIFFICULTY_THEME;

export const QUESTION_TYPES = [
  { value: '', label: 'All types' },
  { value: 'coding', label: 'Coding' },
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'short', label: 'Short answer' },
  { value: 'one_line', label: 'One line' },
];
/** 'correct' from the server means solved; any other recorded result means attempted. */
export function problemStatus(problem) {
  if (problem?.result === 'correct') return 'solved';
  return problem?.result ? 'attempted' : 'none';
}

export const typeLabel =(value) => QUESTION_TYPES.find((type) => type.value === value)?.label || 'Question';

// Company initials get a stable, calm colour so the strip scans quickly without third-party logos.
const AVATAR_TONES = [
  'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
];
export function companyTone(name) {
  let hash = 0;
  for (const char of String(name || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}
export const companyInitial = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';
