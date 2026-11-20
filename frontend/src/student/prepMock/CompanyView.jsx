import { useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, Laptop, Repeat2, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import CompanyLogo from './CompanyLogo';
import MockRow from './MockRow';
import { CompletionRing, LiveDot, OpenNowBadge } from './prepMockUi';
import { PanelTitle, StopwatchGlyph } from './prepMockGlyphs';
import { pickRole } from './prepMockModel';
import { card, focusRing, ProgressBar } from '../dashboard/ui';
import PageGuideButton from '../../guide/platform/PageGuideButton';
import GuideInfo from '../../guide/platform/GuideInfo';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const tabId = (role) => `pmock-role-tab-${role.key.replace(/[^a-z0-9]+/g, '-')}`;

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

/** Roles as a scrollable tab bar (scales to many roles); arrow keys move between them. */
function RoleBar({ roles, selected, onSelect }) {
  const refs = useRef([]);
  const onKeyDown = (event, index) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: roles.length - 1 - index }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (index + step + roles.length) % roles.length;
    onSelect(roles[next]);
    refs.current[next]?.focus();
  };
  return (
    <div className="relative" data-guide="pmock-roles">
      <div role="tablist" aria-label="Roles" className="flex gap-1.5 overflow-x-auto rounded-2xl border border-[#e9eaee] bg-white p-1.5 dark:border-white/[0.07] dark:bg-[#242424]">
        {roles.map((role, index) => {
          const active = role.key === selected?.key;
          return (
            <button key={role.key} ref={(node) => { refs.current[index] = node; }} type="button" role="tab" id={tabId(role)}
              aria-selected={active} aria-controls="pmock-role-panel" tabIndex={active ? 0 : -1}
              onClick={() => onSelect(role)} onKeyDown={(event) => onKeyDown(event, index)}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold transition-colors ${focusRing} ${active
                ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-zinc-900'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}>
              {role.counts.open > 0 && <LiveDot />}
              <span className="max-w-[220px] truncate">{role.name}</span>
              <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? 'bg-white/20 dark:bg-black/10' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.08] dark:text-zinc-400'}`}>{role.counts.total}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** /student/prep-mock/:company: compact company header, roles first, then the chosen role's mocks. */
export default function CompanyView({ company, reports, onStart, onViewResult, onFeedback }) {
  const [params, setParams] = useSearchParams();
  const reduceMotion = useReducedMotion();
  const role = pickRole(company, params.get('role') || '');
  const { counts } = company;

  const selectRole = (next) => {
    if (next.key === role?.key) return;
    setParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set('role', next.name);
      return updated;
    });
  };

  return (
    <div className="min-w-0">
      <BackLink />

      <header data-guide="pmock-banner" className="relative mt-3 overflow-hidden rounded-3xl border border-[#e8e5f4] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_120%_at_0%_0%,rgba(139,92,246,0.12),transparent_65%),radial-gradient(40%_100%_at_100%_0%,rgba(14,165,233,0.09),transparent_65%)]" aria-hidden="true" />
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <CompanyLogo name={company.name} logo={company.logo} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-[24px] font-semibold leading-tight tracking-[-0.025em] text-slate-900 sm:text-[28px] dark:text-zinc-50">
              <span className="min-w-0 truncate" title={company.name}>{company.name}</span><PageGuideButton />
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500 dark:text-zinc-400">
              <span>{plural(company.roles.length, 'role')} · {plural(counts.total, 'mock')}{counts.upcoming ? ` · ${counts.upcoming} upcoming` : ''}</span>
              <OpenNowBadge count={counts.open} />
            </p>
          </div>
          <div className="flex items-center gap-3 sm:w-[220px]">
            <CompletionRing done={counts.completed} total={counts.total} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-bold leading-none tabular-nums text-slate-900 dark:text-white">{counts.completed}<span className="text-[13px] font-semibold text-slate-400 dark:text-zinc-500">/{counts.total}</span></p>
              <p className="mt-1 text-[11.5px] text-slate-500 dark:text-zinc-400">mocks completed</p>
            </div>
          </div>
        </div>
        <ul data-guide="pmock-rules" aria-label="Test rules" className="relative flex flex-wrap gap-x-5 gap-y-1.5 border-t border-black/[0.05] bg-white/55 px-5 py-2.5 text-[12px] text-slate-600 backdrop-blur sm:px-6 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-300">
          {RULES.map(({ icon: Icon, text }) => <li key={text} className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" aria-hidden="true" />{text}</li>)}
        </ul>
      </header>

      <section className="mt-6" aria-labelledby="pmock-roles-title">
        <h2 id="pmock-roles-title" className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400">Choose a role<GuideInfo step="pmock-roles" /></h2>
        <RoleBar roles={company.roles} selected={role} onSelect={selectRole} />
      </section>

      {role && (
        <section id="pmock-role-panel" role="tabpanel" aria-labelledby={tabId(role)} className={`mt-5 overflow-hidden ${card}`}>
          <div className="flex flex-col gap-3 border-b border-[#eef0f3] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-white/[0.06]">
            <PanelTitle glyph={StopwatchGlyph} tone="violet" title={`${role.name} mocks`} info={<GuideInfo step="pmock-mocks" />}
              subtitle={`${plural(role.counts.total, 'mock')}${role.counts.open ? ` · ${role.counts.open} open now` : ''}${role.counts.upcoming ? ` · ${role.counts.upcoming} upcoming` : ''}`} />
            <div className="flex items-center gap-2.5 sm:w-[200px]">
              <ProgressBar value={role.counts.total ? (role.counts.completed / role.counts.total) * 100 : 0} label={`${role.name}: ${role.counts.completed} of ${role.counts.total} completed`} className="flex-1"
                tone={role.counts.completed && role.counts.completed === role.counts.total ? 'bg-indigo-500' : 'bg-violet-500'} />
              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-slate-600 dark:text-zinc-300">{role.counts.completed}/{role.counts.total}</span>
            </div>
          </div>
          <motion.ol key={role.key} data-guide="pmock-mocks" aria-label={`${role.name} mocks`} className="divide-y divide-[#eef0f3] dark:divide-white/[0.06]"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
            {role.mocks.map((mock) => (
              <MockRow key={mock._id} mock={mock} report={reports.get(String(mock._id))} onStart={onStart} onViewResult={onViewResult} onFeedback={onFeedback} />
            ))}
          </motion.ol>
        </section>
      )}
    </div>
  );
}
