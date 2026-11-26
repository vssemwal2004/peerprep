// The exam pattern as a test paper table (S.No · Section · Questions · Time · Marks, Total row),
// shared by the admin form preview, the admin workspace and the student mock page.
import { patternRows, sectionTypeLabel } from './patternModel';

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:text-zinc-400';
const td = 'px-3 py-2.5 text-[13px] tabular-nums text-slate-700 dark:text-zinc-200';

/**
 * `sections`: mock sections (form or student summary); `duration`: total minutes (enforced).
 * `compact`: drops the Type column on narrow screens.
 */
export default function PatternTable({ sections = [], duration = 0, caption = 'Exam pattern', className = '' }) {
  const { rows, totals, hasTimes, hasNegative } = patternRows(sections, duration);
  if (!rows.length) return null;
  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 ${className}`}>
      <table className="w-full min-w-[420px] border-collapse" data-no-serial>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 dark:bg-white/[0.04]">
          <tr>
            <th scope="col" className={`${th} w-12`}>S.No</th>
            <th scope="col" className={th}>Section</th>
            <th scope="col" className={`${th} hidden sm:table-cell`}>Type</th>
            <th scope="col" className={`${th} text-right`}>Questions</th>
            {hasTimes ? <th scope="col" className={`${th} text-right`}>Time (min)</th> : null}
            <th scope="col" className={`${th} text-right`}>Marks</th>
            {hasNegative ? <th scope="col" className={`${th} hidden text-right md:table-cell`}>Negative</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {rows.map((row, index) => (
            <tr key={`${row.name}-${index}`}>
              <td className={`${td} text-slate-500 dark:text-zinc-400`}>{index + 1}</td>
              <td className={`${td} font-medium text-slate-900 dark:text-white`}>{row.name}</td>
              <td className={`${td} hidden sm:table-cell`}>{sectionTypeLabel(row.type)}</td>
              <td className={`${td} text-right`}>{row.questions}</td>
              {hasTimes ? <td className={`${td} text-right`}>{row.minutes ?? '–'}</td> : null}
              <td className={`${td} text-right`}>{row.marks}</td>
              {hasNegative ? <td className={`${td} hidden text-right md:table-cell`}>{row.negative ? `−${row.negative}` : '–'}</td> : null}
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-50/80 font-semibold dark:bg-white/[0.04]">
          <tr>
            <td className={td} />
            <td className={`${td} font-semibold text-slate-900 dark:text-white`}>Total</td>
            <td className={`${td} hidden sm:table-cell`} />
            <td className={`${td} text-right font-semibold`}>{totals.questions}</td>
            {hasTimes ? <td className={`${td} text-right font-semibold`}>{totals.minutes ?? '–'}</td> : null}
            <td className={`${td} text-right font-semibold`}>{totals.marks}</td>
            {hasNegative ? <td className={`${td} hidden md:table-cell`} /> : null}
          </tr>
        </tfoot>
      </table>
      {hasTimes ? <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500 dark:border-white/[0.06] dark:text-zinc-400">Section times are suggested. The timer runs for the whole test ({totals.minutes} min).</p> : null}
    </div>
  );
}
