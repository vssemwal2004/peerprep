import { Link } from 'react-router-dom';
import { ArrowRight, Clock3 } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { LiveDot } from './prepMockUi';
import { PanelTitle, SparkGlyph } from './prepMockGlyphs';
import { companyPath, roleName } from './prepMockModel';
import { formatDurationMinutes } from '../assessment-dashboard/assessmentDashboardUtils';
import { focusRing } from '../dashboard/ui';
import GuideInfo from '../../guide/platform/GuideInfo';

const tile = 'w-[232px] shrink-0 snap-start rounded-2xl border bg-white p-3.5 dark:bg-[#242424]';

/** A mock the student started and has not submitted: one click back into the same launch flow. */
function ContinueCard({ entry, onContinue }) {
  const { mock, company } = entry;
  return (
    <li className={`${tile} flex flex-col border-amber-200 shadow-[0_10px_26px_-20px_rgba(217,119,6,0.7)] dark:border-amber-400/25`}>
      <div className="flex items-center gap-2.5">
        <CompanyLogo name={company.name} logo={company.logo} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-semibold text-slate-500 dark:text-zinc-400">{company.name}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">In progress</span>
        </span>
      </div>
      <p className="mt-2.5 line-clamp-2 text-[13.5px] font-semibold leading-snug text-slate-900 dark:text-zinc-50">{mock.title || 'Untitled mock'}</p>
      <p className="mt-1 flex items-center gap-1 text-[11.5px] text-slate-500 dark:text-zinc-400"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{formatDurationMinutes(mock.duration)} · {roleName(mock)}</p>
      <span className="flex-1" aria-hidden="true" />
      <button type="button" onClick={() => onContinue(mock)} aria-label={`Continue ${mock.title}`}
        className={`mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-900 text-[12.5px] font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 ${focusRing}`}>
        Continue<ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

function OpenCompanyCard({ company }) {
  const openRoles = company.roles.filter((role) => role.counts.open > 0);
  const firstRole = openRoles[0];
  const to = firstRole ? `${companyPath(company.name)}?role=${encodeURIComponent(firstRole.name)}` : company.path;
  return (
    <li className="shrink-0 snap-start">
      <Link to={to} aria-label={`${company.name}: ${company.counts.open} open now`}
        className={`${tile} group flex h-full flex-col border-[#e9eaee] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_14px_30px_-22px_rgba(5,150,105,0.65)] motion-reduce:transform-none dark:border-white/[0.07] dark:hover:border-emerald-400/30 ${focusRing}`}>
        <div className="flex items-start justify-between gap-2">
          <CompanyLogo name={company.name} logo={company.logo} size="spot" />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold leading-none text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><LiveDot />{company.counts.open} open</span>
        </div>
        <p className="mt-3 truncate text-[14px] font-semibold text-slate-900 dark:text-zinc-50">{company.name}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{openRoles.map((role) => role.name).join(' · ') || 'Open now'}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">Take a mock<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /></span>
      </Link>
    </li>
  );
}

/**
 * "Right now": mocks to continue, then companies with a mock open now, in one horizontal row
 * (it scrolls inside itself, never the page). Hidden when there is nothing to do right now.
 */
export default function Spotlight({ inProgress = [], companies = [], onContinue }) {
  if (!inProgress.length && !companies.length) return null;
  const subtitle = [
    inProgress.length ? `${inProgress.length} to continue` : '',
    companies.length ? `${companies.length} ${companies.length === 1 ? 'company' : 'companies'} open now` : '',
  ].filter(Boolean).join(' · ');
  return (
    <section aria-labelledby="pmock-spotlight-title" data-guide="pmock-spotlight" className="min-w-0">
      <PanelTitle id="pmock-spotlight-title" glyph={SparkGlyph} tone="emerald" title="Right now" subtitle={subtitle} info={<GuideInfo step="pmock-spotlight" />} />
      <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 pt-1 sm:-mx-1 sm:px-1" aria-label="Mocks to continue and companies open now">
        {inProgress.map((entry) => <ContinueCard key={entry.mock._id} entry={entry} onContinue={onContinue} />)}
        {companies.map((company) => <OpenCompanyCard key={company.key} company={company} />)}
      </ul>
    </section>
  );
}
