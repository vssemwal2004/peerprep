// Prep Mates' own glyph set: duotone, drawn for PeerPrep (not stock icons). Each glyph draws in
// currentColor with a softer second layer, and sits on a warm gradient tile in section titles.

const Svg = ({ children, className = 'h-5 w-5' }) => <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;

export const MatesGlyph = (props) => <Svg {...props}>
  <circle cx="15.5" cy="8" r="3.2" fill="currentColor" opacity=".45" />
  <path d="M10.5 19.5c.5-3.3 2.6-5.3 5-5.3s4.6 2 5 5.3" fill="currentColor" opacity=".45" />
  <circle cx="8.5" cy="9" r="3.6" fill="currentColor" />
  <path d="M2.8 20.5c.5-3.8 3-6.1 5.7-6.1s5.2 2.3 5.7 6.1Z" fill="currentColor" />
</Svg>;

export const DuelGlyph = (props) => <Svg {...props}>
  <rect x="3.5" y="9" width="5" height="11.5" rx="1.6" fill="currentColor" />
  <rect x="15.5" y="4" width="5" height="16.5" rx="1.6" fill="currentColor" opacity=".5" />
  <path d="m13 3.5-2.6 5h3.2L11 13.5" stroke="currentColor" strokeWidth="1.8" />
</Svg>;

export const CrestGlyph = (props) => <Svg {...props}>
  <path d="M12 2.8 19.5 6v5.4c0 4.6-3.2 8.4-7.5 9.8-4.3-1.4-7.5-5.2-7.5-9.8V6Z" fill="currentColor" opacity=".45" />
  <path d="m12 7.2 1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5Z" fill="currentColor" />
</Svg>;

export const PulseGlyph = (props) => <Svg {...props}>
  <circle cx="12" cy="12" r="9" fill="currentColor" opacity=".3" />
  <path d="M4.5 12.5h3.2l1.8-4 3 8 2.2-5.5 1.2 1.5h3.6" stroke="currentColor" strokeWidth="2" />
</Svg>;

export const InviteGlyph = (props) => <Svg {...props}>
  <rect x="2.8" y="5.5" width="15" height="12" rx="2.5" fill="currentColor" opacity=".45" />
  <path d="m3.5 7 6.8 5 6.8-5" stroke="currentColor" strokeWidth="1.8" />
  <circle cx="18.2" cy="17" r="3.6" fill="currentColor" />
  <path d="M18.2 15.3v3.4M16.5 17h3.4" stroke="white" strokeWidth="1.5" />
</Svg>;

export const TrendGlyph = (props) => <Svg {...props}>
  <rect x="3.5" y="13" width="3.6" height="7.5" rx="1.2" fill="currentColor" opacity=".45" />
  <rect x="10.2" y="10" width="3.6" height="10.5" rx="1.2" fill="currentColor" opacity=".45" />
  <rect x="16.9" y="6.5" width="3.6" height="14" rx="1.2" fill="currentColor" opacity=".45" />
  <path d="m3.5 10 6.5-4.5 4 2.5 6.5-5" stroke="currentColor" strokeWidth="2" />
</Svg>;

export const SpectrumGlyph = (props) => <Svg {...props}>
  <path d="M3 20.5h18" stroke="currentColor" strokeWidth="1.6" opacity=".5" />
  <rect x="4" y="13" width="3" height="6" rx="1" fill="currentColor" opacity=".45" />
  <rect x="8.5" y="7" width="3" height="12" rx="1" fill="currentColor" opacity=".45" />
  <rect x="13" y="4" width="3" height="15" rx="1" fill="currentColor" />
  <rect x="17.5" y="10.5" width="3" height="8.5" rx="1" fill="currentColor" opacity=".45" />
</Svg>;

export const LadderGlyph = (props) => <Svg {...props}>
  <rect x="3" y="14" width="5.5" height="6.5" rx="1.2" fill="currentColor" opacity=".45" />
  <rect x="9.25" y="9" width="5.5" height="11.5" rx="1.2" fill="currentColor" />
  <rect x="15.5" y="11.5" width="5.5" height="9" rx="1.2" fill="currentColor" opacity=".45" />
  <path d="M12 3.5v3M10.5 5h3" stroke="currentColor" strokeWidth="1.6" />
</Svg>;

export const TargetGlyph = (props) => <Svg {...props}>
  <circle cx="11" cy="13" r="8" fill="currentColor" opacity=".3" />
  <circle cx="11" cy="13" r="4.6" fill="currentColor" opacity=".55" />
  <circle cx="11" cy="13" r="1.6" fill="currentColor" />
  <path d="m11 13 8.5-8.5M16.5 4.5h3v3" stroke="currentColor" strokeWidth="1.8" />
</Svg>;

export const HiveGlyph = (props) => <Svg {...props}>
  <path d="m8 3 4 2.3v4.6L8 12.2 4 9.9V5.3Z" fill="currentColor" />
  <path d="m16 3 4 2.3v4.6l-4 2.3-4-2.3V5.3Z" fill="currentColor" opacity=".45" />
  <path d="m12 11.8 4 2.3v4.6l-4 2.3-4-2.3v-4.6Z" fill="currentColor" opacity=".7" />
</Svg>;

export const GridGlyph = (props) => <Svg {...props}>
  {[0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => <rect key={`${row}${col}`} x={3.5 + col * 6} y={3.5 + row * 6} width="4.6" height="4.6" rx="1.2" fill="currentColor" opacity={(row + col) % 2 ? 0.4 : 1} />))}
</Svg>;

export const MedalGlyph = (props) => <Svg {...props}>
  <path d="M7.5 2.8h3.5l2 5H9.5ZM16.5 2.8H13l-2 5h3.5Z" fill="currentColor" opacity=".45" />
  <circle cx="12" cy="14.5" r="6.5" fill="currentColor" />
  <path d="m12 11.2 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3Z" fill="white" opacity=".85" />
</Svg>;

export const SparkGlyph = (props) => <Svg {...props}>
  <path d="M12 2.8c.9 4.6 2.6 6.3 7.2 7.2-4.6.9-6.3 2.6-7.2 7.2-.9-4.6-2.6-6.3-7.2-7.2 4.6-.9 6.3-2.6 7.2-7.2Z" fill="currentColor" />
  <path d="M18.5 15.5c.4 1.9 1 2.5 2.9 2.9-1.9.4-2.5 1-2.9 2.9-.4-1.9-1-2.5-2.9-2.9 1.9-.4 2.5-1 2.9-2.9Z" fill="currentColor" opacity=".5" />
</Svg>;

export const PingGlyph = (props) => <Svg {...props}>
  <path d="M13.5 2.5 5 13.2h6l-1.5 8.3 8.5-10.7h-6Z" fill="currentColor" />
</Svg>;

export const CompassGlyph = (props) => <Svg {...props}>
  <circle cx="12" cy="12" r="9" fill="currentColor" opacity=".3" />
  <path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4Z" fill="currentColor" />
</Svg>;

/** Small flame for a streak in lists; lit when the streak is alive. */
export function MiniFlame({ lit, className = 'h-4 w-3.5' }) {
  return <svg viewBox="0 0 20 24" className={className} aria-hidden="true">
    <path d="M10 1.5c1.7 4 7 7 7 13.6 0 4.6-3.2 7.4-7 7.4s-7-2.8-7-7.4c0-3.3 1.8-5.6 3.4-7.4.3 2.4 1.3 3.9 2.6 4.5C8.2 8.4 8.7 4.5 10 1.5Z"
      className={lit ? 'fill-orange-500' : 'fill-none stroke-slate-300 dark:stroke-zinc-600'} strokeWidth="1.6" strokeDasharray={lit ? undefined : '2.5 2'} />
    {lit && <path d="M10.2 11.5c1 2.4 3.3 3.8 3.3 6.7 0 2.2-1.5 3.4-3.4 3.4s-3.4-1.2-3.4-3.2c0-1.9 1.4-3 2.2-4.2.4 1.4 1 2 1.6 2.2-.5-1.7-.6-3.4-.3-4.9Z" className="fill-amber-200" />}
  </svg>;
}

// Warm gradient tiles: each section has its own colour so the page reads at a glance.
const TILE_TONES = {
  sky: 'from-sky-500 to-indigo-500 shadow-sky-500/30',
  amber: 'from-amber-400 to-orange-500 shadow-orange-500/30',
  emerald: 'from-emerald-400 to-teal-600 shadow-emerald-500/30',
  violet: 'from-violet-500 to-fuchsia-500 shadow-fuchsia-500/30',
  rose: 'from-rose-500 to-orange-400 shadow-rose-500/30',
  ink: 'from-zinc-700 to-zinc-900 shadow-zinc-900/30 dark:from-zinc-200 dark:to-zinc-400 dark:text-zinc-900',
};

export function GlyphTile({ glyph: Glyph, tone = 'sky', size = 'md' }) {
  const box = size === 'lg' ? 'h-12 w-12 rounded-2xl' : size === 'sm' ? 'h-8 w-8 rounded-[10px]' : 'h-10 w-10 rounded-xl';
  const icon = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return <span className={`flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-lg ${box} ${TILE_TONES[tone] || TILE_TONES.sky}`} aria-hidden="true">
    <Glyph className={icon} />
  </span>;
}

/** Section heading: gradient glyph tile, title, optional one-line subtitle and an action slot. */
export function PanelTitle({ id, glyph, tone, title, subtitle, action, info = null }) {
  return <header className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-3">
      <GlyphTile glyph={glyph} tone={tone} />
      <div className="min-w-0">
        <h2 id={id} className="truncate text-[16px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-zinc-50">{title}</h2>
        {subtitle && <p className="truncate text-[12.5px] text-slate-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
      {info}
    </div>
    {action}
  </header>;
}
