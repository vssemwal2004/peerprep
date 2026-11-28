import { forwardRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, Camera, ClipboardList, Clock3, KeyRound, ListChecks, Maximize2, ShieldCheck } from 'lucide-react';
import MockActions from './MockActions';
import { availabilityText } from './mockText';
import { CollegeChip, StatusBadge } from './prepMockUi';
import { collegeAssignmentOf, instructionsOf, isAlwaysOpen, mockState, patternOf, plainText, resultOf } from './prepMockModel';
import { formatDurationMinutes } from '../assessment-dashboard/assessmentDashboardUtils';
import { focusRing } from '../dashboard/ui';

const marksText = (value) => (Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2))));
const cardClass = 'min-w-0 overflow-hidden rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]';
// A description longer than this is clamped to three lines with a "Show more".
const LONG_DESCRIPTION = 220;

// The pattern panel is narrow between 1024 and 1279px (the company and role bars sit beside it), so
// the Type column and the long headings show on tablets and wide screens only; elsewhere the type sits
// under the section name.
const TYPE_COLUMN = 'hidden sm:table-cell lg:hidden xl:table-cell';
const TYPE_INLINE = 'mt-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-violet-600 sm:hidden lg:block xl:hidden dark:text-violet-300';
const SHORT_HEAD = 'sm:hidden lg:inline xl:hidden';
const LONG_HEAD = 'hidden sm:inline lg:hidden xl:inline';

function listNumbers(numbers) {
  if (numbers.length === 1) return `Mock ${numbers[0]} follows a different pattern.`;
  return `Mocks ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]} follow different patterns.`;
}

/** S.No | Section | Type | Questions | Duration (min) (when set) | Marks | Negative (when set), with a Total row. */
function PatternTable({ pattern }) {
  if (!pattern.rows.length) {
    return <p className="rounded-xl border border-dashed border-[#e6e7eb] px-4 py-6 text-center text-[12.5px] text-slate-500 dark:border-white/[0.1] dark:text-zinc-400">The sections of this mock appear here once your admin adds them.</p>;
  }
  const cell = 'px-2.5 py-2.5 sm:px-3.5';
  const totalMinutes = (pattern.written ? 0 : pattern.duration) || pattern.rows.reduce((sum, row) => sum + (row.minutes || 0), 0);
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e9eaee] dark:border-white/[0.07]">
      <table data-no-serial className="w-full text-left text-[13px]">
        <caption className="sr-only">Exam pattern: sections, questions, time and marks</caption>
        <thead className="bg-[#f6f5fd] text-[10.5px] uppercase tracking-[0.1em] text-violet-900/70 dark:bg-violet-500/[0.07] dark:text-violet-200/80">
          <tr>
            <th scope="col" className={`${cell} w-10 font-semibold sm:w-14`}>S.No</th>
            <th scope="col" className={`${cell} font-semibold`}>Section</th>
            <th scope="col" className={`${cell} ${TYPE_COLUMN} font-semibold`}>Type</th>
            <th scope="col" className={`${cell} text-right font-semibold`}><span className={SHORT_HEAD}>Qs</span><span className={LONG_HEAD}>Questions</span></th>
            {pattern.hasTimes && <th scope="col" className={`${cell} text-right font-semibold`}><span className={SHORT_HEAD}>Min</span><span className={LONG_HEAD}>Duration (min)</span></th>}
            <th scope="col" className={`${cell} text-right font-semibold`}>Marks</th>
            {pattern.hasNegative && <th scope="col" className={`${cell} text-right font-semibold`}><span className={SHORT_HEAD} aria-hidden="true">−ve</span><span className="sr-only sm:not-sr-only lg:sr-only xl:not-sr-only">Negative</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef0f3] bg-white dark:divide-white/[0.06] dark:bg-[#242424]">
          {pattern.rows.map((row, index) => (
            <tr key={row.key} className="text-slate-700 dark:text-zinc-200">
              <td className={`${cell} tabular-nums text-slate-400 dark:text-zinc-500`}>{index + 1}</td>
              <th scope="row" className={`${cell} max-w-[18rem] font-semibold text-slate-900 dark:text-zinc-50`} title={row.name}>
                {row.name}<span className={TYPE_INLINE}>{row.type}</span>
              </th>
              <td className={`${cell} ${TYPE_COLUMN}`}><span className="whitespace-nowrap rounded-md bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-500/10 dark:text-violet-200">{row.type}</span></td>
              <td className={`${cell} text-right tabular-nums`}>{row.questions}</td>
              {pattern.hasTimes && <td className={`${cell} text-right tabular-nums`}>{row.minutes ?? '—'}</td>}
              <td className={`${cell} text-right font-semibold tabular-nums`}>{row.marks ? marksText(row.marks) : '—'}</td>
              {pattern.hasNegative && <td className={`${cell} text-right tabular-nums ${row.negative ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>{row.negative ? `−${marksText(row.negative)}` : '—'}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-[#e6e7eb] bg-[#faf9ff] dark:border-white/[0.08] dark:bg-violet-500/[0.05]">
          <tr className="font-semibold text-slate-900 dark:text-zinc-50">
            <td className={cell} />
            <th scope="row" className={`${cell} text-violet-700 dark:text-violet-300`}>Total</th>
            <td className={`${cell} ${TYPE_COLUMN}`} />
            <td className={`${cell} text-right tabular-nums`}>{pattern.questions}</td>
            {pattern.hasTimes && <td className={`${cell} text-right tabular-nums`}>{totalMinutes}</td>}
            <td className={`${cell} text-right tabular-nums`}>{pattern.marks ? marksText(pattern.marks) : '—'}</td>
            {pattern.hasNegative && <td className={cell} />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * The chosen role's exam pattern, at the top of the right column: the admin-written pattern (the
 * section-derived one for older mocks) with its OA month. `rolePattern` comes from rolePatternOf().
 * When the role's mocks differ, it is the chosen mock's pattern and a quiet note names the others.
 */
export function PatternSection({ role, company, rolePattern, headingRef }) {
  const { pattern, from, fromLong, differ, number, mock } = rolePattern;
  const notes = [];
  if (pattern.hasTimes) notes.push(`The pattern lists suggested section times. The overall test timer is ${formatDurationMinutes(mock.duration)}.`);
  if (pattern.hasNegative) notes.push('Negative marks are taken off for each wrong answer in that section. Skipping a question costs nothing.');
  else if (pattern.negativeMarking) notes.push('This mock takes marks off for wrong answers in some sections. Skipping a question costs nothing.');
  return (
    <section aria-labelledby="pmock-pattern-title" className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pb-3 pt-3.5 sm:px-5">
        <h2 ref={headingRef} id="pmock-pattern-title" tabIndex={-1} className="flex min-w-0 scroll-mt-24 items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-zinc-50">
          <ListChecks className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
          <span className="truncate">Exam pattern<span className="font-normal text-slate-400 dark:text-zinc-500"> · {role.name}</span></span>
        </h2>
        {from && (
          <span title={`Based on the ${company?.name || mock.company || 'company'} OA pattern from ${fromLong}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-violet-700 ring-1 ring-inset ring-violet-200/70 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-400/20">
            <CalendarDays className="h-3 w-3" aria-hidden="true" />OA pattern · {from}
          </span>
        )}
      </div>
      <div className="px-4 pb-4 sm:px-5">
        <PatternTable pattern={pattern} />
        {(notes.length > 0 || differ.length > 0) && (
          <ul className="mt-2.5 space-y-1 text-[12px] leading-5 text-slate-500 dark:text-zinc-400">
            {notes.map((note) => <li key={note}>{note}</li>)}
            {differ.length > 0 && <li>This is Mock {number}’s pattern. {listNumbers(differ)}</li>}
          </ul>
        )}
      </div>
    </section>
  );
}

/** One fact in the compact line under the mock's header. */
function Fact({ icon: Icon, children, title }) {
  return <li className="inline-flex items-center gap-1.5" title={title}><Icon className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" />{children}</li>;
}

/**
 * The chosen mock under the pattern: title, a status badge only when it is not simply open, the action
 * (Start / Continue / Result / Feedback), a short description, the facts the pattern table does not
 * show, and the admin's instructions.
 */
const MockOverview = forwardRef(function MockOverview({ mock, index, report, onStart, onViewResult, onFeedback, className = '' }, ref) {
  const reduceMotion = useReducedMotion();
  const [moreText, setMoreText] = useState(false);
  const state = mockState(mock);
  const alwaysOpen = isAlwaysOpen(mock);
  const pattern = patternOf(mock);
  const { paragraphs, rules } = instructionsOf(mock);
  const description = plainText(mock.description);
  const longDescription = description.length > LONG_DESCRIPTION;
  const needsPassword = Boolean(mock.passwordEnabled && !mock.passwordUnlocked);
  const proctored = Boolean(mock.settings?.aiProctoring?.enabled);
  const fullscreen = Boolean(mock.settings?.enableFullscreen);
  const result = resultOf(report);
  const assignment = collegeAssignmentOf(mock);
  const when = availabilityText(mock, state, alwaysOpen);
  // Every mock is open by default: the badge shows only for any other state.
  const showBadge = state !== 'live';

  return (
    <motion.section ref={ref} key={mock._id} aria-labelledby="pmock-overview-title" tabIndex={-1}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`${cardClass} scroll-mt-24 outline-none ${className}`}>
      <header data-guide="pmock-mock" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-[14px] font-bold tabular-nums text-white shadow-[0_8px_18px_-12px_rgba(109,40,217,0.9)]" aria-hidden="true">{index + 1}</span>
          <div className="min-w-0">
            <h2 id="pmock-overview-title" className="text-[18px] font-semibold leading-snug tracking-[-0.02em] text-slate-900 sm:text-[19px] dark:text-zinc-50">
              <span className="sr-only">Mock {index + 1}: </span>{mock.title || 'Untitled mock'}
            </h2>
            {(showBadge || when || needsPassword || assignment) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                {showBadge && <StatusBadge state={state} />}
                {when && <span className="text-[12px] text-slate-500 dark:text-zinc-400">{when}</span>}
                {needsPassword && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20"><KeyRound className="h-3 w-3" aria-hidden="true" />Password needed</span>}
                <CollegeChip assignment={assignment} />
              </div>
            )}
          </div>
        </div>
        <MockActions mock={mock} state={state} report={report} onStart={onStart} onViewResult={onViewResult} onFeedback={onFeedback} size="lg" className="shrink-0 sm:justify-end" />
      </header>

      {state === 'completed' && !result && (
        <p className="mx-4 mb-4 rounded-xl bg-indigo-50/70 px-3.5 py-2.5 text-[12.5px] text-indigo-800 sm:mx-5 dark:bg-indigo-500/[0.08] dark:text-indigo-200">Your result shows here once it is announced.</p>
      )}

      {description && (
        <div className="px-4 pb-4 sm:px-5">
          <p className={`max-w-3xl text-[13.5px] leading-6 text-slate-600 dark:text-zinc-300 ${longDescription && !moreText ? 'line-clamp-3' : ''}`}>{description}</p>
          {longDescription && (
            <button type="button" onClick={() => setMoreText((value) => !value)} aria-expanded={moreText}
              className={`mt-1 rounded text-[12px] font-semibold text-violet-700 hover:underline dark:text-violet-300 ${focusRing}`}>{moreText ? 'Show less' : 'Show more'}</button>
          )}
        </div>
      )}

      <ul aria-label="About this mock" className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-[#eef0f3] px-4 py-2.5 text-[12px] text-slate-600 sm:px-5 dark:border-white/[0.06] dark:text-zinc-300">
        {!pattern.hasTimes && mock.duration > 0 && <Fact icon={Clock3}>{formatDurationMinutes(mock.duration)} timer</Fact>}
        <Fact icon={proctored ? Camera : ShieldCheck} title={proctored ? 'AI proctoring watches the camera during the mock' : 'Usual test checks, no camera'}>{proctored ? 'Camera proctoring' : 'Standard checks, no camera'}</Fact>
        {fullscreen && <Fact icon={Maximize2}>Full screen</Fact>}
      </ul>

      <section aria-labelledby="pmock-instructions-title" className="border-t border-[#eef0f3] px-4 py-4 sm:px-5 dark:border-white/[0.06]">
        <h3 id="pmock-instructions-title" className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400">
          <ClipboardList className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />Instructions
        </h3>
        {paragraphs.length || rules.length ? (
          <div className="text-[13.5px] leading-6 text-slate-700 dark:text-zinc-300">
            {paragraphs.map((text, at) => <p key={at} className={at ? 'mt-2' : ''}>{text}</p>)}
            {rules.length > 0 && (
              <ol className={`space-y-1.5 ${paragraphs.length ? 'mt-3' : ''}`}>
                {rules.map((rule, at) => (
                  <li key={at} className="flex gap-2.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">{at + 1}</span><span>{rule}</span></li>
                ))}
              </ol>
            )}
          </div>
        ) : <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">No extra instructions. The full instructions show again before you start.</p>}
      </section>
    </motion.section>
  );
});

export default MockOverview;
