const statusItems = [
  { id: 'all', label: 'All assessments', countKey: 'total' },
  { id: 'drafts', label: 'Drafts', countKey: 'drafts' },
  { id: 'upcoming', label: 'Scheduled', countKey: 'upcoming' },
  { id: 'active', label: 'Live', countKey: 'active' },
  { id: 'completed', label: 'Completed', countKey: 'completed' },
];

const creationDateOptions = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

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
  return (
    <aside className="border-b border-slate-200 bg-white px-4 py-5 dark:border-gray-800 dark:bg-gray-950 lg:sticky lg:top-20 lg:min-h-[calc(100vh-5rem)] lg:border-b-0 lg:border-r lg:px-5">
      <section>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Test status</h2>
        <nav className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-1" aria-label="Assessment status">
          {statusItems.map(({ id, label, countKey }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-900/20 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-white'
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${isActive ? 'border-sky-600' : 'border-slate-300 dark:border-gray-600'}`}>
                  {isActive && <span className="h-2 w-2 rounded-full bg-sky-600" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className={`text-xs tabular-nums ${isActive ? 'text-sky-700 dark:text-sky-300' : 'text-slate-400'}`}>
                  {Number(counts?.[countKey] || 0).toLocaleString()}
                </span>
              </button>
            );
          })}
        </nav>
      </section>

      <section className="mt-5 border-t border-slate-200 pt-5 dark:border-gray-800">
        <label htmlFor="assessment-creation-date" className="text-xs font-semibold text-slate-700 dark:text-gray-200">Creation date</label>
        <select
          id="assessment-creation-date"
          value={creationWindow}
          onChange={(event) => onCreationWindowChange(event.target.value)}
          className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          {creationDateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>

        {creationWindow === 'custom' && (
          <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1">
            <label className="text-[11px] text-slate-500 dark:text-gray-400">
              From
              <input type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
            </label>
            <label className="text-[11px] text-slate-500 dark:text-gray-400">
              To
              <input type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
            </label>
          </div>
        )}
      </section>

      <section className="mt-5 border-t border-slate-200 pt-5 dark:border-gray-800">
        <label htmlFor="assessment-test-type" className="text-xs font-semibold text-slate-700 dark:text-gray-200">Assessment type</label>
        <select
          id="assessment-test-type"
          value={testType}
          onChange={(event) => onTestTypeChange(event.target.value)}
          className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          <option value="all">All types</option>
          {testTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </section>
    </aside>
  );
}
