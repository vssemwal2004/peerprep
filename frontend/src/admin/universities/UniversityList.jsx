import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ExternalLink, PlusCircle, Search } from 'lucide-react';
import { useUniversities } from './useUniversities';
import { enabledModules, portalUrl, STATUS_META, universityHealth } from './universityModel';
import { ButtonLink, Card, EmptyState, LoadingBlock, Notice, PageHeader, pageShell, Pill, helper, inputClass } from './ui';
import UniversityBadge from './UniversityBadge';
import { SortHeader, TablePager, useClientTable } from '../../components/table';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live', test: (health) => health.status === 'live' || health.status === 'expiring' },
  { key: 'attention', label: 'Needs attention', test: (health) => health.needsAttention },
  { key: 'disabled', label: 'Disabled', test: (health) => health.status === 'disabled' },
];
const COLUMN_VALUES = {
  name: ({ university }) => university.name,
  status: ({ health }) => STATUS_META[health.status]?.label || health.status,
  modules: ({ university }) => enabledModules(university).length,
  service: ({ university, health }) => (university.serviceStartDate && university.serviceEndDate ? health.daysLeft : null),
  limits: ({ university }) => university.studentLimit ?? null,
  coins: ({ university }) => Number(university.coinBalance || 0),
};
const columnValue = (row, key) => COLUMN_VALUES[key]?.(row);

function servicePeriod({ university, health }) {
  if (!university.serviceStartDate || !university.serviceEndDate) return 'Not set';
  if (health.daysLeft < 0) return `Ended ${university.serviceEndDate}`;
  return `Until ${university.serviceEndDate}`;
}

/** Every university in one searchable table; each row opens that university's own page. */
export default function UniversityList() {
  const { universities, loading, error } = useUniversities();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const rows = useMemo(() => universities.map((university) => ({ university, health: universityHealth(university) })), [universities]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(({ key, test }) => [key, test ? rows.filter((row) => test(row.health)).length : rows.length])), [rows]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const test = FILTERS.find((item) => item.key === filter)?.test;
    return rows
      .filter((row) => !test || test(row.health))
      .filter(({ university }) => !term || [university.name, university.universityId, university.contactEmail].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [rows, query, filter]);
  const table = useClientTable(visible, { getValue: columnValue, initialSort: { key: 'name', direction: 'asc' }, resetKey: `${filter}|${query}` });
  const header = (key, label, extra = {}) => <SortHeader sortKey={key} sort={table.sort} onSort={table.toggleSort} className="pl-0" {...extra}>{label}</SortHeader>;

  if (loading) return <LoadingBlock label="Loading universities…" />;
  return (
    <div className={pageShell}>
      <PageHeader title="All universities" description="Search, check status at a glance and open a university to manage it."
        actions={<ButtonLink to="/admin/universities/new" icon={PlusCircle}>Add university</ButtonLink>} />
      {error && <Notice tone="danger">{error}</Notice>}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <label data-guide="ul-search" className="relative min-w-[16rem] flex-1">
            <span className="sr-only">Search universities</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className={`${inputClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, ID or contact email" />
          </label>
          <div data-guide="ul-filters" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Filter universities">
            {FILTERS.map(({ key, label }) => (
              <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filter === key ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'}`}>
                {label} <span className="tabular-nums text-slate-400">{counts[key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {visible.length === 0 ? (
            <EmptyState icon={Building2} title={universities.length ? 'No university matches' : 'No universities yet'}
              action={!universities.length && <ButtonLink to="/admin/universities/new" icon={PlusCircle}>Add university</ButtonLink>}>
              {universities.length ? 'Try another search or filter.' : 'Add a university to give its students their own PeerPrep portal.'}
            </EmptyState>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table data-guide="ul-table" className="w-full min-w-[820px] text-left text-sm" data-no-serial>
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <tr>{header('name', 'University')}{header('status', 'Status')}{header('modules', 'Modules')}{header('service', 'Service')}{header('limits', 'Account limits')}{header('coins', 'Prep Coins', { align: 'right' })}<th className="py-2"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {table.pageRows.map((row) => {
                    const { university, health } = row;
                    const modules = enabledModules(university);
                    return (
                      <tr key={university.universityId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 pr-3">
                          <Link to={`/admin/universities/${university.universityId}`} className="flex items-center gap-3">
                            <UniversityBadge university={university} size="sm" />
                            <span className="min-w-0"><span className="block truncate font-semibold text-slate-900 hover:text-sky-700 dark:text-white">{university.name}</span><span className={helper}>{university.universityId}</span></span>
                          </Link>
                        </td>
                        <td className="py-3 pr-3"><Pill tone={STATUS_META[health.status].tone}>{STATUS_META[health.status].label}</Pill>{health.issues.length > 0 && <span className={`mt-1 block ${helper}`}>{health.issues.length} setup item{health.issues.length === 1 ? '' : 's'} left</span>}</td>
                        <td className="py-3 pr-3"><span className="font-medium text-slate-800 dark:text-slate-200">{modules.length} of 6</span><span className={`block max-w-[14rem] truncate ${helper}`}>{modules.map((module) => module.label).join(', ') || 'None'}</span></td>
                        <td className="py-3 pr-3 text-slate-700 dark:text-slate-300">{servicePeriod(row)}</td>
                        <td className="py-3 pr-3 text-slate-700 dark:text-slate-300">{university.coordinatorLimit ?? '—'} coordinators · {university.studentLimit ?? '—'} students</td>
                        <td className="py-3 pr-3 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{Number(university.coinBalance || 0).toLocaleString()}</td>
                        <td className="py-3 text-right">
                          <span className="inline-flex items-center gap-1">
                            <a href={portalUrl(university)} target="_blank" rel="noreferrer" title="Open the student portal" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-sky-700 dark:hover:bg-slate-800"><ExternalLink className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Open {university.name} portal</span></a>
                            <Link to={`/admin/universities/${university.universityId}`} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40">Manage</Link>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePager {...table.pager} noun="universities" />
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
