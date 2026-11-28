import { Bookmark, Check, CircleDotDashed, LoaderCircle } from 'lucide-react';
import CompanyLogo from '../prepMock/CompanyLogo';
import { DIFFICULTY, focusRing, logoFor, problemStatus, topicTone, typeLabel } from './problemsUi';

function StatusMark({ status }) {
  if (status === 'solved') return <span title="Solved" className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_4px_10px_-4px_rgba(16,185,129,0.8)]"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /><span className="sr-only">Solved</span></span>;
  if (status === 'attempted') return <span title="Attempted, not solved yet" className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 text-amber-500 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-400/25"><CircleDotDashed className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" /><span className="sr-only">Attempted</span></span>;
  return <span title="Not attempted" className="h-6 w-6 rounded-full border-2 border-[#e2e5ea] transition-colors group-hover:border-violet-300 dark:border-white/10 dark:group-hover:border-violet-400/40"><span className="sr-only">Not attempted</span></span>;
}

function companyTooltip(company, reports, latestDate) {
  const count = Number(reports) || 0;
  return [`Asked at ${company}`, count > 0 && `confirmed by ${count} student${count === 1 ? '' : 's'}`,
    latestDate && `last reported ${new Date(latestDate).toLocaleDateString()}`].filter(Boolean).join(' · ');
}

/** One question. The whole card opens it; company tags filter the list; the bookmark saves it. */
export default function ProblemRow({ problem, number, saved, opening, logos, onOpen, onSave, onCompany }) {
  const difficulty = DIFFICULTY[problem.difficulty];
  const status = problemStatus(problem);
  const tags = (problem.tags || []).slice(0, 3);
  const companies = (problem.reportedCompanies || []).slice(0, 3);
  return <li>
    <div role="button" tabIndex={0} onClick={() => onOpen(problem)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(problem); } }}
      aria-label={`PeerPrep ${number}. ${problem.title}${problem.difficulty ? `, ${problem.difficulty}` : ''}`}
      className={`group relative grid cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-xl border py-3 pl-4 pr-3 transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-violet-200 hover:shadow-[0_14px_28px_-20px_rgba(109,40,217,0.55)] motion-reduce:transform-none dark:hover:border-violet-400/30 sm:grid-cols-[24px_minmax(0,1fr)_100px_78px_32px] ${focusRing} ${status === 'solved'
        ? 'border-emerald-100 bg-gradient-to-r from-emerald-50/70 via-white to-white dark:border-emerald-400/10 dark:from-emerald-500/[0.06] dark:via-[#242424] dark:to-[#242424]'
        : 'border-[#eef0f3] bg-white dark:border-white/[0.06] dark:bg-[#242424]'}`}>
      <span className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${difficulty?.rail || 'bg-slate-300'}`} aria-hidden="true" />
      <StatusMark status={status} />
      <div className="min-w-0">
        {/* Phones: the title may wrap to two lines instead of being cut after a few words. */}
        <div className="flex items-start gap-1.5 sm:items-center sm:gap-2">
          <span title={`Question serial ${number}`} className="shrink-0 text-[13px] font-semibold leading-5 tabular-nums text-slate-400 dark:text-zinc-500 sm:w-10 sm:text-right">{number}<span className="sm:hidden">.</span></span>
          <span className="line-clamp-2 text-[14.5px] font-medium leading-5 text-slate-900 transition-colors group-hover:text-violet-700 dark:text-zinc-50 dark:group-hover:text-violet-200 sm:truncate" title={problem.title}>{problem.title}</span>
          {opening && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-violet-500" aria-label="Opening" />}
        </div>
        {(tags.length > 0 || companies.length > 0) && <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:pl-12">
          {tags.map((tag) => <span key={tag} className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${topicTone(tag)}`}>{tag}</span>)}
          {companies.map(({ company, latestDate, reports, voters }) => <button key={company} type="button" onClick={(event) => { event.stopPropagation(); onCompany(company); }}
            title={companyTooltip(company, reports ?? voters, latestDate)}
            className={`inline-flex items-center gap-1 rounded-md border border-[#e9eaee] bg-white py-px pl-px pr-1.5 text-[11px] font-medium text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:bg-violet-500/10 ${focusRing}`}>
            <CompanyLogo name={company} logo={logoFor(logos, company)} size="xs" className="!border-0 !shadow-none" />{company}
          </button>)}
        </div>}
      </div>
      <div className="flex items-center gap-2 sm:contents">
        <span className="hidden text-[12px] text-slate-500 dark:text-zinc-400 sm:block">{typeLabel(problem.questionType)}</span>
        {difficulty ? <span className={`justify-self-start rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${difficulty.pill}`}>{difficulty.short}</span> : <span />}
        <button type="button" onClick={(event) => { event.stopPropagation(); onSave(problem); }} aria-label="Save to a list"
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-violet-50 dark:hover:bg-white/[0.06] ${saved ? 'text-violet-600 dark:text-violet-300' : 'text-slate-300 hover:text-violet-600 dark:text-zinc-600 dark:hover:text-violet-300'} ${focusRing}`}>
          <Bookmark className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} aria-hidden="true" />
        </button>
      </div>
    </div>
  </li>;
}

export function ProblemRowsSkeleton() {
  return <ul className="space-y-2" aria-label="Loading questions">{Array.from({ length: 8 }, (_, index) => <li key={index} className="flex h-[66px] items-center gap-3 rounded-xl border border-[#eef0f3] bg-white px-4 dark:border-white/[0.06] dark:bg-[#242424]">
    <span className="h-6 w-6 animate-pulse rounded-full bg-slate-100 dark:bg-white/[0.06]" />
    <span className="flex-1 space-y-2"><span className="block h-3.5 w-2/5 animate-pulse rounded bg-slate-100 dark:bg-white/[0.06]" /><span className="block h-2.5 w-1/4 animate-pulse rounded bg-slate-100 dark:bg-white/[0.05]" /></span>
    <span className="h-5 w-14 animate-pulse rounded-full bg-slate-100 dark:bg-white/[0.06]" />
  </li>)}</ul>;
}
