import { useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, KeyRound, Laptop, Repeat2, ShieldCheck } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import RoleMocks from './RoleMocks';
import MockOverview from './MockOverview';
import { CompletionRing, OpenNowBadge } from './prepMockUi';
import { pickMock } from './prepMockModel';
import { focusRing } from '../dashboard/ui';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const RULES = [
  { icon: Laptop, text: 'Laptop or desktop only' },
  { icon: ShieldCheck, text: 'Same rules, timer and proctoring as assessments' },
  { icon: KeyRound, text: 'Password when your admin set one' },
  { icon: Repeat2, text: 'One attempt per mock' },
];

export function BackLink() {
  return (
    <Link to="/student/prep-mock" className={`inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-100 ${focusRing}`}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />All companies
    </Link>
  );
}

/** Prep Mock › Company › Role. Phones show "All companies" instead (the left bar is hidden there). */
function Crumbs({ company, role }) {
  return (
    <>
      <div className="lg:hidden"><BackLink /></div>
      <nav aria-label="Breadcrumb" className="hidden lg:block">
        <ol className="flex min-w-0 items-center gap-1 text-[12.5px] text-slate-500 dark:text-zinc-400">
          <li><Link to="/student/prep-mock" className={`rounded font-semibold hover:text-slate-900 dark:hover:text-zinc-100 ${focusRing}`}>Prep Mock</Link></li>
          <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
          <li className="min-w-0 truncate">{company.name}</li>
          {role && <><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li><li className="min-w-0 truncate font-semibold text-slate-800 dark:text-zinc-100" aria-current="page">{role.name}</li></>}
        </ol>
      </nav>
    </>
  );
}

/**
 * /student/prep-mock/:company — the right side of the workspace: the company banner, the chosen role
 * with its mocks, and the chosen mock's overview (pattern, instructions, Start). ?role= and ?mock= keep
 * the choice in the address, so a refresh, a shared link or the left bar's role links reopen it.
 */
export default function CompanyView({ company, reports, onStart, onViewResult, onFeedback }) {
  const [params, setParams] = useSearchParams();
  const overviewRef = useRef(null);
  const { role, mock } = pickMock(company, params.get('role') || '', params.get('mock') || '');
  const { counts } = company;
  const index = role && mock ? role.mocks.findIndex((entry) => String(entry._id) === String(mock._id)) : -1;

  const choose = (nextRole, nextMock) => {
    setParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set('role', nextRole.name);
      if (nextMock) updated.set('mock', String(nextMock._id)); else updated.delete('mock');
      return updated;
    }, { replace: true });
    // Narrow screens: bring the chosen mock's overview (and its Start button) into view.
    if (nextMock && window.matchMedia?.('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => overviewRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <Crumbs company={company} role={role} />

      <header data-guide="pmock-banner" className="relative overflow-hidden rounded-2xl border border-[#e8e5f4] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_120%_at_0%_0%,rgba(139,92,246,0.12),transparent_65%),radial-gradient(40%_100%_at_100%_0%,rgba(14,165,233,0.09),transparent_65%)]" aria-hidden="true" />
        <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <CompanyLogo name={company.name} logo={company.logo} size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-[22px] font-semibold leading-tight tracking-[-0.025em] text-slate-900 sm:text-[26px] dark:text-zinc-50">
              <span className="min-w-0 truncate" title={company.name}>{company.name}</span>
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500 dark:text-zinc-400">
              <span>{plural(company.roles.length, 'role')} · {plural(counts.total, 'mock')}{counts.upcoming ? ` · ${counts.upcoming} upcoming` : ''}</span>
              <OpenNowBadge count={counts.open} />
            </p>
          </div>
          <div className="flex items-center gap-3 sm:w-[200px]">
            <CompletionRing done={counts.completed} total={counts.total} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-bold leading-none tabular-nums text-slate-900 dark:text-white">{counts.completed}<span className="text-[13px] font-semibold text-slate-400 dark:text-zinc-500">/{counts.total}</span></p>
              <p className="mt-1 text-[11.5px] text-slate-500 dark:text-zinc-400">mocks completed</p>
            </div>
          </div>
        </div>
        <ul data-guide="pmock-rules" aria-label="Test rules" className="relative flex flex-wrap gap-x-5 gap-y-1.5 border-t border-black/[0.05] bg-white/55 px-4 py-2.5 text-[12px] text-slate-600 backdrop-blur sm:px-5 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-300">
          {RULES.map(({ icon: Icon, text }) => <li key={text} className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" aria-hidden="true" />{text}</li>)}
        </ul>
      </header>

      <RoleMocks roles={company.roles} selectedRole={role} selectedMock={mock} reports={reports}
        onSelectRole={(next) => choose(next, next.mocks[0] || null)} onSelectMock={(nextRole, nextMock) => choose(nextRole, nextMock)} />

      {mock && role ? (
        <MockOverview ref={overviewRef} className="scroll-mt-4" mock={mock} role={role} index={Math.max(0, index)} report={reports.get(String(mock._id))}
          onStart={onStart} onViewResult={onViewResult} onFeedback={onFeedback} />
      ) : (
        <div className="rounded-2xl border border-dashed border-[#e6e7eb] bg-white px-6 py-12 text-center text-[13px] text-slate-500 dark:border-white/[0.1] dark:bg-[#242424] dark:text-zinc-400">Pick a mock above to see its pattern and start it.</div>
      )}
    </div>
  );
}
