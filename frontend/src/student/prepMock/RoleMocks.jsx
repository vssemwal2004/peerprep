import { BriefcaseBusiness, ChevronDown, LayoutList } from 'lucide-react';
import { CollegeChip } from './prepMockUi';
import { mockStatusLine } from './mockText';
import { collegeAssignmentOf, mockState } from './prepMockModel';
import { formatDurationMinutes } from '../assessment-dashboard/assessmentDashboardUtils';
import { focusRing } from '../dashboard/ui';
import GuideInfo from '../../guide/platform/GuideInfo';

const STATE_DOT = {
  live: 'bg-emerald-500',
  in_progress: 'bg-amber-500',
  upcoming: 'bg-sky-500',
  completed: 'bg-indigo-500',
  closed: 'bg-slate-300 dark:bg-zinc-600',
};
const STATE_LABEL = { live: 'Open', in_progress: 'In progress', upcoming: 'Upcoming', completed: 'Completed', closed: 'Closed' };
// Phones: up to this many roles show as chips; more fall back to a select (a company may have 20+ roles).
const TAB_LIMIT = 5;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * One mock: its number, a status dot, the title, then its duration and only the status that is not
 * simply "open" (in progress, opens on, done, closed). A college assignment adds a small chip.
 */
export function MockRow({ mock, index, active, report, onClick }) {
  const state = mockState(mock);
  const meta = [mock.duration ? formatDurationMinutes(mock.duration) : '', mockStatusLine(mock, state, report)].filter(Boolean).join(' · ');
  const assignment = collegeAssignmentOf(mock);
  const tone = active
    ? 'border-violet-300 bg-violet-50/70 dark:border-violet-400/40 dark:bg-violet-500/10'
    : 'border-[#e9eaee] hover:border-violet-200 hover:bg-violet-50/40 dark:border-white/[0.07] dark:hover:border-violet-400/30 dark:hover:bg-white/[0.03]';
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'true' : undefined}
      className={`flex h-full w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-[background-color,box-shadow,border-color] ${focusRing} ${tone}`}>
      <span className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums ${active ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-zinc-300'}`}>{index + 1}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_DOT[state]}`} aria-hidden="true" />
          <span title={mock.title} className={`truncate text-[12.5px] font-semibold ${active ? 'text-violet-950 dark:text-white' : 'text-slate-800 dark:text-zinc-100'}`}>{mock.title || 'Untitled mock'}</span>
          <span className="sr-only">, {STATE_LABEL[state]}</span>
        </span>
        {meta && <span className="mt-0.5 block truncate text-[11px] tabular-nums text-slate-500 dark:text-zinc-400">{meta}</span>}
        {assignment && <CollegeChip assignment={assignment} short className="mt-1" />}
      </span>
    </button>
  );
}

/** Phones and tablets: role chips for a few roles, a select for many. */
function RolePicker({ roles, selectedRole, onSelectRole }) {
  if (roles.length <= TAB_LIMIT) {
    return (
      <div role="tablist" aria-label="Roles" className="flex min-w-0 flex-wrap gap-1.5">
        {roles.map((role) => {
          const active = role.key === selectedRole?.key;
          return (
            <button key={role.key} type="button" role="tab" aria-selected={active} onClick={() => onSelectRole(role)}
              className={`inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${focusRing} ${active
                ? 'bg-violet-600 text-white shadow-[0_8px_18px_-12px_rgba(109,40,217,0.9)]'
                : 'bg-[#f3f4f6] text-slate-600 hover:bg-[#eceef1] hover:text-slate-900 dark:bg-white/[0.05] dark:text-zinc-300 dark:hover:bg-white/[0.09] dark:hover:text-white'}`}>
              <span className="truncate">{role.name}</span>
              <span className={`tabular-nums ${active ? 'text-white/75' : 'text-slate-400 dark:text-zinc-500'}`}>{role.counts.completed}/{role.counts.total}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">Role</span>
      <BriefcaseBusiness className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-600 dark:text-violet-400" aria-hidden="true" />
      <select value={selectedRole?.key || ''} onChange={(event) => { const next = roles.find((role) => role.key === event.target.value); if (next) onSelectRole(next); }}
        className="h-10 w-full appearance-none truncate rounded-xl border border-[#e6e7eb] bg-white pl-9 pr-9 text-[13px] font-semibold text-slate-900 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-[#2a2a2a] dark:text-zinc-50">
        {roles.map((role) => (
          <option key={role.key} value={role.key}>{role.name} · {plural(role.counts.total, 'mock')} · {role.counts.completed} done</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
    </label>
  );
}

export default function RolePickerSection({ roles, selectedRole, onSelectRole }) {
  return (
    <section aria-labelledby="pmock-role-title" className="min-w-0 rounded-2xl border border-[#e9eaee] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:hidden dark:border-white/[0.07] dark:bg-[#242424]">
      <h2 id="pmock-role-title" className="mb-2.5 flex items-center gap-1.5 px-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400">
        {roles.length === 1 ? 'Role' : 'Roles'}
        <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums tracking-normal text-slate-700 dark:bg-white/[0.08] dark:text-zinc-200">{roles.length}</span>
        <GuideInfo step="pmock-roles" />
      </h2>
      <div data-guide="pmock-roles"><RolePicker roles={roles} selectedRole={selectedRole} onSelectRole={onSelectRole} /></div>
    </section>
  );
}

export function RoleMockList({ role, selectedMock, reports, onSelectMock }) {
  return (
    <section aria-labelledby="pmock-list-title" data-guide="pmock-mocks"
      className="min-w-0 rounded-2xl border border-[#e9eaee] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:px-5 dark:border-white/[0.07] dark:bg-[#242424]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id="pmock-list-title" className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-zinc-50">
          <LayoutList className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
          <span>Mocks for {role.name}</span>
        </h2>
        <span className="shrink-0 text-[12px] tabular-nums text-slate-500 dark:text-zinc-400">{plural(role.mocks.length, 'mock')}</span>
      </div>
      <ol aria-labelledby="pmock-list-title" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-2">
        {role.mocks.map((mock, index) => (
          <li key={mock._id} className="min-w-0">
            <MockRow mock={mock} index={index} active={String(mock._id) === String(selectedMock?._id)}
              report={reports.get(String(mock._id))} onClick={() => onSelectMock(mock)} />
          </li>
        ))}
      </ol>
    </section>
  );
}
