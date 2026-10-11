import { useId } from 'react';
import { BookOpen, Code2, Compass, Flag, GraduationCap, MessageSquare, Target, Trophy } from 'lucide-react';

const designs = {
  coding: ['#38bdf8', '#2563eb', Code2], learning: ['#34d399', '#0f766e', BookOpen],
  assessments: ['#fbbf24', '#d97706', Target], interviews: ['#c084fc', '#7c3aed', MessageSquare],
  events: ['#22d3ee', '#0e7490', GraduationCap], momentum: ['#fb923c', '#ea580c', Flag],
  growth: ['#818cf8', '#4338ca', Compass], special: ['#f472b6', '#a21caf', Trophy],
};
export default function BadgeEmblem({ badge, className = 'h-12 w-12' }) {
  const id = useId();
  const [from, to, Icon] = designs[badge.category] || designs.special;
  const stars = { Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5, Special: 5 }[badge.rarity] || 1;
  return <span className={`relative inline-flex shrink-0 items-center justify-center ${className} ${badge.earned ? '' : 'grayscale opacity-45'}`} aria-hidden="true">
    <svg viewBox="0 0 80 88" fill="none" className="absolute inset-0 h-full w-full">
      <defs><linearGradient id={id} x1="8" y1="6" x2="65" y2="80" gradientUnits="userSpaceOnUse"><stop stopColor={from} /><stop offset="1" stopColor={to} /></linearGradient></defs>
      <path d="M19 59 13 85l15-8 10 9 5-25M42 61l3 25 12-9 12 8-8-27" fill={to} opacity=".85" />
      <path d="m40 3 10 5 11 1 5 10 9 8-2 12 2 11-9 8-5 10-11 1-10 5-10-5-11-1-5-10-9-8 2-11-2-12 9-8 5-10 11-1Z" fill={`url(#${id})`} />
      <circle cx="40" cy="38" r="27" stroke="white" strokeOpacity=".5" strokeWidth="1.5" />
      <circle cx="40" cy="38" r="22" fill="white" fillOpacity=".12" />
      {Array.from({ length: stars }, (_, index) => <circle key={index} cx={40 + (index - (stars - 1) / 2) * 6} cy="60" r="1.6" fill="white" />)}
    </svg>
    <Icon className="relative -mt-1 h-[36%] w-[36%] text-white" strokeWidth={1.8} />
  </span>;
}
