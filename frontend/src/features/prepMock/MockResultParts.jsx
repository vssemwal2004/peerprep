// Prep Mock result pieces shared by the student's result window and the admin's Mock Results page:
// a score ring, the correct / wrong / skipped bar, section bars, a numbered question map (green =
// correct, red = wrong, amber = partly right, grey = skipped) and question cards that open to the
// answer review (MCQ options, written answers) or the coding result (tests passed, marks, code).
// Rows are the `questionWise` entries the server sends (status, marksObtained, options, testSummary...).
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, Code2, Minus, X } from 'lucide-react';
import AnswerReview from '../../admin/reports/AnswerReview';

export const STATUS = {
  correct: { label: 'Correct', short: 'Right', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25', cell: 'bg-emerald-500 text-white', bar: 'bg-emerald-500', icon: Check },
  incorrect: { label: 'Wrong', short: 'Wrong', chip: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25', cell: 'bg-rose-500 text-white', bar: 'bg-rose-500', icon: X },
  partial: { label: 'Partly correct', short: 'Partly', chip: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25', cell: 'bg-amber-400 text-white', bar: 'bg-amber-400', icon: Minus },
  skipped: { label: 'Not answered', short: 'Skipped', chip: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10', cell: 'bg-slate-200 text-slate-600 dark:bg-white/[0.1] dark:text-zinc-300', bar: 'bg-slate-300 dark:bg-zinc-600', icon: Minus },
  pending: { label: 'Being checked', short: 'Pending', chip: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/25', cell: 'bg-sky-400 text-white', bar: 'bg-sky-400', icon: Minus },
};
export const statusOf = (row) => STATUS[row?.status === 'wrong' ? 'incorrect' : row?.status] || STATUS.pending;
const statusKey = (row) => (row?.status === 'wrong' ? 'incorrect' : STATUS[row?.status] ? row.status : 'pending');

const TYPE_LABEL = { mcq: 'MCQ', coding: 'Coding', short: 'Short answer', one_line: 'One line' };
const marksText = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
};

/** Question text as plain lines (questions are saved as rich text). */
export function plainText(value) {
  const html = String(value || '');
  if (!html.includes('<')) return html.trim();
  const withBreaks = html.replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '');
  if (typeof document === 'undefined') return withBreaks.trim();
  const box = document.createElement('textarea');
  box.innerHTML = withBreaks;
  return box.value.replace(/\n{3,}/g, '\n\n').trim();
}

/** Counts of each outcome over the question rows. */
export function outcomeCounts(rows = []) {
  return rows.reduce((counts, row) => { counts[statusKey(row)] += 1; return counts; }, { correct: 0, incorrect: 0, partial: 0, skipped: 0, pending: 0 });
}

/** The score as a ring (0–100%), coloured by the pass mark when one is given. */
export function ScoreRing({ percent, passPercentage = null, size = 132, label = 'Score' }) {
  const reduceMotion = useReducedMotion();
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const ring = 2 * Math.PI * radius;
  const passed = passPercentage === null || passPercentage === undefined ? null : value >= Number(passPercentage);
  const gradient = passed === false ? ['#fda4af', '#e11d48'] : passed ? ['#6ee7b7', '#059669'] : ['#c4b5fd', '#6d28d9'];
  const id = `mock-ring-${size}-${passed}`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label} ${Math.round(value)}%`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={gradient[0]} /><stop offset="1" stopColor={gradient[1]} /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-100 dark:stroke-white/[0.08]" />
        <motion.circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={`url(#${id})`}
          strokeDasharray={ring} initial={reduceMotion ? false : { strokeDashoffset: ring }} animate={{ strokeDashoffset: ring - (value / 100) * ring }}
          transition={{ duration: 0.9, ease: 'easeOut' }} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="text-[28px] font-bold leading-none tabular-nums tracking-[-0.03em] text-slate-950 dark:text-white">{Math.round(value)}<span className="text-[15px] font-semibold text-slate-400 dark:text-zinc-500">%</span></span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400">{label}</span>
      </span>
    </div>
  );
}

/** One bar split into right / partly / wrong / skipped / pending, with a legend under it. */
export function OutcomeBar({ counts, total }) {
  const sum = total || Object.values(counts).reduce((a, b) => a + b, 0);
  const order = ['correct', 'partial', 'incorrect', 'skipped', 'pending'];
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" role="img"
        aria-label={order.filter((key) => counts[key]).map((key) => `${counts[key]} ${STATUS[key].label.toLowerCase()}`).join(', ')}>
        {sum > 0 && order.map((key) => counts[key] > 0 && <span key={key} className={STATUS[key].bar} style={{ width: `${(counts[key] / sum) * 100}%` }} />)}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
        {order.filter((key) => counts[key] > 0 || ['correct', 'incorrect', 'skipped'].includes(key)).map((key) => (
          <li key={key} className="inline-flex items-center gap-1.5 text-slate-600 dark:text-zinc-300">
            <span className={`h-2.5 w-2.5 rounded-[3px] ${STATUS[key].bar}`} aria-hidden="true" />
            <b className="font-semibold tabular-nums text-slate-900 dark:text-white">{counts[key]}</b> {STATUS[key].short.toLowerCase()}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Section score bars (sectionBreakdown rows from the server). */
export function SectionBars({ sections = [] }) {
  if (!sections.length) return null;
  return (
    <ul className="space-y-3">
      {sections.map((section) => {
        const total = Number(section.totalMarks) || 0;
        const score = Number(section.score) || 0;
        const share = total > 0 ? Math.max(0, Math.min(100, (score / total) * 100)) : 0;
        return (
          <li key={section.sectionName}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate font-semibold text-slate-800 dark:text-zinc-100">{section.sectionName}<span className="ml-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-zinc-500">{TYPE_LABEL[section.type] || section.type}</span></span>
              <span className="shrink-0 tabular-nums text-slate-500 dark:text-zinc-400"><b className="font-semibold text-slate-900 dark:text-white">{marksText(score)}</b> / {marksText(total)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-600" style={{ width: `${share}%` }} /></div>
            <p className="mt-1 text-[11.5px] text-slate-500 dark:text-zinc-400">
              {section.correctAnswers || 0} right · {section.wrongAnswers || 0} wrong · {section.skippedQuestions || 0} skipped{section.pendingEvaluationQuestions ? ` · ${section.pendingEvaluationQuestions} being checked` : ''}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** Numbered squares, one per question, grouped by section; clicking one opens that question. */
export function QuestionMap({ rows = [], onPick }) {
  const sections = [];
  rows.forEach((row, index) => {
    const name = row.sectionName || 'Questions';
    let group = sections.find((entry) => entry.name === name);
    if (!group) { group = { name, items: [] }; sections.push(group); }
    group.items.push({ row, index });
  });
  return (
    <div className="space-y-3">
      {sections.map((group) => (
        <div key={group.name}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-zinc-400">{group.name}</p>
          <ol className="flex flex-wrap gap-1.5">
            {group.items.map(({ row, index }) => {
              const look = statusOf(row);
              return (
                <li key={`${row.sectionIndex}-${row.questionIndex}`}>
                  <button type="button" onClick={() => onPick?.(index)} title={`Question ${index + 1}: ${look.label}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-bold tabular-nums shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${look.cell}`}>
                    {index + 1}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

const VERDICT = { AC: 'Accepted', WA: 'Wrong answer', TLE: 'Time limit exceeded', RE: 'Runtime error', CE: 'Compilation error', FAILED: 'Failed', PENDING: 'Not run yet' };

/** A coding question's result: verdict, hidden tests passed, marks, and the submitted code. */
function CodingResult({ row, you }) {
  const [showCode, setShowCode] = useState(false);
  const summary = row.testSummary || {};
  const passed = Number(summary.passed) || 0;
  const total = Number(summary.total) || 0;
  const accepted = row.executionVerdict === 'AC';
  const share = total ? (passed / total) * 100 : 0;
  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-xl border border-[#eef0f3] bg-[#fafbfc] px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">Verdict</p>
          <p className={`mt-0.5 text-[14px] font-semibold ${accepted ? 'text-emerald-700 dark:text-emerald-300' : row.executionVerdict && row.executionVerdict !== 'PENDING' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-zinc-200'}`}>{VERDICT[row.executionVerdict] || row.executionVerdict || 'Not run yet'}</p>
        </div>
        <div className="rounded-xl border border-[#eef0f3] bg-[#fafbfc] px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">Test cases passed</p>
          <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-slate-900 dark:text-white">{total ? `${passed} / ${total}` : '—'}</p>
          {total > 0 && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/[0.08]"><div className={`h-full rounded-full ${passed === total ? 'bg-emerald-500' : passed ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${share}%` }} /></div>}
        </div>
        <div className="rounded-xl border border-[#eef0f3] bg-[#fafbfc] px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">Language</p>
          <p className="mt-0.5 text-[14px] font-semibold text-slate-900 dark:text-white">{row.language || '—'}</p>
          {(Number(summary.time) > 0 || Number(summary.memory) > 0) && <p className="text-[11px] text-slate-400 dark:text-zinc-500">{Number(summary.time) > 0 ? `${summary.time}s` : ''}{Number(summary.time) > 0 && Number(summary.memory) > 0 ? ' · ' : ''}{Number(summary.memory) > 0 ? `${Math.round(Number(summary.memory) / 1024)} MB` : ''}</p>}
        </div>
      </div>
      {summary.error && <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-rose-200 bg-rose-50 p-3 font-mono text-[12px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{String(summary.error)}</pre>}
      {row.sourceCode ? (
        <div>
          <button type="button" onClick={() => setShowCode((value) => !value)} aria-expanded={showCode}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6e7eb] px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700 dark:border-white/[0.08] dark:text-zinc-300">
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />{showCode ? 'Hide code' : you ? 'Show your code' : 'Show submitted code'}
          </button>
          {showCode && <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-[#0f1117] p-4 font-mono text-[12px] leading-5 text-slate-100">{row.sourceCode}</pre>}
        </div>
      ) : <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">{you ? 'You did not submit code for this question.' : 'No code was submitted for this question.'}</p>}
    </div>
  );
}

/**
 * Every question as a card: number (coloured by result), text, section and type, marks, result.
 * A card opens to the answer review. `openIndex` / `onToggle` let a QuestionMap open one from outside.
 */
export function QuestionList({ rows = [], openIndex = null, onToggle, you = false, idPrefix = 'mock-q' }) {
  return (
    <ol className="space-y-2.5">
      {rows.map((row, index) => {
        const look = statusOf(row);
        const Icon = look.icon;
        const open = openIndex === index;
        const type = row.type || 'mcq';
        const text = plainText(row.questionText);
        const hasMarks = row.marksObtained !== null && row.marksObtained !== undefined;
        return (
          <li key={`${row.sectionIndex}-${row.questionIndex}`} id={`${idPrefix}-${index}`} className={`scroll-mt-24 overflow-hidden rounded-2xl border bg-white transition-colors dark:bg-[#242424] ${open ? 'border-violet-200 dark:border-violet-400/30' : 'border-[#e9eaee] dark:border-white/[0.07]'}`}>
            <button type="button" onClick={() => onToggle?.(index)} aria-expanded={open}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#fafbfc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 dark:hover:bg-white/[0.02]">
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold tabular-nums ${look.cell}`}>{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[13.5px] font-medium leading-5 text-slate-900 dark:text-zinc-50 ${open ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>{text || `Question ${index + 1}`}</span>
                <span className="mt-1 block text-[11.5px] text-slate-500 dark:text-zinc-400">{[...new Set([row.sectionName, TYPE_LABEL[type] || type, row.difficulty].filter(Boolean).map((part) => String(part)))].filter((part, at, list) => list.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === at).join(' · ')}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${look.chip}`}><Icon className="h-3 w-3" strokeWidth={2.6} aria-hidden="true" />{type === 'coding' && row.executionVerdict === 'AC' ? 'Accepted' : look.label}</span>
                {hasMarks && <span className="text-[11.5px] font-semibold tabular-nums text-slate-600 dark:text-zinc-300">{Number(row.marksObtained) > 0 ? '+' : ''}{marksText(row.marksObtained)} / {marksText(row.maxMarks)}</span>}
              </span>
              <ChevronDown className={`mt-1.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {open && (
              <div className="border-t border-[#eef0f3] px-4 py-4 dark:border-white/[0.06]">
                {type === 'coding' ? <CodingResult row={row} you={you} /> : <AnswerReview question={row} you={you} />}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
