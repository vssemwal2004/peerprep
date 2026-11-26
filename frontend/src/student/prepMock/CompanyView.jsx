import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BriefcaseBusiness, ChevronRight, Info, KeyRound, Laptop, Repeat2, ShieldCheck } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import RolePickerSection, { RoleMockList } from './RoleMocks';
import MockOverview, { PatternSection } from './MockOverview';
import { CompletionRing } from './prepMockUi';
import { rolePatternOf } from './prepMockModel';
import { focusRing } from '../dashboard/ui';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const RULES = [
  { icon: Laptop, text: 'Laptop or desktop only' },
  { icon: ShieldCheck, text: 'Same rules, timer and proctoring as assessments' },
  { icon: KeyRound, text: 'A password when your admin set one' },
  { icon: Repeat2, text: 'One attempt per mock unless your admin allows more' },
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

/** The test rules behind a small "Rules" button (closes on Escape or a click outside). */
function RulesButton() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button ref={buttonRef} type="button" data-guide="pmock-rules" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e6e7eb] bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-colors hover:border-violet-200 hover:text-violet-700 dark:border-white/[0.08] dark:bg-transparent dark:text-zinc-300 dark:hover:border-violet-400/30 dark:hover:text-violet-200 ${focusRing} ${open ? 'border-violet-300 text-violet-700 dark:border-violet-400/40 dark:text-violet-200' : ''}`}>
        <Info className="h-3.5 w-3.5" aria-hidden="true" />Rules
      </button>
      {open && (
        <div id={panelId} role="region" aria-label="Test rules"
          className="absolute right-0 top-full z-30 mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-xl border border-[#e9eaee] bg-white p-3 shadow-[0_18px_40px_-18px_rgba(16,24,40,0.35)] dark:border-white/[0.08] dark:bg-[#2a2a2a]">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400">A mock runs like an assessment</p>
          <ul className="space-y-1.5 text-[12.5px] text-slate-700 dark:text-zinc-200">
            {RULES.map(({ icon: Icon, text }) => <li key={text} className="flex items-start gap-2"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />{text}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function CompanyView({ company, role, mock, reports, patternHeadingRef, navigatorOpen, onOpenNavigator, onSelectRole, onSelectMock, onStart, onViewResult, onFeedback }) {
  const overviewRef = useRef(null);
  const { counts } = company;
  const index = role && mock ? role.mocks.findIndex((entry) => String(entry._id) === String(mock._id)) : -1;
  const rolePattern = useMemo(() => (role ? rolePatternOf(role, mock) : null), [role, mock]);
  const extra = [counts.inProgress ? `${counts.inProgress} in progress` : '', counts.upcoming ? `${counts.upcoming} upcoming` : ''].filter(Boolean);

  const selectMock = (nextMock) => {
    onSelectMock(role, nextMock);
    requestAnimationFrame(() => overviewRef.current?.focus());
  };

  return (
    <div className="min-w-0 space-y-3">
      <Crumbs company={company} role={role} />

      <header data-guide="pmock-banner" className="flex items-center gap-3 rounded-2xl border border-[#e9eaee] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:gap-4 sm:px-4 dark:border-white/[0.07] dark:bg-[#242424]">
        <CompanyLogo name={company.name} logo={company.logo} size="sm" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-semibold leading-tight tracking-[-0.02em] text-slate-900 sm:text-[20px] dark:text-zinc-50" title={company.name}>{company.name}</h2>
          <p className="mt-0.5 truncate text-[12.5px] text-slate-500 dark:text-zinc-400">
            {plural(company.roles.length, 'role')} · {plural(counts.total, 'mock')}{extra.length ? ` · ${extra.join(' · ')}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2" title={`${counts.completed} of ${counts.total} mocks done`}>
          <CompletionRing done={counts.completed} total={counts.total} size={26} label={`${counts.completed} of ${counts.total} mocks done`} />
          <span className="text-[12.5px] tabular-nums text-slate-500 dark:text-zinc-400" aria-hidden="true">
            <b className="font-semibold text-slate-900 dark:text-zinc-50">{counts.completed}/{counts.total}</b><span className="hidden sm:inline"> done</span>
          </span>
        </div>
        <RulesButton />
        {company.roles.length > 0 && (
          <button type="button" aria-haspopup="dialog" aria-expanded={navigatorOpen} onClick={onOpenNavigator} data-guide="pmock-roles"
            className={`hidden h-8 shrink-0 items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 text-[12px] font-semibold text-violet-700 hover:bg-violet-100 lg:inline-flex dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20 ${focusRing}`}>
            <BriefcaseBusiness className="h-3.5 w-3.5" aria-hidden="true" />Choose role
          </button>
        )}
      </header>

      <RolePickerSection roles={company.roles} selectedRole={role} onSelectRole={onSelectRole} />
      {rolePattern && <PatternSection role={role} company={company} rolePattern={rolePattern} headingRef={patternHeadingRef} />}
      {role && <RoleMockList role={role} selectedMock={mock} reports={reports} onSelectMock={selectMock} />}
      {mock && (
        <MockOverview key={mock._id} ref={overviewRef} mock={mock} index={Math.max(0, index)} report={reports.get(String(mock._id))}
          onStart={onStart} onViewResult={onViewResult} onFeedback={onFeedback} />
      )}
    </div>
  );
}
