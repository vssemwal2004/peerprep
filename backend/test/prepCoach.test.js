import assert from 'node:assert/strict';
import test from 'node:test';
import { coachTip, todayDifficulties, EASY_RUN, WRONG_RUN } from '../src/services/prepScore/coach.js';
import { matchesPracticeCriteria, parsePracticeStatus, withPracticeStatus } from '../src/platform/questionPractice.js';

const solve = (extra = {}) => ({
  kind: 'solve', alreadySolved: false, credited: true, points: 0.3, limit: 3, fullTopics: [], allFull: false, suggestions: [],
  parts: [{ topic: 'Array', counted: true, used: 1 }], ...extra,
});
const POINTS = { Easy: 4, Medium: 8, Hard: 14 };

test('a re-solve says no new points and links a new question in the same topic', () => {
  const tip = coachTip({ outcome: solve({ alreadySolved: true }) });
  assert.equal(tip.code, 'repeat');
  assert.match(tip.actions[0].href, /topic=Array/);
  assert.match(tip.actions[0].href, /status=unsolved/);
});

test('a question whose topics are all full warns and suggests other topics or an open problem', () => {
  const tip = coachTip({ outcome: solve({ allFull: true, fullTopics: ['Array'], parts: [{ topic: 'Array', counted: false, used: 3 }],
    suggestions: ['Graph', 'Tree'], alternative: { title: 'Number of Islands', url: '/problems/abc' } }) });
  assert.equal(tip.code, 'topic-full');
  assert.equal(tip.tone, 'warn');
  assert.match(tip.title, /Array: daily limit reached \(3\/3\)/);
  assert.match(tip.body, /0 points/);
  assert.deepEqual(tip.actions.map((action) => action.href), ['/problems/abc', '/problems?topic=Graph&status=unsolved']);
});

test('a partly full question says where the points went', () => {
  const tip = coachTip({ outcome: solve({ fullTopics: ['Array'], parts: [{ topic: 'Array', counted: false, used: 3 }, { topic: 'Hash Table', counted: true, used: 1 }] }) });
  assert.equal(tip.code, 'topic-partial');
  assert.match(tip.body, /Hash Table/);
});

test('using the last counted slot warns before the next solve is wasted', () => {
  const tip = coachTip({ outcome: solve({ parts: [{ topic: 'Array', counted: true, used: 3 }], suggestions: ['Graph'] }) });
  assert.equal(tip.code, 'last-slot');
  assert.match(tip.title, /Last Array solve/);
  assert.equal(tip.actions[0].label, 'Graph');
});

test('a run of Easy solves suggests a Medium with the real point ratio', () => {
  const difficulties = Array(EASY_RUN).fill('Easy');
  const tip = coachTip({ outcome: solve(), difficulty: 'Easy', difficulties, solvePoints: POINTS });
  assert.equal(tip.code, 'easy-run');
  assert.equal(tip.once, 'day');
  assert.match(tip.body, /2× an Easy/);
  assert.match(tip.actions[0].href, /difficulty=Medium/);
  // A Medium in between breaks the run.
  assert.equal(coachTip({ outcome: solve(), difficulty: 'Easy', difficulties: ['Easy', 'Medium', 'Easy'], solvePoints: POINTS }), null);
});

test('a run of Medium solves suggests a Hard', () => {
  const tip = coachTip({ outcome: solve(), difficulty: 'Medium', difficulties: ['Medium', 'Medium', 'Medium', 'Medium'], solvePoints: POINTS });
  assert.equal(tip.code, 'medium-run');
  assert.match(tip.body, /1\.8× a Medium/);
});

test('an open daily challenge is the lowest-priority tip', () => {
  const tip = coachTip({ outcome: solve(), challenge: { open: true, scores: true, coins: 2 } });
  assert.equal(tip.code, 'challenge');
  assert.match(tip.body, /extra Prep Score and \+2 Prep Coins/);
  // A more urgent tip wins.
  assert.equal(coachTip({ outcome: solve({ alreadySolved: true }), challenge: { open: true } }).code, 'repeat');
});

test('wrong answers: a hint after a few, a calm note once the day cap is reached, nothing on solved problems', () => {
  assert.equal(coachTip({ outcome: { kind: 'wrong', lost: 0.1 }, wrongCount: WRONG_RUN - 1 }), null);
  assert.equal(coachTip({ outcome: { kind: 'wrong', lost: 0.1 }, wrongCount: WRONG_RUN }).code, 'wrong-run');
  assert.equal(coachTip({ outcome: { kind: 'wrong', lost: 0, capped: true }, wrongCount: 12 }).code, 'wrong-capped');
  assert.equal(coachTip({ outcome: { kind: 'wrong', alreadySolved: true, lost: 0 }, wrongCount: 9 }), null);
});

test('nothing to say: no tip', () => {
  assert.equal(coachTip({ outcome: solve(), difficulty: 'Hard', difficulties: ['Hard'], solvePoints: POINTS }), null);
  assert.equal(coachTip({}), null);
});

test('todayDifficulties lists only today\'s counted first solves, oldest first', () => {
  const ledger = { events: [
    { kind: 'solve', day: '2026-11-26', at: 3, raw: 4, meta: { difficulty: 'Easy' } },
    { kind: 'solve', day: '2026-11-26', at: 1, raw: 8, meta: { difficulty: 'Medium' } },
    { kind: 'solve', day: '2026-11-26', at: 2, raw: 0, meta: { difficulty: 'Hard' } },
    { kind: 'solve', day: '2026-11-25', at: 0, raw: 4, meta: { difficulty: 'Easy' } },
    { kind: 'login', day: '2026-11-26', at: 0, raw: 1 },
  ] };
  assert.deepEqual(todayDifficulties(ledger, '2026-11-26'), ['Medium', 'Easy']);
});

test('the practice list status filter: solved, attempted (tried, not solved) and not solved yet', () => {
  const base = { type: '', difficulty: '', tags: [], companies: [], ids: null, search: { serial: null, tagTerms: [], text: '' } };
  const keys = { solved: new Set(['p1', 'q2']), tried: new Set(['p1', 'q2', 'p3']) };
  const local = (id, problem) => ({ _id: id, sourceProblemId: problem, questionType: 'coding', tags: [] });
  const questions = [local('q1', 'p1'), { _id: 'q2', tags: [] }, local('q3', 'p3'), local('q4', 'p4')];
  const pick = (status) => questions.filter((question) => matchesPracticeCriteria(question, [], withPracticeStatus(base, status, keys))).map((question) => question._id);
  assert.deepEqual(pick('solved'), ['q1', 'q2']);
  assert.deepEqual(pick('attempted'), ['q3']);
  assert.deepEqual(pick('unsolved'), ['q3', 'q4']);
  assert.equal(parsePracticeStatus('SOLVED'), 'solved');
  assert.equal(parsePracticeStatus('everything'), '');
});
