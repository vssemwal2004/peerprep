import { useId, useState } from 'react';
import { BookOpen, ChevronDown, ClipboardCheck, Code2, MessagesSquare } from 'lucide-react';

// Prep Score: each feature scored 0-100 from the student's own work, and an
// overall Prep Score that is the average of the features their university has
// turned on. The formula lives in backend/src/services/prepScores.js.
const FEATURES = [
  { key: 'coding', label: 'Prep Coding', Icon: Code2 },
  { key: 'learning', label: 'Prep Learning', Icon: BookOpen },
  { key: 'interview', label: 'Prep Interview', Icon: MessagesSquare },
  { key: 'assessment', label: 'Prep Assessment', Icon: ClipboardCheck },
];

const bounded = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 0;
};
const oneDecimal = (value) => bounded(value).toLocaleString(undefined, { maximumFractionDigits: 1 });

/** A small ring showing a 0-100 score. */
export function ScoreRing({ value, size = 44, stroke = 5, label = 'Prep Score' }) {
  const score = bounded(value);
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label} ${oneDecimal(score)} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-100 dark:stroke-white/[0.08]" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round" className="stroke-sky-500 transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
          strokeDasharray={length} strokeDashoffset={length * (1 - score / 100)} />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums text-slate-900 dark:text-zinc-50" aria-hidden="true">{Math.round(score)}</span>
    </span>
  );
}

/** "73.5 / 100". */
export function ScoreValue({ value, size = 'md' }) {
  const text = { sm: 'text-[13px]', md: 'text-[17px]', lg: 'text-[26px]' }[size] || 'text-[17px]';
  return (
    <span className="inline-flex items-baseline gap-1 tabular-nums">
      <span className={`${text} font-bold leading-none tracking-[-0.02em] text-slate-950 dark:text-zinc-50`}>{oneDecimal(value)}</span>
      <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">/ 100</span>
    </span>
  );
}

/** Each licensed feature's score out of 100, with (on request) what it is made of. */
export function PrepScoreBreakdown({ prepScore, className = '' }) {
  const [open, setOpen] = useState(null);
  const baseId = useId();
  const features = FEATURES.filter((feature) => prepScore?.features?.[feature.key]);
  if (!features.length) return null;
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {features.map(({ key, label, Icon }) => {
        const feature = prepScore.features[key];
        const score = bounded(feature.score);
        const parts = feature.parts || [];
        const expanded = open === key;
        const panelId = `${baseId}-${key}`;
        return (
          <li key={key}>
            <button type="button" onClick={() => setOpen(expanded ? null : key)} aria-expanded={expanded} aria-controls={panelId} disabled={!parts.length}
              className="group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors enabled:hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-default dark:enabled:hover:bg-white/[0.04]">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate font-medium text-slate-700 dark:text-zinc-200">{label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{oneDecimal(score)}<span className="font-normal text-slate-500 dark:text-zinc-400"> / 100</span></span>
                </span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.08]">
                  <span className="block h-full rounded-full bg-sky-500 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${score}%` }} />
                </span>
              </span>
              {parts.length > 0 && <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />}
            </button>
            {expanded && (
              <ul id={panelId} className="mb-1 ml-10 mt-0.5 space-y-0.5 text-[11.5px] text-slate-600 dark:text-zinc-400">
                {parts.map((part) => (
                  <li key={part.key} className="flex justify-between gap-2">
                    <span className="truncate">{part.label}</span>
                    <span className="shrink-0 font-semibold text-slate-800 dark:text-zinc-200">{part.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
