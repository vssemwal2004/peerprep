import { Award, Crown, Flame, Gem, Mountain, Sparkles, Sprout, Target, Trophy, Zap } from 'lucide-react';

// Visual identity per learner level (1–12). Levels 8–12 are the elite tier: richer, metallic
// gradients. Full class strings so Tailwind keeps them.
const LEVEL_THEMES = {
  8: { Icon: Award, gradient: 'from-sky-300 via-indigo-500 to-violet-700', glow: 'shadow-indigo-500/50', soft: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/30' },
  9: { Icon: Flame, gradient: 'from-orange-300 via-rose-500 to-red-700', glow: 'shadow-rose-500/50', soft: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30' },
  10: { Icon: Mountain, gradient: 'from-teal-200 via-cyan-500 to-blue-800', glow: 'shadow-cyan-500/50', soft: 'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/30' },
  11: { Icon: Crown, gradient: 'from-yellow-200 via-amber-500 to-orange-800', glow: 'shadow-amber-500/60', soft: 'bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/40' },
  12: { Icon: Sparkles, gradient: 'from-fuchsia-300 via-violet-600 to-slate-900', glow: 'shadow-fuchsia-500/60', soft: 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-300 dark:bg-fuchsia-500/10 dark:text-fuchsia-200 dark:ring-fuchsia-400/40' },
  7: { Icon: Trophy, gradient: 'from-amber-300 via-rose-500 to-violet-700', glow: 'shadow-amber-500/40', soft: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30' },
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
