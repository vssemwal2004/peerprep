// One badge shape for every badge family, so the profile, the gallery, the Badges page and the
// celebration popup draw them the same way:
//   award    — achievements from the engagement service (categories) or the classic ranking awards
//   lifetime — all-time milestones (backend services/lifetimeBadges.js), one badge per threshold
//   monthly  — this month's levelled badges (backend services/monthlyBadges.js), plus past months
import {
  Award, BookOpen, CalendarCheck2, Code2, Compass, Flag, Flame, GraduationCap, ListChecks,
  Map as MapIcon, MessageSquare, Mountain, Sun, Target, Trophy,
} from 'lucide-react';
import { awardIcon } from '../profile/awardVisuals';
import { badgeLook } from '../rewards/badgeLooks';

// Tier = the metal rim around the badge.
export const TIER_METALS = {
  Bronze: ['#f5c894', '#a0582a'],
  Silver: ['#f8fafc', '#94a3b8'],
  Gold: ['#fde68a', '#d97706'],
  Platinum: ['#cffafe', '#0e7490'],
  Diamond: ['#e0f2fe', '#0369a1'],
  Legend: ['#fecdd3', '#be123c'],
};
export const TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legend'];
const RARITY_TIER = { Common: 'Bronze', Uncommon: 'Silver', Rare: 'Gold', Epic: 'Platinum', Legendary: 'Legend', Special: 'Legend' };

export const FAMILY_LABELS = { award: 'Achievements', lifetime: 'Milestones', monthly: 'Monthly' };

const CATEGORY_LOOKS = {
  coding: { from: '#38bdf8', to: '#1d4ed8', Icon: Code2 },
  learning: { from: '#34d399', to: '#0f766e', Icon: BookOpen },
  assessments: { from: '#fbbf24', to: '#c2410c', Icon: Target },
  interviews: { from: '#c084fc', to: '#6d28d9', Icon: MessageSquare },
  events: { from: '#22d3ee', to: '#0e7490', Icon: GraduationCap },
  momentum: { from: '#fb923c', to: '#c2410c', Icon: Flag },
  growth: { from: '#818cf8', to: '#4338ca', Icon: Compass },
  special: { from: '#f472b6', to: '#a21caf', Icon: Trophy },
  quests: { from: '#22d3ee', to: '#4f46e5', Icon: MapIcon },
};
const TONE_COLORS = {
  emerald: ['#34d399', '#047857'], sky: ['#38bdf8', '#0369a1'], indigo: ['#818cf8', '#4338ca'], rose: ['#fb7185', '#be123c'],
  orange: ['#fb923c', '#c2410c'], amber: ['#fbbf24', '#b45309'], cyan: ['#22d3ee', '#0e7490'], violet: ['#a78bfa', '#6d28d9'],
};
export const LIFETIME_LOOKS = {
  solved: { shape: 'hexagon', from: '#38bdf8', to: '#0369a1', Icon: Code2 },
  hard: { shape: 'shield', from: '#fb7185', to: '#9f1239', Icon: Mountain },
  active: { shape: 'burst', from: '#fcd34d', to: '#b45309', Icon: Sun },
  streak: { shape: 'shield', from: '#fdba74', to: '#c2410c', Icon: Flame },
  challenge: { shape: 'squircle', from: '#c4b5fd', to: '#6d28d9', Icon: CalendarCheck2 },
  sheets: { shape: 'diamond', from: '#5eead4', to: '#0f766e', Icon: ListChecks },
};

const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const compact = (value) => (value >= 1000 ? `${value / 1000}k` : String(value));
const monthLabel = (month) => {
  const [year, index] = String(month || '').split('-').map(Number);
  return year ? new Date(Date.UTC(year, index - 1, 1)).toLocaleString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
};
const monthEnd = (month) => {
  const [year, index] = String(month || '').split('-').map(Number);
  return year ? Date.UTC(year, index, 0, 12) : 0;
};
const time = (value) => {
  const at = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(at) ? at : 0;
};

/** An engagement or classic award. */
export function fromAward(award) {
  const look = award.category
    ? { shape: 'rosette', ...(CATEGORY_LOOKS[award.category] || CATEGORY_LOOKS.special) }
    : { shape: 'circle', from: (TONE_COLORS[award.tone] || TONE_COLORS.sky)[0], to: (TONE_COLORS[award.tone] || TONE_COLORS.sky)[1], Icon: awardIcon(award) || Award };
  const target = Number(award.target) || 0;
  const value = Number(award.value) || 0;
  return {
    uid: `award:${award.id}`, id: award.id, family: 'award', group: award.category || 'achievement',
    title: award.title, description: award.description || '', label: null,
    tier: RARITY_TIER[award.rarity] || (award.earned ? 'Gold' : 'Bronze'), rarity: award.rarity || null,
    earned: Boolean(award.earned), earnedAt: award.earnedAt || null, sortAt: time(award.earnedAt),
    progress: award.earned ? 100 : clamp(award.progress ?? (target ? (value / target) * 100 : 0)),
    valueText: target ? `${Math.min(value, target)}/${target}` : '', next: !award.earned,
    hint: award.earned ? '' : target && value < target ? `${target - value} more to unlock` : award.minimumLevel ? `Reach Level ${award.minimumLevel} to unlock` : 'Keep going to unlock',
    look,
  };
}

/** Every threshold of every lifetime track (from GET /auth/badges/lifetime). */
export function fromLifetimeTracks(tracks = []) {
  return tracks.flatMap((track) => {
    const look = LIFETIME_LOOKS[track.key] || LIFETIME_LOOKS.solved;
    const nextId = track.next?.id;
    return track.steps.map((step) => ({
      uid: `lifetime:${step.id}`, id: step.id, family: 'lifetime', group: track.key,
      title: `${track.title} ${compact(step.threshold)}`, description: `${step.threshold} ${track.unit}, all time`,
      label: compact(step.threshold), tier: step.tierName,
      earned: Boolean(step.earned), earnedAt: step.earnedAt || null, sortAt: time(step.earnedAt),
      progress: step.earned ? 100 : clamp((track.value / step.threshold) * 100),
      valueText: `${Math.min(track.value, step.threshold)}/${step.threshold}`,
      hint: step.earned ? '' : `${Math.max(0, step.threshold - track.value)} more ${track.unit}`,
      next: step.id === nextId,
      look,
    }));
  });
}

/** This month's tracks (earned at their current level, else locked) and past months' best levels. */
export function fromMonthly(data) {
  if (!data?.tracks) return [];
  const current = data.tracks.map((track) => {
    const look = badgeLook(track.key);
    const first = Number(track.targets?.[0]) || 1;
    const target = track.next?.target || first;
    return {
      uid: `monthly:${data.month}:${track.key}`, id: `${data.month}:${track.key}`, family: 'monthly', group: track.key,
      title: track.title, description: track.level ? `${monthLabel(data.month)} · Level ${track.level} of 10` : `${track.description}. Level 1 at ${first} ${track.unit}.`,
      label: track.level ? `Lv ${track.level}` : null, tier: track.tier || 'Bronze', month: data.month,
      earned: track.level > 0, earnedAt: null, earnedLabel: track.level ? monthLabel(data.month) : '', sortAt: Date.now(),
      progress: track.level ? 100 : clamp((track.value / first) * 100),
      valueText: `${Math.min(track.value, target)}/${target}`,
      hint: track.level ? '' : `${Math.max(0, first - track.value)} more ${track.unit} this month`,
      next: !track.level,
      look: { shape: look.shape, from: look.from, to: look.to, Icon: look.Icon },
    };
  });
  const past = (data.history || []).filter((row) => row.month !== data.month).flatMap((row) => (row.best || []).map((best) => {
    const look = badgeLook(best.track);
    return {
      uid: `monthly:${row.month}:${best.track}`, id: `${row.month}:${best.track}`, family: 'monthly', group: best.track,
      title: best.title, description: `${monthLabel(row.month)} · Level ${best.level} of 10`, label: `Lv ${best.level}`,
      tier: best.tier || 'Bronze', month: row.month, earned: true, earnedAt: null, earnedLabel: monthLabel(row.month), sortAt: monthEnd(row.month),
      progress: 100, valueText: '', hint: '', next: false,
      look: { shape: look.shape, from: look.from, to: look.to, Icon: look.Icon },
    };
  }));
  return [...current, ...past];
}

/** Earned newest first (then by tier); locked closest to unlocking first. */
export function orderBadges(items) {
  const tierRank = (item) => TIER_ORDER.indexOf(item.tier);
  const earned = items.filter((item) => item.earned).sort((a, b) => (b.sortAt - a.sortAt) || (tierRank(b) - tierRank(a)));
  const locked = items.filter((item) => !item.earned).sort((a, b) => (b.progress - a.progress) || (tierRank(a) - tierRank(b)));
  return { earned, locked };
}

/** Locked badges worth showing outside the full gallery: only the next step of each track. */
export const nextLocked = (locked) => locked.filter((item) => item.next);

/** A celebration item from a monthly or lifetime badge push (rewardEvents BADGE_LEVEL_EARNED). */
export function fromBadgeEvent(detail) {
  if (detail?.lifetime) {
    const look = LIFETIME_LOOKS[detail.key] || LIFETIME_LOOKS.solved;
    return {
      uid: `event:${detail.track}`, family: 'lifetime', title: detail.title, description: 'Lifetime badge',
      label: compact(Number(detail.level) || 0), tier: detail.tier || 'Bronze', earned: true, coins: detail.coins || 0, look,
    };
  }
  const look = badgeLook(detail?.track);
  return {
    uid: `event:${detail?.month}:${detail?.track}:${detail?.level}`, family: 'monthly', title: detail?.title || 'Monthly badge',
    description: detail?.value != null ? `Level ${detail.level} · ${detail.value} ${detail.unit || ''} this month`.trim() : `Level ${detail?.level}`,
    label: `Lv ${detail?.level}`, tier: detail?.tier || 'Bronze', earned: true, coins: detail?.coins || 0,
    look: { shape: look.shape, from: look.from, to: look.to, Icon: look.Icon },
  };
}
