import { useState } from 'react';

// A company's logo on a fixed-size white tile (no layout shift while it loads), or a coloured
// initial when there is no logo or the image fails to load.

const TONES = [
  'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
];
const companyTone = (name) => TONES[[...String(name || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % TONES.length];
const companyInitial = (name) => String(name || '').trim().charAt(0).toUpperCase() || '?';

const SIZES = {
  xs: { box: 'h-5 w-5 rounded-md', pad: 'p-[2px]', text: 'text-[10px]' },
  sm: { box: 'h-6 w-6 rounded-md', pad: 'p-[3px]', text: 'text-[11px]' },
  md: { box: 'h-8 w-8 rounded-lg', pad: 'p-1', text: 'text-xs' },
  lg: { box: 'h-10 w-10 rounded-xl', pad: 'p-1.5', text: 'text-sm' },
  xl: { box: 'h-12 w-12 rounded-xl', pad: 'p-1.5', text: 'text-base' },
  '2xl': { box: 'h-14 w-14 rounded-2xl', pad: 'p-2', text: 'text-lg' },
};

/**
 * @param {{ name: string, logo?: { url?: string } | null, size?: keyof SIZES, round?: boolean, className?: string }} props
 * `round` draws a circle (chips); decorative by default (the company name is always shown beside it).
 */
export default function CompanyLogo({ name, logo, size = 'md', round = false, className = '', label }) {
  const [failedUrl, setFailedUrl] = useState('');
  const url = logo?.url || '';
  const { box, pad, text } = SIZES[size] || SIZES.md;
  const shape = round ? `${box.split(' ').filter((part) => !part.startsWith('rounded')).join(' ')} rounded-full` : box;
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  if (url && failedUrl !== url) {
    return (
      <span {...a11y} className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-inset ring-slate-200/90 dark:ring-white/10 ${shape} ${pad} ${className}`}>
        <img src={url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailedUrl(url)} className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span {...a11y} className={`inline-flex shrink-0 select-none items-center justify-center font-bold ${shape} ${text} ${companyTone(name)} ${className}`}>
      {companyInitial(name)}
    </span>
  );
}
