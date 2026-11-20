// Prep Mock's own duotone glyphs (same drawing rules as the Prep Mates set: currentColor plus a softer
// layer), on Prep Mock's violet-to-indigo tiles: the page's accent, so it reads as its own place.

const Svg = ({ children, className = 'h-5 w-5' }) => <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;

export const TowerGlyph = (props) => <Svg {...props}>
  <rect x="3.5" y="9" width="7" height="12" rx="1.4" fill="currentColor" opacity=".45" />
  <rect x="9.5" y="3" width="11" height="18" rx="1.6" fill="currentColor" />
  <path d="M12.8 7h1.6M16.2 7h1.6M12.8 10.5h1.6M16.2 10.5h1.6M12.8 14h1.6M16.2 14h1.6" stroke="white" strokeWidth="1.5" opacity=".85" />
</Svg>;

export const TicketGlyph = (props) => <Svg {...props}>
  <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5V14a2 2 0 0 0 0-4Z" fill="currentColor" opacity=".45" />
  <path d="M15 6.5v11" stroke="currentColor" strokeWidth="1.6" strokeDasharray="1.6 2" />
  <path d="m7 12 1.6 1.6L11.5 10.5" stroke="currentColor" strokeWidth="2" />
</Svg>;

export const PathGlyph = (props) => <Svg {...props}>
  <path d="M5 19.5c3.5 0 3-5.5 7-5.5s3.5-5 7-5" stroke="currentColor" strokeWidth="2" opacity=".5" strokeDasharray="0.1 3.2" />
  <circle cx="5" cy="19.5" r="2" fill="currentColor" opacity=".55" />
  <path d="M17.5 3v7.5" stroke="currentColor" strokeWidth="1.8" />
  <path d="M17.5 3.5h4l-1.2 1.8 1.2 1.8h-4Z" fill="currentColor" />
</Svg>;

export const SparkGlyph = (props) => <Svg {...props}>
  <circle cx="12" cy="12" r="9" fill="currentColor" opacity=".3" />
  <path d="M12 5.5 13.6 10l4.4 2-4.4 2L12 18.5 10.4 14 6 12l4.4-2Z" fill="currentColor" />
</Svg>;

export const StopwatchGlyph = (props) => <Svg {...props}>
  <circle cx="12" cy="13.5" r="7.5" fill="currentColor" opacity=".4" />
  <path d="M12 13.5V9.5M9.5 2.8h5M12 2.8V6M18.6 6.4l1.4-1.4" stroke="currentColor" strokeWidth="2" />
</Svg>;

const TILE_TONES = {
  violet: 'from-violet-500 to-indigo-600 shadow-indigo-500/30',
  emerald: 'from-emerald-400 to-teal-600 shadow-emerald-500/30',
  sky: 'from-sky-500 to-indigo-500 shadow-sky-500/30',
  amber: 'from-amber-400 to-orange-500 shadow-orange-500/30',
};

export function GlyphTile({ glyph: Glyph, tone = 'violet', size = 'md' }) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-[10px]' : 'h-10 w-10 rounded-xl';
  return <span className={`flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-lg ${box} ${TILE_TONES[tone] || TILE_TONES.violet}`} aria-hidden="true">
    <Glyph className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
  </span>;
}

/** Section title: glyph tile, title, optional subtitle, ⓘ and a trailing action. */
export function PanelTitle({ id, glyph, tone, title, subtitle, info = null, action = null }) {
  return <header className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-3">
      <GlyphTile glyph={glyph} tone={tone} />
      <div className="min-w-0">
        <h2 id={id} className="flex min-w-0 items-center gap-1.5 text-[16px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-zinc-50"><span className="truncate">{title}</span>{info}</h2>
        {subtitle && <p className="truncate text-[12.5px] text-slate-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
    </div>
    {action}
  </header>;
}
