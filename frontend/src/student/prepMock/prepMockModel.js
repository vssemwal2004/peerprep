// Prep Mock: pure helpers that turn the student mock dashboard (GET /student/assessment-dashboard?kind=mock)
// into companies -> roles -> mocks. No React here, so test/prepMockModel.test.js can run it in node.

import { isResultAnnounced } from '../../utils/assessmentEvaluation.js';

export const GENERAL_ROLE = 'General';
export const OTHER_COMPANY = 'Other companies';

export const FILTERS = Object.freeze([
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open now' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
]);

// in_progress and live are both "open now"; closed = the window ended without a submission.
const STATE_ORDER = { in_progress: 0, live: 1, upcoming: 2, completed: 3, closed: 4 };

const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
export const nameKey = (value) => clean(value).toLowerCase();
const time = (value) => {
  const stamp = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(stamp) ? null : stamp;
};
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Always-on mocks: no closing date (the server stores year 9999 as the end, never show it). */
export function isAlwaysOpen(mock) {
  if (mock?.availabilityMode === 'always') return true;
  const end = time(mock?.endTime);
  return end !== null && new Date(end).getUTCFullYear() >= 9000;
}

export function isSubmitted(mock) {
  return Boolean(mock?.hasSubmitted || mock?.submittedAt);
}

/** 'in_progress' | 'live' | 'upcoming' | 'completed' (submitted) | 'closed' (window over, not submitted). */
export function mockState(mock) {
  if (isSubmitted(mock)) return 'completed';
  if (mock?.status === 'Live' && !mock?.manuallyCompletedAt) return mock?.hasSubmissionInProgress ? 'in_progress' : 'live';
  if (mock?.status === 'Upcoming') return 'upcoming';
  return 'closed';
}

export const isOpenNow = (mock) => ['live', 'in_progress'].includes(mockState(mock));

/** Every mock card in the dashboard response, once each. */
export function collectMocks(dashboard) {
  const seen = new Set();
  const out = [];
  for (const list of [dashboard?.ongoingAssessments, dashboard?.upcomingAssessments, dashboard?.completedAssessments]) {
    for (const mock of Array.isArray(list) ? list : []) {
      const id = String(mock?._id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(mock);
    }
  }
  return out;
}

/** Open (continue first) > upcoming (soonest first) > completed (latest first) > closed; then by title. */
export function compareMocks(a, b) {
  const stateA = mockState(a);
  const stateB = mockState(b);
  if (stateA !== stateB) return STATE_ORDER[stateA] - STATE_ORDER[stateB];
  if (stateA === 'upcoming') {
    const diff = (time(a.startTime) ?? Infinity) - (time(b.startTime) ?? Infinity);
    if (diff) return diff;
  }
  if (stateA === 'completed') {
    const diff = (time(b.submittedAt) ?? 0) - (time(a.submittedAt) ?? 0);
    if (diff) return diff;
  }
  return byName(clean(a.title), clean(b.title));
}

export function countsOf(mocks = []) {
  const counts = { total: 0, open: 0, inProgress: 0, upcoming: 0, completed: 0, closed: 0 };
  for (const mock of mocks) {
    const state = mockState(mock);
    counts.total += 1;
    if (state === 'live' || state === 'in_progress') counts.open += 1;
    if (state === 'in_progress') counts.inProgress += 1;
    if (state === 'upcoming') counts.upcoming += 1;
    if (state === 'completed') counts.completed += 1;
    if (state === 'closed') counts.closed += 1;
  }
  return counts;
}

export const companyName = (mock) => clean(mock?.company) || OTHER_COMPANY;
export const roleName = (mock) => clean(mock?.role) || GENERAL_ROLE;
export const companyPath = (name) => `/student/prep-mock/${encodeURIComponent(name)}`;

// Roles: open ones first, then more mocks, then A-Z; "General" (mocks saved without a role) last.
function compareRoles(a, b) {
  if (a.isGeneral !== b.isGeneral) return a.isGeneral ? 1 : -1;
  if ((a.counts.open > 0) !== (b.counts.open > 0)) return a.counts.open > 0 ? -1 : 1;
  if (a.counts.total !== b.counts.total) return b.counts.total - a.counts.total;
  return byName(a.name, b.name);
}

// Companies: any mock open now first, then more mocks, then A-Z; mocks with no company last.
function compareCompanies(a, b) {
  if (a.isOther !== b.isOther) return a.isOther ? 1 : -1;
  if ((a.counts.open > 0) !== (b.counts.open > 0)) return a.counts.open > 0 ? -1 : 1;
  if (a.counts.total !== b.counts.total) return b.counts.total - a.counts.total;
  return byName(a.name, b.name);
}

/**
 * Mocks grouped by company (case-insensitive) and then role.
 * [{ key, name, path, logo, isOther, mocks, counts, roles: [{ key, name, isGeneral, mocks, counts }] }]
 */
export function groupMocks(mocks = []) {
  const companies = new Map();
  for (const mock of mocks) {
    const name = companyName(mock);
    const key = nameKey(name);
    let company = companies.get(key);
    if (!company) {
      company = { key, name, logo: null, isOther: name === OTHER_COMPANY && !clean(mock?.company), mocks: [], roles: new Map() };
      companies.set(key, company);
    }
    if (!company.logo && mock?.companyLogo?.url) company.logo = mock.companyLogo;
    company.mocks.push(mock);
    const role = roleName(mock);
    const roleKey = nameKey(role);
    let entry = company.roles.get(roleKey);
    if (!entry) {
      entry = { key: roleKey, name: role, isGeneral: role === GENERAL_ROLE && !clean(mock?.role), mocks: [] };
      company.roles.set(roleKey, entry);
    }
    entry.mocks.push(mock);
  }
  return [...companies.values()].map((company) => ({
    ...company,
    path: companyPath(company.name),
    mocks: [...company.mocks].sort(compareMocks),
    counts: countsOf(company.mocks),
    roles: [...company.roles.values()]
      .map((role) => ({ ...role, mocks: [...role.mocks].sort(compareMocks), counts: countsOf(role.mocks) }))
      .sort(compareRoles),
  })).sort(compareCompanies);
}

/** Totals for the stat tiles. */
export function summarize(companies = []) {
  const totals = { companies: companies.length, roles: 0, mocks: 0, open: 0, upcoming: 0, completed: 0 };
  for (const company of companies) {
    totals.roles += company.roles.length;
    totals.mocks += company.counts.total;
    totals.open += company.counts.open;
    totals.upcoming += company.counts.upcoming;
    totals.completed += company.counts.completed;
  }
  return totals;
}

/** How many companies each filter chip would show. */
export function filterCounts(companies = []) {
  return {
    all: companies.length,
    open: companies.filter((company) => company.counts.open > 0).length,
    upcoming: companies.filter((company) => company.counts.upcoming > 0).length,
    completed: companies.filter((company) => company.counts.completed + company.counts.closed > 0).length,
  };
}

/** Search matches a company's name or any of its role names; the filter keeps companies with such mocks. */
export function filterCompanies(companies = [], { query = '', filter = 'all' } = {}) {
  const needle = nameKey(query);
  return companies.filter((company) => {
    if (filter === 'open' && !company.counts.open) return false;
    if (filter === 'upcoming' && !company.counts.upcoming) return false;
    if (filter === 'completed' && !(company.counts.completed + company.counts.closed)) return false;
    if (!needle) return true;
    return company.key.includes(needle) || company.roles.some((role) => role.key.includes(needle));
  });
}

function decode(value) {
  try {
    return decodeURIComponent(String(value ?? ''));
  } catch {
    return String(value ?? '');
  }
}

/** The company for a /student/prep-mock/:company param (already decoded or not), case-insensitive. */
export function findCompany(companies = [], param = '') {
  const key = nameKey(decode(param));
  if (!key) return null;
  return companies.find((company) => company.key === key) || null;
}

/** The role named in ?role= (case-insensitive), else the first role. */
export function pickRole(company, param = '') {
  if (!company?.roles?.length) return null;
  const key = nameKey(param);
  return (key && company.roles.find((role) => role.key === key)) || company.roles[0];
}

/** When the list can change by itself (an upcoming mock opens or a scheduled one closes); null when never. */
export function nextChangeAt(mocks = [], now = Date.now()) {
  let next = null;
  for (const mock of mocks) {
    const state = mockState(mock);
    let at = null;
    if (state === 'upcoming') at = time(mock.startTime);
    else if ((state === 'live' || state === 'in_progress') && !isAlwaysOpen(mock)) at = time(mock.endTime);
    if (at !== null && at > now && (next === null || at < next)) next = at;
  }
  return next;
}

export function sectionTypeLabel(type = '') {
  const normalized = String(type || '').toLowerCase().replace(/_/g, ' ').trim();
  if (!normalized || normalized === 'mixed') return 'Mixed';
  if (normalized === 'mcq') return 'MCQ';
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Distinct question types across a mock's sections ("MCQ", "Coding", …). */
export function sectionTypes(mock) {
  const sections = Array.isArray(mock?.sections) ? mock.sections : [];
  const types = [...new Set(sections.map((section) => sectionTypeLabel(section?.type)))];
  return types.length ? types : [sectionTypeLabel(mock?.assessmentType)];
}

export function totalMarksOf(mock) {
  const sections = Array.isArray(mock?.sections) ? mock.sections : [];
  const fromSections = sections.reduce((sum, section) => sum + (Number(section?.totalMarks) || 0), 0);
  return fromSections || Number(mock?.totalMarks) || 0;
}

export function plainText(value = '') {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function initialsOf(name = '') {
  const words = clean(name).split(' ').filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).replace(/^./, (char) => char.toUpperCase());
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Soft tones for the initial badge (no logo); the same company always gets the same tone.
const INITIAL_TONES = [
  'from-sky-500 to-blue-600',
  'from-violet-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-sky-600',
  'from-fuchsia-500 to-purple-600',
  'from-lime-500 to-emerald-600',
];

export function initialTone(name = '') {
  let hash = 0;
  for (const char of nameKey(name)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return INITIAL_TONES[hash % INITIAL_TONES.length];
}

/* ------------------------------------------------------------------ directory (hundreds of companies) */

/** Companies shown per "Show more" step, and how many companies it takes to show the A–Z index. */
export const DIRECTORY_CHUNK = 60;
export const AZ_INDEX_MIN = 20;
export const ALPHABET = Object.freeze(['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']);

export const SORTS = Object.freeze([
  { key: 'open', label: 'Open now first' },
  { key: 'mocks', label: 'Most mocks' },
  { key: 'az', label: 'A–Z' },
]);

/** The index letter of a company: A–Z, or '#' for digits, symbols and mocks with no company. */
export function letterOf(company) {
  if (company?.isOther) return '#';
  const first = clean(company?.name).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
}

/** 'open' (open now first, then more mocks), 'mocks' (most mocks), 'az' ('#' group first, by name). */
export function sortCompanies(companies = [], sort = 'open') {
  const list = [...companies];
  if (sort === 'az') {
    return list.sort((a, b) => {
      const letterA = letterOf(a);
      const letterB = letterOf(b);
      if (letterA !== letterB) return letterA < letterB ? -1 : 1;
      if (a.isOther !== b.isOther) return a.isOther ? 1 : -1;
      return byName(a.name, b.name);
    });
  }
  if (sort === 'mocks') {
    return list.sort((a, b) => {
      if (a.isOther !== b.isOther) return a.isOther ? 1 : -1;
      return (b.counts.total - a.counts.total) || byName(a.name, b.name);
    });
  }
  return list.sort(compareCompanies);
}

/** Runs of companies by index letter, in list order: [{ letter, companies }]. */
export function groupByLetter(companies = []) {
  const groups = [];
  for (const company of companies) {
    const letter = letterOf(company);
    const last = groups[groups.length - 1];
    if (last?.letter === letter) last.companies.push(company);
    else groups.push({ letter, companies: [company] });
  }
  return groups;
}

/** The letters that have at least one company (for enabling the A–Z index). */
export const lettersPresent = (companies = []) => new Set(companies.map(letterOf));

/** Splits text into [{ text, match }] around every case-insensitive occurrence of the query. */
export function highlightParts(text = '', query = '') {
  const value = String(text ?? '');
  const needle = clean(query).toLowerCase();
  if (!needle || !value) return [{ text: value, match: false }];
  const lower = value.toLowerCase();
  if (lower.length !== value.length) return [{ text: value, match: false }];
  const parts = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: value.slice(from, at), match: false });
    parts.push({ text: value.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < value.length) parts.push({ text: value.slice(from), match: false });
  return parts.length ? parts : [{ text: value, match: false }];
}

/** When a search hits a role but not the company name, the role it hit (to show on the tile). */
export function matchedRole(company, query = '') {
  const needle = nameKey(query);
  if (!needle || company?.key?.includes(needle)) return null;
  return company?.roles?.find((role) => role.key.includes(needle))?.name || null;
}

/** Companies with a mock open now, most open first (the spotlight row). */
export function spotlightOf(companies = [], limit = 12) {
  return companies
    .filter((company) => company.counts.open > 0)
    .sort((a, b) => (b.counts.open - a.counts.open) || byName(a.name, b.name))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ results and the journey rail */

/**
 * What a student may see of a mock's result: null until announced; otherwise the percentage when the
 * mock allows it, else the score. Never derives a hidden percentage from the score.
 */
export function resultOf(report) {
  if (!report || !isResultAnnounced(report)) return null;
  const accuracy = Number(report.accuracy);
  const percentVisible = report.permissions?.canViewPercentage !== false && report.accuracy !== null && report.accuracy !== undefined && Number.isFinite(accuracy);
  if (percentVisible) return { percent: Math.round(accuracy), label: `${Math.round(accuracy)}%` };
  const total = Number(report.totalMarks);
  return { percent: null, label: `${report.score}${total ? ` / ${total}` : ''}` };
}

const reportFor = (reports, mock) => (reports instanceof Map ? reports.get(String(mock?._id)) : reports?.[String(mock?._id)]) || null;

/**
 * The student's own Prep Mock progress: totals, the mocks to continue, recent results, what opens next,
 * and best / latest released result. `reports` is a Map (or object) of report rows by mock id.
 */
export function journeyOf(companies = [], reports = new Map()) {
  const all = companies.flatMap((company) => company.mocks.map((mock) => ({ mock, company, state: mockState(mock) })));
  const completed = all
    .filter((entry) => entry.state === 'completed')
    .map((entry) => ({ ...entry, report: reportFor(reports, entry.mock), result: resultOf(reportFor(reports, entry.mock)) }))
    .sort((a, b) => (time(b.mock.submittedAt) ?? 0) - (time(a.mock.submittedAt) ?? 0));
  const released = completed.filter((entry) => entry.result);
  const best = released.filter((entry) => entry.result.percent !== null)
    .reduce((top, entry) => (!top || entry.result.percent > top.result.percent ? entry : top), null);
  return {
    total: all.length,
    completed: completed.length,
    open: all.filter((entry) => entry.state === 'live' || entry.state === 'in_progress').length,
    companies: companies.length,
    attemptedCompanies: companies.filter((company) => company.counts.completed + company.counts.inProgress > 0).length,
    inProgress: all.filter((entry) => entry.state === 'in_progress'),
    recent: completed.slice(0, 4),
    upcoming: all.filter((entry) => entry.state === 'upcoming')
      .sort((a, b) => (time(a.mock.startTime) ?? Infinity) - (time(b.mock.startTime) ?? Infinity))
      .slice(0, 4),
    best,
    last: released[0] || null,
  };
}
