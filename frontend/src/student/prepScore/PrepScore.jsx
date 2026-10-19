import { formatScore } from './formatScore';

const VALUE_SIZES = {
  sm: 'text-[13px]',
  md: 'text-[18px]',
  lg: 'text-[28px]',
};

/** A neutral numeric score. Students see only this number, never how it is calculated. */
export function ScoreValue({ value, size = 'md', label = 'Prep Score' }) {
  const text = VALUE_SIZES[size] || VALUE_SIZES.md;
  return (
    <span className={`${text} font-bold leading-none tracking-[-0.02em] tabular-nums text-slate-950 dark:text-zinc-50`} aria-label={`${label} ${formatScore(value)}`}>
      {formatScore(value)}
    </span>
  );
}
