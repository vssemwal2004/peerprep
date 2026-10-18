/** A Prep Score as "1,234.5" (one decimal at most, never negative). */
export function formatScore(value) {
  const number = Number(value);
  return (Number.isFinite(number) ? Math.max(0, number) : 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
}
