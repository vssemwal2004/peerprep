import { ArrowRight, Clock, ExternalLink } from 'lucide-react';

export function InterviewStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-2 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{value ?? '—'}</div>
    </div>
  );
}

export function InterviewPair({ pair }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] items-center gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-slate-400">Mentor</div>
          <div className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-white">{pair.interviewer?.name || pair.interviewer?.email || 'Unassigned'}</div>
          <div className="mt-1 break-words text-xs text-slate-500 dark:text-gray-400">{pair.interviewer?.studentId || pair.interviewer?.email}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-300" />
        <div className="min-w-0">
          <div className="text-[11px] text-slate-400">Candidate</div>
          <div className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-white">{pair.interviewee?.name || pair.interviewee?.email || 'Unassigned'}</div>
          <div className="mt-1 break-words text-xs text-slate-500 dark:text-gray-400">{pair.interviewee?.studentId || pair.interviewee?.email}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-gray-800 dark:text-gray-400">
        <span className="rounded-md bg-slate-100 px-2 py-1 capitalize text-slate-600 dark:bg-gray-800 dark:text-gray-300">{pair.status || (pair.scheduledAt ? 'Scheduled' : 'Pending')}</span>
        {pair.scheduledAt && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(pair.scheduledAt).toLocaleString()}</span>}
        {pair.meetingLink && <a href={pair.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-600 hover:underline dark:text-sky-400">Meeting<ExternalLink className="h-3 w-3" /></a>}
      </div>
    </div>
  );
}
