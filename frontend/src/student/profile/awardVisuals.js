import {
  Award,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Code2,
  Crown,
  Flame,
  Languages,
  Medal,
  MessageSquare,
  Zap,
} from 'lucide-react';

// Icon + colour per award (ids/icons/tones defined in achievements.js). Full class strings so
// Tailwind keeps them.
export const AWARD_ICONS = {
  check: CheckCircle2,
  code: Code2,
  medal: Medal,
  zap: Zap,
  flame: Flame,
  crown: Crown,
  calendar: CalendarCheck,
  languages: Languages,
  clipboard: ClipboardList,
  message: MessageSquare,
};

export const AWARD_TONES = {
  emerald: 'from-emerald-400 to-emerald-600 shadow-emerald-500/30',
  sky: 'from-sky-400 to-sky-600 shadow-sky-500/30',
  indigo: 'from-indigo-400 to-indigo-600 shadow-indigo-500/30',
  rose: 'from-rose-400 to-rose-600 shadow-rose-500/30',
  orange: 'from-orange-400 to-orange-600 shadow-orange-500/30',
  amber: 'from-amber-400 to-amber-600 shadow-amber-500/30',
  cyan: 'from-cyan-400 to-cyan-600 shadow-cyan-500/30',
  violet: 'from-violet-400 to-violet-600 shadow-violet-500/30',
};

export function awardIcon(award) {
  return AWARD_ICONS[award?.icon] || Award;
}

export function awardTone(award) {
  return AWARD_TONES[award?.tone] || AWARD_TONES.sky;
}
