// Two series only, everywhere in Prep Mates: YOU (PeerPrep sky) and YOUR PREP MATE (amber).
// sky-600 / amber-600 pass the palette checks (lightness, CVD and contrast) on both the light
// (#ffffff) and dark (#262626) card surfaces, so the same pair is used in both themes.
export const YOU_COLOR = '#0284c7';
export const MATE_COLOR = '#d97706';

export function Swatch({ color, label }) {
  return <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-zinc-300">
    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />{label}
  </span>;
}

/** Legend for the two series; always shown with a two-series chart. */
export function DuelLegend({ youLabel = 'You', mateLabel }) {
  return <div className="flex flex-wrap items-center gap-4"><Swatch color={YOU_COLOR} label={youLabel} /><Swatch color={MATE_COLOR} label={mateLabel} /></div>;
}
