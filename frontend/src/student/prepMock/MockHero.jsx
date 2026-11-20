import { TicketGlyph } from './prepMockGlyphs';
import { LiveDot } from './prepMockUi';
import PageGuideButton from '../../guide/platform/PageGuideButton';

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/** Hand-drawn stroke under "Mock", the student pages' title motif (violet here). */
function TitleUnderline() {
  return <svg viewBox="0 0 200 16" preserveAspectRatio="none" fill="none" aria-hidden="true" className="pointer-events-none absolute -bottom-2.5 left-0 h-3 w-full overflow-visible text-violet-400 dark:text-violet-500">
    <path d="M4 11.5C52 5.5 118 3.2 196 7.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" pathLength="1" className="dashboard-underline" />
  </svg>;
}

function ProgressMedal({ done, total }) {
  const radius = 40;
  const ring = 2 * Math.PI * radius;
  const share = total ? Math.min(1, done / total) : 0;
  return (
    <div className="relative h-[104px] w-[104px] shrink-0" role="img" aria-label={`${done} of ${total} mocks completed`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="pmock-medal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#4f46e5" /></linearGradient>
        </defs>
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-violet-100 dark:stroke-white/[0.07]" />
        {share > 0 && <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" strokeLinecap="round" stroke="url(#pmock-medal)" strokeDasharray={`${share * ring} ${ring}`} />}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="text-[24px] font-bold leading-none tabular-nums tracking-[-0.03em] text-slate-950 dark:text-white">{done}<span className="text-[14px] font-semibold text-slate-400 dark:text-zinc-500">/{total}</span></span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-zinc-400">done</span>
      </span>
    </div>
  );
}

function Stat({ label, value, detail, dot = false, className = '' }) {
  return (
    <div className={`min-w-0 border-black/[0.05] px-4 py-3 sm:px-5 dark:border-white/[0.06] ${className}`}>
      <dt className="flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-zinc-400">{dot && <LiveDot />}{label}</dt>
      <dd className="mt-0.5 truncate text-[18px] font-bold leading-tight tabular-nums text-slate-900 dark:text-white">
        {value}{detail && <span className="ml-1 text-[12px] font-medium text-slate-400 dark:text-zinc-500">{detail}</span>}
      </dd>
    </div>
  );
}

/**
 * The top of Prep Mock: what the page is, and the student's own standing in it (completed, open now,
 * companies tried, best and latest released result). Compact: no tall empty banner.
 */
export default function MockHero({ journey, userName }) {
  const name = firstName(userName);
  return (
    <section data-guide="pmock-header" aria-labelledby="pmock-title" className="relative overflow-hidden rounded-3xl border border-[#e8e5f4] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_0%_0%,rgba(139,92,246,0.14),transparent_65%),radial-gradient(45%_90%_at_100%_0%,rgba(14,165,233,0.11),transparent_65%)]" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.13em] text-violet-700 dark:text-violet-300"><TicketGlyph className="h-4 w-4" />Company mock tests</p>
          <h1 id="pmock-title" className="mt-1.5 text-[30px] font-medium leading-tight tracking-[-0.03em] text-slate-900 sm:text-[34px] dark:text-zinc-50">
            Prep <span className="relative inline-block font-bold text-violet-600 dark:text-violet-400">Mock<TitleUnderline /></span>
            <PageGuideButton className="ml-3 align-middle" />
          </h1>
          <p className="mt-3 max-w-xl text-[14px] leading-6 text-slate-500 dark:text-zinc-400">
            {name ? `${name}, practise` : 'Practise'} real company tests, role by role. Pick a company, choose your role and sit its mocks under real test rules.
          </p>
        </div>
        <ProgressMedal done={journey.completed} total={journey.total} />
      </div>
      <dl data-guide="pmock-stats" className="relative grid grid-cols-2 divide-black/[0.05] border-t border-black/[0.05] bg-white/55 backdrop-blur sm:grid-cols-4 sm:divide-x dark:divide-white/[0.06] dark:border-white/[0.06] dark:bg-white/[0.02]">
        <Stat label="Open now" value={journey.open} detail={journey.inProgress.length ? `${journey.inProgress.length} to continue` : ''} dot={journey.open > 0} />
        <Stat label="Companies tried" value={journey.attemptedCompanies} detail={`of ${journey.companies}`} className="border-l" />
        <Stat label="Best result" value={journey.best ? journey.best.result.label : '–'} detail={journey.best ? '' : 'none released'} className="border-t sm:border-t-0" />
        <Stat label="Latest result" value={journey.last ? journey.last.result.label : '–'} detail={journey.last ? journey.last.company.name : 'none released'} className="border-l border-t sm:border-t-0" />
      </dl>
    </section>
  );
}
