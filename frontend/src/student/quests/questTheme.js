import { Building2, Flame, Map as MapIcon, Shapes } from 'lucide-react';

// Each quest picks one theme in the admin builder; the band and accents follow it everywhere.
export const QUEST_THEMES = {
  sky: { band: 'from-sky-500 via-sky-600 to-blue-700', soft: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300', ring: '#0284c7', bar: 'bg-sky-500' },
  violet: { band: 'from-violet-500 via-violet-600 to-indigo-700', soft: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300', ring: '#7c3aed', bar: 'bg-violet-500' },
  emerald: { band: 'from-emerald-500 via-teal-600 to-cyan-700', soft: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', ring: '#059669', bar: 'bg-emerald-500' },
  amber: { band: 'from-amber-400 via-orange-500 to-rose-500', soft: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300', ring: '#d97706', bar: 'bg-amber-500' },
  rose: { band: 'from-rose-500 via-pink-600 to-fuchsia-700', soft: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300', ring: '#e11d48', bar: 'bg-rose-500' },
  indigo: { band: 'from-indigo-500 via-indigo-600 to-slate-800', soft: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300', ring: '#4f46e5', bar: 'bg-indigo-500' },
};
export const questTheme = (name) => QUEST_THEMES[name] || QUEST_THEMES.sky;

export const QUEST_CATEGORIES = [
  { value: 'company', label: 'Company', icon: Building2 },
  { value: 'topic', label: 'Topic', icon: Shapes },
  { value: 'study-plan', label: 'Study plan', icon: MapIcon },
  { value: 'difficulty', label: 'Difficulty', icon: Flame },
];
export const questCategory = (value) => QUEST_CATEGORIES.find((category) => category.value === value) || QUEST_CATEGORIES[2];

export const DIFFICULTY_TONES = {
  Easy: { bar: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20' },
  Medium: { bar: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20' },
  Hard: { bar: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20' },
};

export const questPercent = (quest) => (quest?.total ? Math.round((quest.solved / quest.total) * 100) : 0);
export const questState = (quest) => (quest?.completedAt ? 'completed' : quest?.started ? 'active' : 'new');
