import { Bookmark, Building2, Check, LoaderCircle } from 'lucide-react';
import { DIFFICULTY, focusRing, problemStatus, typeLabel } from './problemsUi';

function StatusMark({ status }) {
  if (status === 'solved') return <span title="Solved" className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /><span className="sr-only">Solved</span></span>;
  if (status === 'attempted') return <span title="Attempted, not solved yet" className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-amber-400"><span className="sr-only">Attempted</span></span>;
  return <span title="Not attempted" className="h-6 w-6 rounded-full border-2 border-[#e2e5ea] dark:border-white/10"><span className="sr-only">Not attempted</span></span>;
}

function companyTooltip(company, reports, latestDate) {
  const count = Number(reports) || 0;
  return [`Asked at ${company}`, count > 0 && `confirmed by ${count} student${count === 1 ? '' : 's'}`,
    latestDate && `last reported ${new Date(latestDate).toLocaleDateString()}`].filter(Boolean).join(' · ');
}

/** One question. The whole card opens it; company tags filter the list; the bookmark saves it. */
export default function ProblemRow({ problem, number, saved, opening, onOpen, onSave, onCompany }) {
  const difficulty = DIFFICULTY[problem.difficulty];
  const tags = (problem.tags || []).slice(0, 3);
  const companies = (problem.reportedCompanies || []).slice(0, 3);
  return <li>
    <div role="button" tabIndex={0} onClick={() => onOpen(problem)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(problem); } }}
      aria-label={`${number}. ${problem.title}${problem.difficulty ? `, ${problem.difficulty}` : ''}`}
      className={`group relative grid cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-xl border border-[#eef0f3] bg-white py-3 pl-4 pr-3 transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-sky-200 hover:shadow-[0_12px_26px_-20px_rgba(2,132,199,0.6)] motion-reduce:transform-none dark:border-white/[0.06] dark:bg-[#232325] dark:hover:border-sky-400/30 sm:grid-cols-[24px_minmax(0,1fr)_100px_78px_32px] ${focusRing}`}>
      <span className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${difficulty?.rail || 'bg-slate-300'}`} aria-hidden="true" />
      <StatusMark status={problemStatus(problem)} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[12px] tabular-nums text-slate-400 dark:text-zinc-500">{number}</span>
          <span className="truncate text-[14.5px] font-medium text-slate-900 transition-colors group-hover:text-sky-700 dark:text-zinc-50 dark:group-hover:text-sky-300" title={problem.title}>{problem.title}</span>          {opening && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-sky-500" aria-label="Opening" />}
        </div>
        {(tags.length > 0 || companies.length > 0) && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => <span key={tag} className="rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-white/[0.05] dark:text-zinc-400">{tag}</span>)}
          {companies.map(({ company, latestDate, reports, voters }) => <button key={company} type="button" onClick={(event) => { event.stopPropagation(); onCompany(company); }}
            title={companyTooltip(company, reports ?? voters, latestDate)}
            className={`inline-flex items-center gap-1 rounded-md bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-700 hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20 ${focusRing}`}>
            <Building2 className="h-3 w-3" aria-hidden="true" />{company}
          </button>)}
        </div>}
      </div>
      <div className="flex items-center gap-2 sm:contents">
        <span className="hidden text-[12px] text-slate-500 dark:text-zinc-400 sm:block">{typeLabel(problem.questionType)}</span>
        {difficulty ? <span className={`justify-self-start rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${difficulty.pill}`}>{difficulty.short}</span> : <span />}
        <button type="button" onClick={(event) => { event.stopPropagation(); onSave(problem); }} aria-label="Save to a list"
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[#f3f4f6] dark:hover:bg-white/[0.06] ${saved ? 'text-amber-500' : 'text-slate-300 hover:text-slate-500 dark:text-zinc-600 dark:hover:text-zinc-300'} ${focusRing}`}>
          <Bookmark className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} aria-hidden="true" />
        </button>
      </div>
    </div>
  </li>;
}

export function ProblemRowsSkeleton() {
  return <ul className="space-y-2" aria-label="Loading questions">{Array.from({ length: 8 }, (_, index) => <li key={index} className="flex h-[66px] items-center gap-3 rounded-xl border border-[#eef0f3] bg-white px-4 dark:border-white/[0.06] dark:bg-[#232325]">
    <span className="h-6 w-6 animate-pulse rounded-full bg-slate-100 dark:bg-white/[0.06]" />
    <span className="flex-1 space-y-2"><span className="block h-3.5 w-2/5 animate-pulse rounded bg-slate-100 dark:bg-white/[0.06]" /><span className="block h-2.5 w-1/4 animate-pulse rounded bg-slate-100 dark:bg-white/[0.05]" /></span>
    <span className="h-5 w-14 animate-pulse rounded-full bg-slate-100 dark:bg-white/[0.06]" />
  </li>)}</ul>;
}
