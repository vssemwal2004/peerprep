import { levelTheme } from './levelTheme';

/** Round gradient medallion for a learner level (1-6). */
export default function LevelMedallion({ level, size = 'md', className = '' }) {
  const theme = levelTheme(level);
  const { Icon } = theme;
  const sizes = {
    sm: 'h-9 w-9 [&>svg]:h-4 [&>svg]:w-4',
    md: 'h-14 w-14 [&>svg]:h-6 [&>svg]:w-6',
    lg: 'h-24 w-24 [&>svg]:h-11 [&>svg]:w-11',
  };
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-lg ring-4 ring-white/70 dark:ring-white/10 ${theme.gradient} ${theme.glow} ${sizes[size] || sizes.md} ${className}`}
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}
