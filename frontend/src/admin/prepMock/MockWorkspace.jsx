import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowLeft, BarChart3, BriefcaseBusiness, Building2, CalendarClock, ChevronDown,
  ChevronRight, ClipboardList, Eye, FolderOpen, Globe, Layers, LayoutDashboard, ListChecks, Loader2, Lock,
  MoreVertical, Pencil, Plus, Repeat, RotateCcw, Search, ShieldCheck, ShieldOff, SlidersHorizontal, Table2, Timer, X,
} from 'lucide-react';
import CompanyLogo from '../../student/prepMock/CompanyLogo';
import { PublishSwitch } from './PublishToggle';
import { NO_ROLE_KEY, isBulkEligible, isLiveMock, isReadyMock, pageSelectionState, rangeIds } from './mockAccessModel';
import MockPatternTable from '../../features/prepMock/MockPatternTable';
import { formatPatternFrom } from '../../features/prepMock/patternModel';
import { TablePager, nextSort, sortRows } from '../../components/table';
import GridSortButton from '../assessment/components/GridSortButton';
import {
  assessmentLifecycleLabel, assignedCountOf, displayStatus, formatShortDate, statusStyles,
} from '../assessment/assessmentListShared';

// All Mocks workspace (admin Prep Mock). Same look and structure as the student's Prep Mock page:
//   left  — the company bar: Overview, then every company (logo, role and mock counts, ⋮ actions);
//           roles are not listed in the bar;
//   right — a title card for the chosen company or role (with its numbers inside), then the company's
//           Roles table and All mocks list, or the role's exam pattern and its mocks.
// Built to scale to hundreds of companies, dozens of roles per company and many mocks per role.
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
// The roles table grows with the screen (the company bar takes 300–320px): from 1024px Role, Mocks,
// Live, Question mix, Attempts; from 1280px also Drafts and Duration; from 1536px also Avg score and
// Updated. Below 1024px every row stacks with inline labels.
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
// Company bar filters (short labels so they fit one row of the bar). "No role" shows only when needed.
const RAIL_FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'live', label: 'Live', test: (company) => company.live > 0 },
  { key: 'drafts', label: 'Drafts', test: (company) => company.drafts > 0 },
  { key: 'norole', label: 'No role', test: (company) => company.noRole > 0 },
];

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;
const companyNameOf = (mock) => String(mock.company || 'Uncategorized').trim() || 'Uncategorized';
const roleOf = (mock) => String(mock.role || '').trim();
const roleKeyOf = (mock) => (roleOf(mock) ? roleOf(mock).toLocaleLowerCase() : NO_ROLE);
const timeOf = (value) => { const time = value ? new Date(value).getTime() : Number.NaN; return Number.isFinite(time) ? time : 0; };
const isPublished = (mock) => mock.lifecycleStatus === 'published';
const isDraft = (mock) => mock.lifecycleStatus === 'draft';

// --- Look (same tokens as the student's Prep Mock page) ----------------------------------------

const surface = 'rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]';
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#1a1a1a]';
const insetRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500';
const iconButton = `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-zinc-500 dark:hover:bg-white/[0.08] dark:hover:text-white ${insetRing}`;
const ghostButton = `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#e6e7eb] bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-colors hover:border-violet-200 hover:text-violet-700 dark:border-white/[0.08] dark:bg-transparent dark:text-zinc-300 dark:hover:border-violet-400/30 dark:hover:text-violet-200 ${focusRing}`;
const primaryButton = `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-[12.5px] font-semibold text-white shadow-[0_8px_18px_-12px_rgba(109,40,217,0.9)] transition-colors hover:bg-violet-500 ${focusRing}`;
const searchInput = 'h-9 w-full rounded-xl border border-[#e6e7eb] bg-[#f8f9fb] pl-9 pr-8 text-[12.5px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white [&::-webkit-search-cancel-button]:hidden';
const fieldClass = 'h-9 w-full rounded-lg border border-[#e6e7eb] bg-white px-2.5 text-[12px] text-slate-700 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-[#2a2a2a] dark:text-zinc-200 dark:[color-scheme:dark]';
const eyebrow = 'text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400';
const countPill = 'rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums tracking-normal text-slate-700 dark:bg-white/[0.08] dark:text-zinc-200';
const muted = 'text-slate-500 dark:text-zinc-400';
const faint = 'text-slate-400 dark:text-zinc-500';
const hairline = 'border-[#eef0f3] dark:border-white/[0.06]';

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
    const entry = map.get(key) || { key, label: roleOf(mock) || 'No role', mocks: [], count: 0, published: 0, live: 0, drafts: 0, updated: 0 };
    entry.mocks.push(mock);
    entry.count += 1;
    if (isPublished(mock)) entry.published += 1;
    if (isLiveMock(mock)) entry.live += 1;
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
 * A three-dot menu that renders above everything (the bar and panes scroll and clip). Items:
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
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); buttonRef.current?.focus(); return; }
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
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.cancelAnimationFrame(first);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, visible.length, menuWidth]);

  if (!visible.some((item) => !item.divider && !item.heading)) return null;
  return (
    <>
      <button ref={buttonRef} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
        className={`${buttonClass || `${iconButton} ${size === 'sm' ? 'h-7 w-7' : ''}`} ${open && !buttonClass ? 'bg-slate-100 text-slate-800 dark:bg-white/[0.08] dark:text-white' : ''} ${className}`}>
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div ref={menuRef} role="menu" aria-label={label} style={style || { visibility: 'hidden', position: 'fixed' }}
          onClick={(event) => event.stopPropagation()}
          className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-xl border border-[#e9eaee] bg-white p-1 font-dmsans shadow-[0_18px_40px_-18px_rgba(16,24,40,0.35)] dark:border-white/[0.08] dark:bg-[#2a2a2a]">
          {visible.map((item) => (item.divider
            ? <div key={item.key} role="separator" className="my-1 h-px bg-[#eef0f3] dark:bg-white/[0.06]" />
            : item.heading
              ? <div key={item.key} role="presentation" className={`px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] ${faint}`}>{item.heading}</div>
            : <button key={item.label} type="button" role="menuitem" onClick={() => { setOpen(false); buttonRef.current?.focus(); item.onClick(); }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors hover:bg-[#f6f7f9] focus:bg-[#f6f7f9] focus:outline-none dark:hover:bg-white/[0.05] dark:focus:bg-white/[0.05] ${item.danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-zinc-200'}`}>
              {item.icon}<span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** One number in a card's stat row (the title card and the overview hero). */
function Stat({ label, value, tone = 'slate', hint, className = '' }) {
  const tones = {
    slate: 'text-slate-900 dark:text-white',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    violet: 'text-violet-700 dark:text-violet-300',
    sky: 'text-sky-700 dark:text-sky-300',
  };
  return (
    <div className={`min-w-0 bg-[#fcfcfd] px-4 py-3 sm:px-5 dark:bg-[#262626] ${className}`} title={hint}>
      <dt className={`truncate text-[11.5px] ${muted}`}>{label}</dt>
      <dd className={`mt-0.5 truncate text-[18px] font-bold leading-tight tabular-nums ${tones[tone]}`}>{value}</dd>
    </div>
  );
}

/** A row of Stats along the bottom of a card, divided like the student's hero card. */
function StatRow({ children, cols = 6 }) {
  return (
    // 1px gaps over a hairline-coloured background draw the dividers at every column count.
    <dl className={`grid grid-cols-2 gap-px border-t border-[#eef0f3] bg-[#eef0f3] dark:border-white/[0.06] dark:bg-white/[0.06] ${cols === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-3 xl:grid-cols-6'}`}>
      {children}
    </dl>
  );
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

/** A card heading like the student's: violet icon, title, optional muted part and an aside. */
function CardTitle({ icon: Icon, children, id, aside }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h3 id={id} className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-zinc-50">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />}
        <span className="min-w-0 truncate">{children}</span>
      </h3>
      {aside}
    </div>
  );
}

const StaticDot = ({ className = 'bg-emerald-500' }) => <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${className}`} aria-hidden="true" />;

function CountChips({ live, drafts, noRole }) {
  if (!live && !drafts && !noRole) return null;
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1">
      {live > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-[3px] text-[10.5px] font-semibold leading-none text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><StaticDot />{live} live</span>}
      {drafts > 0 && <span className="rounded-md bg-slate-100 px-1.5 py-[3px] text-[10.5px] font-semibold leading-none text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300">{plural(drafts, 'draft')}</span>}
      {noRole > 0 && <span className="rounded-md bg-amber-50 px-1.5 py-[3px] text-[10.5px] font-semibold leading-none text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{noRole} no role</span>}
    </span>
  );
}

/** Hand-drawn stroke under "Mock" (the student Prep Mock title motif). */
function TitleUnderline() {
  return (
    <svg viewBox="0 0 200 16" preserveAspectRatio="none" fill="none" aria-hidden="true" className="pointer-events-none absolute -bottom-2.5 left-0 h-3 w-full overflow-visible text-violet-400 dark:text-violet-500">
      <path d="M4 11.5C52 5.5 118 3.2 196 7.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" pathLength="1" className="dashboard-underline" />
    </svg>
  );
}

// --- Page header ----------------------------------------------------------------------------

/**
 * The All Mocks title row (same as the student's Prep Mock header): the title, what the page is,
 * at-a-glance chips, and the page buttons on the right. `totals`: { companies, mocks, live, drafts }.
 */
export function MockPageHeader({ totals, children }) {
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[24px] font-medium leading-tight tracking-[-0.03em] text-slate-900 sm:text-[26px] dark:text-zinc-50">
          Prep <span className="relative inline-block font-bold text-violet-600 dark:text-violet-400">Mock<TitleUnderline /></span>
        </h1>
        <p className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.13em] text-violet-700 dark:text-violet-300"><Layers className="h-4 w-4" aria-hidden="true" />All mocks</p>
        {totals && (
          <ul aria-label="All mocks at a glance" className="flex flex-wrap gap-1.5 text-[12px]">
            {totals.live > 0 && <li className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-50 px-3 font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"><StaticDot />{totals.live} live</li>}
            <li className="inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-slate-500 ring-1 ring-inset ring-[#e6e7eb] dark:bg-[#242424] dark:text-zinc-400 dark:ring-white/[0.08]"><b className="font-semibold text-slate-800 dark:text-zinc-100">{totals.companies}</b> {totals.companies === 1 ? 'company' : 'companies'}</li>
            <li className="inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-slate-500 ring-1 ring-inset ring-[#e6e7eb] dark:bg-[#242424] dark:text-zinc-400 dark:ring-white/[0.08]"><b className="font-semibold text-slate-800 dark:text-zinc-100">{totals.mocks}</b> {totals.mocks === 1 ? 'mock' : 'mocks'}</li>
            {totals.drafts > 0 && <li className="inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-slate-500 ring-1 ring-inset ring-[#e6e7eb] dark:bg-[#242424] dark:text-zinc-400 dark:ring-white/[0.08]"><b className="font-semibold text-slate-800 dark:text-zinc-100">{totals.drafts}</b> {totals.drafts === 1 ? 'draft' : 'drafts'}</li>}
          </ul>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** A page button in the header, in the same style (`primary` for the main action). */
export function MockHeaderButton({ primary = false, className = '', ...props }) {
  return <button type="button" {...props} className={`${primary ? primaryButton : `${ghostButton} h-9 rounded-xl px-3 text-[12.5px]`} ${className}`} />;
}

// --- Filter bar -----------------------------------------------------------------------------

/** `actions`: items for the global ⋮ (bulk actions over every mock), or undefined to hide it. */
export function MockFilterBar({ filters, setFilters, status, counts, onStatus, testTypes, total, loading, onRefresh, onSortChange, actions }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const activeFilters = (filters.creationWindow !== 'any' ? 1 : 0) + (filters.testType !== 'all' ? 1 : 0);
  const smallButton = `flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#e6e7eb] bg-white text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-700 disabled:opacity-50 dark:border-white/[0.08] dark:bg-transparent dark:text-zinc-300 dark:hover:border-violet-400/30 dark:hover:text-violet-200 ${focusRing}`;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className={`${surface} flex shrink-0 flex-col gap-2.5 p-2.5 xl:flex-row xl:items-center`}>
      <label className="relative block min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input type="search" value={filters.search}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          placeholder="Search company, role, mock name, ID or type" aria-label="Search mocks"
          className={`${searchInput} h-10 text-[13px]`} />
        {filters.search && <button type="button" aria-label="Clear search" onClick={() => setFilters((current) => ({ ...current, search: '' }))} className={`absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 ${insetRing}`}><X className="h-3.5 w-3.5" /></button>}
      </label>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Mock status" className="flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-slate-100 p-0.5 [scrollbar-width:none] dark:bg-white/[0.05]">
          {STATUS_TABS.map((tab) => {
            const active = status === tab.id;
            return (
              <button key={tab.id} type="button" role="tab" aria-selected={active} onClick={() => onStatus(tab.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[12px] font-semibold transition-colors ${insetRing} ${active ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'}`}>
                {tab.label}<span className={`tabular-nums ${faint}`}>{Number(counts?.[tab.countKey] || 0)}</span>
              </button>
            );
          })}
        </div>

        <div ref={boxRef} className="relative">
          <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}
            className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[12px] font-semibold transition-colors ${focusRing} ${activeFilters ? 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-400/40 dark:bg-violet-500/10 dark:text-violet-200' : 'border-[#e6e7eb] bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700 dark:border-white/[0.08] dark:bg-transparent dark:text-zinc-300'}`}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
            {activeFilters > 0 && <span className="rounded-full bg-violet-600 px-1.5 text-[10px] leading-4 text-white">{activeFilters}</span>}
          </button>
          {open && (
            <div role="dialog" aria-label="Mock filters" className="absolute right-0 top-11 z-[70] w-72 rounded-xl border border-[#e9eaee] bg-white p-3.5 shadow-[0_18px_40px_-18px_rgba(16,24,40,0.35)] dark:border-white/[0.08] dark:bg-[#2a2a2a]">
              <label htmlFor="mock-created" className="block text-[12px] font-semibold text-slate-700 dark:text-zinc-200">Created</label>
              <select id="mock-created" value={filters.creationWindow} onChange={(event) => setFilters((current) => ({ ...current, creationWindow: event.target.value }))} className={`mt-1.5 ${fieldClass}`}>
                {CREATION_WINDOWS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {filters.creationWindow === 'custom' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className={`text-[11px] ${muted}`}>From
                    <input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} className={`mt-1 ${fieldClass} px-2`} />
                  </label>
                  <label className={`text-[11px] ${muted}`}>To
                    <input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} className={`mt-1 ${fieldClass} px-2`} />
                  </label>
                </div>
              )}
              <label htmlFor="mock-type" className="mt-3 block text-[12px] font-semibold text-slate-700 dark:text-zinc-200">Mock type</label>
              <select id="mock-type" value={filters.testType} onChange={(event) => setFilters((current) => ({ ...current, testType: event.target.value }))} className={`mt-1.5 ${fieldClass}`}>
                <option value="all">All types</option>
                {testTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <div className={`mt-3.5 flex items-center justify-between border-t pt-3 ${hairline}`}>
                <button type="button" disabled={!activeFilters} onClick={() => setFilters((current) => ({ ...current, creationWindow: 'any', startDate: '', endDate: '', testType: 'all' }))} className={`rounded text-[12px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-white ${focusRing}`}>Reset</button>
                <button type="button" onClick={() => setOpen(false)} className={`rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-violet-500 ${focusRing}`}>Done</button>
              </div>
            </div>
          )}
        </div>

        <select value={filters.sort} onChange={(event) => onSortChange(event.target.value)} aria-label="Sort mocks"
          className="h-9 rounded-xl border border-[#e6e7eb] bg-white pl-2.5 pr-8 text-[12px] font-semibold text-slate-600 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-[#242424] dark:text-zinc-300">
          <option value="updated">Recently updated</option>
          <option value="oldest">Oldest created</option>
          <option value="start">Start time</option>
          <option value="title">Name A-Z</option>
        </select>
        <span className={`hidden whitespace-nowrap px-1 text-[12px] font-medium tabular-nums sm:inline ${muted}`}>{plural(total, 'mock')}</span>
        <button type="button" onClick={onRefresh} disabled={loading} title="Refresh mocks" aria-label="Refresh mocks" className={smallButton}>
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        {actions && <DotsMenu label="Actions for all mocks" items={actions} width={272} buttonClass={smallButton} />}
      </div>
    </div>
  );
}

// --- Company bar (left) -----------------------------------------------------------------------

function CompanyRail({ companies, selectedKey, onSelect, companyMenu, sort, onSort }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const term = query.trim().toLocaleLowerCase();
  const filters = RAIL_FILTERS.map((option) => ({ ...option, count: companies.filter(option.test).length }))
    .filter((option) => option.key !== 'norole' || option.count > 0);
  const activeFilter = filters.find((option) => option.key === filter) || filters[0];
  const shown = useMemo(() => {
    const list = companies
      .filter(activeFilter.test)
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
  }, [companies, term, sort, activeFilter]);

  // Roles never list inside the bar: the company page's Roles table lists them.
  const totalRoles = companies.reduce((sum, company) => sum + company.roleCount, 0);
  const totalMocks = companies.reduce((sum, company) => sum + company.count, 0);
  const totalLive = companies.reduce((sum, company) => sum + company.live, 0);

  return (
    <aside aria-label="Companies" className={`${surface} flex min-h-0 flex-col overflow-hidden lg:flex-1`}>
      <div className={`shrink-0 space-y-2.5 border-b px-3 pb-3 pt-3.5 ${hairline}`}>
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className={`flex items-center gap-1.5 whitespace-nowrap ${eyebrow}`}>Companies <span className={countPill}>{companies.length}</span></h2>
          <label className={`flex items-center gap-1 text-[11px] ${faint}`}>
            <span className="sr-only">Sort</span>
            <select value={sort} onChange={(event) => onSort(event.target.value)} aria-label="Sort companies"
              className={`h-7 max-w-[9rem] rounded-md border-0 bg-transparent py-0 pl-1 pr-6 text-[11.5px] font-semibold text-slate-600 dark:bg-transparent dark:text-zinc-300 ${insetRing}`}>
              {RAIL_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Company or role" aria-label="Find a company or role" className={searchInput} />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
              className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 ${insetRing}`}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </label>
        <div className="flex gap-0.5 rounded-xl bg-slate-100 p-0.5 dark:bg-white/[0.05]" role="group" aria-label="Filter companies">
          {filters.map((option) => {
            const active = activeFilter.key === option.key;
            return (
              <button key={option.key} type="button" aria-pressed={active} onClick={() => setFilter(option.key)}
                aria-label={`${option.label}: ${plural(option.count, 'company', 'companies')}`}
                className={`inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-[10px] px-1 text-[11.5px] font-semibold transition-colors ${insetRing} ${active
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'}`}>
                {option.key === 'live' && <StaticDot />}
                {option.key === 'norole' && <StaticDot className="bg-amber-500" />}
                <span className="truncate">{option.label}</span>
                <span className={`tabular-nums ${faint}`}>{option.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrolls with wheel, touch and keys, without a visible scrollbar (cleaner bar). */}
      <nav aria-label="Companies and roles" className="min-h-0 flex-1 px-2 py-2 lg:overflow-y-auto lg:overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" onClick={() => onSelect('')} aria-current={!selectedKey ? 'page' : undefined}
          className={`mb-1.5 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${insetRing} ${!selectedKey ? 'bg-violet-50 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/25' : 'hover:bg-[#f6f7f9] dark:hover:bg-white/[0.03]'}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_8px_18px_-10px_rgba(109,40,217,0.9)]"><LayoutDashboard className="h-[18px] w-[18px]" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-slate-900 dark:text-zinc-50">Overview</span>
            <span className={`block truncate text-[11.5px] ${muted}`}>{plural(totalRoles, 'role')} · {plural(totalMocks, 'mock')} · {totalLive} live</span>
          </span>
        </button>

        {/* The header already counts every company; say it again only when a search or filter hides some. */}
        <p className={`px-2 pb-1 pt-1 text-[11px] ${faint} ${shown.length === companies.length ? 'sr-only' : ''}`} aria-live="polite">
          {shown.length === companies.length ? plural(companies.length, 'company', 'companies') : `${shown.length} of ${plural(companies.length, 'company', 'companies')}`}
        </p>

        {shown.length === 0 ? (
          <div role="status" className="px-3 py-6 text-center">
            <p className="text-[12.5px] font-semibold text-slate-700 dark:text-zinc-200">No companies match</p>
            <p className={`mt-1 text-[11.5px] ${muted}`}>{term ? `Nothing for “${query.trim()}”.` : 'Try another filter.'}</p>
            <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className={`${ghostButton} mt-3`}>Show all companies</button>
          </div>
        ) : (
          <ul className={`divide-y border-t ${hairline} divide-[#eef0f3] dark:divide-white/[0.06]`}>
            {shown.map(({ company, roles, matched }) => {
              const active = company.key === selectedKey;
              return (
                <li key={company.key} className="py-1.5">
                  <div className={`flex items-start gap-0.5 rounded-xl pr-1 transition-colors ${active ? 'bg-violet-50 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/25' : 'hover:bg-[#f6f7f9] dark:hover:bg-white/[0.03]'}`}>
                    <button type="button" onClick={() => onSelect(company.name)} aria-current={active ? 'page' : undefined}
                      aria-label={`${company.name}: ${plural(company.roleCount, 'role')}, ${plural(company.count, 'mock')}, ${company.live} live`}
                      className={`flex min-w-0 flex-1 items-start gap-3 rounded-xl py-2 pl-2.5 text-left ${insetRing}`}>
                      <CompanyLogo name={company.name} logo={company.logo} size="tile" />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13.5px] font-semibold leading-5 ${active ? 'text-violet-900 dark:text-violet-100' : 'text-slate-900 dark:text-zinc-50'}`}>{company.name}</span>
                        <span className={`block truncate text-[11.5px] ${muted}`}>
                          <b className="font-semibold text-slate-700 dark:text-zinc-200">{company.roleCount}</b> {company.roleCount === 1 ? 'role' : 'roles'} · <b className="font-semibold text-slate-700 dark:text-zinc-200">{company.count}</b> {company.count === 1 ? 'mock' : 'mocks'}
                        </span>
                        <CountChips live={company.live} drafts={company.drafts} noRole={company.noRole} />
                        {/* A search that matched roles (not the company name) says which ones. */}
                        {matched && <span className="mt-1 flex min-w-0 items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300"><BriefcaseBusiness className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{roles.map((role) => role.label).join(', ')}</span></span>}
                      </span>
                    </button>
                    <span className="mt-2 flex shrink-0 items-center">
                      <DotsMenu label={`${company.name} actions`} size="sm" items={companyMenu(company)} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}

// --- Overview (no company chosen) ------------------------------------------------------------

/** Publish state of one mock for the overview: live | hidden | ready | draft. */
const publishStateOf = (mock) => (isLiveMock(mock) ? 'live' : isPublished(mock) ? 'hidden' : isReadyMock(mock) ? 'ready' : 'draft');
const PUBLISH_STATES = [
  { key: 'live', label: 'Live', bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', hint: 'Open to every university with an active Prep Mock package' },
  { key: 'ready', label: 'Ready to publish', bar: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300', hint: 'Complete; turn on its Publish switch to make it live' },
  { key: 'draft', label: 'Draft', bar: 'bg-slate-300 dark:bg-zinc-600', text: 'text-slate-600 dark:text-zinc-300', hint: 'Still missing a pattern, questions or the test length' },
  { key: 'hidden', label: 'Hidden', bar: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-300', hint: 'Published earlier, now hidden from students' },
];
const countStates = (mocks) => mocks.reduce((counts, mock) => { counts[publishStateOf(mock)] += 1; return counts; }, { live: 0, ready: 0, draft: 0, hidden: 0 });

/** One horizontal bar split by publish state. */
function StateBar({ counts, total, height = 'h-2' }) {
  return (
    <div className={`flex ${height} w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]`} role="img"
      aria-label={PUBLISH_STATES.map((state) => `${counts[state.key]} ${state.label.toLowerCase()}`).join(', ')}>
      {total > 0 && PUBLISH_STATES.map((state) => counts[state.key] > 0 && (
        <span key={state.key} className={state.bar} style={{ width: `${(counts[state.key] / total) * 100}%` }} />
      ))}
    </div>
  );
}

/** Live share as a ring (the student hero's progress medal, here: live of all mocks). */
function LiveMedal({ live, total }) {
  const radius = 40;
  const ring = 2 * Math.PI * radius;
  const share = total ? Math.min(1, live / total) : 0;
  return (
    <div className="relative h-[104px] w-[104px] shrink-0" role="img" aria-label={`${live} of ${total} mocks live`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <defs><linearGradient id="admin-pmock-medal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#4f46e5" /></linearGradient></defs>
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-violet-100 dark:stroke-white/[0.07]" />
        {share > 0 && <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" strokeLinecap="round" stroke="url(#admin-pmock-medal)" strokeDasharray={`${share * ring} ${ring}`} />}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="text-[24px] font-bold leading-none tabular-nums tracking-[-0.03em] text-slate-950 dark:text-white">{live}<span className="text-[14px] font-semibold text-slate-400 dark:text-zinc-500">/{total}</span></span>
        <span className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${muted}`}>live</span>
      </span>
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
  const tile = 'rounded-xl bg-[#f6f7f9] px-3 py-2 dark:bg-white/[0.03]';

  return (
    <div className="space-y-5">
      <section aria-labelledby="mock-overview-title" className="relative overflow-hidden rounded-3xl border border-[#e8e5f4] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_0%_0%,rgba(139,92,246,0.14),transparent_65%),radial-gradient(45%_90%_at_100%_0%,rgba(14,165,233,0.11),transparent_65%)]" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-violet-700 dark:text-violet-300">Overview</p>
            <h2 id="mock-overview-title" className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.025em] text-slate-900 sm:text-[26px] dark:text-zinc-50">Every company mock in one place</h2>
            <p className={`mt-2 max-w-xl text-[14px] leading-6 ${muted}`}>Live mocks reach every university with an active Prep Mock package.</p>
            {canCreate && <button type="button" onClick={() => onCreateMock({})} className={`${primaryButton} mt-4`}><Plus className="h-4 w-4" /> New mock</button>}
          </div>
          <LiveMedal live={states.live} total={mocks.length} />
        </div>
        <div className="relative">
          <StatRow>
            <Stat label="Companies" value={companies.length} />
            <Stat label="Roles" value={roleCount} tone="violet" hint="Company and role pairs with at least one mock" />
            <Stat label="Mocks" value={mocks.length} />
            <Stat label="Live" value={states.live} tone="emerald" hint="Open to students now" />
            <Stat label="Ready to publish" value={states.ready} tone="violet" hint="Complete drafts waiting for the Publish switch" />
            <Stat label="Attempts" value={attemptsOf(mocks).toLocaleString()} hint="Started student attempts across these mocks" />
          </StatRow>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${surface} p-4 sm:p-5`} aria-labelledby="overview-publishing">
          <CardTitle icon={Globe} id="overview-publishing">Publishing</CardTitle>
          <div className="mt-3"><StateBar counts={states} total={mocks.length} height="h-3" /></div>
          <dl className="mt-3 grid grid-cols-2 gap-2 2xl:grid-cols-4">
            {PUBLISH_STATES.map((state) => (
              <div key={state.key} title={state.hint} className={tile}>
                <dt className={`flex items-center gap-1.5 truncate text-[11.5px] ${muted}`}><span className={`h-2 w-2 shrink-0 rounded-full ${state.bar}`} aria-hidden="true" />{state.label}</dt>
                <dd className={`mt-0.5 text-[18px] font-bold tabular-nums ${state.text}`}>{states[state.key]}</dd>
              </div>
            ))}
          </dl>
          <p className={`mt-3 text-[12px] ${muted}`}>Test lengths: <span className="font-semibold text-slate-700 dark:text-zinc-200">{lengths}</span></p>
        </section>

        <section className={`${surface} p-4 sm:p-5`} aria-labelledby="overview-patterns">
          <CardTitle icon={Table2} id="overview-patterns">Exam patterns</CardTitle>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-[26px] font-bold leading-none tabular-nums text-slate-900 dark:text-white">{coverage.withPattern}<span className="text-[16px] font-semibold text-slate-400 dark:text-zinc-500"> / {coverage.roles}</span></p>
            <p className={`text-right text-[12px] ${muted}`}>roles have a written pattern</p>
          </div>
          <div className="mt-2.5 h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" role="img" aria-label={`${coveragePercent}% of roles have a pattern`}>
            <span className="block h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-600" style={{ width: `${coveragePercent}%` }} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className={tile}><dt className={`text-[11.5px] ${muted}`}>Mocks with a pattern</dt><dd className="mt-0.5 text-[18px] font-bold tabular-nums text-violet-700 dark:text-violet-300">{mocksWithPattern}</dd></div>
            <div className={tile}><dt className={`text-[11.5px] ${muted}`}>Without a pattern</dt><dd className="mt-0.5 text-[18px] font-bold tabular-nums text-slate-700 dark:text-zinc-200">{mocks.length - mocksWithPattern}</dd></div>
            <div className={tile}><dt className={`text-[11.5px] ${muted}`}>Without a role</dt><dd className={`mt-0.5 text-[18px] font-bold tabular-nums ${withoutRole ? 'text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-zinc-200'}`}>{withoutRole}</dd></div>
          </dl>
        </section>
      </div>

      <section aria-labelledby="overview-companies">
        <div className="mb-3">
          <CardTitle icon={Building2} id="overview-companies" aside={companies.length > OVERVIEW_COMPANIES && <span className={`text-[12px] ${faint}`}>Top {OVERVIEW_COMPANIES} by mocks · all {companies.length} on the left</span>}>Companies</CardTitle>
        </div>
        {topCompanies.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {topCompanies.map((company) => {
              const counts = countStates(company.mocks);
              const covered = patternCoverage([company]);
              return (
                <li key={company.key}>
                  <button type="button" onClick={() => onJump(company.name, '')}
                    className={`${surface} flex h-full w-full flex-col gap-3 p-4 text-left transition hover:border-violet-200 hover:shadow-[0_10px_30px_-18px_rgba(109,40,217,0.45)] dark:hover:border-violet-400/30 ${focusRing}`}>
                    <span className="flex min-w-0 items-center gap-3">
                      <CompanyLogo name={company.name} logo={company.logo} size="tile" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-slate-900 dark:text-zinc-50">{company.name}</span>
                        <span className={`block truncate text-[11.5px] ${muted}`}>{plural(company.roleCount, 'role')} · {plural(company.count, 'mock')}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-zinc-600" aria-hidden="true" />
                    </span>
                    <StateBar counts={counts} total={company.count} />
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                      {PUBLISH_STATES.filter((state) => counts[state.key] > 0).map((state) => (
                        <span key={state.key} className={`inline-flex items-center gap-1 font-semibold ${state.text}`}><span className={`h-1.5 w-1.5 rounded-full ${state.bar}`} aria-hidden="true" />{counts[state.key]} {state.label.toLowerCase()}</span>
                      ))}
                      <span className={`ml-auto ${faint}`}>{covered.withPattern}/{covered.roles} patterns</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={`${surface} border-dashed p-6 text-center text-[12.5px] ${muted}`}>No mocks yet. Create the first mock to see companies here.</p>
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
  if (!sections.length) return <p className={`rounded-xl border border-dashed border-[#e6e7eb] px-4 py-6 text-center text-[12.5px] dark:border-white/[0.1] ${muted}`}>No sections yet. Edit the mock to add questions.</p>;
  const showDifficulty = sections.some((section) => levelText(section.difficulty));
  const showNegative = sections.some((section) => section.negative);
  const showTime = sections.some((section) => section.minutes);
  const totalQuestions = sections.reduce((sum, section) => sum + section.count, 0);
  const totalMarks = sections.reduce((sum, section) => sum + (section.marks || 0), 0);
  const cell = 'px-3 py-2.5 sm:px-3.5';
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e9eaee] dark:border-white/[0.07]">
      <table data-no-serial className="w-full min-w-[460px] text-left text-[13px]">
        <thead className="bg-[#f6f5fd] text-[10.5px] uppercase tracking-[0.1em] text-violet-900/70 dark:bg-violet-500/[0.07] dark:text-violet-200/80">
          <tr>
            <th scope="col" className={`${cell} w-14 font-semibold`}>S.No</th>
            <th scope="col" className={`${cell} font-semibold`}>Section</th>
            <th scope="col" className={`${cell} font-semibold`}>Type</th>
            <th scope="col" className={`${cell} text-right font-semibold`}>Questions</th>
            {showTime && <th scope="col" className={`${cell} text-right font-semibold`}>Time (min)</th>}
            {showDifficulty && <th scope="col" className={`${cell} font-semibold`}>Difficulty</th>}
            <th scope="col" className={`${cell} text-right font-semibold`}>Marks</th>
            {showNegative && <th scope="col" className={`${cell} text-right font-semibold`}>Negative</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef0f3] bg-white dark:divide-white/[0.06] dark:bg-[#242424]">
          {sections.map((section, index) => (
            <tr key={`${section.name}-${index}`} className="text-slate-700 dark:text-zinc-200">
              <td className={`${cell} tabular-nums ${faint}`}>{index + 1}</td>
              <td className={`${cell} max-w-[16rem] truncate font-semibold text-slate-900 dark:text-zinc-50`} title={section.name}>{section.name}</td>
              <td className={cell}><span className="whitespace-nowrap rounded-md bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-500/10 dark:text-violet-200">{SECTION_TYPES[section.type] || section.type || '—'}</span></td>
              <td className={`${cell} text-right tabular-nums`}>{section.count}</td>
              {showTime && <td className={`${cell} text-right tabular-nums`}>{section.minutes ?? '—'}</td>}
              {showDifficulty && <td className={`${cell} whitespace-nowrap ${muted}`}>{levelText(section.difficulty) || '—'}</td>}
              <td className={`${cell} text-right font-semibold tabular-nums`}>{section.marks || '—'}</td>
              {showNegative && <td className={`${cell} text-right tabular-nums ${section.negative ? 'font-semibold text-rose-600 dark:text-rose-400' : faint}`}>{section.negative ? `−${section.negative} / Q` : '—'}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-[#e6e7eb] bg-[#faf9ff] text-slate-900 dark:border-white/[0.08] dark:bg-violet-500/[0.05] dark:text-zinc-50">
          <tr className="font-semibold">
            <td className={cell} />
            <td className={`${cell} text-violet-700 dark:text-violet-300`}>Total</td>
            <td className={cell} />
            <td className={`${cell} text-right tabular-nums`}>{totalQuestions}</td>
            {showTime && <td className={`${cell} text-right tabular-nums`}>{pattern.duration || sections.reduce((sum, section) => sum + (section.minutes || 0), 0)}</td>}
            {showDifficulty && <td className={`${cell} whitespace-nowrap font-medium ${muted}`}>{levelText(pattern.difficulty)}</td>}
            <td className={`${cell} text-right tabular-nums`}>{totalMarks || pattern.marks || '—'}</td>
            {showNegative && <td className={cell} />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * The rules a student sees before starting, as one quiet line of facts (as under the student's mock
 * header) instead of a boxed grid. A missing OA month shows in amber.
 */
// Questions and marks are left out: the pattern table's Total row shows them.
function PatternFacts({ pattern, mock, hideOa = false }) {
  const facts = [
    !hideOa && { icon: CalendarClock, label: 'OA pattern', value: pattern.patternFrom || 'Not set', warn: !pattern.patternFrom },
    { icon: Timer, label: 'Duration', value: pattern.duration ? `${pattern.duration} min` : 'Not set', warn: !pattern.duration },
    { icon: Repeat, label: 'Attempts', value: pattern.attempts },
    { icon: pattern.proctored ? ShieldCheck : ShieldOff, label: 'AI proctoring', value: pattern.proctored ? 'On' : 'Off' },
    { icon: Globe, label: 'Availability', value: pattern.always ? 'Always open' : 'Not live' },
    mock?.passwordEnabled && { icon: Lock, label: 'Password', value: 'Required' },
    pattern.sets > 1 && { icon: Layers, label: 'Question sets', value: pattern.sets },
  ].filter(Boolean);
  return (
    <ul aria-label="Mock facts" className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12px]">
      {facts.map(({ icon: Icon, label, value, warn }) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${warn ? 'text-amber-500' : faint}`} aria-hidden="true" />
          <span className={muted}>{label}</span>
          <b className={`font-semibold tabular-nums ${warn ? 'text-amber-700 dark:text-amber-300' : 'text-slate-800 dark:text-zinc-100'}`}>{value}</b>
        </li>
      ))}
    </ul>
  );
}

/** Description, instructions and custom rules the admin wrote for the mock (like the student's Instructions). */
function AdminNotes({ mock, title = 'Instructions from admin' }) {
  const notes = [mock.description, mock.instructions].map((value) => String(value || '').trim()).filter(Boolean);
  const custom = (mock.customInstructions || []).map((value) => String(value || '').trim()).filter(Boolean);
  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-[#e9eaee] bg-white dark:border-white/[0.07] dark:bg-[#242424]">
      <div className={`flex items-center gap-2 border-b px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${hairline} ${muted}`}><ClipboardList className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />{title}</div>
      {notes.length || custom.length ? (
        <div className="max-h-56 space-y-2 overflow-y-auto px-3.5 py-3 text-[13px] leading-6 text-slate-700 dark:text-zinc-300">
          {notes.map((note, index) => <p key={index} className="whitespace-pre-line">{note}</p>)}
          {custom.length > 0 && (
            <ol className="space-y-1.5">
              {custom.map((item, index) => (
                <li key={index} className="flex gap-2.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">{index + 1}</span><span>{item}</span></li>
              ))}
            </ol>
          )}
        </div>
      ) : <p className={`px-3.5 py-4 text-[12.5px] ${muted}`}>No description or instructions written for this mock yet.</p>}
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
  if (written) return <MockPatternTable pattern={written} caption={`${mock.company || ''} ${mock.role || ''} exam pattern`} className="bg-white dark:bg-[#242424]" />;
  return (
    <div className="space-y-2">
      <PatternTable pattern={pattern} />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {/* Read-only viewers (universities) cannot add a pattern, so they get no instruction. */}
        {onEditPattern ? 'No written exam pattern yet: worked out from the questions. Add one so students see the company\'s pattern.' : 'Exam pattern worked out from the questions.'}
        {onEditPattern && <button type="button" onClick={onEditPattern} className={`rounded font-semibold underline underline-offset-2 ${focusRing}`}>Add pattern</button>}
      </p>
    </div>
  );
}

function MockDetails({ mock, onOpenPath, openPath, assessmentRoot }) {
  const pattern = mockPattern(mock);
  const editPattern = mock.shared ? null : () => onOpenPath(`${assessmentRoot}/${mock._id}/edit?pattern=1`);
  return (
    <div className={`space-y-3.5 border-t bg-[#fafbfc] px-4 py-4 sm:px-5 dark:bg-white/[0.02] ${hairline}`}>
      <PatternFacts pattern={pattern} mock={mock} />
      <div className={PATTERN_GRID}>
        <PatternBlock mock={mock} pattern={pattern} onEditPattern={editPattern} />
        <AdminNotes mock={mock} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-[11.5px] ${faint}`}>{mock.createdBy?.name ? `By ${mock.createdBy.name} · ` : ''}Created {formatShortDate(mock.createdAt)} · Updated {ago(mock.updatedAt || mock.createdAt)}</span>
        <span className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onOpenPath(`${assessmentRoot}/preview/${mock._id}`)} className={ghostButton}><Eye className="h-3.5 w-3.5" /> Preview</button>
          {editPattern && <button type="button" onClick={editPattern} className={ghostButton}><Table2 className="h-3.5 w-3.5" /> Edit pattern</button>}
          {!mock.shared && <button type="button" onClick={() => onOpenPath(`${assessmentRoot}/${mock._id}/edit`)} className={ghostButton}><Pencil className="h-3.5 w-3.5" /> Edit</button>}
          <button type="button" onClick={() => onOpenPath(openPath)} className={`inline-flex h-8 items-center gap-1 rounded-lg bg-violet-600 px-2.5 text-[12px] font-semibold text-white hover:bg-violet-500 ${focusRing}`}>Open <ChevronRight className="h-3.5 w-3.5" /></button>
        </span>
      </div>
    </div>
  );
}

const checkboxClass = 'h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-violet-600 focus:ring-2 focus:ring-violet-500 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-[#2a2a2a]';

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
    const ids = event?.nativeEvent?.shiftKey && lastTicked.current ? rangeIds(table.pageRows, lastTicked.current, id) : [id];
    onSelect(ids.length ? ids : [id], on);
    lastTicked.current = id;
  };

  if (!table.total) return <div className={`${surface} border-dashed p-8 text-center text-[13px] ${muted}`}>{emptyText}</div>;

  return (
    <div className={`${surface} overflow-hidden`}>
      {selectable && (
        // Below xl the column header is hidden: a slim bar keeps "select this page" reachable.
        <label className={`flex items-center gap-2.5 border-b bg-[#fafbfc] px-4 py-2 text-[11.5px] font-semibold xl:hidden dark:bg-white/[0.02] ${hairline} ${muted}`}>
          <PageCheckbox rows={table.pageRows} selection={selection} onSelect={onSelect} />
          Select this page
        </label>
      )}
      <div className={`hidden items-center gap-x-3 border-b bg-[#fafbfc] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] xl:grid dark:bg-white/[0.02] ${hairline} ${faint} ${ROW_GRID}`}>
        {MOCK_COLUMNS.map((keys, column) => (
          <span key={keys[0][0]} className="flex min-w-0 items-center gap-1">
            {column === 0 && selectable && <PageCheckbox rows={table.pageRows} selection={selection} onSelect={onSelect} className="mr-1.5" />}
            {keys.map(([key, label], index) => (
              <span key={key} className="flex min-w-0 items-center gap-1">
                {index > 0 && <span aria-hidden="true" className="text-slate-300 dark:text-zinc-700">/</span>}
                <GridSortButton sortKey={key} sort={table.sort} onSort={table.toggleSort}>{label}</GridSortButton>
              </span>
            ))}
          </span>
        ))}
        <span className="sr-only">Actions</span>
      </div>
      <ul role="list" className="divide-y divide-[#eef0f3] dark:divide-white/[0.06]">
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
                className={`group grid cursor-pointer grid-cols-1 items-center gap-x-3 gap-y-2.5 px-4 py-3 transition-colors focus:outline-none md:grid-cols-2 ${ticked ? 'bg-violet-50/70 hover:bg-violet-50 focus-visible:bg-violet-50 dark:bg-violet-500/[0.08] dark:hover:bg-violet-500/10' : open ? 'bg-[#fafbfc] dark:bg-white/[0.02]' : 'hover:bg-violet-50/40 focus-visible:bg-violet-50/60 dark:hover:bg-white/[0.02]'} ${ROW_GRID}`}>
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
                      <span className="truncate text-[13.5px] font-semibold text-slate-900 group-hover:text-violet-700 dark:text-zinc-50 dark:group-hover:text-violet-300">{mock.title || 'Untitled mock'}</span>
                      {mock.passwordEnabled && <Lock className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Password protected" />}
                      {mock.shared && <span className="shrink-0 rounded-md bg-sky-50 px-1.5 py-[2px] text-[10px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">Shared</span>}
                    </div>
                    <div className={`mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] ${faint}`}>
                      {showRole && (roleOf(mock)
                        ? <span className="inline-flex min-w-0 max-w-[10rem] shrink-0 items-center gap-1 font-semibold text-violet-700 dark:text-violet-300"><BriefcaseBusiness className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{roleOf(mock)}</span></span>
                        : <span className="shrink-0 rounded bg-amber-50 px-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" title="Choose a role before publishing">No role</span>)}
                      {showRole && <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />}
                      <span className="truncate">{mock.testType || mock.assessmentType || 'General'}</span>
                      <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                      <span className="shrink-0">ID {mock.assessmentId || '—'}</span>
                    </div>
                  </div>
                </div>
                <div className={`min-w-0 truncate text-[12px] font-semibold ${always ? 'text-slate-700 dark:text-zinc-200' : faint}`}>{always ? 'Always open' : isPublished(mock) ? 'Hidden' : 'Not published'}</div>
                <div className="text-[12px]">
                  <div className="font-semibold text-slate-700 dark:text-zinc-200">{plural(Number(mock.totalQuestions || 0), 'question')}</div>
                  <div className={`mt-0.5 text-[11.5px] ${faint}`}>{mock.totalMarks || 0} marks · {mock.duration ? `${mock.duration} min` : 'no time'}</div>
                </div>
                <div className="min-w-0" title="All eligible universities can access a published mock">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate font-semibold text-slate-700 dark:text-zinc-200">{completed} completed</span>
                    {assigned > 0 && <span className={`text-[10.5px] tabular-nums ${faint}`}>{percent}%</span>}
                  </div>
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
    <div className={`${surface} overflow-hidden`}>
      {roles.length > 6 && (
        <div className={`border-b p-2.5 ${hairline}`}>
          <label className="relative block max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Find among ${roles.length} roles`} aria-label="Find a role" className={`${searchInput} h-8 text-[12px]`} />
          </label>
        </div>
      )}
      <div className={`hidden items-center gap-x-3 border-b bg-[#fafbfc] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] lg:grid dark:bg-white/[0.02] ${hairline} ${faint} ${ROLE_GRID}`}>
        {ROLE_COLUMNS.map(([key, label]) => <span key={key} className={`min-w-0 ${ROLE_TIER[key] || ''}`}><GridSortButton sortKey={key} sort={sort} onSort={onSort}>{label}</GridSortButton></span>)}
        <span className="sr-only">Actions</span>
      </div>
      {rows.length === 0 ? <p className={`px-4 py-8 text-center text-[12.5px] ${muted}`}>No role matches “{query}”.</p> : (
        <ul role="list" className="divide-y divide-[#eef0f3] dark:divide-white/[0.06]">
          {rows.map((role) => {
            const noRole = role.key === NO_ROLE;
            return (
              <li key={role.key}>
                <div role="link" tabIndex={0}
                  onClick={(event) => { if (!event.target.closest('button')) onOpenRole(role.key); }}
                  onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) { event.preventDefault(); onOpenRole(role.key); } }}
                  className={`group grid cursor-pointer grid-cols-2 items-center gap-x-3 gap-y-1 px-4 py-3 text-[12.5px] transition-colors hover:bg-violet-50/40 focus:outline-none focus-visible:bg-violet-50/60 sm:grid-cols-4 dark:hover:bg-white/[0.02] ${ROLE_GRID}`}>
                  <span className="col-span-2 flex min-w-0 items-center gap-2.5 sm:col-span-4 lg:col-span-1">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${noRole ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'}`}>
                      {noRole ? <AlertTriangle className="h-4 w-4" /> : <BriefcaseBusiness className="h-4 w-4" />}
                    </span>
                    <span className={`truncate text-[13.5px] font-semibold group-hover:text-violet-700 dark:group-hover:text-violet-300 ${noRole ? 'text-amber-800 dark:text-amber-200' : 'text-slate-900 dark:text-zinc-50'}`}>{role.label}</span>
                  </span>
                  <span className="tabular-nums text-slate-700 dark:text-zinc-200"><span className={`lg:hidden ${faint}`}>Mocks </span><b className="font-semibold">{role.count}</b></span>
                  <span className="tabular-nums font-semibold text-emerald-700 dark:text-emerald-300"><span className={`font-normal lg:hidden ${faint}`}>Live </span>{role.published}</span>
                  <span className={`tabular-nums ${muted} ${ROLE_TIER.drafts}`}><span className={`xl:hidden ${faint}`}>Drafts </span>{role.drafts}</span>
                  <span className={`tabular-nums text-slate-600 dark:text-zinc-300 ${ROLE_TIER.duration}`}>{role.duration}</span>
                  <span className="col-span-2 truncate text-slate-600 sm:col-span-1 dark:text-zinc-300" title={role.mix}>{noRole ? 'Choose a role before publishing' : role.mix || '—'}</span>
                  <span className="tabular-nums text-slate-600 dark:text-zinc-300"><span className={`lg:hidden ${faint}`}>Attempts </span>{role.attempts.toLocaleString()}</span>
                  <span className={`tabular-nums text-slate-600 dark:text-zinc-300 ${ROLE_TIER.avg}`}><span className={`2xl:hidden ${faint}`}>Avg </span>{role.avg !== null ? `${role.avg}%` : '—'}</span>
                  <span className={`${faint} ${ROLE_TIER.updated}`}>{ago(role.updated)}</span>
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
 * The role's exam pattern as students meet it (the student page's "Exam pattern" card): the facts
 * line, a section table with totals, and the admin's own instructions beside it. Mocks that use the
 * same written pattern (or, for older mocks, the same structure) form one pattern; tabs switch between
 * several.
 */
function RolePattern({ mocks, onOpenPath, assessmentRoot }) {
  const [open, setOpen] = useState(true);
  const groups = useMemo(() => patternGroups(mocks), [mocks]);
  const [active, setActive] = useState(0);
  const group = groups[Math.min(active, groups.length - 1)];
  if (!group) return null;
  const { pattern, sample } = group;
  const written = writtenPatternOf(sample);
  const editPattern = sample.shared || !onOpenPath ? null : () => onOpenPath(`${assessmentRoot}/${sample._id}/edit?pattern=1`);
  return (
    <section aria-labelledby="mock-pattern-title" className={`${surface} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pb-3 pt-3.5 sm:px-5">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}
          className={`flex min-w-0 items-center gap-2 rounded-lg text-left ${focusRing}`}>
          <ListChecks className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
          <h3 id="mock-pattern-title" className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-zinc-50">
            Exam pattern
          </h3>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
        </button>
        <span className="flex flex-wrap items-center gap-2">
          {pattern.patternFrom && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-violet-700 ring-1 ring-inset ring-violet-200/70 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-400/20">
              <CalendarClock className="h-3 w-3" aria-hidden="true" />OA pattern · {pattern.patternFrom}
            </span>
          )}
          {editPattern && <button type="button" onClick={editPattern} className={ghostButton}><Table2 className="h-3.5 w-3.5" /> {written ? 'Edit pattern' : 'Add pattern'}</button>}
        </span>
      </div>
      {open && (
        <div className="space-y-3.5 px-4 pb-4 sm:px-5">
          {groups.length > 1 && (
            <div role="tablist" aria-label="Patterns" className="flex flex-wrap gap-1.5">
              {groups.map((entry, index) => (
                <button key={entry.key} type="button" role="tab" aria-selected={index === active} onClick={() => setActive(index)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-colors ${focusRing} ${index === active ? 'bg-violet-600 text-white shadow-[0_8px_18px_-12px_rgba(109,40,217,0.9)]' : 'bg-[#f3f4f6] text-slate-600 hover:bg-[#eceef1] hover:text-slate-900 dark:bg-white/[0.05] dark:text-zinc-300 dark:hover:bg-white/[0.09]'}`}>
                  {entry.pattern.patternFrom || `Pattern ${index + 1}`}<span className={`tabular-nums ${index === active ? 'text-white/75' : faint}`}>{plural(entry.mocks.length, 'mock')}</span>
                </button>
              ))}
            </div>
          )}
          {/* The OA month is in the badge above, so the facts line leaves it out. */}
          <PatternFacts pattern={pattern} mock={sample} hideOa={Boolean(pattern.patternFrom)} />
          <div className={PATTERN_GRID}>
            <PatternBlock mock={sample} pattern={pattern} onEditPattern={editPattern} />
            <AdminNotes mock={sample} title={group.mocks.length > 1 ? 'Instructions (latest mock)' : 'Instructions'} />
          </div>
          {/* Only worth saying when one edit reaches several mocks. */}
          {editPattern && written && group.mocks.length > 1 && (
            <p className={`text-[11.5px] ${faint}`}>Editing this pattern updates all {group.mocks.length} mocks that use it.</p>
          )}
        </div>
      )}
    </section>
  );
}

/** All Mocks › Company › Role. */
function Crumbs({ company, role, onCompany, onOverview }) {
  const crumb = `rounded font-semibold hover:text-slate-900 dark:hover:text-zinc-100 ${focusRing}`;
  return (
    <nav aria-label="Breadcrumb">
      <ol className={`flex min-w-0 items-center gap-1 text-[12.5px] ${muted}`}>
        <li className="lg:hidden"><button type="button" onClick={onOverview} className={`inline-flex items-center gap-1 ${crumb}`}><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />All companies</button></li>
        <li className="hidden lg:block"><button type="button" onClick={onOverview} className={crumb}>All mocks</button></li>
        <li aria-hidden="true" className="hidden lg:block"><ChevronRight className="h-3.5 w-3.5" /></li>
        <li className="hidden min-w-0 truncate lg:block">
          {role ? <button type="button" onClick={onCompany} className={crumb}>{company.name}</button> : <span className="font-semibold text-slate-800 dark:text-zinc-100" aria-current="page">{company.name}</span>}
        </li>
        {role && <><li aria-hidden="true" className="hidden lg:block"><ChevronRight className="h-3.5 w-3.5" /></li><li className="hidden min-w-0 truncate font-semibold text-slate-800 lg:block dark:text-zinc-100" aria-current="page">{role.label}</li></>}
      </ol>
    </nav>
  );
}

/**
 * The title card of the chosen company or role (like the student page's banner): logo, name and a
 * short line, the actions on the right, and its numbers inside the card along the bottom.
 */
function TitleCard({ company, role, canCreate, onCreateMock, menu }) {
  const realRole = role && role.key !== NO_ROLE ? role : null;
  const mocks = role ? role.mocks : company.mocks;
  const avg = meanScore(mocks);
  return (
    <header className={`${surface} overflow-hidden`}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_120%_at_0%_0%,rgba(139,92,246,0.09),transparent_70%)]" aria-hidden="true" />
        <div className="relative flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <CompanyLogo name={company.name} logo={company.logo} size="spot" />
            <div className="min-w-0">
              <h2 className={`truncate text-[20px] font-semibold leading-tight tracking-[-0.02em] ${role?.key === NO_ROLE ? 'text-amber-800 dark:text-amber-200' : 'text-slate-900 dark:text-zinc-50'}`} title={role ? role.label : company.name}>{role ? role.label : company.name}</h2>
              <p className={`mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] ${muted}`}>
                {!role && company.domain && <a href={`https://${company.domain}`} target="_blank" rel="noreferrer noopener" className={`inline-flex items-center gap-1 rounded font-medium text-violet-700 hover:underline dark:text-violet-300 ${focusRing}`}><Globe className="h-3 w-3" />{company.domain}</a>}
                {!role && company.domain && <span aria-hidden="true">·</span>}
                {/* Counts, length and question mix are in the numbers below and the pattern card. */}
                <span>Updated {ago(role ? role.updated : company.updated)}</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canCreate && (!role || realRole) && (
              <button type="button" onClick={() => onCreateMock({ company: company.name, role: realRole?.label || '' })} className={primaryButton}>
                <Plus className="h-4 w-4" /> New mock
              </button>
            )}
            {menu}
          </div>
        </div>
      </div>
      <StatRow cols={role ? 5 : 6}>
        {role ? <>
          <Stat label="Mocks" value={role.count} />
          <Stat label="Live" value={role.live} tone="emerald" hint="Published and visible to students" />
          <Stat label="Drafts" value={role.drafts} />
          <Stat label="Attempts" value={role.attempts.toLocaleString()} hint="Started student attempts across this role's mocks" />
          <Stat label="Avg score" value={avg !== null ? `${avg}%` : '—'} hint="Mean of each mock's average graded score" />
        </> : <>
          <Stat label="Roles" value={company.roleCount} tone="violet" />
          <Stat label="Mocks" value={company.count} />
          <Stat label="Live" value={company.live} tone="emerald" hint="Published and visible to students" />
          <Stat label="Drafts" value={company.drafts} />
          <Stat label="Attempts" value={attemptsOf(company.mocks).toLocaleString()} hint="Started student attempts across this company's mocks" />
          <Stat label="Avg score" value={avg !== null ? `${avg}%` : '—'} hint="Mean of each mock's average graded score" />
        </>}
      </StatRow>
    </header>
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
    <div className="min-w-0 space-y-4">
      <Crumbs company={company} role={activeRole} onCompany={() => onSelectRole('')} onOverview={onClose} />

      <TitleCard company={company} role={activeRole} canCreate={canCreate} onCreateMock={onCreateMock}
        menu={<DotsMenu label={`${company.name}${activeRole ? ` ${activeRole.label}` : ''} actions`} items={activeRole
          ? roleMenu(company, activeRole, { inDetail: true })
          : companyMenu(company, { inDetail: true, onClose })} />} />

      {!activeRole && <>
        {company.noRole > 0 && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p><b>{plural(company.noRole, 'mock')} {company.noRole === 1 ? 'has' : 'have'} no role.</b> Students find mocks by company and then role, so choose a role before publishing.
              <button type="button" onClick={() => onSelectRole(NO_ROLE)} className={`ml-1 rounded font-semibold underline underline-offset-2 ${focusRing}`}>Show {company.noRole === 1 ? 'it' : 'them'}</button></p>
          </div>
        )}

        <div role="tablist" aria-label={`${company.name} view`} className="flex gap-5 border-b border-[#e6e7eb] dark:border-white/[0.08]">
          {[['roles', 'Roles', company.roleCount + (company.noRole ? 1 : 0)], ['mocks', 'All mocks', table.total]].map(([id, label, count]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`-mb-px inline-flex items-center gap-1.5 rounded-t border-b-2 pb-2.5 text-[13.5px] font-semibold transition-colors ${insetRing} ${tab === id ? 'border-violet-600 text-slate-900 dark:border-violet-400 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}>
              {label}<span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === id ? 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-zinc-400'}`}>{count}</span>
            </button>
          ))}
        </div>

        {tab === 'roles'
          ? <RolesTable company={company} onOpenRole={onSelectRole} roleMenu={roleMenu} />
          : <MockList {...listProps} showRole emptyText={`No mocks in ${company.name} match the filters.`} />}
      </>}

      {activeRole && <>
        {realRole && <RolePattern key={realRole.key} mocks={realRole.mocks} onOpenPath={onOpenPath} assessmentRoot={assessmentRoot} />}
        <section aria-labelledby="mock-role-list" className="space-y-3">
          <CardTitle icon={ClipboardList} id="mock-role-list" aside={<span className={`text-[12px] tabular-nums ${muted}`}>{plural(table.total, 'mock')}</span>}>Mocks for {activeRole.label}</CardTitle>
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
      const company = map.get(key) || { key, name, mocks: [], count: 0, published: 0, live: 0, drafts: 0, noRole: 0, updated: 0, logo: null };
      company.mocks.push(mock);
      company.count += 1;
      if (isPublished(mock)) company.published += 1;
      if (isLiveMock(mock)) company.live += 1;
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

  // Shared by the company row in the bar and the title card.
  const companyMenu = (entry, { inDetail, onClose } = {}) => [
    ...(scopeActions?.({ company: entry.name }) || []),
    { divider: true, key: 'company-scope' },
    !inDetail && { label: `Open ${entry.name}`, icon: <FolderOpen className="h-3.5 w-3.5" />, onClick: () => jump(entry.name, '') },
    canCreate && { label: `Create mock for ${entry.name}`, icon: <Plus className="h-3.5 w-3.5" />, onClick: () => onCreateMock({ company: entry.name }) },
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
    body = <div className={`${surface} flex min-h-56 items-center justify-center text-[13px] ${muted}`}><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading mocks…</div>;
  } else if (error) {
    body = <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center text-[13px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">{error}</div>;
  } else if (!mocks.length) {
    body = (
      <div className={`${surface} flex min-h-64 flex-col items-center justify-center border-dashed px-6 py-10 text-center`}>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"><ClipboardList className="h-6 w-6" /></span>
        <h3 className="mt-3 text-[15px] font-semibold text-slate-900 dark:text-zinc-50">No mocks found</h3>
        <p className={`mt-1 max-w-sm text-[12.5px] ${muted}`}>Try another status, date, type, or search term.</p>
        <button type="button" onClick={onClearFilters} className={`${ghostButton} mt-4`}>Clear filters</button>
      </div>
    );
  } else if (selectedKey && !company) {
    body = (
      <div className={`${surface} border-dashed p-8 text-center text-[13px] ${muted}`}>
        No mocks in {selectedCompany} match the filters.
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" onClick={onClearFilters} className={ghostButton}>Clear filters</button>
          <button type="button" onClick={() => jump('', '')} className={ghostButton}>Back to overview</button>
        </div>
      </div>
    );
  } else if (company) {
    body = (
      <CompanyDetail key={company.key} company={company} selectedRole={selectedRole} onSelectRole={onSelectRole} onClose={() => jump('', '')}
        canCreate={canCreate} onCreateMock={onCreateMock} companyMenu={companyMenu} roleMenu={roleMenu}
        table={table} openPathOf={openPathOf} onOpenPath={onOpenPath} renderActions={renderActions} assessmentRoot={assessmentRoot}
        onTogglePublish={onTogglePublish} selection={selection} onToggleSelection={onToggleSelection} />
    );
  } else {
    body = <Overview companies={companies} mocks={mocks} onJump={jump} canCreate={canCreate} onCreateMock={onCreateMock} />;
  }

  return (
    <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-6">
      {/* Phones: the company bar, or the chosen company with a back link; desktop: both side by side. */}
      <div className={`${selectedKey ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col`}>
        <CompanyRail companies={companies} selectedKey={company ? selectedKey : ''}
          onSelect={(name) => jump(name, '')} companyMenu={companyMenu} sort={railSort} onSort={setRailSort} />
      </div>
      <div className={`${selectedKey ? 'block' : 'hidden lg:block'} min-h-0 min-w-0 pb-6 lg:overflow-y-auto lg:overscroll-contain lg:pr-1 [scrollbar-width:thin]`}>{body}</div>
    </div>
  );
}
