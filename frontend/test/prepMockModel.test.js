import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GENERAL_ROLE, OTHER_COMPANY, collectMocks, companyPath, filterCompanies, filterCounts, findCompany,
  groupByLetter, groupMocks, highlightParts, initialTone, initialsOf, isAlwaysOpen, journeyOf, letterOf,
  lettersPresent, matchedRole, mockState, nextChangeAt, pickRole, resultOf, sectionTypes, sortCompanies,
  spotlightOf, summarize, totalMarksOf,
} from '../src/student/prepMock/prepMockModel.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-11-20T10:00:00Z');
const iso = (offset) => new Date(NOW + offset).toISOString();

const live = (id, extra = {}) => ({ _id: id, title: `Mock ${id}`, status: 'Live', startTime: iso(-HOUR), endTime: iso(5 * HOUR), ...extra });
const upcoming = (id, extra = {}) => ({ _id: id, title: `Mock ${id}`, status: 'Upcoming', startTime: iso(2 * HOUR), endTime: iso(9 * HOUR), ...extra });
const done = (id, extra = {}) => ({ _id: id, title: `Mock ${id}`, status: 'Completed', hasSubmitted: true, submittedAt: iso(-3 * HOUR), startTime: iso(-9 * HOUR), endTime: iso(9 * HOUR), ...extra });
const missed = (id, extra = {}) => ({ _id: id, title: `Mock ${id}`, status: 'Completed', startTime: iso(-9 * HOUR), endTime: iso(-HOUR), ...extra });

test('states: submitted beats window, in progress, upcoming, closed', () => {
  assert.equal(mockState(live('a')), 'live');
  assert.equal(mockState(live('a', { hasSubmissionInProgress: true })), 'in_progress');
  assert.equal(mockState(upcoming('a')), 'upcoming');
  assert.equal(mockState(done('a')), 'completed');
  assert.equal(mockState(live('a', { submittedAt: iso(-1) })), 'completed');
  assert.equal(mockState(missed('a')), 'closed');
});

test('always-open mocks: by mode or by the year-9999 end, never a change time', () => {
  const always = live('x', { availabilityMode: 'always', endTime: '9999-12-31T23:59:59.000Z' });
  assert.equal(isAlwaysOpen(always), true);
  assert.equal(isAlwaysOpen(live('y', { endTime: '9999-12-31T00:00:00.000Z' })), true);
  assert.equal(isAlwaysOpen(live('z', { availabilityMode: 'scheduled' })), false);
  assert.equal(nextChangeAt([always], NOW), null);
  assert.equal(nextChangeAt([always, live('s'), upcoming('u')], NOW), NOW + 2 * HOUR, 'soonest change: upcoming opens');
  assert.equal(nextChangeAt([live('s')], NOW), NOW + 5 * HOUR, 'scheduled live mock closes');
  assert.equal(nextChangeAt([done('d'), missed('m')], NOW), null);
});

test('collectMocks takes every list once', () => {
  const a = live('a');
  const mocks = collectMocks({ ongoingAssessments: [a], upcomingAssessments: [upcoming('b')], completedAssessments: [done('c'), a] });
  assert.deepEqual(mocks.map((mock) => mock._id), ['a', 'b', 'c']);
  assert.deepEqual(collectMocks(null), []);
});

test('groups by company (case-insensitive) then role; empty role is General, empty company is last', () => {
  const companies = groupMocks([
    live('1', { company: 'Google', role: 'SDE 1', companyLogo: null }),
    done('2', { company: 'google ', role: 'sde 1', companyLogo: { url: 'https://logo/g.png', width: 64, height: 64 } }),
    upcoming('3', { company: 'Google', role: '' }),
    upcoming('4', { company: 'Amazon', role: 'SDE Intern' }),
    upcoming('5', { company: 'Amazon', role: 'Data Analyst' }),
    upcoming('6', { company: 'Amazon', role: 'Data Analyst' }),
    live('7', { company: '', role: 'Tester' }),
  ]);
  assert.deepEqual(companies.map((company) => company.name), ['Google', 'Amazon', OTHER_COMPANY], 'open first, then more mocks, no-company last');
  const google = companies[0];
  assert.equal(google.logo.url, 'https://logo/g.png', 'first logo found is used');
  assert.equal(google.path, companyPath('Google'));
  assert.deepEqual(google.roles.map((role) => role.name), ['SDE 1', GENERAL_ROLE], 'General goes last');
  assert.deepEqual(google.roles[0].counts, { total: 2, open: 1, inProgress: 0, upcoming: 0, completed: 1, closed: 0 });
  assert.deepEqual(google.counts, { total: 3, open: 1, inProgress: 0, upcoming: 1, completed: 1, closed: 0 });
  const amazon = companies[1];
  assert.deepEqual(amazon.roles.map((role) => role.name), ['Data Analyst', 'SDE Intern'], 'more mocks first');
  assert.deepEqual(summarize(companies), { companies: 3, roles: 5, mocks: 7, open: 2, upcoming: 4, completed: 1 });
});

test('mocks inside a role: continue, live, upcoming soonest, completed latest, closed; then title', () => {
  const [company] = groupMocks([
    missed('m', { company: 'X' }),
    done('old', { company: 'X', submittedAt: iso(-9 * HOUR) }),
    done('new', { company: 'X', submittedAt: iso(-HOUR) }),
    upcoming('late', { company: 'X', startTime: iso(8 * HOUR) }),
    upcoming('soon', { company: 'X', startTime: iso(HOUR) }),
    live('Mock 10', { company: 'X', title: 'Mock 10' }),
    live('Mock 2', { company: 'X', title: 'Mock 2' }),
    live('cont', { company: 'X', hasSubmissionInProgress: true }),
  ]);
  assert.deepEqual(company.roles[0].mocks.map((mock) => mock._id), ['cont', 'Mock 2', 'Mock 10', 'soon', 'late', 'new', 'old', 'm']);
});

test('search, filters, URL lookup and role pick', () => {
  const companies = groupMocks([
    live('1', { company: 'Tata Consultancy Services', role: 'Systems Engineer' }),
    upcoming('2', { company: 'Infosys', role: 'Data Analyst' }),
    done('3', { company: 'Wipro', role: 'Project Engineer' }),
  ]);
  assert.deepEqual(filterCompanies(companies, { query: 'info' }).map((c) => c.name), ['Infosys']);
  assert.deepEqual(filterCompanies(companies, { query: 'ANALYST' }).map((c) => c.name), ['Infosys'], 'matches role names too');
  assert.deepEqual(filterCompanies(companies, { filter: 'open' }).map((c) => c.name), ['Tata Consultancy Services']);
  assert.deepEqual(filterCompanies(companies, { filter: 'upcoming' }).map((c) => c.name), ['Infosys']);
  assert.deepEqual(filterCompanies(companies, { filter: 'completed' }).map((c) => c.name), ['Wipro']);
  assert.deepEqual(filterCounts(companies), { all: 3, open: 1, upcoming: 1, completed: 1 });
  assert.equal(findCompany(companies, encodeURIComponent('tata consultancy services'))?.name, 'Tata Consultancy Services');
  assert.equal(findCompany(companies, 'Tata Consultancy Services')?.name, 'Tata Consultancy Services');
  assert.equal(findCompany(companies, '%E0%A4%A'), null, 'bad encoding does not throw');
  assert.equal(findCompany(companies, ''), null);
  const tcs = companies[0];
  assert.equal(pickRole(tcs, 'systems engineer').name, 'Systems Engineer');
  assert.equal(pickRole(tcs, 'Nope').name, 'Systems Engineer', 'unknown role falls back to the first');
  assert.equal(pickRole(null, 'x'), null);
});

test('card helpers: section types, marks, initials, stable tone', () => {
  const mock = { sections: [{ type: 'mcq', totalMarks: 20 }, { type: 'coding', totalMarks: 30 }, { type: 'mcq', totalMarks: 10 }], totalMarks: 5 };
  assert.deepEqual(sectionTypes(mock), ['MCQ', 'Coding']);
  assert.deepEqual(sectionTypes({ assessmentType: 'mixed' }), ['Mixed']);
  assert.equal(totalMarksOf(mock), 60);
  assert.equal(totalMarksOf({ sections: [], totalMarks: 40 }), 40);
  assert.equal(initialsOf('Goldman Sachs'), 'GS');
  assert.equal(initialsOf('google'), 'Go');
  assert.equal(initialsOf(''), '?');
  assert.equal(initialTone('Google'), initialTone(' google '));
});

test('directory sorts: open first, most mocks, A–Z with the # group first and no-company last', () => {
  const companies = groupMocks([
    upcoming('1', { company: 'zeta' }), upcoming('2', { company: 'Zeta' }), upcoming('3', { company: 'Zeta' }),
    live('4', { company: 'Mango' }),
    upcoming('5', { company: 'apple' }), upcoming('6', { company: 'Apple' }),
    upcoming('7', { company: '3M' }),
    upcoming('8', { company: '' }), upcoming('9', { company: '' }), upcoming('10', { company: '' }), upcoming('11', { company: '' }),
  ]);
  assert.deepEqual(sortCompanies(companies, 'open').map((c) => c.name), ['Mango', 'zeta', 'apple', '3M', OTHER_COMPANY]);
  assert.deepEqual(sortCompanies(companies, 'mocks').map((c) => c.name), ['zeta', 'apple', '3M', 'Mango', OTHER_COMPANY]);
  const az = sortCompanies(companies, 'az');
  assert.deepEqual(az.map((c) => c.name), ['3M', OTHER_COMPANY, 'apple', 'Mango', 'zeta']);
  assert.deepEqual(az.map(letterOf), ['#', '#', 'A', 'M', 'Z']);
  assert.deepEqual(groupByLetter(az).map((g) => [g.letter, g.companies.length]), [['#', 2], ['A', 1], ['M', 1], ['Z', 1]]);
  assert.deepEqual([...lettersPresent(companies)].sort(), ['#', 'A', 'M', 'Z']);
  assert.notEqual(sortCompanies(companies, 'az'), companies, 'returns a new array');
});

test('search highlight and role hits', () => {
  assert.deepEqual(highlightParts('Goldman Sachs', 'man'), [{ text: 'Gold', match: false }, { text: 'man', match: true }, { text: ' Sachs', match: false }]);
  assert.deepEqual(highlightParts('Banana', 'AN').filter((p) => p.match).length, 2, 'every occurrence, any case');
  assert.deepEqual(highlightParts('Infosys', ''), [{ text: 'Infosys', match: false }]);
  assert.deepEqual(highlightParts('Infosys', 'xyz'), [{ text: 'Infosys', match: false }]);
  const [company] = groupMocks([live('1', { company: 'Infosys', role: 'Data Analyst' })]);
  assert.equal(matchedRole(company, 'analyst'), 'Data Analyst');
  assert.equal(matchedRole(company, 'info'), null, 'company name hit: no role shown');
  assert.equal(matchedRole(company, ''), null);
});

test('spotlight: companies open now, most open first', () => {
  const companies = groupMocks([
    live('1', { company: 'A' }), live('2', { company: 'B' }), live('3', { company: 'B', hasSubmissionInProgress: true }), upcoming('4', { company: 'C' }),
  ]);
  assert.deepEqual(spotlightOf(companies).map((c) => c.name), ['B', 'A']);
  assert.equal(spotlightOf(companies, 1).length, 1);
});

const report = (id, extra = {}) => ({ assessmentId: id, status: 'Completed', score: 30, totalMarks: 50, accuracy: 60, evaluationStatus: 'completed', permissions: { resultReleased: true }, ...extra });

test('results: hidden until announced; percent only when allowed (never derived from the score)', () => {
  assert.equal(resultOf(null), null);
  assert.equal(resultOf(report('a', { permissions: { resultReleased: false } })), null);
  assert.equal(resultOf(report('a', { evaluationStatus: 'processing' })), null);
  assert.deepEqual(resultOf(report('a')), { percent: 60, label: '60%' });
  assert.deepEqual(resultOf(report('a', { accuracy: null, permissions: { resultReleased: true, canViewPercentage: false } })), { percent: null, label: '30 / 50' });
});

test('journey: totals, continue list, recent results, opening soon, best and latest result', () => {
  const companies = groupMocks([
    done('d1', { company: 'A', submittedAt: iso(-5 * HOUR) }),
    done('d2', { company: 'B', submittedAt: iso(-2 * HOUR) }),
    done('d3', { company: 'B', submittedAt: iso(-HOUR) }),
    live('p1', { company: 'C', hasSubmissionInProgress: true }),
    live('l1', { company: 'C' }),
    upcoming('u2', { company: 'D', startTime: iso(5 * HOUR) }),
    upcoming('u1', { company: 'D', startTime: iso(HOUR) }),
    missed('m1', { company: 'E' }),
  ]);
  const reports = new Map([
    ['d1', report('d1', { accuracy: 80 })],
    ['d2', report('d2', { accuracy: 55 })],
    ['d3', report('d3', { permissions: { resultReleased: false } })],
  ]);
  const journey = journeyOf(companies, reports);
  assert.equal(journey.total, 8);
  assert.equal(journey.completed, 3);
  assert.equal(journey.open, 2);
  assert.equal(journey.companies, 5);
  assert.equal(journey.attemptedCompanies, 3, 'A, B (submitted) and C (in progress)');
  assert.deepEqual(journey.inProgress.map((e) => e.mock._id), ['p1']);
  assert.deepEqual(journey.recent.map((e) => e.mock._id), ['d3', 'd2', 'd1']);
  assert.equal(journey.recent[0].result, null, 'unannounced result stays hidden');
  assert.deepEqual(journey.upcoming.map((e) => e.mock._id), ['u1', 'u2']);
  assert.equal(journey.best.mock._id, 'd1');
  assert.equal(journey.last.mock._id, 'd2', 'latest released, not latest submitted');
  const empty = journeyOf([], new Map());
  assert.equal(empty.best, null);
  assert.equal(empty.last, null);
});
