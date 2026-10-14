import { ChevronRight, ExternalLink, Mail, Settings2 } from 'lucide-react';
import { HealthBadge, StatusBadge, UniversityLogo } from './primitives';
import { formatCount, formatDateTime, heartbeatHealth, relativeTime } from './universityModel';
import { focusRing } from './styles';

const host = (url) => { try { return new URL(url).host; } catch { return url; } };

function Heartbeat({ university, now }) {
  const health = heartbeatHealth(university, now);
  return <div className="flex flex-col items-start gap-1">
    <HealthBadge health={health} title={university.lastHeartbeatAt ? `Last heartbeat ${formatDateTime(university.lastHeartbeatAt)}` : 'No heartbeat received yet'} />
    {university.lastHeartbeatAt && <span className="text-[11.5px] text-slate-500 dark:text-zinc-400">{relativeTime(university.lastHeartbeatAt, now)}</span>}
  </div>;
}

function Usage({ usage = {} }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] tabular-nums">
    {[['Students', usage.students], ['Coordinators', usage.coordinators], ['Submissions', usage.submissions], ['AI interviews', usage.interviewSessions]].map(([label, value]) => <div key={label} className="flex justify-between gap-2">
      <dt className="text-slate-500 dark:text-zinc-400">{label}</dt><dd className="font-semibold text-slate-800 dark:text-zinc-100">{formatCount(value ?? 0)}</dd>
    </div>)}
  </dl>;
}

function SiteLink({ url }) {
  if (!url) return <span className="text-[12.5px] text-slate-400 dark:text-zinc-500">Not set</span>;
  return <a href={url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} title={url}
    className={`inline-flex max-w-full items-center gap-1 rounded text-[12.5px] font-medium text-sky-700 hover:underline dark:text-sky-300 ${focusRing}`}>
    <span className="truncate">{host(url)}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
  </a>;
}

/** Table on large screens, cards on small ones. Clicking a row or its Manage button opens the drawer. */
export default function UniversityList({ universities, onOpen, now }) {
  return <>
    <div className="hidden overflow-x-auto lg:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50/80 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-zinc-900/60 dark:text-zinc-400">
          <tr>
            <th scope="col" className="py-3 pl-4 pr-3">University</th>
            <th scope="col" className="px-3 py-3">Contact &amp; site</th>
            <th scope="col" className="px-3 py-3">Status</th>
            <th scope="col" className="px-3 py-3">Heartbeat</th>
            <th scope="col" className="w-60 px-3 py-3">Usage</th>
            <th scope="col" className="py-3 pl-3 pr-4 text-right"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
          {universities.map((university) => <tr key={university.universityId} onClick={() => onOpen(university.universityId)} className="cursor-pointer align-top transition hover:bg-sky-50/40 dark:hover:bg-zinc-800/40">
            <td className="py-3 pl-4 pr-3">
              <div className="flex items-center gap-3">
                <UniversityLogo university={university} />
                <div className="min-w-0">
                  <p className="max-w-[16rem] truncate font-semibold text-slate-900 dark:text-zinc-50" title={university.name}>{university.name}</p>
                  <p className="font-mono text-[12px] text-slate-500 dark:text-zinc-400">{university.universityId}</p>
                </div>
              </div>
            </td>
            <td className="max-w-[16rem] px-3 py-3">
              <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-slate-600 dark:text-zinc-300"><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" /><span className="truncate" title={university.contactEmail || ''}>{university.contactEmail || 'No contact email'}</span></p>
              <div className="mt-1"><SiteLink url={university.deploymentUrl} /></div>
            </td>
            <td className="px-3 py-3"><StatusBadge active={university.active} /></td>
            <td className="px-3 py-3"><Heartbeat university={university} now={now} /></td>
            <td className="px-3 py-3"><Usage usage={university.usage} /></td>
            <td className="py-3 pl-3 pr-4 text-right">
              <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(university.universityId); }} aria-label={`Manage ${university.name}`}
                className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-sky-500 dark:hover:text-sky-300 ${focusRing}`}>
                <Settings2 className="h-4 w-4" aria-hidden="true" />Manage
              </button>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <ul className="divide-y divide-slate-100 dark:divide-zinc-800 lg:hidden">
      {universities.map((university) => <li key={university.universityId} className="relative p-4">
        <div className="flex items-start gap-3">
          <UniversityLogo university={university} />
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => onOpen(university.universityId)} className={`block max-w-full rounded text-left after:absolute after:inset-0 after:content-[''] ${focusRing}`} aria-label={`Manage ${university.name}`}>
              <span className="block truncate font-semibold text-slate-900 dark:text-zinc-50">{university.name}</span>
            </button>
            <p className="font-mono text-[12px] text-slate-500 dark:text-zinc-400">{university.universityId}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge active={university.active} />
              <HealthBadge health={heartbeatHealth(university, now)} />
              {university.lastHeartbeatAt && <span className="text-[11.5px] text-slate-500 dark:text-zinc-400">{relativeTime(university.lastHeartbeatAt, now)}</span>}
            </div>
          </div>
          <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </div>
        <div className="mt-3 space-y-1 sm:pl-14">
          <p className="truncate text-[12.5px] text-slate-600 dark:text-zinc-300">{university.contactEmail || 'No contact email'}</p>
          <div className="relative z-10"><SiteLink url={university.deploymentUrl} /></div>
          <div className="pt-1"><Usage usage={university.usage} /></div>
        </div>
      </li>)}
    </ul>
  </>;
}
