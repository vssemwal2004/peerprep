import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, ArrowUpRight, Info, Loader2, Minus, X } from 'lucide-react';
import { api } from '../../utils/api';
import { useWidth } from '../peers/useWidth';
import { formatScore } from './formatScore';
import { GAIN_KINDS, LOSS_KINDS, POINT_KINDS, TONE_CLASSES, dayLabel, fillDays, signed } from './pointKinds';

const RANGES = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['all', 'All time']];
const UP = '#10b981';
const DOWN = '#f43f5e';
const LINE = '#0284c7';

/** Loads the student's own score history for a range. */
export function usePrepScoreHistory(range, enabled = true) {
  const [state, setState] = useState({ loading: enabled, error: null, history: null });
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    api.getPrepScoreHistory(range)
      .then((data) => { if (live) setState({ loading: false, error: null, history: data?.history || null }); })
      .catch((error) => { if (live) setState({ loading: false, error, history: null }); });
    return () => { live = false; };
  }, [range, enabled]);
  return state;
}

/** Tiny running-total line for the score tile (white on the blue card). */
export function ScoreSparkline({ history, width = 132, height = 38, className = '' }) {
  const days = useMemo(() => fillDays(history), [history]);
  if (days.length < 2) return null;
  const values = days.map((day) => day.total);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${height - 3 - ((value - min) / span) * (height - 6)}`);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <defs><linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.35" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${height} ${points.join(' ')} ${width},${height}`} fill="url(#spark-fill)" />
      <polyline points={points.join(' ')} fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={points.at(-1).split(',')[1]} r="3" fill="#fff" />
    </svg>
  );
}

/** "+12 in 30 days" chip: green up, red down, grey flat. `inverse` for the blue card. */
export function ChangeChip({ change, label, inverse = false }) {
  const value = Number(change) || 0;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  const tone = inverse
    ? value > 0 ? 'bg-emerald-400/25 text-emerald-50 ring-emerald-200/40' : value < 0 ? 'bg-rose-500/30 text-rose-50 ring-rose-200/40' : 'bg-white/15 text-sky-50 ring-white/25'
    : value > 0 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20'
      : value < 0 ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20'
        : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10';
  return <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums ring-1 ring-inset ${tone}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{signed(value)}{label ? <span className="ml-1 font-medium opacity-80">{label}</span> : null}</span>;
}

/** Running total (line) over daily gains (green, up) and losses (red, down), with a hover card. */
function HistoryChart({ days }) {
  const [ref, width] = useWidth(640);
  const [hover, setHover] = useState(null);
  const lineHeight = 170;
  const barHeight = 70;
  const pad = { left: 44, right: 10, top: 10 };
  const inner = Math.max(1, width - pad.left - pad.right);
  const totals = days.map((day) => day.total);
  const maxTotal = Math.max(5, ...totals);
  const niceMax = Math.ceil(maxTotal / 5) * 5;
  const maxSwing = Math.max(1, ...days.map((day) => Math.max(day.gained, day.lost)));
  const x = (index) => pad.left + (days.length === 1 ? inner / 2 : (index / (days.length - 1)) * inner);
  const y = (value) => pad.top + (1 - value / niceMax) * (lineHeight - pad.top - 18);
  const mid = lineHeight + barHeight / 2;
  const bar = (value) => (value / maxSwing) * (barHeight / 2 - 4);
  const column = inner / Math.max(1, days.length);
  const barWidth = Math.max(1.5, Math.min(14, column * 0.62));
  const path = days.map((day, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(day.total).toFixed(1)}`).join(' ');
  const ticks = [0, niceMax / 2, niceMax];
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(inner / 70))));
  const active = hover === null ? null : days[hover];
  return (
    <div ref={ref} className="relative">
      <svg width={width} height={lineHeight + barHeight + 22} role="img" aria-label={`Prep Score from ${formatScore(days[0]?.total)} to ${formatScore(days.at(-1)?.total)} over ${days.length} days`}>
        <defs><linearGradient id="score-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={LINE} stopOpacity="0.22" /><stop offset="1" stopColor={LINE} stopOpacity="0" /></linearGradient></defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200 dark:stroke-white/[0.08]" strokeDasharray="3 6" />
            <text x={pad.left - 6} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[10.5px] dark:fill-zinc-500">{formatScore(tick)}</text>
          </g>
        ))}
        <path d={`${path} L${x(days.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#score-area)" />
        <path d={path} fill="none" stroke={LINE} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={pad.left} x2={width - pad.right} y1={mid} y2={mid} className="stroke-slate-200 dark:stroke-white/[0.1]" />
        <text x={pad.left - 6} y={mid - barHeight / 2 + 8} textAnchor="end" className="fill-emerald-500 text-[10px]">up</text>
        <text x={pad.left - 6} y={mid + barHeight / 2 - 2} textAnchor="end" className="fill-rose-500 text-[10px]">down</text>
        {days.map((day, index) => (
          <g key={day.day}>
            {day.gained > 0 && <rect x={x(index) - barWidth / 2} y={mid - bar(day.gained)} width={barWidth} height={bar(day.gained)} rx={Math.min(3, barWidth / 2)} fill={UP} opacity={hover === null || hover === index ? 1 : 0.45} />}
            {day.lost > 0 && <rect x={x(index) - barWidth / 2} y={mid} width={barWidth} height={bar(day.lost)} rx={Math.min(3, barWidth / 2)} fill={DOWN} opacity={hover === null || hover === index ? 1 : 0.45} />}
            {index % labelEvery === 0 && <text x={x(index)} y={lineHeight + barHeight + 16} textAnchor="middle" className="fill-slate-400 text-[10.5px] dark:fill-zinc-500">{dayLabel(day.day)}</text>}
          </g>
        ))}
        {active && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={lineHeight + barHeight} className="stroke-slate-300 dark:stroke-white/20" />
            <circle cx={x(hover)} cy={y(active.total)} r="4.5" fill={LINE} className="stroke-white dark:stroke-[#242424]" strokeWidth="2" />
          </g>
        )}
        {days.map((day, index) => (
          <rect key={`hit-${day.day}`} x={x(index) - column / 2} y={0} width={column} height={lineHeight + barHeight} fill="transparent"
            onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)} />
        ))}
      </svg>
      {active && (
        <div role="tooltip" className="pointer-events-none absolute top-2 z-10 w-56 -translate-x-1/2 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 text-[12px] shadow-xl backdrop-blur dark:border-white/10 dark:bg-[#2c2c2c]/95"
          style={{ left: `${Math.min(86, Math.max(14, (x(hover) / width) * 100))}%` }}>
          <p className="flex items-center justify-between font-semibold text-slate-900 dark:text-white"><span>{dayLabel(active.day, true)}</span><span className="tabular-nums">{formatScore(active.total)}</span></p>
          {Object.keys(active.byKind).length ? (
            <ul className="mt-1.5 space-y-0.5">
              {Object.entries(active.byKind).filter(([, value]) => value).map(([kind, value]) => (
                <li key={kind} className="flex items-center justify-between gap-2 text-slate-600 dark:text-zinc-300">
                  <span>{POINT_KINDS[kind]?.label || kind}</span>
                  <span className={`font-semibold tabular-nums ${value > 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}>{signed(value)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-slate-500 dark:text-zinc-400">No change this day</p>}
        </div>
      )}
      <table className="sr-only">
        <caption>Prep Score by day</caption>
        <thead><tr><th>Day</th><th>Score</th><th>Gained</th><th>Lost</th></tr></thead>
        <tbody>{days.filter((day) => day.gained || day.lost).map((day) => <tr key={day.day}><td>{day.day}</td><td>{day.total}</td><td>{day.gained}</td><td>{day.lost}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

const RULE_MARK = {
  up: { sign: '+', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  down: { sign: '−', className: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  no: { sign: '0', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  info: { sign: 'i', className: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-300' },
};

/**
 * The published scoring rules as short points (2026-11-26: students found the sentences too long).
 * Every number comes from the live policy (GET /auth/prep-score/history `rules`).
 */
function prepScoreRulePoints(rules) {
  if (!rules) return [];
  const n = (value) => formatScore(Number(value) || 0);
  const curved = rules.curve && Number(rules.curve.exponent) < 1;
  const extras = [
    rules.dailyChallenge > 0 && 'daily challenge', rules.sheetCompleted > 0 && 'finished sheet', rules.login > 0 && 'daily login', rules.monthlyBadgeLevel > 0 && 'badges',
  ].filter(Boolean);
  return [
    rules.solve && { mark: 'up', text: `Solve a NEW question: Easy ${n(rules.solve.Easy)} · Medium ${n(rules.solve.Medium)} · Hard ${n(rules.solve.Hard)} points.` },
    rules.dailyTopicLimit > 0 && { mark: 'no', text: `Only ${rules.dailyTopicLimit} solves per topic count each day. After that, switch topic (resets at midnight).` },
    { mark: 'no', text: 'Re-solving a question you already solved gives 0.' },
    extras.length > 0 && { mark: 'up', text: `Extra points: ${extras.join(', ')}.` },
    rules.wrongSubmission > 0 && { mark: 'down', text: `Wrong answer: −${n(rules.wrongSubmission)}${rules.refundSameDay ? ', back if you solve it the same day' : ''}. Max −${n(rules.wrongDailyCap)} a day.` },
    rules.inactivity?.perDay > 0 && { mark: 'down', text: `No submission for ${rules.inactivity.graceDays}+ days: −${n(rules.inactivity.perDay)} a day (login alone doesn’t count).` },
    curved && { mark: 'info', text: 'Score rises fast at first, then slower as it grows. That is normal, not a bug.' },
    rules.lossFloorShare > 0 && { mark: 'info', text: `Losses never take more than ${Math.round((1 - rules.lossFloorShare) * 100)}% of your solve points.` },
  ].filter(Boolean);
}

/** The published scoring rules, point by point. */
export function RulesList({ rules }) {
  const points = prepScoreRulePoints(rules);
  if (!points.length) return null;
  return <ul className="mt-1.5 space-y-1">{points.map((point) => <li key={point.text} className="flex items-start gap-2">
    <span className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${RULE_MARK[point.mark].className}`} aria-hidden="true">{RULE_MARK[point.mark].sign}</span>
    <span>{point.text}</span>
  </li>)}</ul>;
}

function KindRow({ kind, value, max }) {
  const meta = POINT_KINDS[kind];
  if (!meta) return null;
  const gain = value > 0;
  return (
    <li className="flex items-center gap-3">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${TONE_CLASSES[meta.tone]}`}><meta.Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-slate-800 dark:text-zinc-100">{meta.label}</span>
          <span className={`shrink-0 text-[13px] font-bold tabular-nums ${gain ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}>{signed(value)}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.07]">
          <div className={`h-full rounded-full ${gain ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.max(4, (Math.abs(value) / max) * 100)}%` }} />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-zinc-400">{meta.hint}</p>
      </div>
    </li>
  );
}

/** Full Prep Score history: range, graph, where points came from and went, topics. */
export function PrepScoreHistoryDialog({ open, onClose, initialRange = '30d' }) {
  const [range, setRange] = useState(initialRange);
  const { loading, error, history } = usePrepScoreHistory(range, open);
  const days = useMemo(() => fillDays(history), [history]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const byKind = history?.byKind || {};
  const gains = GAIN_KINDS.filter((kind) => byKind[kind] > 0).sort((a, b) => byKind[b] - byKind[a]);
  const losses = LOSS_KINDS.filter((kind) => byKind[kind] < 0);
  const maxKind = Math.max(1, ...Object.values(byKind).map((value) => Math.abs(value)));
  const maxTopic = Math.max(1, ...(history?.topics || []).map((topic) => topic.points));
  const gained = gains.reduce((sum, kind) => sum + byKind[kind], 0);
  const lost = losses.reduce((sum, kind) => sum + byKind[kind], 0);

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-slate-950/50 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="score-history-title" className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-[#242424]">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/[0.06]">
          <div className="min-w-0 flex-1">
            <h2 id="score-history-title" className="text-[16px] font-semibold text-slate-900 dark:text-white">Your Prep Score history</h2>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-zinc-400">Every point you gained and lost, day by day.</p>
          </div>
          <div className="flex rounded-xl bg-slate-100 p-0.5 dark:bg-white/[0.06]" role="tablist" aria-label="Range">
            {RANGES.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={range === key} onClick={() => setRange(key)}
                className={`rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${range === key ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}>{label}</button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-white"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading && !history ? <div className="flex h-72 items-center justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div> : null}
          {error && !history ? <p className="py-16 text-center text-[13px] text-slate-500 dark:text-zinc-400">Your score history could not be loaded right now.</p> : null}
          {history ? (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-sky-50 px-4 py-3 dark:bg-sky-500/10">
                  <p className="text-[11.5px] font-medium text-sky-700 dark:text-sky-300">Prep Score now</p>
                  <p className="mt-1 text-[26px] font-bold leading-none tabular-nums text-slate-950 dark:text-white">{formatScore(history.total)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[0.04]">
                  <p className="text-[11.5px] font-medium text-slate-500 dark:text-zinc-400">Change in this range</p>
                  <p className="mt-1.5"><ChangeChip change={history.change} /></p>
                </div>
                <div className="rounded-2xl bg-emerald-50/70 px-4 py-3 dark:bg-emerald-500/[0.07]">
                  <p className="text-[11.5px] font-medium text-emerald-700 dark:text-emerald-300">Points gained</p>
                  <p className="mt-1 text-[20px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{signed(gained)}</p>
                </div>
                <div className="rounded-2xl bg-rose-50/70 px-4 py-3 dark:bg-rose-500/[0.07]">
                  <p className="text-[11.5px] font-medium text-rose-700 dark:text-rose-300">Points lost</p>
                  <p className="mt-1 text-[20px] font-bold tabular-nums text-rose-700 dark:text-rose-300">{signed(lost)}</p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-100 p-3 dark:border-white/[0.06]">
                {days.length ? <HistoryChart days={days} /> : <p className="py-12 text-center text-[13px] text-slate-500 dark:text-zinc-400">No score changes yet. Solve a problem to start.</p>}
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <section aria-labelledby="score-gains">
                  <h3 id="score-gains" className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Where your points came from</h3>
                  {gains.length ? <ul className="mt-3 space-y-3">{gains.map((kind) => <KindRow key={kind} kind={kind} value={byKind[kind]} max={maxKind} />)}</ul>
                    : <p className="mt-2 text-[12.5px] text-slate-500 dark:text-zinc-400">No points gained in this range.</p>}
                  {losses.length ? (
                    <>
                      <h3 className="mt-5 text-[13.5px] font-semibold text-slate-900 dark:text-white">Where you lost points</h3>
                      <ul className="mt-3 space-y-3">{losses.map((kind) => <KindRow key={kind} kind={kind} value={byKind[kind]} max={maxKind} />)}</ul>
                    </>
                  ) : null}
                </section>
                <section aria-labelledby="score-topics">
                  <h3 id="score-topics" className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Points by topic</h3>
                  {history.topics?.length ? (
                    <ul className="mt-3 space-y-2">
                      {history.topics.map((topic) => (
                        <li key={topic.topic} className="flex items-center gap-3 text-[12.5px]">
                          <span className="w-32 shrink-0 truncate text-slate-700 dark:text-zinc-200">{topic.topic}</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.07]"><span className="block h-full rounded-full bg-sky-500" style={{ width: `${(topic.points / maxTopic) * 100}%` }} /></span>
                          <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{formatScore(topic.points)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-[12.5px] text-slate-500 dark:text-zinc-400">Solve problems to see which topics earn you points.</p>}
                  <div className="mt-5 rounded-xl bg-slate-50 p-3.5 text-[12px] leading-5 text-slate-600 dark:bg-white/[0.04] dark:text-zinc-300">
                    <p className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white"><Info className="h-3.5 w-3.5" />How it works</p>
                    <RulesList rules={history.rules} />
                  </div>
                </section>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
