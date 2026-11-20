import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { CompletionRing, Highlight, LiveDot } from './prepMockUi';
import { highlightParts, matchedRole } from './prepMockModel';
import { focusRing } from '../dashboard/ui';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function describe(company) {
  const { counts, roles } = company;
  return `${company.name}: ${plural(roles.length, 'role')}, ${plural(counts.total, 'mock')}${counts.open ? `, ${counts.open} open now` : ''}, ${counts.completed} of ${counts.total} completed`;
}

/** The logo with a live dot on its corner when a mock is open now. */
function LogoWithDot({ company }) {
  return (
    <span className="relative shrink-0">
      <CompanyLogo name={company.name} logo={company.logo} size="tile" />
      {company.counts.open > 0 && (
        <span className="absolute -right-1 -top-1 rounded-full bg-white p-[3px] dark:bg-[#242424]"><LiveDot /></span>
      )}
    </span>
  );
}

/**
 * One company in the directory. Grid: a 72px tile (logo, name, counts, completion ring). List: a row
 * with the same facts in columns. The whole tile is the link to the company's roles.
 */
function CompanyTile({ company, query = '', view = 'grid' }) {
  const { counts, roles } = company;
  const role = matchedRole(company, query);
  const name = <Highlight parts={highlightParts(company.name, query)} />;
  const sub = role
    ? <>Role: <Highlight parts={highlightParts(role, query)} /></>
    : <>{plural(roles.length, 'role')} · {plural(counts.total, 'mock')}</>;

  if (view === 'list') {
    return (
      <li>
        <Link to={company.path} data-guide="pmock-company" aria-label={describe(company)}
          className={`group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[#f8f9fb] sm:px-4 dark:hover:bg-white/[0.03] ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0`}>
          <LogoWithDot company={company} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-slate-900 dark:text-zinc-50">{name}</span>
            <span className="block truncate text-[11.5px] text-slate-500 dark:text-zinc-400">
              {role ? sub : roles.slice(0, 3).map((entry) => entry.name).join(' · ') + (roles.length > 3 ? ` +${roles.length - 3}` : '')}
            </span>
          </span>
          <span className="hidden w-16 shrink-0 text-right text-[12px] tabular-nums text-slate-500 sm:block dark:text-zinc-400">{plural(roles.length, 'role')}</span>
          <span className="hidden w-16 shrink-0 text-right text-[12px] tabular-nums text-slate-500 sm:block dark:text-zinc-400">{plural(counts.total, 'mock')}</span>
          <span className="hidden w-24 shrink-0 md:block">
            {counts.open > 0 && <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-700 dark:text-emerald-300"><LiveDot />{counts.open} open</span>}
          </span>
          <span className="flex w-[72px] shrink-0 items-center justify-end gap-2">
            <span className="text-[11.5px] font-semibold tabular-nums text-slate-600 dark:text-zinc-300">{counts.completed}/{counts.total}</span>
            <CompletionRing done={counts.completed} total={counts.total} size={22} />
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500 motion-reduce:transition-none dark:text-zinc-600" aria-hidden="true" />
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Link to={company.path} data-guide="pmock-company" aria-label={describe(company)}
        className={`group flex h-[72px] items-center gap-2.5 rounded-2xl border border-[#e9eaee] bg-white px-2.5 sm:gap-3 sm:px-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-violet-200 hover:shadow-[0_10px_24px_-18px_rgba(79,70,229,0.55)] motion-reduce:transform-none dark:border-white/[0.07] dark:bg-[#242424] dark:hover:border-violet-400/30 ${focusRing}`}>
        <LogoWithDot company={company} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold leading-5 text-slate-900 dark:text-zinc-50">{name}</span>
          <span className="block truncate text-[11.5px] leading-4 text-slate-500 dark:text-zinc-400">{sub}</span>
        </span>
        <CompletionRing done={counts.completed} total={counts.total} size={26} className="hidden sm:block" />
      </Link>
    </li>
  );
}

export default memo(CompanyTile);
