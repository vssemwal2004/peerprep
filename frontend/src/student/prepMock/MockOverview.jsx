import { forwardRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BarChart3, CalendarDays, Camera, ClipboardList, Clock3, KeyRound, Layers, ListChecks, Maximize2, Trophy } from 'lucide-react';
import MockActions from './MockActions';
import { availabilityText } from './mockText';
import { AlwaysOpenBadge, StatusBadge } from './prepMockUi';
import { instructionsOf, isAlwaysOpen, mockState, patternOf, plainText, resultOf, sectionTypes } from './prepMockModel';
import { formatDateTime, formatDurationMinutes } from '../assessment-dashboard/assessmentDashboardUtils';
import { focusRing } from '../dashboard/ui';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const marksText = (value) => (Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2))));

function Fact({ icon: Icon, label, value, hint }) {
  return (
    <div className="min-w-0 bg-white px-4 py-3 dark:bg-[#242424]" title={hint}>
      <dt className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-zinc-500"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</dt>
      <dd className="mt-1 truncate text-[15px] font-semibold tabular-nums text-slate-900 dark:text-zinc-50">{value}</dd>
    </div>
  );
}

function Heading({ icon: Icon, children, aside }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400"><Icon className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />{children}</h3>
      {aside}
    </div>
  );
}

/** S.No | Section | Type | Questions | Marks/Q | Marks | Negative (only when set) — with a Total row. */
function PatternTable({ pattern }) {
  if (!pattern.rows.length) {
    return <p className="rounded-xl border border-dashed border-[#e6e7eb] px-4 py-6 text-center text-[12.5px] text-slate-500 dark:border-white/[0.1] dark:text-zinc-400">The sections of this mock appear here once your admin adds them.</p>;
  }
  const cell = 'px-2.5 py-3 sm:px-4';
  // Phones keep S.No, Section, Questions, Marks (and Negative); Type and Marks / Q join from 640px.
  const wide = 'hidden sm:table-cell';
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e9eaee] dark:border-white/[0.07]">
      <table data-no-serial className="w-full text-left text-[13px] sm:min-w-[520px]">
        <caption className="sr-only">Exam pattern: sections, questions and marks</caption>
        <thead className="bg-[#f6f5fd] text-[10.5px] uppercase tracking-[0.1em] text-violet-900/70 dark:bg-violet-500/[0.07] dark:text-violet-200/80">
          <tr>
            <th scope="col" className={`${cell} w-10 font-semibold sm:w-14`}>S.No</th>
            <th scope="col" className={`${cell} font-semibold`}>Section</th>
            <th scope="col" className={`${cell} ${wide} font-semibold`}>Type</th>
            <th scope="col" className={`${cell} text-right font-semibold`}><span className="sm:hidden">Qs</span><span className="hidden sm:inline">Questions</span></th>
            <th scope="col" className={`${cell} ${wide} text-right font-semibold`}>Marks / Q</th>
            <th scope="col" className={`${cell} text-right font-semibold`}>Marks</th>
            {pattern.hasNegative && <th scope="col" className={`${cell} text-right font-semibold`}><span className="sm:hidden" aria-hidden="true">−ve</span><span className="sr-only sm:not-sr-only">Negative</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef0f3] bg-white dark:divide-white/[0.06] dark:bg-[#242424]">
          {pattern.rows.map((row, index) => (
            <tr key={row.key} className="text-slate-700 dark:text-zinc-200">
              <td className={`${cell} tabular-nums text-slate-400 dark:text-zinc-500`}>{index + 1}</td>
              <th scope="row" className={`${cell} max-w-[18rem] font-semibold text-slate-900 sm:truncate dark:text-zinc-50`} title={row.name}>
                {row.name}<span className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-violet-600 sm:hidden dark:text-violet-300">{row.type}</span>
              </th>
              <td className={`${cell} ${wide}`}><span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-500/10 dark:text-violet-200">{row.type}</span></td>
              <td className={`${cell} text-right tabular-nums`}>{row.questions}</td>
              <td className={`${cell} ${wide} text-right tabular-nums text-slate-500 dark:text-zinc-400`}>{row.perQuestion ? marksText(row.perQuestion) : '—'}</td>
              <td className={`${cell} text-right font-semibold tabular-nums`}>{row.marks ? marksText(row.marks) : '—'}</td>
              {pattern.hasNegative && <td className={`${cell} text-right tabular-nums ${row.negative ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>{row.negative ? `−${marksText(row.negative)}` : '—'}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-[#e6e7eb] bg-[#faf9ff] dark:border-white/[0.08] dark:bg-violet-500/[0.05]">
          <tr className="font-semibold text-slate-900 dark:text-zinc-50">
            <td className={cell} />
            <th scope="row" className={`${cell} text-violet-700 dark:text-violet-300`}>Total</th>
            <td className={`${cell} ${wide}`} />
            <td className={`${cell} text-right tabular-nums`}>{pattern.questions}</td>
            <td className={`${cell} ${wide}`} />
            <td className={`${cell} text-right tabular-nums`}>{pattern.marks ? marksText(pattern.marks) : '—'}</td>
            {pattern.hasNegative && <td className={cell} />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * The chosen mock, laid out like a test paper's overview: status and the action first, then the key
 * facts, the section-by-section pattern with totals, and the admin's own instructions.
 */
const MockOverview = forwardRef(function MockOverview({ mock, role, index, report, onStart, onViewResult, onFeedback, className = '' }, ref) {
  const reduceMotion = useReducedMotion();
  const state = mockState(mock);
  const alwaysOpen = isAlwaysOpen(mock);
  const open = state === 'live' || state === 'in_progress';
  const pattern = patternOf(mock);
  const { paragraphs, rules } = instructionsOf(mock);
  const description = plainText(mock.description);
  const needsPassword = Boolean(mock.passwordEnabled && !mock.passwordUnlocked);
  const proctored = Boolean(mock.settings?.aiProctoring?.enabled);
  const fullscreen = Boolean(mock.settings?.enableFullscreen);
  const result = resultOf(report);

  const facts = [
    { icon: Clock3, label: 'Duration', value: formatDurationMinutes(mock.duration) },
    { icon: ListChecks, label: 'Questions', value: pattern.questions || '—' },
    { icon: Layers, label: 'Sections', value: pattern.rows.length || Number(mock.totalSections) || '—' },
    { icon: Trophy, label: 'Total marks', value: pattern.marks ? marksText(pattern.marks) : '—' },
    { icon: Camera, label: 'Proctoring', value: proctored ? 'Camera on' : 'Standard', hint: proctored ? 'AI proctoring watches the camera during the mock' : 'Usual test checks, no camera' },
    {
      icon: CalendarDays,
      label: state === 'upcoming' ? 'Opens' : 'Available',
      value: state === 'upcoming' ? formatDateTime(mock.startTime)
        : state === 'completed' ? 'Submitted'
          : state === 'closed' ? 'Closed'
            : alwaysOpen ? 'Any time' : `Till ${formatDateTime(mock.endTime)}`,
    },
  ];

  return (
    <motion.section ref={ref} key={mock._id} aria-labelledby="pmock-overview-title" tabIndex={-1}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none dark:border-white/[0.07] dark:bg-[#242424] ${className}`}>
      <header data-guide="pmock-mock" className={`relative border-b border-[#eef0f3] p-5 sm:p-6 dark:border-white/[0.06] ${open ? 'bg-[linear-gradient(180deg,rgba(16,185,129,0.06),transparent)]' : ''}`}>
        {open && <span className="absolute inset-x-0 top-0 h-[3px] bg-emerald-500" aria-hidden="true" />}
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">{role.name} · Mock {index + 1} of {role.mocks.length}</p>
        <div className="mt-1.5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 id="pmock-overview-title" className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-slate-900 sm:text-[22px] dark:text-zinc-50">{mock.title || 'Untitled mock'}</h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge state={state} />
              {alwaysOpen && open && <AlwaysOpenBadge />}
              {needsPassword && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20"><KeyRound className="h-3 w-3" aria-hidden="true" />Password needed</span>}
              {fullscreen && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold leading-none text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10"><Maximize2 className="h-3 w-3" aria-hidden="true" />Full screen</span>}
              {sectionTypes(mock).map((type) => <span key={type} className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-500/10 dark:text-violet-200">{type}</span>)}
            </div>
            {description && <p className="mt-3 max-w-2xl text-[13.5px] leading-6 text-slate-600 dark:text-zinc-300">{description}</p>}
          </div>
          <div className="flex shrink-0 flex-col gap-2 lg:items-end">
            <MockActions mock={mock} state={state} report={report} onStart={onStart} onViewResult={onViewResult} onFeedback={onFeedback} size="lg" className="lg:justify-end" />
            <p className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-zinc-400"><CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{availabilityText(mock, state, alwaysOpen)}</p>
          </div>
        </div>
        {state === 'completed' && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-[13px] dark:border-indigo-400/15 dark:bg-indigo-500/[0.07]">
            <BarChart3 className="h-4 w-4 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
            <span className="text-slate-700 dark:text-zinc-200">{result ? <>Your result: <b className="font-semibold text-indigo-700 dark:text-indigo-200">{result.label}</b></> : 'Submitted. Your result shows here once it is announced.'}</span>
            {report && <button type="button" onClick={() => onViewResult(report)} className={`ml-auto rounded-lg text-[12.5px] font-semibold text-indigo-700 hover:underline dark:text-indigo-200 ${focusRing}`}>Open full report</button>}
          </div>
        )}
      </header>

      <div className="space-y-6 p-5 sm:p-6">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#e9eaee] bg-[#e9eaee] sm:grid-cols-3 2xl:grid-cols-6 dark:border-white/[0.07] dark:bg-white/[0.07]">
          {facts.map((fact) => <Fact key={fact.label} {...fact} />)}
        </dl>

        <section aria-labelledby="pmock-pattern-title">
          <Heading icon={ListChecks} aside={<span className="text-[11.5px] text-slate-400 dark:text-zinc-500">{plural(pattern.rows.length, 'section')} · {formatDurationMinutes(mock.duration)} in total</span>}>
            <span id="pmock-pattern-title">Exam pattern</span>
          </Heading>
          <PatternTable pattern={pattern} />
          {pattern.hasNegative && <p className="mt-2 text-[12px] text-slate-500 dark:text-zinc-400">Negative marks are taken off for each wrong answer in that section. Skipping a question costs nothing.</p>}
        </section>

        <section aria-labelledby="pmock-instructions-title">
          <Heading icon={ClipboardList}><span id="pmock-instructions-title">Instructions</span></Heading>
          {paragraphs.length || rules.length ? (
            <div className="rounded-xl border border-[#e9eaee] bg-[#fbfbfd] p-4 text-[13.5px] leading-6 text-slate-700 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300">
              {paragraphs.map((text, at) => <p key={at} className={at ? 'mt-2' : ''}>{text}</p>)}
              {rules.length > 0 && (
                <ol className={`space-y-1.5 ${paragraphs.length ? 'mt-3 border-t border-[#eef0f3] pt-3 dark:border-white/[0.06]' : ''}`}>
                  {rules.map((rule, at) => (
                    <li key={at} className="flex gap-2.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">{at + 1}</span><span>{rule}</span></li>
                  ))}
                </ol>
              )}
            </div>
          ) : <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">No extra instructions for this mock. The full instructions show again before you start.</p>}
        </section>
      </div>
    </motion.section>
  );
});

export default MockOverview;
