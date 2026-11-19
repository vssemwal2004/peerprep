// Badge level tiers (levels 1-10): colour and wording shared by the dashboard card and the popup.
// Server: backend/src/services/monthlyBadges.js tierOf().
export const TIERS = {
  Bronze: { ring: 'from-orange-300 to-amber-700', chip: 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-200 dark:ring-orange-400/20', bar: 'bg-orange-500' },
  Silver: { ring: 'from-slate-200 to-slate-500', chip: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10', bar: 'bg-slate-500' },
  Gold: { ring: 'from-yellow-200 to-amber-500', chip: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20', bar: 'bg-amber-500' },
  Platinum: { ring: 'from-teal-200 to-cyan-600', chip: 'bg-cyan-50 text-cyan-800 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-200 dark:ring-cyan-400/20', bar: 'bg-cyan-500' },
  Diamond: { ring: 'from-sky-200 to-sky-600', chip: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-400/20', bar: 'bg-sky-500' },
  Legend: { ring: 'from-rose-300 via-amber-300 to-rose-500', chip: 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20', bar: 'bg-rose-500' },
};
export const NO_TIER = { ring: 'from-slate-100 to-slate-300 dark:from-white/10 dark:to-white/20', chip: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10', bar: 'bg-sky-500' };
export const tierStyle = (tier) => TIERS[tier] || NO_TIER;

// Short initials drawn on each badge emblem.
export const BADGE_MARKS = { solver: 'PS', medium: 'MM', hard: 'HH', explorer: 'TE', consistent: 'CO', regular: 'DV' };
