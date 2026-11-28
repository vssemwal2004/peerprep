import { DIFFICULTY_THEME } from '../../utils/difficultyTheme.js';
// Shared surfaces for the practice library. Same violet → indigo accent, card surface and dark
// neutrals as Prep Mock and the student dashboard, so the pages read as one product.
export const card = 'rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424] dark:shadow-none';
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#1a1a1a]';
export const fieldBase = 'h-10 rounded-xl border border-[#e6e7eb] bg-white text-[13px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-100 dark:focus:border-violet-400/60';
/** The page's brand tile: the gradient Prep Mock uses for its own icons. */
export const brandTile = 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_8px_18px_-10px_rgba(109,40,217,0.9)]';

// Topic tags get a stable soft colour (the same topic is always the same colour on every row),
// so a page of questions no longer reads as one grey block.
const TOPIC_TONES = [
  'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/15',
  'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/15',
  'bg-teal-50 text-teal-700 ring-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/15',
  'bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/15',
  'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/15',
  'bg-cyan-50 text-cyan-700 ring-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/15',
  'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/15',
  'bg-pink-50 text-pink-700 ring-pink-100 dark:bg-pink-500/10 dark:text-pink-300 dark:ring-pink-400/15',
];
// The topic's bar in the Topics drawer, in the same hue as its tag.
const TOPIC_BARS = ['bg-violet-400', 'bg-sky-400', 'bg-teal-400', 'bg-indigo-400', 'bg-fuchsia-400', 'bg-cyan-400', 'bg-amber-400', 'bg-pink-400'];
function toneIndex(name) {
  let hash = 0;
  for (const char of String(name || '').toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % TOPIC_TONES.length;
}
export const topicTone = (name) => TOPIC_TONES[toneIndex(name)];
export const topicBar = (name) => TOPIC_BARS[toneIndex(name)];

/** Company logos come keyed by lower-case name ({ url, width, height }); missing → initials. */
export const logoFor = (logos, company) => logos?.[String(company || '').trim().toLowerCase()] || null;

export const DIFFICULTY = DIFFICULTY_THEME;
/** Rows per page offered under the question list (the same choices as every PeerPrep table); 25 is the default. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_PAGE_SIZE = 25;

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
