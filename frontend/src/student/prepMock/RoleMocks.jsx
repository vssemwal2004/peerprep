import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BriefcaseBusiness, ChevronDown, LayoutGrid, Search, X } from 'lucide-react';
import { LiveDot } from './prepMockUi';
import { isAlwaysOpen, mockState, nameKey, resultOf } from './prepMockModel';
import { formatDateTime, formatDurationMinutes } from '../assessment-dashboard/assessmentDashboardUtils';
import { focusRing } from '../dashboard/ui';
import GuideInfo from '../../guide/platform/GuideInfo';

const STATE_DOT = {
  live: 'bg-emerald-500',
  in_progress: 'bg-amber-500',
  upcoming: 'bg-sky-500',
  completed: 'bg-indigo-500',
  closed: 'bg-slate-300 dark:bg-zinc-600',
};
const STATE_LABEL = { live: 'Open now', in_progress: 'In progress', upcoming: 'Upcoming', completed: 'Completed', closed: 'Closed' };
// Up to this many roles show as tabs; more fall back to a select (a company may have 20+ roles).
const TAB_LIMIT = 5;
// Mocks shown as cards before "+N more" (which opens all of them in a popup).
const VISIBLE_MOCKS = 4;

/** One short line under a mock's title: where it stands, and when / how long. */
function mockLine(mock, state, report) {
  if (state === 'completed') {
    const result = resultOf(report);
    return result ? `Completed · ${result.label}` : 'Completed · result pending';
  }
  if (state === 'upcoming') return `Opens ${formatDateTime(mock.startTime)}`;
  if (state === 'closed') return 'Closed';
  const when = isAlwaysOpen(mock) ? 'Always open' : `Till ${formatDateTime(mock.endTime)}`;
  return `${STATE_LABEL[state]} · ${when}`;
}

/**
 * The first VISIBLE_MOCKS mocks of a role (open ones come first); the chosen mock always stays on
 * screen, taking the last slot when it sits further down. The rest open from "+N more".
 */
function visibleMocks(mocks, selectedMock) {
  const all = mocks.map((mock, index) => ({ mock, index }));
  if (all.length <= VISIBLE_MOCKS) return { visible: all, hidden: 0 };
  const visible = all.slice(0, VISIBLE_MOCKS);
  const chosen = all.find((entry) => String(entry.mock._id) === String(selectedMock?._id));
  if (chosen && chosen.index >= VISIBLE_MOCKS) visible[VISIBLE_MOCKS - 1] = chosen;
  return { visible, hidden: all.length - VISIBLE_MOCKS };
}

/** One mock: its number, state dot, title and a short status line. The chosen one is tinted violet. */
function MockCard({ mock, index, active, report, onClick, className = '' }) {
  const state = mockState(mock);
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'true' : undefined}
      className={`flex h-full w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] ${focusRing} ${active
        ? 'border-violet-300 bg-violet-50 shadow-[0_10px_24px_-20px_rgba(109,40,217,0.8)] ring-1 ring-inset ring-violet-200 dark:border-violet-400/40 dark:bg-violet-500/[0.12] dark:ring-violet-400/20'
        : 'border-[#e9eaee] bg-white hover:border-violet-200 hover:bg-violet-50/40 dark:border-white/[0.07] dark:bg-transparent dark:hover:border-violet-400/30 dark:hover:bg-white/[0.03]'} ${className}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold tabular-nums ${active ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-200'}`}>{index + 1}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT[state]}`} aria-hidden="true" />
          <span className={`truncate text-[12.5px] font-semibold ${active ? 'text-violet-950 dark:text-violet-50' : 'text-slate-900 dark:text-zinc-50'}`}>{mock.title || 'Untitled mock'}</span>
        </span>
        <span className={`mt-0.5 block truncate text-[11px] ${active ? 'text-violet-700/80 dark:text-violet-200/80' : 'text-slate-500 dark:text-zinc-400'}`}>
          {mockLine(mock, state, report)}{state !== 'completed' && mock.duration ? ` · ${formatDurationMinutes(mock.duration)}` : ''}
        </span>
      </span>
    </button>
  );
}

/** Every mock of a role in a popup (opened from "+N more"): search, then pick one to see it. */
function AllMocksDialog({ role, selectedMock, reports, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const needle = nameKey(query);
  const list = role.mocks.map((mock, index) => ({ mock, index })).filter(({ mock }) => !needle || nameKey(mock.title).includes(needle));

  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  // Once per opening: focus the search, close on Escape, lock the page scroll, give focus back after.
  useEffect(() => {
    const opener = document.activeElement;
    inputRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="pmock-all-title"
        className="flex max-h-[86dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-[#e9eaee] bg-white shadow-2xl sm:rounded-2xl dark:border-white/[0.08] dark:bg-[#242424]">
        <div className="flex items-start gap-3 border-b border-[#eef0f3] px-5 py-4 dark:border-white/[0.06]">
          <div className="min-w-0 flex-1">
            <h2 id="pmock-all-title" className="truncate text-[16px] font-semibold text-slate-900 dark:text-zinc-50">{role.name} · all mocks</h2>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-zinc-400">{role.counts.total} mocks · {role.counts.open} open · {role.counts.completed} done</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200 ${focusRing}`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="border-b border-[#eef0f3] px-5 py-3 dark:border-white/[0.06]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input ref={inputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a mock" aria-label="Find a mock"
              className="h-9 w-full rounded-xl border border-[#e6e7eb] bg-[#f8f9fb] pl-9 pr-3 text-[12.5px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" />
          </label>
        </div>
        <ol aria-label={`${role.name} mocks`} className="grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto overscroll-contain p-4 sm:grid-cols-2">
          {list.map(({ mock, index }) => (
            <li key={mock._id} className="min-w-0">
              <MockCard mock={mock} index={index} active={String(mock._id) === String(selectedMock?._id)} report={reports.get(String(mock._id))} onClick={() => onPick(mock)} />
            </li>
          ))}
          {!list.length && <li className="col-span-full py-8 text-center text-[12.5px] text-slate-500 dark:text-zinc-400">No mock matches “{query.trim()}”.</li>}
        </ol>
      </div>
    </div>,
    document.body,
  );
}

function RolePicker({ roles, selectedRole, onSelectRole }) {
  if (roles.length <= TAB_LIMIT) {
    return (
      <div role="tablist" aria-label="Roles" className="flex min-w-0 flex-wrap gap-1">
        {roles.map((role) => {
          const active = role.key === selectedRole?.key;
          return (
            <button key={role.key} type="button" role="tab" aria-selected={active} onClick={() => onSelectRole(role)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${focusRing} ${active
                ? 'bg-violet-600 text-white shadow-[0_8px_18px_-12px_rgba(109,40,217,0.9)]'
                : 'bg-[#f3f4f6] text-slate-600 hover:bg-[#eceef1] hover:text-slate-900 dark:bg-white/[0.05] dark:text-zinc-300 dark:hover:bg-white/[0.09] dark:hover:text-white'}`}>
              {role.name}
              {role.counts.open > 0 && <LiveDot />}
              <span className={`tabular-nums ${active ? 'text-white/75' : 'text-slate-400 dark:text-zinc-500'}`}>{role.counts.total}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <label className="relative block min-w-0 sm:w-[300px]">
      <span className="sr-only">Role</span>
      <BriefcaseBusiness className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-600 dark:text-violet-400" aria-hidden="true" />
      <select value={selectedRole?.key || ''} onChange={(event) => { const next = roles.find((role) => role.key === event.target.value); if (next) onSelectRole(next); }}
        className="h-9 w-full appearance-none truncate rounded-xl border border-[#e6e7eb] bg-white pl-9 pr-9 text-[13px] font-semibold text-slate-900 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-[#2a2a2a] dark:text-zinc-50">
        {roles.map((role) => (
          <option key={role.key} value={role.key}>{role.name} · {role.counts.total} {role.counts.total === 1 ? 'mock' : 'mocks'}{role.counts.open ? ` · ${role.counts.open} open` : ''}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
    </label>
  );
}

/**
 * The chosen role and its mocks, between the company banner and the mock overview: a role switch (tabs
 * for a few roles, a select for many; the left bar lists them too) and the role's mocks as numbered
 * cards (open first, then upcoming, then finished).
 */
export default function RoleMocks({ roles, selectedRole, selectedMock, reports, onSelectRole, onSelectMock }) {
  const [showAll, setShowAll] = useState(false);
  const { visible, hidden } = visibleMocks(selectedRole?.mocks || [], selectedMock);
  const counts = selectedRole?.counts;
  const done = counts?.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  return (
    <section aria-labelledby="pmock-role-title" className="rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]">
      <div data-guide="pmock-roles" className="flex flex-col gap-3 border-b border-[#eef0f3] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <h2 id="pmock-role-title" className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400">
            {roles.length === 1 ? 'Role' : `Roles · ${roles.length}`}<GuideInfo step="pmock-roles" />
          </h2>
          <RolePicker roles={roles} selectedRole={selectedRole} onSelectRole={onSelectRole} />
        </div>
        {counts && (
          <div className="flex shrink-0 items-center gap-2.5 sm:w-[210px]">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.08]" aria-hidden="true">
              <span className={`block h-full rounded-full ${done === 100 ? 'bg-indigo-500' : 'bg-violet-500'}`} style={{ width: `${done}%` }} />
            </span>
            <span className="text-[11.5px] tabular-nums text-slate-500 dark:text-zinc-400"><b className="font-semibold text-slate-800 dark:text-zinc-100">{counts.completed}/{counts.total}</b> done{counts.open ? ` · ${counts.open} open` : ''}</span>
          </div>
        )}
      </div>

      {selectedRole && (
        <ol data-guide="pmock-mocks" aria-label={`${selectedRole.name} mocks`} className="grid grid-cols-1 gap-2 p-3 min-[460px]:grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
          {visible.map(({ mock, index }) => (
            <li key={mock._id} className="min-w-0">
              <MockCard mock={mock} index={index} active={String(mock._id) === String(selectedMock?._id)} report={reports.get(String(mock._id))} onClick={() => onSelectMock(selectedRole, mock)} />
            </li>
          ))}
          {hidden > 0 && (
            <li className="min-w-0">
              <button type="button" onClick={() => setShowAll(true)} aria-haspopup="dialog"
                className={`flex h-full min-h-[54px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50/50 px-3 py-2.5 text-[12.5px] font-semibold text-violet-700 transition-colors hover:border-violet-400 hover:bg-violet-50 dark:border-violet-400/30 dark:bg-violet-500/[0.06] dark:text-violet-200 dark:hover:bg-violet-500/10 ${focusRing}`}>
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />+{hidden} more<span className="font-medium text-violet-500/80 dark:text-violet-300/70">· see all {selectedRole.mocks.length}</span>
              </button>
            </li>
          )}
        </ol>
      )}
      {showAll && selectedRole && (
        <AllMocksDialog role={selectedRole} selectedMock={selectedMock} reports={reports} onClose={() => setShowAll(false)}
          onPick={(mock) => { setShowAll(false); onSelectMock(selectedRole, mock); }} />
      )}
    </section>
  );
}
