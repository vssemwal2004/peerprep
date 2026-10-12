// One difficulty palette across charts, tables and cards. Bright accents follow the
// reference artwork; darker text variants keep small labels readable on light surfaces.
export const DIFFICULTY_THEME = Object.freeze({
  Easy: Object.freeze({ short: 'Easy', color: '#10b981', stroke: '#10b981', text: 'difficulty-easy difficulty-text', pill: 'difficulty-easy difficulty-pill', bar: 'difficulty-easy difficulty-fill', rail: 'difficulty-easy difficulty-fill', dot: 'difficulty-easy difficulty-fill' }),
  Medium: Object.freeze({ short: 'Medium', color: '#f97316', stroke: '#f97316', text: 'difficulty-medium difficulty-text', pill: 'difficulty-medium difficulty-pill', bar: 'difficulty-medium difficulty-fill', rail: 'difficulty-medium difficulty-fill', dot: 'difficulty-medium difficulty-fill' }),
  Hard: Object.freeze({ short: 'Hard', color: '#f43f5e', stroke: '#f43f5e', text: 'difficulty-hard difficulty-text', pill: 'difficulty-hard difficulty-pill', bar: 'difficulty-hard difficulty-fill', rail: 'difficulty-hard difficulty-fill', dot: 'difficulty-hard difficulty-fill' }),
});

const UNKNOWN = Object.freeze({ color: '#94a3b8', text: 'difficulty-neutral difficulty-text', pill: 'difficulty-neutral difficulty-pill', bar: 'difficulty-neutral difficulty-fill' });
export function difficultyTheme(value) {
  const key = String(value || '').trim().toLowerCase();
  return DIFFICULTY_THEME[{ easy: 'Easy', medium: 'Medium', hard: 'Hard', 'easy-medium': 'Medium', 'medium-hard': 'Hard' }[key]] || UNKNOWN;
}
