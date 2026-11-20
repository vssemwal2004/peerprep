import { Archive, CalendarRange, CheckCircle2, FilePen, Layers, PlayCircle, Shapes } from 'lucide-react';
import { RAIL_PANEL_WIDTH, RAIL_WIDTH, useHoverRail } from '../../../components/useHoverRail';
import GuideInfo from '../../../guide/platform/GuideInfo';

const statusItems = [
  { id: 'all', label: 'All', countKey: 'total', Icon: Layers },
  { id: 'ongoing', label: 'Ongoing', countKey: 'ongoing', Icon: PlayCircle },
  { id: 'completed', label: 'Completed', countKey: 'completed', Icon: CheckCircle2 },
  { id: 'drafts', label: 'Drafts', countKey: 'drafts', Icon: FilePen },
  { id: 'archived', label: 'Archived', countKey: 'archived', Icon: Archive },
];

const creationDateOptions = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

const fieldClass = 'h-9 w-full rounded-lg border border-sky-100 bg-white px-2.5 text-xs text-slate-700 outline-none transition-colors focus:border-sky-400 dark:border-sky-950 dark:bg-slate-900 dark:text-gray-200';

/**
 * Assessment filters. On desktop it is an icon rail that slides open over the list on hover
 * (and on keyboard focus) and slides closed when the pointer leaves; icons never move.
 * On smaller screens it is always open.
 */
export default function AssessmentLifecycleSidebar({
  active,
  counts,
  onChange,
  creationWindow,
  onCreationWindowChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  testType,
  testTypes = [],
  onTestTypeChange,
}) {
  // Labels, counts and fields fade and slide in as the panel opens; icons stay fixed.
  const { rail: desktop, open, railProps, pickProps, donePicking, reveal } = useHoverRail('(min-width: 1024px)');
  const dateSet = creationWindow && creationWindow !== 'any';
  const typeSet = testType && testType !== 'all';

  return (
    <div data-guide="as-rail" className="relative lg:h-full lg:min-h-0" style={desktop ? { width: RAIL_WIDTH } : undefined}>
      <aside
        aria-label="Assessment filters"
        {...railProps}
        style={desktop ? { width: open ? RAIL_PANEL_WIDTH : RAIL_WIDTH } : undefined}
        className={`border-b border-sky-100 bg-[#f3f8fd] dark:border-sky-950 dark:bg-slate-950 lg:absolute lg:inset-y-0 lg:left-0 lg:z-[55] lg:overflow-hidden lg:border-b-0 lg:border-r lg:transition-[width,box-shadow] lg:duration-300 lg:ease-[cubic-bezier(0.22,1,0.36,1)] ${
          desktop && open ? 'shadow-[10px_0_32px_rgba(14,165,233,0.12)] dark:shadow-black/40' : 'lg:shadow-[4px_0_20px_rgba(14,165,233,0.06)]'
        }`}
      >
        <div className="h-full overflow-y-auto overflow-x-hidden px-2.5 py-4 [scrollbar-width:thin]" style={desktop ? { width: RAIL_PANEL_WIDTH } : undefined}>
          <section>
            <h2 className={`mb-2 flex h-4 items-center gap-1 whitespace-nowrap px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 ${reveal}`}>Test status<GuideInfo step="as-rail" /></h2>
            <nav className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1" aria-label="Assessment status">
              {statusItems.map(({ id, label, countKey, Icon }) => {
                const isActive = active === id;
                const count = Number(counts?.[countKey] || 0);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange(id)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={`${label} (${count})`}
                    title={open ? undefined : `${label} · ${count}`}
                    className={`group relative flex h-10 w-full items-center rounded-xl text-left text-[13px] transition-colors duration-200 ${
                      isActive
                        ? `font-semibold text-sky-700 dark:text-sky-300 ${open ? 'bg-sky-100/80 shadow-sm dark:bg-sky-900/30' : ''}`
                        : `font-medium text-slate-600 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white ${open ? 'hover:bg-white dark:hover:bg-slate-800' : ''}`
                    }`}
                  >
                    <span className={`absolute left-[3px] flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-200 ${
                      isActive ? 'bg-sky-600 text-white shadow-sm' : 'bg-white/70 text-slate-500 group-hover:text-sky-700 dark:bg-slate-800 dark:text-gray-400'
                    }`}>
                      <Icon className="h-4 w-4" strokeWidth={1.9} />
                      {!open && count > 0 && !isActive && (
                        <span className="absolute -right-1 -top-1 min-w-[15px] rounded-full bg-sky-600 px-1 text-center text-[9px] font-bold leading-[15px] text-white ring-2 ring-sky-50 dark:ring-slate-950">{count > 99 ? '99+' : count}</span>
                      )}
                    </span>
                    <span className={`ml-11 min-w-0 flex-1 truncate whitespace-nowrap ${reveal}`}>{label}</span>
                    <span className={`mr-2.5 text-xs tabular-nums ${isActive ? 'text-sky-700 dark:text-sky-300' : 'text-slate-400'} ${reveal}`}>
                      {count.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </nav>
          </section>

          <section className="mt-4 border-t border-sky-100 pt-4 dark:border-sky-950">
            <div className="relative flex min-h-9 items-start">
              <span className={`absolute left-[3px] top-0 flex h-8 w-8 items-center justify-center rounded-lg ${dateSet ? 'bg-sky-600 text-white' : 'bg-white/70 text-slate-500 dark:bg-slate-800 dark:text-gray-400'}`} title={open ? undefined : 'Creation date'}>
                <CalendarRange className="h-4 w-4" strokeWidth={1.9} />
              </span>
              <div className={`ml-11 min-w-0 flex-1 pr-0.5 ${reveal}`}>
                <label htmlFor="assessment-creation-date" className="block text-xs font-semibold text-slate-700 dark:text-gray-200">Creation date</label>
                <select
                  id="assessment-creation-date"
                  value={creationWindow}
                  onChange={(event) => { onCreationWindowChange(event.target.value); donePicking(); }}
                  {...pickProps}
                  tabIndex={open ? 0 : -1}
                  className={`mt-1.5 ${fieldClass}`}
                >
                  {creationDateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>

                {creationWindow === 'custom' && (
                  <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1">
                    <label className="text-[11px] text-slate-500 dark:text-gray-400">
                      From
                      <input type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} {...pickProps} tabIndex={open ? 0 : -1} className={`mt-1 ${fieldClass} px-2`} />
                    </label>
                    <label className="text-[11px] text-slate-500 dark:text-gray-400">
                      To
                      <input type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} {...pickProps} tabIndex={open ? 0 : -1} className={`mt-1 ${fieldClass} px-2`} />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="mt-4 border-t border-sky-100 pt-4 dark:border-sky-950">
            <div className="relative flex min-h-9 items-start">
              <span className={`absolute left-[3px] top-0 flex h-8 w-8 items-center justify-center rounded-lg ${typeSet ? 'bg-sky-600 text-white' : 'bg-white/70 text-slate-500 dark:bg-slate-800 dark:text-gray-400'}`} title={open ? undefined : 'Assessment type'}>
                <Shapes className="h-4 w-4" strokeWidth={1.9} />
              </span>
              <div className={`ml-11 min-w-0 flex-1 pr-0.5 ${reveal}`}>
                <label htmlFor="assessment-test-type" className="block text-xs font-semibold text-slate-700 dark:text-gray-200">Assessment type</label>
                <select
                  id="assessment-test-type"
                  value={testType}
                  onChange={(event) => { onTestTypeChange(event.target.value); donePicking(); }}
                  {...pickProps}
                  tabIndex={open ? 0 : -1}
                  className={`mt-1.5 ${fieldClass}`}
                >
                  <option value="all">All types</option>
                  {testTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
