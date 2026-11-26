import { useEffect, useId, useRef, useState } from 'react';
import { BriefcaseBusiness, ChevronRight, Search, X } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { nameKey } from './prepMockModel';
import { focusRing } from '../dashboard/ui';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const ROLE_SEARCH_MIN = 8;

export default function MockNavigator({ onClose, company, selectedRole, onSelectRole }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const openerRef = useRef(null);
  const [query, setQuery] = useState('');
  const { roles } = company;
  const needle = nameKey(query);
  const shownRoles = needle
    ? roles.filter((role) => role.key.includes(needle) || role.mocks.some((mock) => nameKey(mock.title).includes(needle)))
    : roles;

  useEffect(() => {
    openerRef.current = document.activeElement;
    const frame = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const onKey = (event) => {
      if (event.key !== 'Escape' || !panelRef.current?.getClientRects().length) return;
      event.stopPropagation();
      onClose();
      openerRef.current?.focus({ preventScroll: true });
    };
    const onDown = (event) => {
      if (panelRef.current?.contains(event.target) || event.target.closest?.('[data-pmock-rail]')) return;
      if (panelRef.current?.getClientRects().length) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  return (
    <section ref={panelRef} role="dialog" aria-labelledby={titleId} data-guide="pmock-navigator"
      className="flex max-h-[calc(100dvh-110px)] w-[300px] flex-col overflow-hidden rounded-2xl border border-[#e3e5ea] bg-white shadow-[0_24px_60px_-20px_rgba(16,24,40,0.35)] dark:border-white/[0.09] dark:bg-[#242424]">
      <header className="border-b border-[#eef0f3] px-3 pb-2.5 pt-3 dark:border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <CompanyLogo name={company.name} logo={company.logo} size="sm" />
          <span className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[14px] font-semibold text-slate-900 dark:text-zinc-50" title={company.name}>{company.name}</h2>
            <p className="truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{plural(roles.length, 'role')} · {plural(company.counts.total, 'mock')}</p>
          </span>
          <button ref={closeRef} type="button" aria-label="Close" onClick={() => {
            onClose();
            openerRef.current?.focus({ preventScroll: true });
          }} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white ${focusRing}`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {roles.length > ROLE_SEARCH_MIN && (
          <label className="relative mt-2.5 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a role or mock" aria-label="Find a role or mock"
              className="h-8 w-full rounded-lg border border-[#e6e7eb] bg-[#f8f9fb] pl-8 pr-2 text-[12px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" />
          </label>
        )}
        <p className="mt-2 px-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-zinc-500">Choose a role</p>
      </header>
      <ul aria-label={`${company.name} roles`} data-guide="pmock-roles" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 [scrollbar-width:thin]">
        {shownRoles.map((role) => {
          const current = selectedRole?.key === role.key;
          return (
            <li key={role.key}>
              <button type="button" onClick={() => onSelectRole(role)} aria-current={current ? 'true' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${focusRing} ${current ? 'bg-violet-50 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/25' : 'hover:bg-[#f6f7f9] dark:hover:bg-white/[0.04]'}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${current ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-zinc-400'}`}><BriefcaseBusiness className="h-4 w-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] font-semibold ${current ? 'text-violet-950 dark:text-white' : 'text-slate-800 dark:text-zinc-100'}`} title={role.name}>{role.name}</span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-zinc-400">{plural(role.counts.total, 'mock')}{role.counts.inProgress ? ` · ${role.counts.inProgress} in progress` : ''}</span>
                </span>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-400 dark:text-zinc-500" title={`${role.counts.completed} of ${role.counts.total} done`}>{role.counts.completed}/{role.counts.total}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-zinc-600" aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {!shownRoles.length && <li className="px-2 py-6 text-center text-[12px] text-slate-500 dark:text-zinc-400">No role matches “{query.trim()}”.</li>}
      </ul>
    </section>
  );
}
