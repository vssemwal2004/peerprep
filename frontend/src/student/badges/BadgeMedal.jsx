import { useId } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { Lock } from 'lucide-react';
import { TIER_METALS } from './badgeModel';

// One medal for every badge (badgeModel.js item): ribbon tails, a metal rim in the tier's colours,
// the badge's own face colour and icon, and an optional label banner ("50", "Lv 3").
// Locked = the same medal in grey with a padlock, so students can see what they are working toward.

const LOCK_RIM = ['#eef2f7', '#a3b1c2'];
const LOCK_FACE = ['#f8fafc', '#cbd5e1'];

function burst(points, outer, inner) {
  return Array.from({ length: points * 2 }, (_, index) => {
    const radius = index % 2 ? inner : outer;
    const angle = (Math.PI * index) / points - Math.PI / 2;
    return `${(32 + Math.cos(angle) * radius).toFixed(2)},${(32 + Math.sin(angle) * radius).toFixed(2)}`;
  }).join(' ');
}

/** Body shapes in a 64×64 box centred on (32, 32). */
function Shape({ shape, ...props }) {
  switch (shape) {
    case 'hexagon': return <polygon points="32,1 59,16.5 59,47.5 32,63 5,47.5 5,16.5" strokeLinejoin="round" {...props} />;
    case 'diamond': return <polygon points="32,0 64,32 32,64 0,32" strokeLinejoin="round" {...props} />;
    case 'shield': return <path d="M32 1 L58 9.5 V30 C58 46 46 57 32 63.5 C18 57 6 46 6 30 V9.5 Z" strokeLinejoin="round" {...props} />;
    case 'squircle': return <rect x="3" y="3" width="58" height="58" rx="19" {...props} />;
    case 'burst': return <polygon points={burst(12, 32, 27.5)} strokeLinejoin="round" {...props} />;
    case 'rosette': return <polygon points={burst(16, 32, 29)} strokeLinejoin="round" {...props} />;
    default: return <circle cx="32" cy="32" r="31" {...props} />;
  }
}

const INNER = 'translate(32 32) scale(0.8) translate(-32 -32)';
const RING = 'translate(32 32) scale(0.68) translate(-32 -32)';

/**
 * @param {{ badge: object, size?: number, interactive?: boolean, shine?: boolean, className?: string, title?: string }} props
 *  interactive: 3D tilt toward the pointer and a light sweep on hover (earned badges only).
 *  shine: a repeating light sweep (celebration).
 */
export default function BadgeMedal({ badge, size = 56, interactive = false, shine = false, className = '', title }) {
  const raw = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const locked = !badge?.earned;
  const look = badge?.look || {};
  const [rimFrom, rimTo] = locked ? LOCK_RIM : TIER_METALS[badge?.tier] || TIER_METALS.Bronze;
  const [faceFrom, faceTo] = locked ? LOCK_FACE : [look.from || '#38bdf8', look.to || '#0369a1'];
  const Icon = look.Icon;
  const height = Math.round((size * 92) / 80);
  const tilt = interactive && !locked && !reduce;

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-22, 22]), { stiffness: 220, damping: 18 });
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [18, -18]), { stiffness: 220, damping: 18 });
  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - box.left) / box.width - 0.5);
    pointerY.set((event.clientY - box.top) / box.height - 0.5);
  };
  const onLeave = () => { pointerX.set(0); pointerY.set(0); };

  // The banner text is unreadable on small medals, so it shows from 44px up.
  const label = badge?.label && size >= 44 ? String(badge.label) : '';
  const bannerWidth = Math.max(20, label.length * 5.6 + 10);

  return (
    <motion.span
      role="img"
      aria-label={title || `${badge?.title || 'Badge'}${locked ? ', locked' : ''}`}
      className={`group/medal relative inline-flex shrink-0 select-none ${className}`}
      style={{ width: size, height, transformPerspective: 500, rotateX: tilt ? rotateX : 0, rotateY: tilt ? rotateY : 0 }}
      onPointerMove={tilt ? onMove : undefined}
      onPointerLeave={tilt ? onLeave : undefined}
    >
      <svg viewBox="0 0 80 92" width={size} height={height} aria-hidden="true"
        className={`overflow-visible ${locked ? 'dark:brightness-[0.42] dark:contrast-[1.15]' : 'drop-shadow-[0_8px_14px_rgba(15,23,42,0.22)]'}`}>
        <defs>
          <linearGradient id={`${raw}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={rimFrom} />
            <stop offset="48%" stopColor={rimTo} />
            <stop offset="72%" stopColor={rimFrom} />
            <stop offset="100%" stopColor={rimTo} />
          </linearGradient>
          <linearGradient id={`${raw}-face`} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor={faceFrom} />
            <stop offset="100%" stopColor={faceTo} />
          </linearGradient>
          <linearGradient id={`${raw}-gloss`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity={locked ? 0.7 : 0.5} />
            <stop offset="50%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${raw}-sheen`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${raw}-clip`}><g transform="translate(8 5)"><Shape shape={look.shape} /></g></clipPath>
        </defs>

        {/* Ribbon tails */}
        <path d="M27 58 L18 88 L28.5 82 L35.5 91 L40 64 Z" fill={locked ? '#cbd5e1' : faceTo} />
        <path d="M53 58 L62 88 L51.5 82 L44.5 91 L40 64 Z" fill={locked ? '#b6c2d1' : faceFrom} />
        <path d="M27 58 L18 88 L28.5 82 L35.5 91 L40 64 Z" fill="#000" opacity={locked ? 0.04 : 0.18} />

        <g transform="translate(8 5)">
          {/* Metal rim, face, inner ring, gloss */}
          <Shape shape={look.shape} fill={`url(#${raw}-rim)`} />
          <Shape shape={look.shape} fill={`url(#${raw}-face)`} transform={INNER} />
          <Shape shape={look.shape} fill="none" stroke="#fff" strokeOpacity={locked ? 0.9 : 0.4} strokeWidth="1.2" strokeDasharray={locked ? '2.5 2.5' : undefined} transform={RING} />
          <Shape shape={look.shape} fill={`url(#${raw}-gloss)`} transform={INNER} />
        </g>

        {/* Light sweep: on hover for earned badges, looping in the celebration */}
        {!locked && (interactive || shine) && !reduce ? (
          <g clipPath={`url(#${raw}-clip)`}>
            <g transform="skewX(-18)">
              {shine
                ? <motion.rect y="-10" width="18" height="110" fill={`url(#${raw}-sheen)`}
                  initial={{ x: -10 }} animate={{ x: 130 }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }} />
                : <rect x="-10" y="-10" width="18" height="110" fill={`url(#${raw}-sheen)`}
                  className="translate-x-0 transition-transform duration-700 ease-out group-hover/medal:translate-x-[140px]" />}
            </g>
          </g>
        ) : null}

        {/* Label banner ("50", "Lv 3") */}
        {label ? (
          <g>
            <rect x={40 - bannerWidth / 2} y="55" width={bannerWidth} height="12" rx="6" fill={locked ? '#94a3b8' : rimTo} stroke="#fff" strokeOpacity="0.85" strokeWidth="1" />
            <text x="40" y="63.6" textAnchor="middle" fontSize="7.6" fontWeight="800" fill="#fff" fontFamily="Inter, ui-sans-serif, system-ui, sans-serif" letterSpacing="0.2">{label}</text>
          </g>
        ) : null}
      </svg>

      {Icon ? (
        <span className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={{ top: `${label ? 37 : 40}%` }} aria-hidden="true">
          <Icon className={locked ? 'text-slate-400/90 dark:text-zinc-500' : 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]'} style={{ width: size * 0.3, height: size * 0.3 }} strokeWidth={2.2} />
        </span>
      ) : null}

      {locked ? (
        <span className="absolute flex items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-700"
          style={{ width: Math.max(14, size * 0.3), height: Math.max(14, size * 0.3), right: size * 0.04, top: size * 0.62 }} aria-hidden="true">
          <Lock className="text-slate-500 dark:text-zinc-400" style={{ width: Math.max(8, size * 0.15), height: Math.max(8, size * 0.15) }} strokeWidth={2.4} />
        </span>
      ) : null}
    </motion.span>
  );
}
