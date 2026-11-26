// The exam pattern an admin wrote for a company + role, as a test-paper table:
// S.No · Section · Type · Questions · Duration (min) · Marks, with a Total row.
// Shared by the mock builder (preview), the admin workspace, the University page and students.
import { formatPatternFrom, sectionTypeLabel, writtenPattern } from './patternModel';

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:text-zinc-400';
const td = 'px-3 py-2.5 text-[13px] tabular-nums text-slate-700 dark:text-zinc-200';

/**
 * `pattern`: { rows: [{ name, type, questions, minutes, marks }], patternFrom }.
 * `showType`: false hides the Type column. `footnote`: false hides the "suggested times" note.
 */
export default function MockPatternTable({ pattern, caption = 'Exam pattern', showType = true, footnote = true, className = '' }) {
  const { rows, totals, hasTimes } = writtenPattern(pattern);
  if (!rows.length) return null;
  const from = formatPatternFrom(pattern?.patternFrom, { long: true });
  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 ${className}`}>
      <table className="w-full min-w-[420px] border-collapse" data-no-serial>
        <caption className="sr-only">{caption}{from ? ` (${from})` : ''}</caption>
        <thead className="bg-slate-50 dark:bg-white/[0.04]">
          <tr>
            <th scope="col" className={`${th} w-12`}>S.No</th>
            <th scope="col" className={th}>Section</th>
            {showType ? <th scope="col" className={`${th} hidden sm:table-cell`}>Type</th> : null}
            <th scope="col" className={`${th} text-right`}>Questions</th>
            <th scope="col" className={`${th} text-right`}>Duration (min)</th>
            <th scope="col" className={`${th} text-right`}>Marks</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {rows.map((row, index) => (
            <tr key={`${row.name}-${index}`}>
              <td className={`${td} text-slate-500 dark:text-zinc-400`}>{index + 1}</td>
              <td className={`${td} font-medium text-slate-900 dark:text-white`}>{row.name}</td>
              {showType ? <td className={`${td} hidden sm:table-cell`}>{sectionTypeLabel(row.type)}</td> : null}
              <td className={`${td} text-right`}>{row.questions}</td>
              <td className={`${td} text-right`}>{row.minutes || '–'}</td>
              <td className={`${td} text-right`}>{row.marks}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-50/80 font-semibold dark:bg-white/[0.04]">
          <tr>
            <td className={td} />
            <td className={`${td} font-semibold text-slate-900 dark:text-white`}>Total</td>
            {showType ? <td className={`${td} hidden sm:table-cell`} /> : null}
            <td className={`${td} text-right font-semibold`}>{totals.questions}</td>
            <td className={`${td} text-right font-semibold`}>{hasTimes ? totals.minutes : '–'}</td>
            <td className={`${td} text-right font-semibold`}>{totals.marks}</td>
          </tr>
        </tfoot>
      </table>
      {footnote && hasTimes ? <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500 dark:border-white/[0.06] dark:text-zinc-400">Section durations are a guide. The timer runs for the whole test.</p> : null}
    </div>
  );
}
