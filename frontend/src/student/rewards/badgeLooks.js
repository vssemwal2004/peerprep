import { CalendarCheck, CalendarCheck2, Code2, Compass, Flame, Layers, Sunrise } from 'lucide-react';

// Each monthly badge has its own look: emblem shape, colour and icon. Server tracks:
// backend/src/services/monthlyBadges.js TRACKS.
export const BADGE_LOOKS = {
  solver: { shape: 'hexagon', from: '#38bdf8', to: '#0369a1', accent: '#0284c7', Icon: Code2 },
  medium: { shape: 'diamond', from: '#fdba74', to: '#c2410c', accent: '#ea580c', Icon: Layers },
  hard: { shape: 'shield', from: '#fb7185', to: '#be123c', accent: '#e11d48', Icon: Flame },
  explorer: { shape: 'circle', from: '#6ee7b7', to: '#047857', accent: '#059669', Icon: Compass },
  consistent: { shape: 'squircle', from: '#a5b4fc', to: '#4338ca', accent: '#4f46e5', Icon: CalendarCheck },
  regular: { shape: 'burst', from: '#fcd34d', to: '#b45309', accent: '#d97706', Icon: Sunrise },
  // Daily Challenger: daily challenges completed this month (2026-11-21).
  challenger: { shape: 'burst', from: '#c4b5fd', to: '#6d28d9', accent: '#7c3aed', Icon: CalendarCheck2 },
};
export const badgeLook = (track) => BADGE_LOOKS[track] || BADGE_LOOKS.solver;

// Tier = the metal ring around the emblem.
export const TIER_METAL = {
  Bronze: '#c2773a', Silver: '#9ca3af', Gold: '#f59e0b', Platinum: '#22d3ee', Diamond: '#38bdf8', Legend: '#f43f5e',
};

export const DARK_TIER_METAL = {
  Bronze: '#755337', Silver: '#5b636c', Gold: '#74603a', Platinum: '#43696d', Diamond: '#435d73', Legend: '#775160',
};
