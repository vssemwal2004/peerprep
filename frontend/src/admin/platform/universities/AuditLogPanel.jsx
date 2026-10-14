import { ScrollText } from 'lucide-react';
import { EmptyState, SectionCard } from './primitives';
import { auditLabel, formatDateTime, relativeTime } from './universityModel';

/** The control plane's most recent audit entries (the server returns the latest 30, newest first). */
export default function AuditLogPanel({ audit = [], universities = [] }) {
  const names = new Map(universities.map((university) => [university.universityId, university.name]));
  const rows = [...audit].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!rows.length) return <SectionCard><EmptyState icon={ScrollText} title="No activity recorded yet">Creating universities, changing their access and sharing assessments are recorded here.</EmptyState></SectionCard>;
  const university = (row) => row.universityId
    ? <><span className="font-medium text-slate-800 dark:text-zinc-100">{names.get(row.universityId) || row.universityId}</span>{names.has(row.universityId) && <span className="ml-1 font-mono text-[11.5px] text-slate-400">{row.universityId}</span>}</>
    : <span className="text-slate-400 dark:text-zinc-500">Platform-wide</span>;
  return <SectionCard title="Recent activity" description={`The ${rows.length} most recent changes and record views on this control plane, newest first.`}>
    <div className="-mx-4 sm:-mx-5">
      <table className="hidden w-full text-left text-sm md:table">
        <thead className="bg-slate-50/80 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-zinc-900/60 dark:text-zinc-400">
          <tr><th scope="col" className="py-2.5 pl-5 pr-3">Time</th><th scope="col" className="px-3 py-2.5">Action</th><th scope="col" className="py-2.5 pl-3 pr-5">University</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
          {rows.map((row) => <tr key={row._id}>
            <td className="whitespace-nowrap py-2.5 pl-5 pr-3"><time dateTime={row.createdAt} title={formatDateTime(row.createdAt)} className="text-slate-700 dark:text-zinc-200">{relativeTime(row.createdAt)}</time><span className="block text-[11.5px] text-slate-400">{formatDateTime(row.createdAt)}</span></td>
            <td className="px-3 py-2.5"><span className="font-medium text-slate-800 dark:text-zinc-100">{auditLabel(row.action)}</span><span className="block font-mono text-[11px] text-slate-400">{row.action}</span></td>
            <td className="py-2.5 pl-3 pr-5">{university(row)}</td>
          </tr>)}
        </tbody>
      </table>
      <ul className="divide-y divide-slate-100 dark:divide-zinc-800 md:hidden">
        {rows.map((row) => <li key={row._id} className="px-4 py-3">
          <p className="text-sm font-medium text-slate-800 dark:text-zinc-100">{auditLabel(row.action)}</p>
          <p className="mt-0.5 text-[12.5px]">{university(row)}</p>
          <time dateTime={row.createdAt} className="mt-0.5 block text-[12px] text-slate-500 dark:text-zinc-400">{formatDateTime(row.createdAt)} · {relativeTime(row.createdAt)}</time>
        </li>)}
      </ul>
    </div>
  </SectionCard>;
}
