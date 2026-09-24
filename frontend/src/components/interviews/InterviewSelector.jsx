import { useId } from 'react';

export default function InterviewSelector({ events, value, onChange, allLabel = 'All interviews' }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <label htmlFor={id} className="text-xs font-semibold text-slate-500 dark:text-gray-400">Interview</label>
      <select id={id} value={value || ''} onChange={(event) => onChange(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 sm:max-w-md dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-sky-900">
        <option value="">{allLabel}</option>
        {events.map((event) => <option key={event._id} value={event._id}>{event.name}</option>)}
      </select>
    </div>
  );
}
