import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowLeft, BarChart3, BriefcaseBusiness, Building2, CalendarClock, Check, ChevronDown,
  ChevronRight, ClipboardList, Eye, FolderOpen, Globe, History, Layers, ListChecks, Loader2, Lock,
  MoreVertical, Pencil, Plus, Repeat, RotateCcw, Search, ShieldCheck, ShieldOff, SlidersHorizontal, Table2, Timer, UserPlus, Users, X,
} from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { PublishSwitch } from './PublishToggle';
import { NO_ROLE_KEY, isBulkEligible, isLiveMock, isReadyMock, pageSelectionState, rangeIds } from './mockAccessModel';
import MockPatternTable from '../../features/prepMock/MockPatternTable';
import { formatPatternFrom } from '../../features/prepMock/patternModel';
import { TablePager, nextSort, sortRows } from '../../components/table';
import GridSortButton from '../assessment/components/GridSortButton';
import {
  assessmentLifecycleLabel, assignedCountOf, displayStatus, formatShortDate, statusStyles,
} from '../assessment/assessmentListShared';

// All Mocks workspace (admin Prep Mock), built to scale to hundreds of companies, dozens of roles
// per company and many mocks per role:
//   left  — a company tree: each company with its role and mock counts, ⋮ actions, and its roles
//           nested under it (like folders in a file explorer);
//   right — the chosen company: a Roles table (one row per role, sortable, searchable) and an All
//           mocks table; or, for a chosen role, its pattern (worked out from its mocks) and its mocks.
// Every action lives in the page (AssessmentDashboard) and comes in through props.

export const NO_ROLE = NO_ROLE_KEY;

const SECTION_TYPES = { coding: 'Coding', mcq: 'MCQ', short: 'Short answer', one_line: 'One line' };
const DIFFICULTIES = [['Easy'], ['Medium'], ['Hard']];
// Each header cell sorts by one or more keys. Prep Mocks are always open (no dates): the second
// column says who has the mock, the last one is the Live / Draft publish switch.
const MOCK_COLUMNS = [
  [['title', 'Mock']],
  [['date', 'Availability']],
  [['content', 'Content']],
  [['completion', 'Completion']],
  [['live', 'Publish']],
];
const ROW_GRID = 'xl:grid-cols-[minmax(220px,1.8fr)_140px_120px_minmax(96px,1fr)_112px_36px]';
/** A mock's admin-written exam pattern (company + role), or null for older mocks without one. */
const writtenPatternOf = (mock) => (mock?.mockPattern?.rows?.length ? mock.mockPattern : null);
const ROLE_COLUMNS = [
  ['label', 'Role'], ['count', 'Mocks'], ['published', 'Live'], ['drafts', 'Drafts'], ['duration', 'Duration'],
  ['mix', 'Question mix'], ['attempts', 'Attempts'], ['avg', 'Avg score'], ['updated', 'Updated'],
];
// The roles table grows with the screen (the company tree takes 300px): from 1024px Role, Mocks, Live,
// Question mix, Attempts; from 1280px also Drafts and Duration; from 1536px also Avg score and Updated.
// Below 1024px every row stacks with inline labels.
const ROLE_GRID = [
  'lg:grid-cols-[minmax(150px,1.5fr)_68px_56px_minmax(120px,1.2fr)_92px_36px]',
  'xl:grid-cols-[minmax(150px,1.5fr)_68px_56px_72px_92px_minmax(120px,1.2fr)_92px_36px]',
  '2xl:grid-cols-[minmax(150px,1.5fr)_68px_56px_72px_92px_minmax(120px,1.2fr)_92px_96px_88px_36px]',
].join(' ');
const ROLE_TIER = { drafts: 'lg:hidden xl:block', duration: 'lg:hidden xl:block', avg: 'lg:hidden 2xl:block', updated: 'lg:hidden 2xl:block' };
const STATUS_TABS = [
  { id: 'all', label: 'All', countKey: 'total' },
  { id: 'ongoing', label: 'Ongoing', countKey: 'ongoing' },
  { id: 'completed', label: 'Completed', countKey: 'completed' },
  { id: 'drafts', label: 'Drafts', countKey: 'drafts' },
  { id: 'archived', label: 'Archived', countKey: 'archived' },
];
const CREATION_WINDOWS = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];
const RAIL_SORTS = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'mocks', label: 'Most mocks' },
  { value: 'roles', label: 'Most roles' },
  { value: 'recent', label: 'Recently updated' },
  { value: 'attention', label: 'Needs attention' },
];

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;
const companyNameOf = (mock) => String(mock.company || 'Uncategorized').trim() || 'Uncategorized';
const roleOf = (mock) => String(mock.role || '').trim();
const roleKeyOf = (mock) => (roleOf(mock) ? roleOf(mock).toLocaleLowerCase() : NO_ROLE);
const timeOf = (value) => { const time = value ? new Date(value).getTime() : Number.NaN; return Number.isFinite(time) ? time : 0; };
const isPublished = (mock) => mock.lifecycleStatus === 'published';
const isDraft = (mock) => mock.lifecycleStatus === 'draft';
const fieldClass = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-sky-900/30';
const iconButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white';
const roleRailMenuButton = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2';
const searchClass = 'h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs text-slate-700 outline-none focus:border-sky-400 focus:bg-white dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200';

const ago = (value) => {
  const time = timeOf(value);
  if (!time) return '';
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatShortDate(value);
};

const range = (values, unit = '') => {
  const list = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!list.length) return '—';
  const low = Math.min(...list);
  const high = Math.max(...list);
  return low === high ? `${low}${unit}` : `${low}–${high}${unit}`;
};
const meanScore = (mocks) => {
  const scored = mocks.map((mock) => Number(mock.avgPercentage)).filter((value) => Number.isFinite(value) && value > 0);
  return scored.length ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length) : null;
};
const attemptsOf = (mocks) => mocks.reduce((sum, mock) => sum + (Number(mock.attempts) || 0), 0);

/** The sections a mock delivers (the first question set when it uses sets). */
const sectionsOf = (mock) => (mock.sections?.length ? mock.sections : mock.questionSets?.[0]?.sections || []);

const difficultyOf = (question) => {
  const raw = String(question.coding?.difficulty || question.difficulty || question.problemDataSnapshot?.difficulty || '').trim().toLowerCase();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
};

/** What one mock looks like to a student: sections, question types, difficulty and rules. */
function mockPattern(mock) {
  const types = {};
  const difficulty = { Easy: 0, Medium: 0, Hard: 0 };
  const sections = sectionsOf(mock).map((section, index) => {
    const count = section.questions?.length || 0;
    const levels = { Easy: 0, Medium: 0, Hard: 0 };
    (section.questions || []).forEach((question) => {
      const type = question.type || section.type;
      if (type) types[type] = (types[type] || 0) + 1;
      const level = difficultyOf(question);
      if (level in levels) { levels[level] += 1; difficulty[level] += 1; }
    });
    return {
      name: section.sectionName || `Section ${index + 1}`,
      type: section.type,
      count,
      marks: Number(section.totalMarks) || count * (Number(section.marksPerQuestion) || 0),
      negative: Number(section.negativeMarksPerQuestion) || 0,
      difficulty: levels,
      minutes: Number(section.suggestedMinutes) > 0 ? Number(section.suggestedMinutes) : null,
    };
  });
  return {
    sections,
    patternFrom: formatPatternFrom(mock.mockPattern?.patternFrom || mock.patternFrom),
    types,
    difficulty,
    sets: mock.questionSets?.length || 0,
    duration: Number(mock.duration) || 0,
    questions: Number(mock.totalQuestions) || sections.reduce((sum, section) => sum + section.count, 0),
    marks: Number(mock.totalMarks) || 0,
    proctored: Boolean(mock.settings?.aiProctoring?.enabled),
    attempts: Number(mock.attemptLimit) || 1,
    always: isPublished(mock) && mock.isVisible !== false,
  };
}

/** One role's pattern, worked out from all its mocks. */
function rolePattern(mocks) {
  const patterns = mocks.map(mockPattern);
  const typeTotals = {};
  const difficulty = { Easy: 0, Medium: 0, Hard: 0 };
  patterns.forEach((pattern) => {
    Object.entries(pattern.types).forEach(([type, count]) => { typeTotals[type] = (typeTotals[type] || 0) + count; });
    Object.keys(difficulty).forEach((level) => { difficulty[level] += pattern.difficulty[level]; });
  });
  const mix = Object.entries(typeTotals)
    .map(([type, total]) => {
      const counts = patterns.map((pattern) => pattern.types[type] || 0);
      const same = counts.every((count) => count === counts[0]);
      return { type, label: SECTION_TYPES[type] || type, perMock: Math.round(total / Math.max(1, patterns.length)), same };
    })
    .sort((left, right) => right.perMock - left.perMock);
  const durations = patterns.map((pattern) => pattern.duration).filter((value) => value > 0);
  return {
    duration: range(durations, ' min'),
    minDuration: durations.length ? Math.min(...durations) : null,
    questions: range(patterns.map((pattern) => pattern.questions)),
    marks: range(patterns.map((pattern) => pattern.marks)),
    mix,
    difficulty,
    proctored: patterns.filter((pattern) => pattern.proctored).length,
    always: patterns.filter((pattern) => pattern.always).length,
    attemptLimits: [...new Set(patterns.map((pattern) => pattern.attempts))].sort((a, b) => a - b),
    total: patterns.length,
    studentAttempts: attemptsOf(mocks),
    avgScore: meanScore(mocks),
  };
}

/** A company's roles, each with its mocks and a short pattern summary; "No role" last. */
function rolesOf(mocks) {
  const map = new Map();
  mocks.forEach((mock) => {
    const key = roleKeyOf(mock);
    const entry = map.get(key) || { key, label: roleOf(mock) || 'No role', mocks: [], count: 0, published: 0, drafts: 0, updated: 0 };
    entry.mocks.push(mock);
    entry.count += 1;
    if (isPublished(mock)) entry.published += 1;
    if (isDraft(mock)) entry.drafts += 1;
    entry.updated = Math.max(entry.updated, timeOf(mock.updatedAt || mock.createdAt));
    map.set(key, entry);
  });
  return [...map.values()]
    .map((entry) => {
      const pattern = rolePattern(entry.mocks);
      return {
        ...entry,
        duration: pattern.duration,
        minDuration: pattern.minDuration,
        mix: pattern.mix.map((item) => `${item.same ? '' : '≈'}${item.perMock} ${item.label}`).join(' + '),
        attempts: pattern.studentAttempts,
        avg: pattern.avgScore,
      };
    })
    .sort((left, right) => (left.key === NO_ROLE) - (right.key === NO_ROLE) || left.label.localeCompare(right.label));
}

const ROLE_VALUES = {
  label: (row) => row.label, count: (row) => row.count, published: (row) => row.published, drafts: (row) => row.drafts,
  duration: (row) => row.minDuration, mix: (row) => row.mix || null, attempts: (row) => row.attempts, avg: (row) => row.avg, updated: (row) => row.updated,
};
const roleValue = (row, key) => ROLE_VALUES[key]?.(row);

// --- Small building blocks ------------------------------------------------------------------

/**
 * A three-dot menu that renders above everything (the rail and panes scroll and clip). Items:
 * { label, icon, onClick, danger } | { divider: true, key } | { heading, key } (a group label);
 * falsy items are skipped. `buttonClass` replaces the trigger's look (e.g. the bordered global ⋮).
 */
function DotsMenu({ label, items, size = 'md', className = '', buttonClass = '', width: menuWidth = 232 }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const visible = [];
  for (const item of items.filter(Boolean)) {
    if (!item.divider || (visible.length && !visible.at(-1).divider)) visible.push(item);
  }
  if (visible.at(-1)?.divider) visible.pop();

  useLayoutEffect(() => {
    if (!open) { setStyle(null); return undefined; }
    const first = window.requestAnimationFrame(() => menuRef.current?.querySelector('[role="menuitem"]')?.focus());
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(menuWidth, window.innerWidth - 16);
      const height = menuRef.current?.scrollHeight || 40 * visible.length;
      const up = rect.bottom + height + 8 > window.innerHeight;
      setStyle({
        width,
        maxHeight: window.innerHeight - 16,
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(up ? rect.top - height - 6 : rect.bottom + 6, window.innerHeight - Math.min(height, window.innerHeight - 16) - 8)),
      });
    };
    place();
    const close = (event) => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); return; }
      if (event.key === 'Tab') { setOpen(false); return; }
      const entries = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
      if (!entries.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const at = entries.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1
        : (at + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
      entries[next].focus();
    };
    const onScroll = (event) => { if (!menuRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.cancelAnimationFrame(first);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, visible.length, menuWidth]);

  if (!visible.some((item) => !item.divider && !item.heading)) return null;
  return (
    <>
      <button ref={buttonRef} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
        className={`${buttonClass || `${iconButton} ${size === 'sm' ? 'h-7 w-7' : ''}`} ${open ? 'bg-slate-100 text-slate-800 dark:bg-gray-800 dark:text-white' : ''} ${className}`}>
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div ref={menuRef} role="menu" aria-label={label} style={style || { visibility: 'hidden', position: 'fixed' }}
          onClick={(event) => event.stopPropagation()}
          className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-1 shadow-2xl ring-1 ring-slate-950/5 dark:border-gray-700 dark:bg-gray-900">
          {visible.map((item) => (item.divider
            ? <div key={item.key} role="separator" className="my-1 h-px bg-slate-100 dark:bg-gray-800" />
            : item.heading
              ? <div key={item.key} role="presentation" className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-gray-500">{item.heading}</div>
            : <button key={item.label} type="button" role="menuitem" onClick={() => { setOpen(false); buttonRef.current?.focus(); item.onClick(); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-slate-50 dark:hover:bg-gray-800 ${item.danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-gray-200'}`}>
              {item.icon}<span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>))}
        </div>,
        document.body,
      )}
    </>
  );
}

function Stat({ label, value, tone = 'slate', hint }) {
  const tones = {
    slate: 'text-slate-900 dark:text-white',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    sky: 'text-sky-700 dark:text-sky-300',
  };
  return (
    <div className="min-w-0 px-4 py-2.5" title={hint}>
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-gray-500">{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function StatStrip({ children }) {
  return <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6 dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">{children}</div>;
}

function StatusBadge({ mock }) {
  const status = assessmentLifecycleLabel(mock);
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${statusStyles[status] || statusStyles.Upcoming}`}>
      {mock.status === 'Active' && status === 'Active' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />}
      {displayStatus(status)}
    </span>
  );
}

function SectionTitle({ icon: Icon, children, aside }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-gray-400">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}{children}
      </h3>
      {aside}
    </div>
  );
}

function CountChips({ published, drafts, noRole }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1 text-[10.5px] font-semibold leading-4">
      <span className={`rounded px-1.5 ${published ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400'}`}>{published} live</span>
      {drafts > 0 && <span className="rounded bg-slate-100 px-1.5 text-slate-600 dark:bg-gray-800 dark:text-gray-300">{plural(drafts, 'draft')}</span>}
      {noRole > 0 && <span className="rounded bg-amber-50 px-1.5 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{noRole} no role</span>}
    </span>
  );
}

// --- Filter bar (replaces the assessment filter rail on All Mocks) --------------------------

/** `actions`: items for the global ⋮ (bulk actions over every mock), or undefined to hide it. */
export function MockFilterBar({ filters, setFilters, status, counts, onStatus, testTypes, total, loading, onRefresh, onSortChange, actions }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const activeFilters = (filters.creationWindow !== 'any' ? 1 : 0) + (filters.testType !== 'all' ? 1 : 0);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="flex shrink-0 flex-col gap-2.5 border-b border-slate-200 pb-3 dark:border-gray-800 xl:flex-row xl:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          value={filters.search}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          placeholder="Search company, role, mock name, ID or type"
          aria-label="Search mocks"
          className="h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-sky-900/30"
        />
        {filters.search && <button type="button" aria-label="Clear search" onClick={() => setFilters((current) => ({ ...current, search: '' }))} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-gray-200"><X className="h-3.5 w-3.5" /></button>}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Mock status" className="flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-0.5 [scrollbar-width:none] dark:border-gray-700 dark:bg-gray-900">
          {STATUS_TABS.map((tab) => {
            const active = status === tab.id;
            return (
              <button key={tab.id} type="button" role="tab" aria-selected={active} onClick={() => onStatus(tab.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${active ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-gray-950' : 'text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                {tab.label}<span className={`tabular-nums ${active ? 'opacity-70' : 'text-slate-400 dark:text-gray-500'}`}>{Number(counts?.[tab.countKey] || 0)}</span>
              </button>
            );
          })}
        </div>

        <div ref={boxRef} className="relative">
          <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${activeFilters ? 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-500/10 dark:text-sky-200' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'}`}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
            {activeFilters > 0 && <span className="rounded-full bg-sky-600 px-1.5 text-[10px] leading-4 text-white">{activeFilters}</span>}
          </button>
          {open && (
            <div role="dialog" aria-label="Mock filters" className="absolute right-0 top-11 z-[70] w-72 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xl ring-1 ring-slate-950/5 dark:border-gray-700 dark:bg-gray-900">
              <label htmlFor="mock-created" className="block text-xs font-semibold text-slate-700 dark:text-gray-200">Created</label>
              <select id="mock-created" value={filters.creationWindow} onChange={(event) => setFilters((current) => ({ ...current, creationWindow: event.target.value }))} className={`mt-1.5 ${fieldClass}`}>
                {CREATION_WINDOWS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {filters.creationWindow === 'custom' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-500 dark:text-gray-400">From
                    <input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} className={`mt-1 ${fieldClass} px-2`} />
                  </label>
                  <label className="text-[11px] text-slate-500 dark:text-gray-400">To
                    <input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} className={`mt-1 ${fieldClass} px-2`} />
                  </label>
                </div>
              )}
              <label htmlFor="mock-type" className="mt-3 block text-xs font-semibold text-slate-700 dark:text-gray-200">Mock type</label>
              <select id="mock-type" value={filters.testType} onChange={(event) => setFilters((current) => ({ ...current, testType: event.target.value }))} className={`mt-1.5 ${fieldClass}`}>
                <option value="all">All types</option>
                {testTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-gray-800">
                <button type="button" disabled={!activeFilters} onClick={() => setFilters((current) => ({ ...current, creationWindow: 'any', startDate: '', endDate: '', testType: 'all' }))} className="text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-gray-400 dark:hover:text-white">Reset</button>
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-gray-950">Done</button>
              </div>
            </div>
          )}
        </div>

        <select value={filters.sort} onChange={(event) => onSortChange(event.target.value)} aria-label="Sort mocks" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          <option value="updated">Recently updated</option>
          <option value="oldest">Oldest created</option>
          <option value="start">Start time</option>
          <option value="title">Name A-Z</option>
        </select>
        <span className="hidden whitespace-nowrap text-xs font-medium tabular-nums text-slate-500 sm:inline dark:text-gray-400">{plural(total, 'mock')}</span>
        <button type="button" onClick={onRefresh} disabled={loading} title="Refresh mocks" aria-label="Refresh mocks" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800">
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        {actions && <DotsMenu label="Actions for all mocks" items={actions} width={272}
          buttonClass="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800" />}
      </div>
    </div>
  );
}

// --- Company tree (left) ----------------------------------------------------------------------

function CompanyRail({ companies, selectedKey, selectedRole, onSelect, onSelectRole, companyMenu, roleMenu, sort, onSort }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const term = query.trim().toLocaleLowerCase();
  const shown = useMemo(() => {
    const list = companies
      .map((company) => {
        if (!term || company.key.includes(term)) return { company, roles: company.roles, matched: false };
        const roles = company.roles.filter((role) => role.label.toLocaleLowerCase().includes(term));
        return roles.length ? { company, roles, matched: true } : null;
      })
      .filter(Boolean);
    const byName = (left, right) => left.company.name.localeCompare(right.company.name);
    return list.sort((left, right) => {
      const a = left.company;
      const b = right.company;
      if (sort === 'mocks') return b.count - a.count || byName(left, right);
      if (sort === 'roles') return b.roleCount - a.roleCount || byName(left, right);
      if (sort === 'recent') return b.updated - a.updated || byName(left, right);
      if (sort === 'attention') return (b.noRole + b.drafts) - (a.noRole + a.drafts) || byName(left, right);
      return byName(left, right);
    });
  }, [companies, term, sort]);

  const isOpen = (key, matched) => matched || expanded.has(key) || (key === selectedKey && !expanded.has(`-${key}`));
  const toggle = (key) => setExpanded((current) => {
    const next = new Set(current);
    const open = isOpen(key, false);
    // The chosen company opens by default; "-key" remembers that it was closed by hand.
    if (open) { next.delete(key); next.add(`-${key}`); } else { next.add(key); next.delete(`-${key}`); }
    return next;
  });
  const totalRoles = companies.reduce((sum, company) => sum + company.roleCount, 0);
  const totalMocks = companies.reduce((sum, company) => sum + company.count, 0);

  return (
    <aside aria-label="Companies" className="flex min-h-0 flex-col border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-950 lg:border-r">
      <div className="shrink-0 space-y-2 border-b border-slate-100 px-3 py-3 dark:border-gray-800">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-gray-400">
            Companies <span className="ml-1 tabular-nums text-slate-700 dark:text-gray-200">{companies.length}</span>
          </h2>
          <select value={sort} onChange={(event) => onSort(event.target.value)} aria-label="Sort companies" className="h-7 max-w-[8.5rem] rounded-md border-0 bg-transparent pr-6 text-[11px] font-medium text-slate-500 outline-none focus:ring-2 focus:ring-sky-500 dark:text-gray-400">
            {RAIL_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a company or role" aria-label="Find a company or role" className={searchClass} />
        </div>
      </div>
      <nav aria-label="Companies and roles" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" onClick={() => onSelect('')} aria-current={!selectedKey ? 'page' : undefined}
          className={`mb-1.5 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${!selectedKey ? 'bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/30' : 'hover:bg-slate-50 dark:hover:bg-gray-900'}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-gray-950"><Layers className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-slate-900 dark:text-white">Overview</span>
            <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">{plural(companies.length, 'company', 'companies')} · {plural(totalRoles, 'role')} · {plural(totalMocks, 'mock')}</span>
          </span>
        </button>
        {shown.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-400">No company or role matches “{query}”.</p>}
        <ul className="divide-y divide-slate-200/80 border-t border-slate-200/80 dark:divide-gray-800 dark:border-gray-800">
          {shown.map(({ company, roles, matched }) => {
            const active = company.key === selectedKey;
            const open = isOpen(company.key, matched);
            return (
              <li key={company.key} className="py-1.5">
                <div className={`group relative flex items-start gap-1 rounded-xl pr-1 transition ${active && !selectedRole ? 'bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/30' : active ? 'bg-slate-50 dark:bg-gray-900' : 'hover:bg-slate-50 dark:hover:bg-gray-900'}`}>
                  <button type="button" onClick={() => onSelect(company.name)} aria-current={active && !selectedRole ? 'page' : undefined}
                    aria-label={`${company.name}: ${plural(company.roleCount, 'role')}, ${plural(company.count, 'mock')}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pl-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                    <CompanyLogo name={company.name} logo={company.logo} size="lg" />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] font-semibold ${active ? 'text-sky-900 dark:text-sky-100' : 'text-slate-900 dark:text-white'}`}>{company.name}</span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">
                        <b className="font-semibold text-slate-700 dark:text-gray-200">{company.roleCount}</b> {company.roleCount === 1 ? 'role' : 'roles'} · <b className="font-semibold text-slate-700 dark:text-gray-200">{company.count}</b> {company.count === 1 ? 'mock' : 'mocks'}
                      </span>
                      <CountChips published={company.published} drafts={company.drafts} noRole={company.noRole} />
                    </span>
                  </button>
                  <span className="mt-2 flex shrink-0 items-center">
                    <DotsMenu label={`${company.name} actions`} size="sm" items={companyMenu(company, { open, toggle: () => toggle(company.key) })} />
                    <button type="button" onClick={() => toggle(company.key)} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} ${company.name} roles`} className={`${iconButton} h-7 w-7`}>
                      <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
                    </button>
                  </span>
                </div>
                {open && (
                  <ul aria-label={`${company.name} roles`} className="my-1 ml-[1.6rem] space-y-px border-l border-slate-200 pl-2 dark:border-gray-800">
                    {roles.map((role) => {
                      const roleActive = active && selectedRole === role.key;
                      const noRole = role.key === NO_ROLE;
                      return (
                        <li key={role.key} className={`flex min-w-0 items-center gap-0.5 rounded-lg pr-0.5 transition-colors ${roleActive ? 'bg-sky-600 text-white' : noRole ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'}`}>
                          <button type="button" onClick={() => onSelectRole(company.name, role.key)} aria-current={roleActive ? 'page' : undefined}
                            className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${roleActive ? 'font-semibold' : ''}`}>
                            {noRole ? <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" /> : <BriefcaseBusiness className={`h-3 w-3 shrink-0 ${roleActive ? '' : 'opacity-50'}`} aria-hidden="true" />}
                            <span className="min-w-0 flex-1 truncate">{role.label}</span>
                            {role.drafts > 0 && !roleActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" title={plural(role.drafts, 'draft')} aria-hidden="true" />}
                            <span className={`shrink-0 tabular-nums ${roleActive ? 'text-white/80' : 'text-slate-400 dark:text-gray-500'}`}>{role.count}</span>
                          </button>
                          <DotsMenu label={`${company.name} ${role.label} actions`} items={roleMenu(company, role)}
                            buttonClass={`${roleRailMenuButton} ${roleActive
                              ? 'text-white hover:bg-white/20 focus-visible:ring-inset focus-visible:ring-white aria-expanded:bg-white/20 aria-expanded:text-white'
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-sky-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'}`} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

// --- Overview (no company chosen) ------------------------------------------------------------

/** Publish state of one mock for the overview: live | hidden | ready | draft. */
const publishStateOf = (mock) => (isLiveMock(mock) ? 'live' : isPublished(mock) ? 'hidden' : isReadyMock(mock) ? 'ready' : 'draft');
const PUBLISH_STATES = [
  { key: 'live', label: 'Live', bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', hint: 'Open to every university with an active Prep Mock package' },
  { key: 'ready', label: 'Ready to publish', bar: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300', hint: 'Complete; turn on its Publish switch to make it live' },
  { key: 'draft', label: 'Draft', bar: 'bg-slate-300 dark:bg-gray-600', text: 'text-slate-600 dark:text-gray-300', hint: 'Still missing a pattern, questions or the test length' },
  { key: 'hidden', label: 'Hidden', bar: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-300', hint: 'Published earlier, now hidden from students' },
];
const countStates = (mocks) => mocks.reduce((counts, mock) => { counts[publishStateOf(mock)] += 1; return counts; }, { live: 0, ready: 0, draft: 0, hidden: 0 });

/** One horizontal bar split by publish state. */
function StateBar({ counts, total, height = 'h-2' }) {
  return (
    <div className={`flex ${height} w-full overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800`} role="img"
      aria-label={PUBLISH_STATES.map((state) => `${counts[state.key]} ${state.label.toLowerCase()}`).join(', ')}>
      {total > 0 && PUBLISH_STATES.map((state) => counts[state.key] > 0 && (
        <span key={state.key} className={state.bar} style={{ width: `${(counts[state.key] / total) * 100}%` }} />
      ))}
    </div>
  );
}

/** Roles of the given companies with at least one mock, and how many have a written exam pattern. */
function patternCoverage(companies) {
  const roles = companies.flatMap((company) => company.roles.filter((role) => role.key !== NO_ROLE));
  const withPattern = roles.filter((role) => role.mocks.some(writtenPatternOf)).length;
  return { roles: roles.length, withPattern };
}

const OVERVIEW_COMPANIES = 12;

function Overview({ companies, mocks, onJump, canCreate, onCreateMock }) {
  const roleCount = companies.reduce((sum, company) => sum + company.roleCount, 0);
  const states = countStates(mocks);
  const coverage = patternCoverage(companies);
  const coveragePercent = coverage.roles ? Math.round((coverage.withPattern / coverage.roles) * 100) : 0;
  const mocksWithPattern = mocks.filter(writtenPatternOf).length;
  const withoutRole = mocks.filter((mock) => !roleOf(mock)).length;
  const lengths = range(mocks.map((mock) => Number(mock.duration)), ' min');
  const topCompanies = [...companies].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)).slice(0, OVERVIEW_COMPANIES);
  const card = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Overview</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">Live mocks reach every university with an active Prep Mock package. Open a company to see its roles, patterns and mocks.</p>
        </div>
        {canCreate && <button type="button" onClick={() => onCreateMock({})} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"><Plus className="h-4 w-4" /> New mock</button>}
      </div>

      <StatStrip>
        <Stat label="Companies" value={companies.length} />
        <Stat label="Roles" value={roleCount} tone="sky" hint="Company and role pairs with at least one mock" />
        <Stat label="Mocks" value={mocks.length} />
        <Stat label="Live" value={states.live} tone="emerald" hint="Open to students now" />
        <Stat label="Ready to publish" value={states.ready} tone="sky" hint="Complete drafts waiting for the Publish switch" />
        <Stat label="Attempts" value={attemptsOf(mocks).toLocaleString()} hint="Started student attempts across these mocks" />
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-labelledby="overview-publishing">
          <SectionTitle icon={Globe}><span id="overview-publishing">Publishing</span></SectionTitle>
          <StateBar counts={states} total={mocks.length} height="h-3" />
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PUBLISH_STATES.map((state) => (
              <div key={state.key} title={state.hint} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-gray-950/60">
                <dt className="flex items-center gap-1.5 truncate text-[11px] text-slate-500 dark:text-gray-400"><span className={`h-2 w-2 shrink-0 rounded-full ${state.bar}`} aria-hidden="true" />{state.label}</dt>
                <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${state.text}`}>{states[state.key]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500 dark:text-gray-400">
            {canCreate ? 'Mocks are saved ready from the builder and published with the switch on each mock. ' : ''}Test lengths: <span className="font-semibold text-slate-700 dark:text-gray-200">{lengths}</span>.
          </p>
        </section>

        <section className={card} aria-labelledby="overview-patterns">
          <SectionTitle icon={Table2}><span id="overview-patterns">Exam patterns</span></SectionTitle>
          <div className="flex items-end justify-between gap-3">
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{coverage.withPattern}<span className="text-base font-medium text-slate-400 dark:text-gray-500"> / {coverage.roles}</span></p>
            <p className="text-right text-[11.5px] text-slate-500 dark:text-gray-400">roles have a written pattern</p>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800" role="img" aria-label={`${coveragePercent}% of roles have a pattern`}>
            <span className="block h-full rounded-full bg-violet-500" style={{ width: `${coveragePercent}%` }} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-gray-950/60"><dt className="text-[11px] text-slate-500 dark:text-gray-400">Mocks with a pattern</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums text-violet-700 dark:text-violet-300">{mocksWithPattern}</dd></div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-gray-950/60"><dt className="text-[11px] text-slate-500 dark:text-gray-400">Without a pattern</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-700 dark:text-gray-200">{mocks.length - mocksWithPattern}</dd></div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-gray-950/60"><dt className="text-[11px] text-slate-500 dark:text-gray-400">Without a role</dt><dd className={`mt-0.5 text-lg font-semibold tabular-nums ${withoutRole ? 'text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-gray-200'}`}>{withoutRole}</dd></div>
          </dl>
          {canCreate && <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500 dark:text-gray-400">A pattern is written once per company and role (with its OA month) and is needed before a mock is saved ready in the builder.</p>}
        </section>
      </div>

      <section aria-labelledby="overview-companies">
        <SectionTitle icon={Building2} aside={companies.length > OVERVIEW_COMPANIES && <span className="text-[11px] text-slate-400 dark:text-gray-500">Top {OVERVIEW_COMPANIES} by mocks · all {companies.length} on the left</span>}>
          <span id="overview-companies">Companies</span>
        </SectionTitle>
        {topCompanies.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {topCompanies.map((company) => {
              const counts = countStates(company.mocks);
              const covered = patternCoverage([company]);
              return (
                <li key={company.key}>
                  <button type="button" onClick={() => onJump(company.name, '')}
                    className="flex h-full w-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-sky-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-sky-800">
                    <span className="flex min-w-0 items-center gap-3">
                      <CompanyLogo name={company.name} logo={company.logo} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-slate-900 dark:text-white">{company.name}</span>
                        <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">{plural(company.roleCount, 'role')} · {plural(company.count, 'mock')}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-gray-600" aria-hidden="true" />
                    </span>
                    <StateBar counts={counts} total={company.count} />
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      {PUBLISH_STATES.filter((state) => counts[state.key] > 0).map((state) => (
                        <span key={state.key} className={`inline-flex items-center gap-1 font-semibold ${state.text}`}><span className={`h-1.5 w-1.5 rounded-full ${state.bar}`} aria-hidden="true" />{counts[state.key]} {state.label.toLowerCase()}</span>
                      ))}
                      <span className="ml-auto text-slate-400 dark:text-gray-500">{covered.withPattern}/{covered.roles} patterns</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">No mocks yet. Create the first mock to see companies here.</p>
        )}
      </section>
    </div>
  );
}

// --- Pattern table (one mock's structure, laid out like an exam paper's pattern) ----------------

// Section table full width with the admin's instructions under it; side by side only on wide screens.
const PATTERN_GRID = 'grid items-start gap-3 2xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]';

const levelText = (levels) => DIFFICULTIES.filter(([level]) => levels[level]).map(([level]) => `${levels[level]} ${level}`).join(' · ');

/**
 * S.No | Section | Type | Questions | Difficulty | Marks | Negative, with a Total row. Difficulty and
 * Negative appear only when the admin set them, so the table follows what the mock actually has.
 */
function PatternTable({ pattern }) {
  const { sections } = pattern;
  if (!sections.length) return <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400 dark:border-gray-700 dark:text-gray-500">No sections yet. Edit the mock to add questions.</p>;
  const showDifficulty = sections.some((section) => levelText(section.difficulty));
  const showNegative = sections.some((section) => section.negative);
  const showTime = sections.some((section) => section.minutes);
  const totalQuestions = sections.reduce((sum, section) => sum + section.count, 0);
  const totalMarks = sections.reduce((sum, section) => sum + (section.marks || 0), 0);
  const cell = 'px-3 py-2.5';
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-800">
      <table data-no-serial className="w-full min-w-[460px] text-left text-xs">
        <thead className="bg-slate-50 text-[10.5px] uppercase tracking-[0.08em] text-slate-500 dark:bg-gray-950 dark:text-gray-400">
          <tr>
            <th scope="col" className={`${cell} w-12 font-semibold`}>S.No</th>
            <th scope="col" className={`${cell} font-semibold`}>Section</th>
            <th scope="col" className={`${cell} font-semibold`}>Type</th>
            <th scope="col" className={`${cell} text-right font-semibold`}>Questions</th>
            {showTime && <th scope="col" className={`${cell} text-right font-semibold`}>Time (min)</th>}
            {showDifficulty && <th scope="col" className={`${cell} font-semibold`}>Difficulty</th>}
            <th scope="col" className={`${cell} text-right font-semibold`}>Marks</th>
            {showNegative && <th scope="col" className={`${cell} text-right font-semibold`}>Negative</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
          {sections.map((section, index) => (
            <tr key={`${section.name}-${index}`} className="text-slate-700 dark:text-gray-200">
              <td className={`${cell} tabular-nums text-slate-400`}>{index + 1}</td>
              <td className={`${cell} max-w-[16rem] truncate font-semibold`} title={section.name}>{section.name}</td>
              <td className={`${cell} text-slate-500 dark:text-gray-400`}>{SECTION_TYPES[section.type] || section.type || '—'}</td>
              <td className={`${cell} text-right tabular-nums`}>{section.count}</td>
              {showTime && <td className={`${cell} text-right tabular-nums`}>{section.minutes ?? '—'}</td>}
              {showDifficulty && <td className={`${cell} whitespace-nowrap text-slate-500 dark:text-gray-400`}>{levelText(section.difficulty) || '—'}</td>}
              <td className={`${cell} text-right tabular-nums`}>{section.marks || '—'}</td>
              {showNegative && <td className={`${cell} text-right tabular-nums ${section.negative ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>{section.negative ? `−${section.negative} / Q` : '—'}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-200 bg-sky-50/60 text-slate-900 dark:border-gray-800 dark:bg-sky-500/5 dark:text-white">
          <tr className="font-semibold">
            <td className={cell} />
            <td className={`${cell} text-sky-700 dark:text-sky-300`}>Total</td>
            <td className={cell} />
            <td className={`${cell} text-right tabular-nums`}>{totalQuestions}</td>
            {showTime && <td className={`${cell} text-right tabular-nums`}>{pattern.duration || sections.reduce((sum, section) => sum + (section.minutes || 0), 0)}</td>}
            {showDifficulty && <td className={`${cell} whitespace-nowrap font-medium text-slate-500 dark:text-gray-400`}>{levelText(pattern.difficulty)}</td>}
            <td className={`${cell} text-right tabular-nums`}>{totalMarks || pattern.marks || '—'}</td>
            {showNegative && <td className={cell} />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** The rules a student sees before starting, as small labelled facts. */
function PatternFacts({ pattern, mock }) {
  const facts = [
    { icon: CalendarClock, label: 'OA pattern from', value: pattern.patternFrom || 'Not set', warn: !pattern.patternFrom },
    { icon: Timer, label: 'Duration', value: pattern.duration ? `${pattern.duration} min` : 'Not set' },
    { icon: ListChecks, label: 'Questions', value: pattern.questions },
    { icon: BarChart3, label: 'Marks', value: pattern.marks || '—' },
    { icon: Repeat, label: 'Attempts', value: pattern.attempts },
    { icon: pattern.proctored ? ShieldCheck : ShieldOff, label: 'AI proctoring', value: pattern.proctored ? 'On' : 'Off' },
    { icon: CalendarClock, label: 'Availability', value: pattern.always ? 'Always open' : 'Scheduled' },
    mock?.passwordEnabled && { icon: Lock, label: 'Password', value: 'Required' },
    pattern.sets > 1 && { icon: Layers, label: 'Question sets', value: pattern.sets },
  ].filter(Boolean);
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-gray-800 dark:bg-gray-800">
      {facts.map(({ icon: Icon, label, value, warn }) => (
        <div key={label} className="bg-white px-3 py-2 dark:bg-gray-900">
          <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-gray-400"><Icon className="h-3 w-3" aria-hidden="true" />{label}</dt>
          <dd className={`mt-0.5 text-[13px] font-semibold tabular-nums ${warn ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Description, instructions and custom rules the admin wrote for the mock. */
function AdminNotes({ mock, title = 'Instructions from admin' }) {
  const notes = [mock.description, mock.instructions].map((value) => String(value || '').trim()).filter(Boolean);
  const custom = (mock.customInstructions || []).map((value) => String(value || '').trim()).filter(Boolean);
  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:border-gray-800 dark:text-gray-400"><ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />{title}</div>
      {notes.length || custom.length ? (
        <div className="max-h-56 space-y-2 overflow-y-auto px-3 py-2.5 text-xs leading-relaxed text-slate-600 dark:text-gray-300">
          {notes.map((note, index) => <p key={index} className="whitespace-pre-line">{note}</p>)}
          {custom.length > 0 && <ol className="list-decimal space-y-1 pl-4 marker:text-slate-400">{custom.map((item, index) => <li key={index}>{item}</li>)}</ol>}
        </div>
      ) : <p className="px-3 py-4 text-xs text-slate-400 dark:text-gray-500">No description or instructions written for this mock yet.</p>}
    </div>
  );
}

/** A role's mocks grouped by identical structure (duration + sections), most used first. */
function patternGroups(mocks) {
  const map = new Map();
  mocks.forEach((mock) => {
    const pattern = mockPattern(mock);
    const written = writtenPatternOf(mock);
    // A written pattern (one per company + role + OA month) groups its mocks; older mocks without
    // one group by the same OA date and structure (including suggested section times).
    const key = written
      ? `written:${String(mock.patternId || written.patternId || '') || JSON.stringify([written.patternFrom, written.rows])}`
      : JSON.stringify([pattern.patternFrom, pattern.duration, pattern.sections.map((section) => [section.name.trim().toLowerCase(), section.type, section.count, section.marks, section.negative, section.minutes])]);
    const group = map.get(key) || { key, mocks: [] };
    group.mocks.push(mock);
    map.set(key, group);
  });
  return [...map.values()]
    .map((group) => {
      const sample = [...group.mocks].sort((left, right) => timeOf(right.updatedAt || right.createdAt) - timeOf(left.updatedAt || left.createdAt))[0];
      return { ...group, sample, pattern: mockPattern(sample) };
    })
    .sort((left, right) => right.mocks.length - left.mocks.length);
}

// --- Mock list --------------------------------------------------------------------------------

/** The written exam pattern when the mock has one (what students read), else the old section-derived table. */
function PatternBlock({ mock, pattern, onEditPattern }) {
  const written = writtenPatternOf(mock);
  if (written) return <MockPatternTable pattern={written} caption={`${mock.company || ''} ${mock.role || ''} exam pattern`} className="bg-white dark:bg-gray-900" />;
  return (
    <div className="space-y-2">
      <PatternTable pattern={pattern} />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
        {/* Read-only viewers (universities) cannot add a pattern, so they get no instruction. */}
        {onEditPattern ? 'No written exam pattern yet: worked out from the questions. Add one so students see the company\'s pattern.' : 'Exam pattern worked out from the questions.'}
        {onEditPattern && <button type="button" onClick={onEditPattern} className="font-semibold underline underline-offset-2">Add pattern</button>}
      </p>
    </div>
  );
}

function MockDetails({ mock, onOpenPath, openPath, assessmentRoot }) {
  const pattern = mockPattern(mock);
  const editPattern = mock.shared ? null : () => onOpenPath(`${assessmentRoot}/${mock._id}/edit?pattern=1`);
  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-4 py-4 dark:border-gray-800 dark:bg-gray-950/40">
      <PatternFacts pattern={pattern} mock={mock} />
      <div className={PATTERN_GRID}>
        <PatternBlock mock={mock} pattern={pattern} onEditPattern={editPattern} />
        <AdminNotes mock={mock} />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 dark:text-gray-500">
          <span>{mock.createdBy?.name ? `By ${mock.createdBy.name} · ` : ''}Created {formatShortDate(mock.createdAt)} · Updated {ago(mock.updatedAt || mock.createdAt)}</span>
          <span className="flex gap-1.5">
            <button type="button" onClick={() => onOpenPath(`${assessmentRoot}/preview/${mock._id}`)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"><Eye className="h-3 w-3" /> Preview</button>
            {editPattern && <button type="button" onClick={editPattern} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"><Table2 className="h-3 w-3" /> Edit pattern</button>}
            {!mock.shared && <button type="button" onClick={() => onOpenPath(`${assessmentRoot}/${mock._id}/edit`)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"><Pencil className="h-3 w-3" /> Edit</button>}
            <button type="button" onClick={() => onOpenPath(openPath)} className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-gray-950">Open <ChevronRight className="h-3 w-3" /></button>
          </span>
        </div>
      </div>
    </div>
  );
}

const checkboxClass = 'h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-2 focus:ring-sky-500 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900';

/** "Select every mock on this page" — tri-state (indeterminate when some are ticked). */
function PageCheckbox({ rows, selection, onSelect, className = '' }) {
  const state = pageSelectionState(selection, rows);
  const selectable = rows.filter(isBulkEligible);
  return (
    <input type="checkbox" aria-label={`Select all ${selectable.length} mocks on this page`} disabled={!selectable.length}
      checked={state === 'all'} ref={(node) => { if (node) node.indeterminate = state === 'some'; }}
      onChange={() => onSelect(selectable.map((mock) => String(mock._id)), state !== 'all')}
      className={`${checkboxClass} ${className}`} />
  );
}

/**
 * Mocks of the chosen company / role. With `selection` (a Set of mock ids, owned by the page) and
 * `onSelect(ids, on)`, every row gets a checkbox (shift-click ticks a range on this page) and the
 * header a page checkbox; without them (university, read-only) the list has no checkboxes.
 */
function MockList({ table, showRole, openPathOf, onOpenPath, renderActions, assessmentRoot, emptyText, onTogglePublish, selection, onSelect }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const lastTicked = useRef(null);
  const selectable = Boolean(selection && onSelect);
  const toggle = (id) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const tick = (mock, event) => {
    const id = String(mock._id);
    const on = !selection.has(id);
    const range = event?.nativeEvent?.shiftKey && lastTicked.current ? rangeIds(table.pageRows, lastTicked.current, id) : [id];
    onSelect(range.length ? range : [id], on);
    lastTicked.current = id;
  };

  if (!table.total) return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">{emptyText}</div>;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      {selectable && (
        // Below xl the column header is hidden: a slim bar keeps "select this page" reachable.
        <label className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-[11px] font-semibold text-slate-500 xl:hidden dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-400">
          <PageCheckbox rows={table.pageRows} selection={selection} onSelect={onSelect} />
          Select this page
        </label>
      )}
      <div className={`hidden items-center gap-x-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 xl:grid dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-500 ${ROW_GRID}`}>
        {MOCK_COLUMNS.map((keys, column) => (
          <span key={keys[0][0]} className="flex min-w-0 items-center gap-1">
            {column === 0 && selectable && <PageCheckbox rows={table.pageRows} selection={selection} onSelect={onSelect} className="mr-1.5" />}
            {keys.map(([key, label], index) => (
              <span key={key} className="flex min-w-0 items-center gap-1">
                {index > 0 && <span aria-hidden="true" className="text-slate-300 dark:text-gray-700">/</span>}
                <GridSortButton sortKey={key} sort={table.sort} onSort={table.toggleSort}>{label}</GridSortButton>
              </span>
            ))}
          </span>
        ))}
        <span className="sr-only">Actions</span>
      </div>
      <ul role="list" className="divide-y divide-slate-100 dark:divide-gray-800">
        {table.pageRows.map((mock) => {
          const openPath = openPathOf(mock);
          const open = expanded.has(mock._id);
          const completed = Number(mock.completedCount || 0);
          const assigned = assignedCountOf(mock);
          const percent = assigned > 0 ? Math.min(100, Math.round((completed / assigned) * 100)) : 0;
          const always = isPublished(mock) && mock.isVisible !== false;
          const ticked = selectable && selection.has(String(mock._id));
          return (
            <li key={mock._id}>
              <div role="link" tabIndex={0}
                onClick={(event) => { if (!event.target.closest('button, a, input, select, textarea, label')) onOpenPath(openPath); }}
                onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) { event.preventDefault(); onOpenPath(openPath); } }}
                className={`group grid cursor-pointer grid-cols-1 items-center gap-x-3 gap-y-2.5 px-4 py-3 transition-colors focus:outline-none md:grid-cols-2 ${ticked ? 'bg-sky-50/70 hover:bg-sky-50 focus-visible:bg-sky-50 dark:bg-sky-500/[0.07] dark:hover:bg-sky-500/10' : 'hover:bg-sky-50/40 focus-visible:bg-sky-50/60 dark:hover:bg-white/[0.02]'} ${ROW_GRID}`}>
                <div className="flex min-w-0 items-center gap-2.5 md:col-span-2 xl:col-span-1">
                  {selectable && (
                    <input type="checkbox" checked={ticked} disabled={!isBulkEligible(mock)} onChange={(event) => tick(mock, event)}
                      aria-label={`Select ${mock.title || 'mock'}`} title={isBulkEligible(mock) ? 'Select (Shift-click to select a range)' : 'Shared mocks cannot be changed here'}
                      className={checkboxClass} />
                  )}
                  <button type="button" aria-expanded={open} aria-label={open ? 'Hide mock details' : 'Show mock details'} onClick={() => toggle(mock._id)} className={`${iconButton} h-7 w-7`}>
                    <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-slate-900 group-hover:text-sky-700 dark:text-white dark:group-hover:text-sky-300">{mock.title || 'Untitled mock'}</span>
                      {mock.passwordEnabled && <Lock className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Password protected" />}
                      {mock.shared && <span className="shrink-0 rounded border border-sky-200 bg-sky-50 px-1 text-[10px] font-medium text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">Shared</span>}
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400 dark:text-gray-500">
                      {showRole && (roleOf(mock)
                        ? <span className="inline-flex min-w-0 max-w-[10rem] shrink-0 items-center gap-1 font-semibold text-sky-700 dark:text-sky-300"><BriefcaseBusiness className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{roleOf(mock)}</span></span>
                        : <span className="shrink-0 rounded bg-amber-50 px-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" title="Choose a role before publishing">No role</span>)}
                      {showRole && <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />}
                      <span className="truncate">{mock.testType || mock.assessmentType || 'General'}</span>
                      <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                      <span className="shrink-0">ID {mock.assessmentId || '—'}</span>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 text-xs">
                  <div className="truncate font-semibold text-slate-700 dark:text-gray-200">{always ? 'Always on' : isPublished(mock) ? 'Hidden' : 'Not published'}</div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-gray-500">{always ? 'Until unpublished' : 'Publish to make available'}</div>
                </div>
                <div className="text-xs">
                  <div className="font-semibold text-slate-700 dark:text-gray-200">{plural(Number(mock.totalQuestions || 0), 'question')}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400 dark:text-gray-500">{mock.totalMarks || 0} marks · {mock.duration ? `${mock.duration} min` : 'no time'}</div>
                </div>
                <div className="min-w-0" title="All eligible universities can access a published mock">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-semibold text-slate-700 dark:text-gray-200">{completed} completed</span>
                    {assigned > 0 && <span className="text-[10px] tabular-nums text-slate-400 dark:text-gray-500">{percent}%</span>}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-gray-500">All eligible universities</div>
                </div>
                <div className="flex items-center gap-2 xl:flex-col xl:items-start xl:gap-1">
                  <PublishSwitch mock={mock} disabled={Boolean(mock.shared) || !onTogglePublish} onToggle={() => onTogglePublish?.(mock)} />
                  {mock.status === 'Completed' && <StatusBadge mock={mock} />}
                </div>
                <div className="flex justify-start md:justify-end">{renderActions(mock, openPath)}</div>
              </div>
              {open && <MockDetails mock={mock} openPath={openPath} onOpenPath={onOpenPath} assessmentRoot={assessmentRoot} />}
            </li>
          );
        })}
      </ul>
      <TablePager {...table.pager} noun="mocks" />
    </div>
  );
}

// --- Roles table ------------------------------------------------------------------------------

function RolesTable({ company, onOpenRole, roleMenu }) {
  const { roles } = company;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(null);
  const term = query.trim().toLocaleLowerCase();
  const rows = useMemo(() => sortRows(term ? roles.filter((role) => role.label.toLocaleLowerCase().includes(term)) : roles, sort, roleValue), [roles, term, sort]);
  const onSort = (key) => setSort((current) => nextSort(current, key));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      {roles.length > 6 && (
        <div className="border-b border-slate-100 p-2.5 dark:border-gray-800">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Find among ${roles.length} roles`} aria-label="Find a role" className={searchClass} />
          </div>
        </div>
      )}
      <div className={`hidden items-center gap-x-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 lg:grid dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-500 ${ROLE_GRID}`}>
        {ROLE_COLUMNS.map(([key, label]) => <span key={key} className={`min-w-0 ${ROLE_TIER[key] || ''}`}><GridSortButton sortKey={key} sort={sort} onSort={onSort}>{label}</GridSortButton></span>)}
        <span className="sr-only">Actions</span>
      </div>
      {rows.length === 0 ? <p className="px-4 py-8 text-center text-xs text-slate-400">No role matches “{query}”.</p> : (
        <ul role="list" className="divide-y divide-slate-100 dark:divide-gray-800">
          {rows.map((role) => {
            const noRole = role.key === NO_ROLE;
            return (
              <li key={role.key}>
                <div role="link" tabIndex={0}
                  onClick={(event) => { if (!event.target.closest('button')) onOpenRole(role.key); }}
                  onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) { event.preventDefault(); onOpenRole(role.key); } }}
                  className={`group grid cursor-pointer grid-cols-2 items-center gap-x-3 gap-y-1 px-4 py-2.5 text-xs transition-colors hover:bg-sky-50/40 focus:outline-none focus-visible:bg-sky-50/60 sm:grid-cols-4 dark:hover:bg-white/[0.02] ${ROLE_GRID}`}>
                  <span className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-4 lg:col-span-1">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${noRole ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'}`}>
                      {noRole ? <AlertTriangle className="h-3.5 w-3.5" /> : <BriefcaseBusiness className="h-3.5 w-3.5" />}
                    </span>
                    <span className={`truncate text-[13px] font-semibold group-hover:text-sky-700 dark:group-hover:text-sky-300 ${noRole ? 'text-amber-800 dark:text-amber-200' : 'text-slate-900 dark:text-white'}`}>{role.label}</span>
                  </span>
                  <span className="tabular-nums text-slate-700 dark:text-gray-200"><span className="text-slate-400 lg:hidden">Mocks </span><b className="font-semibold">{role.count}</b></span>
                  <span className="tabular-nums text-emerald-700 dark:text-emerald-300"><span className="text-slate-400 lg:hidden">Live </span>{role.published}</span>
                  <span className={`tabular-nums text-slate-500 dark:text-gray-400 ${ROLE_TIER.drafts}`}><span className="text-slate-400 xl:hidden">Drafts </span>{role.drafts}</span>
                  <span className={`tabular-nums text-slate-600 dark:text-gray-300 ${ROLE_TIER.duration}`}>{role.duration}</span>
                  <span className="col-span-2 truncate text-slate-600 sm:col-span-1 dark:text-gray-300" title={role.mix}>{noRole ? 'Choose a role before publishing' : role.mix || '—'}</span>
                  <span className="tabular-nums text-slate-600 dark:text-gray-300"><span className="text-slate-400 lg:hidden">Attempts </span>{role.attempts.toLocaleString()}</span>
                  <span className={`tabular-nums text-slate-600 dark:text-gray-300 ${ROLE_TIER.avg}`}><span className="text-slate-400 2xl:hidden">Avg </span>{role.avg !== null ? `${role.avg}%` : '—'}</span>
                  <span className={`text-slate-400 dark:text-gray-500 ${ROLE_TIER.updated}`}>{ago(role.updated)}</span>
                  <span className="flex justify-end"><DotsMenu label={`${company.name} ${role.label} actions`} size="sm" items={roleMenu(company, role)} /></span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// --- Company detail ---------------------------------------------------------------------------

/**
 * The role's exam pattern as students meet it: facts (duration, attempts, proctoring...), a section
 * table with totals, and the admin's own instructions beside it. Mocks that use the same written
 * pattern (or, for older mocks, the same structure) form one pattern; tabs switch between several.
 */
function RolePattern({ mocks, onOpenPath, assessmentRoot }) {
  const [open, setOpen] = useState(true);
  const groups = useMemo(() => patternGroups(mocks), [mocks]);
  const [active, setActive] = useState(0);
  const group = groups[Math.min(active, groups.length - 1)];
  const students = rolePattern(mocks);
  if (!group) return null;
  const { pattern, sample } = group;
  const written = writtenPatternOf(sample);
  const editPattern = sample.shared || !onOpenPath ? null : () => onOpenPath(`${assessmentRoot}/${sample._id}/edit?pattern=1`);
  return (
    <section aria-label="Role pattern" className="rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}
          className="flex min-w-0 items-center gap-2 rounded text-left text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-white">
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
          Exam pattern
          {!open && <span className="truncate font-normal text-slate-500 dark:text-gray-400">· {written ? `${written.rows.length} sections` : `${pattern.sections.length} sections · ${pattern.questions} questions`} · {pattern.duration ? `${pattern.duration} min` : 'no time'}</span>}
        </button>
        <span className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 dark:text-gray-500">
          <span>
            {groups.length > 1 ? `${groups.length} patterns across ${plural(mocks.length, 'mock')}` : `Same for all ${plural(mocks.length, 'mock')}`}
            {' · '}{plural(students.studentAttempts, 'student attempt')}{students.avgScore !== null ? ` · avg ${students.avgScore}%` : ''}
          </span>
          {editPattern && <button type="button" onClick={editPattern} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"><Table2 className="h-3 w-3" /> {written ? 'Edit pattern' : 'Add pattern'}</button>}
        </span>
      </div>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-4 dark:border-gray-800">
          {groups.length > 1 && (
            <div role="tablist" aria-label="Patterns" className="flex flex-wrap gap-1.5">
              {groups.map((entry, index) => (
                <button key={entry.key} type="button" role="tab" aria-selected={index === active} onClick={() => setActive(index)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${index === active ? 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                  {entry.pattern.patternFrom || `Pattern ${index + 1}`} <span className="font-normal opacity-70">· {plural(entry.mocks.length, 'mock')}</span>
                </button>
              ))}
            </div>
          )}
          <PatternFacts pattern={pattern} mock={sample} />
          <div className={PATTERN_GRID}>
            <PatternBlock mock={sample} pattern={pattern} onEditPattern={editPattern} />
            <AdminNotes mock={sample} title={group.mocks.length > 1 ? 'Instructions from admin (latest mock)' : 'Instructions from admin'} />
          </div>
          <p className="text-[11px] text-slate-400 dark:text-gray-500">
            Used by: {group.mocks.map((mock) => mock.title || 'Untitled mock').join(', ')}.
            {editPattern && (written ? ' Editing this pattern updates every mock that uses it.' : ' Edit a mock to add its pattern.')}
          </p>
        </div>
      )}
    </section>
  );
}

function CompanyDetail({
  company, selectedRole, onSelectRole, onClose, canCreate, onCreateMock, companyMenu, roleMenu,
  table, openPathOf, onOpenPath, renderActions, assessmentRoot, onTogglePublish, selection, onToggleSelection,
}) {
  const listProps = { table, openPathOf, onOpenPath, renderActions, assessmentRoot, onTogglePublish, selection, onSelect: onToggleSelection };
  const [tab, setTab] = useState('roles');
  const activeRole = company.roles.find((entry) => entry.key === selectedRole) || null;
  const realRole = activeRole && activeRole.key !== NO_ROLE ? activeRole : null;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 lg:hidden dark:text-gray-400 dark:hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> All companies</button>

      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center dark:border-gray-800 dark:bg-gray-900">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <CompanyLogo name={company.name} logo={company.logo} size="xl" />
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-lg font-semibold tracking-tight">
              <button type="button" onClick={() => onSelectRole('')} disabled={!activeRole} className={`truncate ${activeRole ? 'text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white' : 'text-slate-950 dark:text-white'}`}>{company.name}</button>
              {activeRole && <><ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" /><span className={`truncate ${activeRole.key === NO_ROLE ? 'text-amber-700 dark:text-amber-300' : 'text-slate-950 dark:text-white'}`}>{activeRole.label}</span></>}
            </nav>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-gray-400">
              {company.domain && !activeRole && <a href={`https://${company.domain}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-sky-700 hover:underline dark:text-sky-300"><Globe className="h-3 w-3" />{company.domain}</a>}
              {company.domain && !activeRole && <span aria-hidden="true">·</span>}
              {activeRole
                ? <><span>{plural(activeRole.count, 'mock')}</span><span aria-hidden="true">·</span><span>{activeRole.published} live</span>{activeRole.drafts > 0 && <><span aria-hidden="true">·</span><span>{plural(activeRole.drafts, 'draft')}</span></>}<span aria-hidden="true">·</span><span>Updated {ago(activeRole.updated)}</span></>
                : <><span>{plural(company.roleCount, 'role')}</span><span aria-hidden="true">·</span><span>{plural(company.count, 'mock')}</span><span aria-hidden="true">·</span><span>Updated {ago(company.updated)}</span></>}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canCreate && <button type="button" onClick={() => onCreateMock({ company: company.name, role: realRole?.label || '' })}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-3.5 text-xs font-semibold text-white hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2">
            <Plus className="h-4 w-4" /> New mock{realRole ? ` for ${realRole.label}` : ''}
          </button>}
          <DotsMenu label={`${company.name}${activeRole ? ` ${activeRole.label}` : ''} actions`} items={activeRole
            ? roleMenu(company, activeRole, { inDetail: true })
            : companyMenu(company, { inDetail: true, onClose })} />
        </div>
      </header>

      {!activeRole && <>
        <StatStrip>
          <Stat label="Roles" value={company.roleCount} tone="sky" />
          <Stat label="Mocks" value={company.count} />
          <Stat label="Published" value={company.published} tone="emerald" />
          <Stat label="Drafts" value={company.drafts} />
          <Stat label="Attempts" value={attemptsOf(company.mocks).toLocaleString()} hint="Started student attempts across this company's mocks" />
          <Stat label="Avg score" value={meanScore(company.mocks) !== null ? `${meanScore(company.mocks)}%` : '—'} hint="Mean of each mock's average graded score" />
        </StatStrip>

        {company.noRole > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p><b>{plural(company.noRole, 'mock')} {company.noRole === 1 ? 'has' : 'have'} no role.</b> Students find mocks by company and then role, so choose a role before publishing.
              <button type="button" onClick={() => onSelectRole(NO_ROLE)} className="ml-1 font-semibold underline underline-offset-2">Show {company.noRole === 1 ? 'it' : 'them'}</button></p>
          </div>
        )}

        <div role="tablist" aria-label={`${company.name} view`} className="flex gap-5 border-b border-slate-200 dark:border-gray-800">
          {[['roles', 'Roles', company.roleCount + (company.noRole ? 1 : 0)], ['mocks', 'All mocks', table.total]].map(([id, label, count]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${tab === id ? 'border-sky-600 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white'}`}>
              {label}<span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === id ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200' : 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400'}`}>{count}</span>
            </button>
          ))}
        </div>

        {tab === 'roles'
          ? <RolesTable company={company} onOpenRole={onSelectRole} roleMenu={roleMenu} />
          : <MockList {...listProps} showRole emptyText={`No mocks in ${company.name} match the filters.`} />}
      </>}

      {activeRole && <>
        <button type="button" onClick={() => onSelectRole('')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> All {company.name} roles</button>
        {realRole && <RolePattern key={realRole.key} mocks={realRole.mocks} onOpenPath={onOpenPath} assessmentRoot={assessmentRoot} />}
        <section aria-label={`${activeRole.label} mocks`}>
          <SectionTitle icon={ClipboardList} aside={<span className="text-[11px] tabular-nums text-slate-400 dark:text-gray-500">{plural(table.total, 'mock')}</span>}>{activeRole.label} mocks</SectionTitle>
          <MockList {...listProps} showRole={!realRole} emptyText={`No ${activeRole.label} mocks in ${company.name} match the filters.`} />
        </section>
      </>}
    </div>
  );
}

// --- Workspace --------------------------------------------------------------------------------

export default function MockWorkspace({
  loading, error, mocks, companyInfo, logoOf, selectedCompany, onSelectCompany, selectedRole, onSelectRole,
  table, openPathOf, onOpenPath, renderActions, assessmentRoot, canCreate, onCreateMock, onManageCompany, onClearFilters,
  onTogglePublish, scopeActions, selection, onToggleSelection,
}) {
  const [railSort, setRailSort] = useState('name');
  const companies = useMemo(() => {
    const map = new Map();
    mocks.forEach((mock) => {
      const name = companyNameOf(mock);
      const key = name.toLocaleLowerCase();
      const company = map.get(key) || { key, name, mocks: [], count: 0, published: 0, drafts: 0, noRole: 0, updated: 0, logo: null };
      company.mocks.push(mock);
      company.count += 1;
      if (isPublished(mock)) company.published += 1;
      if (isDraft(mock)) company.drafts += 1;
      if (!roleOf(mock)) company.noRole += 1;
      company.updated = Math.max(company.updated, timeOf(mock.updatedAt || mock.createdAt));
      company.logo = company.logo || mock.companyLogo || null;
      map.set(key, company);
    });
    return [...map.values()].map((company) => {
      const roles = rolesOf(company.mocks);
      return {
        ...company,
        roles,
        roleCount: roles.filter((role) => role.key !== NO_ROLE).length,
        logo: logoOf(company.name, company.logo),
        domain: companyInfo.get(company.key)?.domain || '',
      };
    });
  }, [mocks, logoOf, companyInfo]);

  const selectedKey = String(selectedCompany || '').toLocaleLowerCase();
  const company = companies.find((entry) => entry.key === selectedKey) || null;
  const jump = (name, roleKey) => { onSelectCompany(name); onSelectRole(roleKey); };

  // Shared by the company row in the tree and the company header.
  const companyMenu = (entry, { open, toggle, inDetail, onClose } = {}) => [
    ...(scopeActions?.({ company: entry.name }) || []),
    { divider: true, key: 'company-scope' },
    !inDetail && { label: `Open ${entry.name}`, icon: <FolderOpen className="h-3.5 w-3.5" />, onClick: () => onSelectCompany(entry.name) },
    canCreate && { label: `Create mock for ${entry.name}`, icon: <Plus className="h-3.5 w-3.5" />, onClick: () => onCreateMock({ company: entry.name }) },
    toggle && { label: open ? 'Hide roles' : `Show ${plural(entry.roles.length, 'role')}`, icon: <BriefcaseBusiness className="h-3.5 w-3.5" />, onClick: toggle },
    entry.noRole > 0 && { label: `Show ${plural(entry.noRole, 'mock')} without role`, icon: <AlertTriangle className="h-3.5 w-3.5" />, onClick: () => jump(entry.name, NO_ROLE) },
    { divider: true, key: 'd1' },
    canCreate && { label: 'Logo, website & roles', icon: <Building2 className="h-3.5 w-3.5" />, onClick: () => onManageCompany(entry.name) },
    entry.domain && { label: `Visit ${entry.domain}`, icon: <Globe className="h-3.5 w-3.5" />, onClick: () => window.open(`https://${entry.domain}`, '_blank', 'noopener,noreferrer') },
    inDetail && { divider: true, key: 'd2' },
    inDetail && { label: 'Close company', icon: <X className="h-3.5 w-3.5" />, onClick: onClose },
  ];

  const roleMenu = (entry, role, { inDetail = false } = {}) => [
    ...(scopeActions?.({ company: entry.name, roleKey: role.key, role: role.label }) || []),
    { divider: true, key: 'role-scope' },
    !inDetail && { label: 'Open role', icon: <FolderOpen className="h-3.5 w-3.5" />, onClick: () => jump(entry.name, role.key) },
    canCreate && role.key !== NO_ROLE && { label: `Create mock for ${role.label}`, icon: <Plus className="h-3.5 w-3.5" />, onClick: () => onCreateMock({ company: entry.name, role: role.label }) },
    role.count === 1 && !role.mocks[0].shared && { label: 'Edit its mock', icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => onOpenPath(`${assessmentRoot}/${role.mocks[0]._id}/edit`) },
    role.mocks.some((mock) => !isDraft(mock)) && {
      label: 'Preview latest mock',
      icon: <Eye className="h-3.5 w-3.5" />,
      onClick: () => {
        const latest = role.mocks.filter((mock) => !isDraft(mock)).sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt))[0];
        onOpenPath(`${assessmentRoot}/preview/${latest._id}`);
      },
    },
    inDetail && { divider: true, key: 'back-to-roles' },
    inDetail && { label: `Back to ${entry.name} roles`, icon: <ArrowLeft className="h-3.5 w-3.5" />, onClick: () => onSelectRole('') },
  ];

  let body;
  if (loading) {
    body = <div className="flex min-h-56 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading mocks…</div>;
  } else if (error) {
    body = <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-center text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">{error}</div>;
  } else if (!mocks.length) {
    body = (
      <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center dark:border-gray-700 dark:bg-gray-900">
        <ClipboardList className="h-7 w-7 text-slate-300" />
        <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">No mocks found</h3>
        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-gray-400">Try another status, date, type, or search term.</p>
        <button type="button" onClick={onClearFilters} className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Clear filters</button>
      </div>
    );
  } else if (selectedKey && !company) {
    body = (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        No mocks in {selectedCompany} match the filters.
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" onClick={onClearFilters} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300">Clear filters</button>
          <button type="button" onClick={() => onSelectCompany('')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300">Back to overview</button>
        </div>
      </div>
    );
  } else if (company) {
    body = (
      <CompanyDetail key={company.key} company={company} selectedRole={selectedRole} onSelectRole={onSelectRole} onClose={() => onSelectCompany('')}
        canCreate={canCreate} onCreateMock={onCreateMock} companyMenu={companyMenu} roleMenu={roleMenu}
        table={table} openPathOf={openPathOf} onOpenPath={onOpenPath} renderActions={renderActions} assessmentRoot={assessmentRoot}
        onTogglePublish={onTogglePublish} selection={selection} onToggleSelection={onToggleSelection} />
    );
  } else {
    body = <Overview companies={companies} mocks={mocks} logoOf={logoOf} onJump={jump} canCreate={canCreate} onCreateMock={onCreateMock} />;
  }

  return (
    <div className="mt-3 grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-gray-800 dark:bg-gray-950 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Phones: the company tree, or the chosen company with a back link; desktop: both side by side. */}
      <div className={`${selectedKey ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col`}>
        <CompanyRail companies={companies} selectedKey={company ? selectedKey : ''} selectedRole={selectedRole}
          onSelect={onSelectCompany} onSelectRole={jump} companyMenu={companyMenu} roleMenu={roleMenu} sort={railSort} onSort={setRailSort} />
      </div>
      <div className={`${selectedKey ? 'block' : 'hidden lg:block'} min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5`}>{body}</div>
    </div>
  );
}
