import { useId, useState } from 'react';
import { BookOpen, ChevronDown, ClipboardCheck, Code2, MessagesSquare } from 'lucide-react';
import { formatScore } from './formatScore';

// Prep Score: each feature scores work points x quality from the student's own
// work, and the Prep Score is the average of the features their university has
// turned on. There is no ceiling. The formula and the wording of every step come
// from backend/src/services/prepScores.js, so the page never re-implements it.
const FEATURES = [
  { key: 'coding', label: 'Prep Coding', Icon: Code2 },
  { key: 'learning', label: 'Prep Learning', Icon: BookOpen },
  { key: 'interview', label: 'Prep Interview', Icon: MessagesSquare },
  { key: 'assessment', label: 'Prep Assessment', Icon: ClipboardCheck },
];


const COIN_FACE = {
  background: 'radial-gradient(circle at 34% 28%, #fffbeb 0%, #fde68a 18%, #fbbf24 45%, #f59e0b 72%, #b45309 100%)',
  boxShadow: 'inset 0 0 0 1px #d97706, inset 0 -2px 3px rgb(120 53 15 / .4), inset 0 1px 2px rgb(255 255 255 / .6), 0 1px 2px rgb(120 53 15 / .3)',
};
const COIN_RING = {
  inset: '13%',
  background: 'radial-gradient(circle at 62% 72%, #f59e0b, #fbbf24 55%, #fde68a)',
  boxShadow: 'inset 0 1px 2px rgb(120 53 15 / .45), inset 0 -1px 1px rgb(255 251 235 / .7)',
};
const COIN_MARK = {
  width: '60%',
  height: '60%',
  background: 'linear-gradient(150deg, #fef3c7 0%, #f59e0b 30%, #92400e 68%, #b45309 100%)',
  WebkitMask: 'url(/images/peerprep-mark.png) center / contain no-repeat',
  mask: 'url(/images/peerprep-mark.png) center / contain no-repeat',
};

/** The gold PeerPrep coin that stands for the Prep Score (decorative). */
export function PrepCoin({ size = 20, className = '' }) {
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${className}`} style={{ width: size, height: size, ...COIN_FACE }}>
      <span className="absolute rounded-full" style={COIN_RING} />
      <span className="relative" style={COIN_MARK} />
    </span>
  );
}

const VALUE_SIZES = {
  sm: { coin: 16, text: 'text-[13px]' },
  md: { coin: 20, text: 'text-[18px]' },
  lg: { coin: 30, text: 'text-[28px]' },
};

/** Coin + "1,234.5". */
export function ScoreValue({ value, size = 'md', label = 'Prep Score' }) {
  const { coin, text } = VALUE_SIZES[size] || VALUE_SIZES.md;
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums" aria-label={`${label} ${formatScore(value)}`}>
      <PrepCoin size={coin} />
      <span className={`${text} font-bold leading-none tracking-[-0.02em] text-slate-950 dark:text-zinc-50`} aria-hidden="true">{formatScore(value)}</span>
    </span>
  );
}

const Chip = ({ value, caption, strong = false }) => (
  <span className={`inline-flex flex-col items-center rounded-lg px-2 py-1 leading-none ${strong ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-900 dark:bg-white/[0.06] dark:text-zinc-100'}`}>
    <span className="text-[12.5px] font-bold tabular-nums">{value}</span>
    <span className={`mt-0.5 text-[9.5px] font-medium ${strong ? 'text-sky-100' : 'text-slate-500 dark:text-zinc-400'}`}>{caption}</span>
  </span>
);
const Op = ({ children }) => <span className="text-[13px] font-semibold text-slate-400 dark:text-zinc-500" aria-hidden="true">{children}</span>;

function Equation({ feature }) {
  const { work, quality, extra } = feature;
  return (
    <span className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
      <Chip value={formatScore(work?.value)} caption="work points" />
      {quality && <><Op>×</Op><Chip value={`${formatScore(quality.value)}%`} caption="quality" /></>}
      {extra && <><Op>+</Op><Chip value={formatScore(extra.value)} caption={extra.label.toLowerCase()} /></>}
      <Op>=</Op><Chip value={formatScore(feature.score)} caption="points" strong />
    </span>
  );
}

const sentence = (feature) => [
  `${formatScore(feature.work?.value)} work points`,
  feature.quality ? ` × ${formatScore(feature.quality.value)}% quality` : '',
  feature.extra ? ` + ${formatScore(feature.extra.value)} ${feature.extra.label}` : '',
  ` = ${formatScore(feature.score)} points`,
].join('');

/**
 * How the student's own numbers become their Prep Score, as a flow: each licensed
 * feature's "work points x quality = points" (tap for where each number comes
 * from), then their average. `prepScore` = { total, features } from the API.
 */
export function PrepScoreFlow({ prepScore, className = '' }) {
  const [open, setOpen] = useState(null);
  const baseId = useId();
  const features = FEATURES.filter((feature) => prepScore?.features?.[feature.key]);
  if (!features.length) return null;
  const scores = features.map(({ key }) => prepScore.features[key].score);
  return (
    <div className={className}>
      <ol className="space-y-1.5">
        {features.map(({ key, label, Icon }) => {
          const feature = prepScore.features[key];
          const expanded = open === key;
          const panelId = `${baseId}-${key}`;
          const steps = [feature.work, feature.quality, feature.extra].filter(Boolean);
          return (
            <li key={key} className="rounded-xl border border-slate-100 bg-white dark:border-white/[0.06] dark:bg-white/[0.02]">
              <button type="button" onClick={() => setOpen(expanded ? null : key)} aria-expanded={expanded} aria-controls={panelId}
                className="w-full rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/[0.04]">
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100">{label}</span>
                  <ScoreValue value={feature.score} size="sm" label={label} />
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                </span>
                <span className="mt-1.5 block pl-8"><Equation feature={feature} /><span className="sr-only">{sentence(feature)}</span></span>
              </button>
              {expanded && (
                <div id={panelId} className="space-y-1.5 border-t border-slate-100 px-3 py-2 pl-10 text-[11.5px] leading-snug text-slate-600 dark:border-white/[0.06] dark:text-zinc-400">
                  {steps.map((step) => (
                    <p key={step.label}>
                      <b className="text-slate-800 dark:text-zinc-200">{step.label} {step === feature.quality ? `${formatScore(step.value)}%` : formatScore(step.value)}</b>
                      <span className="block">{step.detail}</span>
                      {step.math && <span className="mt-0.5 block font-mono text-[10.5px] text-slate-500 dark:text-zinc-500">{step.math}</span>}
                    </p>
                  ))}
                  {feature.rule && <p className="rounded-md bg-sky-50 px-2 py-1 text-[11px] text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">Rule: {feature.rule}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sky-50/80 px-3 py-2 ring-1 ring-inset ring-sky-100 dark:bg-sky-500/[0.07] dark:ring-sky-500/20">
        <span className="min-w-0 text-[11.5px] leading-snug text-slate-700 dark:text-zinc-300">
          <b className="block text-slate-900 dark:text-zinc-50">{features.length > 1 ? `Average of ${features.length} features` : 'Your Prep Score'}</b>
          {features.length > 1 && <span className="tabular-nums">({scores.map(formatScore).join(' + ')}) ÷ {features.length}</span>}
        </span>
        <ScoreValue value={prepScore.total} size="md" />
      </div>
    </div>
  );
}

/** "How the Prep Score works": the rule as three steps, with this student's licensed features. */
export function PrepScoreRules({ prepScore, className = '' }) {
  const features = FEATURES.filter((feature) => prepScore?.features?.[feature.key]?.rule);
  const steps = [
    { title: 'Earn work points', body: features.length ? null : 'Solve problems, finish topics, do interviews and take tests.' },
    { title: '× Quality', body: 'Your own average: few submissions per solve, and marks above the 40% pass mark. A small start-up allowance (epsilon) stops one lucky or unlucky attempt from deciding it.' },
    { title: 'Average your features', body: 'Your Prep Score is the average of your features. There is no maximum. A better Prep Score means a better rank; equal scores share a rank.' },
  ];
  return (
    <ol className={`relative space-y-3 ${className}`}>
      <span className="absolute bottom-3 left-[11px] top-3 w-px bg-sky-200 dark:bg-sky-500/30" aria-hidden="true" />
      {steps.map((step, index) => (
        <li key={step.title} className="relative flex gap-3">
          <span className="z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white ring-4 ring-white dark:ring-gray-900">{index + 1}</span>
          <div className="min-w-0 text-[11.5px] leading-snug text-slate-600 dark:text-zinc-400">
            <p className="text-[12.5px] font-semibold text-slate-900 dark:text-zinc-100">{step.title}</p>
            {index === 0 && features.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {features.map(({ key, label }) => <li key={key}><b className="font-semibold text-slate-700 dark:text-zinc-200">{label}:</b> {prepScore.features[key].rule}</li>)}
              </ul>
            )}
            {step.body && <p className="mt-0.5">{step.body}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
