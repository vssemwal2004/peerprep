import { Crown, Gem, Sprout, Target, Trophy, Zap } from 'lucide-react';

// Visual identity per learner level (1-6, matching getLearnerLevel). Full class strings so
// Tailwind keeps them.
const LEVEL_THEMES = {
  1: { Icon: Sprout, gradient: 'from-sky-400 to-sky-600', glow: 'shadow-sky-500/40', soft: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30' },
  2: { Icon: Zap, gradient: 'from-cyan-400 to-blue-600', glow: 'shadow-cyan-500/40', soft: 'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/30' },
  3: { Icon: Target, gradient: 'from-emerald-400 to-teal-600', glow: 'shadow-emerald-500/40', soft: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30' },
  4: { Icon: Trophy, gradient: 'from-violet-400 to-indigo-600', glow: 'shadow-violet-500/40', soft: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30' },
  5: { Icon: Crown, gradient: 'from-amber-400 to-orange-600', glow: 'shadow-amber-500/40', soft: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30' },
  6: { Icon: Gem, gradient: 'from-rose-400 via-fuchsia-500 to-indigo-600', glow: 'shadow-fuchsia-500/40', soft: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-500/30' },
};

export function levelTheme(level) {
  return LEVEL_THEMES[Number(level)] || LEVEL_THEMES[1];
}
