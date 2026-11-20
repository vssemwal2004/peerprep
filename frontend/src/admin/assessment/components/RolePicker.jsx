import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { BriefcaseBusiness, Check, ChevronDown, Loader2, Plus, Search, X } from 'lucide-react';
import { api } from '../../../utils/api';
import { cleanRole, roleNameProblem, useMockRoles } from '../../prepMock/catalog';

const SHARED_LIMIT = 200;

/** Small count badges for a role: mocks using it, students who reported it, added by an admin. */
export function RoleBadges({ role, className = '' }) {
  const badges = [];
  if (role.mocks > 0) badges.push(['mocks', `${role.mocks} mock${role.mocks === 1 ? '' : 's'}`, 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20']);
  if (role.reporters > 0) badges.push(['reporters', `Reported by ${role.reporters} student${role.reporters === 1 ? '' : 's'}`, 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20']);
  if (role.added) badges.push(['added', 'Added', 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20']);
  if (!badges.length) return null;
  return <span className={`flex flex-wrap items-center gap-1 ${className}`}>
    {badges.map(([key, text, tone]) => <span key={key} className={`whitespace-nowrap rounded-full px-1.5 py-px text-[10.5px] font-semibold ring-1 ring-inset ${tone}`}>{text}</span>)}
  </span>;
}

/**
 * The job role a company mock is for (SDE 1, Data Analyst, …). Roles students reported for the
 * chosen company come first; any other known role can be picked, and a new one can be added.
 */
export default function RolePicker({ id, company = '', value = '', onChange, invalid = false }) {
  const listId = useId();
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const roles = useMockRoles(company);

  const needle = cleanRole(query).toLowerCase();
  const groups = useMemo(() => {
    const filter = (list) => (needle ? list.filter((role) => role.name.toLowerCase().includes(needle)) : list);
    const own = filter(roles.company);
    const shared = filter(roles.shared);
    return { own, shared: shared.slice(0, SHARED_LIMIT), hiddenShared: Math.max(0, shared.length - SHARED_LIMIT) };
  }, [needle, roles.company, roles.shared]);
  const exists = needle && [...roles.company, ...roles.shared].some((role) => role.name.toLowerCase() === needle);
  const canAdd = Boolean(needle) && !exists;
  // One flat list for the keyboard: company roles, other roles, then "Add …".
  const options = useMemo(() => [
    ...groups.own.map((role) => ({ kind: 'role', role })),
    ...groups.shared.map((role) => ({ kind: 'role', role })),
    ...(canAdd ? [{ kind: 'add' }] : []),
  ], [groups, canAdd]);

  useEffect(() => { setActive(0); }, [needle, open]);
  useEffect(() => {
    if (!open) return undefined;
    searchRef.current?.focus();
    const onDown = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-option-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open, listId]);

  const close = (focusTrigger = false) => {
    setOpen(false); setQuery(''); setAddError('');
    if (focusTrigger) document.getElementById(id)?.focus();
  };
  const choose = (name) => { onChange(name); close(true); };
  const addRole = async () => {
    const name = cleanRole(query);
    const problem = roleNameProblem(name);
    if (problem) { setAddError(problem); return; }
    setAdding(true);
    setAddError('');
    try {
      const result = await api.addMockRole({ name, company });
      roles.reload();
      choose(result?.name || name);
    } catch (error) {
      setAddError(error.message || 'The role could not be added.');
    } finally {
      setAdding(false);
    }
  };
  const pick = (option) => (option?.kind === 'add' ? addRole() : option && choose(option.role.name));

  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(options.length - 1, index + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); if (!adding) pick(options[active] || options[0]); }
  };

  const selectedRole = [...roles.company, ...roles.shared].find((role) => role.name.toLowerCase() === String(value || '').toLowerCase());
  const renderRole = (role, index) => {
    const selected = role.name.toLowerCase() === String(value || '').toLowerCase();
    const focused = index === active;
    return (
      <li key={role.name} id={`${listId}-option-${index}`} role="option" aria-selected={selected}
        onPointerMove={() => setActive(index)} onClick={() => choose(role.name)}
        className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${focused ? 'bg-sky-50 dark:bg-white/[0.06]' : ''} ${selected ? 'font-semibold text-sky-800 dark:text-sky-200' : 'text-slate-800 dark:text-gray-100'}`}>
        <BriefcaseBusiness className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-sky-600' : 'text-slate-400'}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{role.name}</span>
        <RoleBadges role={role} className="shrink-0 justify-end" />
        <Check className={`h-3.5 w-3.5 shrink-0 text-sky-600 ${selected ? '' : 'invisible'}`} aria-hidden="true" />
      </li>
    );
  };
  const groupLabel = 'px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-gray-500';

  return (
    <div ref={rootRef} className="relative mt-1.5">
      <button id={id} type="button" onClick={() => (open ? close() : setOpen(true))} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-invalid={invalid || undefined}
        className={`flex h-11 w-full items-center gap-2.5 rounded-lg border bg-white px-2.5 text-left text-sm outline-none transition focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-100 dark:bg-gray-900 dark:focus-visible:ring-sky-950 ${open ? 'border-sky-400' : invalid ? 'border-rose-300 dark:border-rose-500/50' : 'border-slate-200 hover:border-slate-300 dark:border-gray-700 dark:hover:border-gray-600'}`}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${value ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300' : 'bg-slate-100 text-slate-400 dark:bg-white/[0.06]'}`} aria-hidden="true"><BriefcaseBusiness className="h-4 w-4" /></span>
        <span className={`min-w-0 flex-1 truncate ${value ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-gray-400'}`}>{value || 'Select role'}</span>
        {selectedRole && <RoleBadges role={selectedRole} className="hidden shrink-0 sm:flex" />}
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_24px_48px_-24px_rgba(16,24,40,0.35)] dark:border-gray-700 dark:bg-gray-900">
          <label className="relative block">
            <span className="sr-only">Search or add a role</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setAddError(''); }} onKeyDown={onKeyDown}
              placeholder="Search roles, or type a new one" role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
              aria-activedescendant={options.length ? `${listId}-option-${active}` : undefined} maxLength={80}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:ring-sky-950" />
            {query && <button type="button" onClick={() => { setQuery(''); searchRef.current?.focus(); }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>}
          </label>
          <ul id={listId} role="listbox" aria-label="Roles" className="mt-1.5 max-h-80 overflow-y-auto overscroll-contain">
            {roles.loading && !roles.company.length && !roles.shared.length && Array.from({ length: 6 }, (_, index) => <li key={index} className="mx-2.5 my-2 h-5 animate-pulse rounded bg-slate-100 dark:bg-white/[0.06]" />)}
            {company && groups.own.length > 0 && <li role="presentation" className={groupLabel}>Roles at {company}</li>}
            {groups.own.map((role, index) => renderRole(role, index))}
            {groups.shared.length > 0 && <li role="presentation" className={groupLabel}>{company && groups.own.length ? 'All roles' : company ? `All roles · none reported at ${company} yet` : 'All roles'}</li>}
            {groups.shared.map((role, index) => renderRole(role, groups.own.length + index))}
            {groups.hiddenShared > 0 && <li role="presentation" className="px-2.5 py-1.5 text-[11.5px] text-slate-400">{groups.hiddenShared} more: type to narrow the list.</li>}
            {canAdd && (
              <li id={`${listId}-option-${options.length - 1}`} role="option" aria-selected={false} onPointerMove={() => setActive(options.length - 1)} onClick={() => !adding && addRole()}
                className={`mt-1 flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed px-2.5 py-2 text-[13px] font-semibold text-sky-700 transition dark:text-sky-300 ${active === options.length - 1 ? 'border-sky-400 bg-sky-50 dark:bg-sky-500/10' : 'border-sky-200 dark:border-sky-500/30'}`}>
                {adding ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">Add “{cleanRole(query)}” as a new role</span>
                <span className="hidden shrink-0 text-[11px] font-medium text-slate-400 sm:inline">Saved for next time</span>
              </li>
            )}
            {!roles.loading && !options.length && <li className="px-2.5 py-6 text-center text-sm text-slate-500">{roles.error || 'No roles yet. Type one to add it.'}</li>}
          </ul>
          {(addError || (roles.error && options.length > 0)) && <p role="alert" className="mt-1.5 px-1 text-[11.5px] text-rose-600 dark:text-rose-400">{addError || roles.error}</p>}
          <p className="mt-1.5 border-t border-slate-100 px-1 pt-1.5 text-[11px] text-slate-400 dark:border-gray-800 dark:text-gray-500">↑ ↓ to move · Enter to pick{canAdd ? ' or add' : ''} · Esc to close</p>
        </div>
      )}
    </div>
  );
}
