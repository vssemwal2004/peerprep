import { levelTheme } from './levelTheme';

/**
 * Round gradient medallion for a learner level (1–12). Elite levels (8–12) get a gold ring and a
 * soft inner shine so they read as a step above.
 */
export default function LevelMedallion({ level, size = 'md', className = '' }) {
  const theme = levelTheme(level);
  const { Icon } = theme;
  const elite = Number(level) >= 8;
  const sizes = {
    sm: 'h-9 w-9 [&>svg]:h-4 [&>svg]:w-4',
    md: 'h-14 w-14 [&>svg]:h-6 [&>svg]:w-6',
    lg: 'h-24 w-24 [&>svg]:h-11 [&>svg]:w-11',
  };
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br text-white shadow-lg ring-4 ${elite ? 'ring-amber-300/90 dark:ring-amber-400/60' : 'ring-white/70 dark:ring-white/10'} ${theme.gradient} ${theme.glow} ${sizes[size] || sizes.md} ${className}`}
      aria-hidden="true"
    >
      {elite ? <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" /> : null}
      <Icon className="relative" />
    </span>
  );
}
