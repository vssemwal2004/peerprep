import { useId } from 'react';
import { badgeLook, DARK_TIER_METAL, TIER_METAL } from './badgeLooks';

// Each monthly badge has its own emblem: a shape, a colour and an icon (badgeLooks.js). The tier
// (Bronze … Legend) is the metal ring around it and the level is the small pip. Level 0 = locked (grey).

function burst(points = 12, outer = 30, inner = 25.5) {
  return Array.from({ length: points * 2 }, (_, index) => {
    const radius = index % 2 ? inner : outer;
    const angle = (Math.PI * index) / points - Math.PI / 2;
    return `${(32 + Math.cos(angle) * radius).toFixed(2)},${(32 + Math.sin(angle) * radius).toFixed(2)}`;
  }).join(' ');
}

function Shape({ shape, ...props }) {
  switch (shape) {
    case 'hexagon': return <polygon points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5" strokeLinejoin="round" {...props} />;
    case 'diamond': return <polygon points="32,3 61,32 32,61 3,32" strokeLinejoin="round" {...props} />;
    case 'shield': return <path d="M32 3 L56 11 V30 C56 45 45 55 32 61 C19 55 8 45 8 30 V11 Z" strokeLinejoin="round" {...props} />;
    case 'squircle': return <rect x="5" y="5" width="54" height="54" rx="17" {...props} />;
    case 'burst': return <polygon points={burst()} strokeLinejoin="round" {...props} />;
    default: return <circle cx="32" cy="32" r="28.5" {...props} />;
  }
}

/** The emblem for one monthly badge at a level (0 = locked). */
export default function MonthlyBadgeEmblem({ track, level = 0, tier, size = 64, title }) {
  const id = useId().replace(/:/g, '');
  const look = badgeLook(track);
  const locked = !level;
  const metal = locked ? null : TIER_METAL[tier] || TIER_METAL.Bronze;
  const { Icon } = look;
  return <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} role="img" aria-label={title || (locked ? 'Locked badge' : `Level ${level} ${tier}`)}>
    <svg viewBox="0 0 64 64" width={size} height={size} className={`dark:brightness-[0.94] dark:saturate-[0.88] ${locked ? 'opacity-90' : 'drop-shadow-[0_6px_10px_rgba(15,23,42,0.18)]'}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={locked ? '#e2e8f0' : look.from} />
          <stop offset="100%" stopColor={locked ? '#94a3b8' : look.to} />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <Shape shape={look.shape} fill={`url(#${id}-fill)`} stroke={metal || '#cbd5e1'} strokeWidth={metal ? 3 : 2} className={locked ? 'dark:[stroke:#3f3f46]' : ''} />
      <Shape shape={look.shape} fill={`url(#${id}-shine)`} stroke="none" />
    </svg>
    <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <Icon className={locked ? 'text-white/80' : 'text-white drop-shadow'} style={{ width: size * 0.36, height: size * 0.36 }} strokeWidth={2.25} />
    </span>
    {!locked && <span className="absolute -bottom-1 -right-1 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[color:var(--badge-metal)] px-1 text-[11px] font-black text-white ring-2 ring-white dark:bg-[color:var(--badge-metal-dark)] dark:ring-[#242424]"
      style={{ '--badge-metal': metal, '--badge-metal-dark': DARK_TIER_METAL[tier] || DARK_TIER_METAL.Bronze }} aria-hidden="true">{level}</span>}
  </span>;
}
