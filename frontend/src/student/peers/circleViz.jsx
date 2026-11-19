// Series colours, everywhere in Prep Mates, in this fixed order (never cycled): YOU (PeerPrep sky),
// YOUR PREP MATE (amber), then up to two circle leaders (teal, purple). The four pass the palette
// checks (lightness, chroma, CVD separation, contrast) on the light (#ffffff) and the dark (#242424)
// card surfaces, so the same values are used in both themes.
export const YOU_COLOR = '#0284c7';
export const MATE_COLOR = '#d97706';
// The two circle-leader colours live in circleMath.js (OTHER_COLORS).

export function Swatch({ color, label }) {
  return <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-zinc-300">
    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />{label}
  </span>;
}

/** Legend for the two series; always shown with a two-series chart. */
export function DuelLegend({ youLabel = 'You', mateLabel }) {
  return <div className="flex flex-wrap items-center gap-4"><Swatch color={YOU_COLOR} label={youLabel} /><Swatch color={MATE_COLOR} label={mateLabel} /></div>;
}
