import { Link } from 'react-router-dom';
import { BarChart3, CalendarClock } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { PanelTitle, PathGlyph } from './prepMockGlyphs';
import { companyPath, roleName } from './prepMockModel';
import { formatDateTime } from '../assessment-dashboard/assessmentDashboardUtils';
import { card, focusRing } from '../dashboard/ui';
import GuideInfo from '../../guide/platform/GuideInfo';

const SEGMENTS = [
  { key: 'completed', label: 'Completed', tone: 'bg-indigo-500' },
  { key: 'inProgress', label: 'In progress', tone: 'bg-amber-400' },
  { key: 'openOnly', label: 'Open', tone: 'bg-emerald-500' },
  { key: 'upcoming', label: 'Upcoming', tone: 'bg-sky-400' },
];

function Breakdown({ counts }) {
  const total = counts.total || 0;
  const values = { ...counts, openOnly: Math.max(0, counts.open - counts.inProgress) };
  return (
    <div className="mt-4">
      <div className="flex h-2 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.08]" role="img"
        aria-label={SEGMENTS.map((segment) => `${values[segment.key]} ${segment.label.toLowerCase()}`).join(', ') + ` of ${total} mocks`}>
        {total > 0 && SEGMENTS.map((segment) => values[segment.key] > 0 && (
          <span key={segment.key} className={`h-full ${segment.tone}`} style={{ width: `${(values[segment.key] / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] text-slate-500 dark:text-zinc-400" aria-hidden="true">
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${segment.tone}`} />{segment.label}<b className="ml-auto font-semibold tabular-nums text-slate-700 dark:text-zinc-200">{values[segment.key]}</b></li>
        ))}
      </ul>
    </div>
  );
}

function Row({ company, children, aside }) {
  return (
    <li className="flex items-center gap-2.5 py-2">
      <CompanyLogo name={company.name} logo={company.logo} size="sm" />
      <span className="min-w-0 flex-1">{children}</span>
      {aside}
    </li>
  );
}

const subHeading = 'mt-5 mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-zinc-500';

/** The student's own Prep Mock journey: status breakdown, recent results, what opens next. */
export default function JourneyRail({ journey, counts, onViewResult }) {
  return (
    <section data-guide="pmock-journey" aria-labelledby="pmock-journey-title" className={`p-5 ${card}`}>
      <PanelTitle id="pmock-journey-title" glyph={PathGlyph} tone="violet" title="Your mock journey" subtitle={`${journey.completed} of ${journey.total} mocks completed`} info={<GuideInfo step="pmock-journey" />} />
      <Breakdown counts={counts} />

      <h3 className={subHeading}>Recently completed</h3>
      {journey.recent.length ? (
        <ul className="divide-y divide-[#eef0f3] dark:divide-white/[0.06]">
          {journey.recent.map(({ mock, company, report, result }) => (
            <Row key={mock._id} company={company}
              aside={report ? (
                <button type="button" onClick={() => onViewResult(report)} aria-label={`View result of ${mock.title}`}
                  className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold ${result ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20' : 'text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/[0.06]'} ${focusRing}`}>
                  {result ? result.label : <><BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />Report</>}
                </button>
              ) : null}>
              <span className="block truncate text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100">{mock.title}</span>
              <span className="block truncate text-[11px] text-slate-500 dark:text-zinc-400">{company.name}{result ? '' : ' · result not announced yet'}</span>
            </Row>
          ))}
        </ul>
      ) : <p className="py-2 text-[12px] text-slate-500 dark:text-zinc-400">Your finished mocks and their results will show here.</p>}

      <h3 className={subHeading}>Opening soon</h3>
      {journey.upcoming.length ? (
        <ul className="divide-y divide-[#eef0f3] dark:divide-white/[0.06]">
          {journey.upcoming.map(({ mock, company }) => (
            <Row key={mock._id} company={company}>
              <Link to={`${companyPath(company.name)}?role=${encodeURIComponent(roleName(mock))}`} className={`block rounded ${focusRing}`}>
                <span className="block truncate text-[12.5px] font-semibold text-slate-800 hover:text-violet-700 dark:text-zinc-100 dark:hover:text-violet-300">{mock.title}</span>
                <span className="flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-zinc-400"><CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />{formatDateTime(mock.startTime)}</span>
              </Link>
            </Row>
          ))}
        </ul>
      ) : <p className="py-2 text-[12px] text-slate-500 dark:text-zinc-400">No scheduled mocks coming up.</p>}
    </section>
  );
}
