import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canonicalTags, canonicalTopic, countsFromEvidence, defaultPolicy, displayScore, marginalGain, policyTotals,
  primaryTopic, scoreReadiness, scoreTrack, validatePolicy,
} from '../src/services/prepReadiness/engine.js';
import { SEED_TOPICS, SEED_TOTALS } from '../src/services/prepReadiness/seed.js';

const policy = defaultPolicy();
const close = (actual, expected, places = 6) => assert.ok(Math.abs(actual - expected) < 0.5 * 10 ** -places, `${actual} ≉ ${expected}`);
const counts = (rows) => new Map(Object.entries(rows).map(([topic, [Easy, Medium, Hard]]) => [topic, { Easy, Medium, Hard }]));
const contribution = (track, topic, [e, m, h]) => scoreTrack(policy, track, counts({ [topic]: [e, m, h] })).topics.find((row) => row.key === topic).contribution;

test('seed: 70 topics, unique keys, the four published sums', () => {
  assert.equal(SEED_TOPICS.length, 70);
  assert.equal(new Set(SEED_TOPICS.map((topic) => topic.key)).size, 70);
  const totals = policyTotals(policy);
  assert.equal(totals.pbc.weight, SEED_TOTALS.pbc.weight);
  assert.equal(totals.sbc.weight, SEED_TOTALS.sbc.weight);
  assert.equal(totals.pbc.target, SEED_TOTALS.pbc.target);
  assert.equal(totals.sbc.target, SEED_TOTALS.sbc.target);
  assert.deepEqual([totals.pbc.weight, totals.sbc.weight, totals.pbc.target, totals.sbc.target], [215, 128, 932, 539]);
  const memo = SEED_TOPICS.find((topic) => topic.key === 'memoization');
  assert.deepEqual([memo.sbc.weight, memo.sbc.target], [1, 5]);
  assert.equal(policy.tracks.sbc.multipliers.Hard, 2.5);
  assert.ok(validatePolicy(policy).ok);
});

test('priority starts from the weight, bounded 1–5; excluded rows have none', () => {
  const dp = SEED_TOPICS.find((topic) => topic.key === 'dynamic-programming');
  assert.deepEqual([dp.pbc.priority, dp.sbc.priority], [5, 2]);
  const segment = SEED_TOPICS.find((topic) => topic.key === 'segment-tree');
  assert.deepEqual([segment.pbc.priority, segment.sbc.priority], [2, 0]);
});

test('dry runs: single-topic contributions', () => {
  close(contribution('pbc', 'dynamic-programming', [0, 4, 0]), 0.465116, 6);
  close(contribution('sbc', 'dynamic-programming', [0, 4, 0]), 1.5625, 6);
  close(contribution('pbc', 'dynamic-programming', [0, 0, 4]), 0.930233, 6);
  close(contribution('sbc', 'dynamic-programming', [0, 0, 4]), 1.5625, 6);
  close(contribution('pbc', 'dynamic-programming', [2, 8, 4]), 1.918605, 6);
  close(contribution('sbc', 'dynamic-programming', [2, 8, 4]), 1.5625, 6);
  close(contribution('pbc', 'segment-tree', [0, 0, 4]), 0.930233, 6);
  const sbcSegment = scoreTrack(policy, 'sbc', counts({ 'segment-tree': [0, 0, 4] }));
  assert.equal(sbcSegment.topics.find((row) => row.key === 'segment-tree').excluded, true);
  assert.equal(sbcSegment.score, 0);
  close(contribution('pbc', 'memoization', [1, 0, 0]), 0.058140, 6);
  const memo = scoreTrack(policy, 'sbc', counts({ memoization: [1, 0, 0] })).topics.find((row) => row.key === 'memoization');
  close(memo.contribution, 0.234375, 6);
  close(memo.progress, 0.3, 9);
  // Rounded as the brief shows them.
  assert.deepEqual(['dynamic-programming'].map(() => contribution('pbc', 'dynamic-programming', [0, 4, 0]).toFixed(2)), ['0.47']);
  assert.equal(contribution('pbc', 'dynamic-programming', [0, 0, 4]).toFixed(2), '0.93');
  assert.equal(contribution('pbc', 'dynamic-programming', [2, 8, 4]).toFixed(2), '1.92');
  assert.equal(contribution('pbc', 'memoization', [1, 0, 0]).toFixed(2), '0.06');
  assert.equal(memo.contribution.toFixed(2), '0.23');
});

test('topic progress is capped: 12 Hard and 50 Hard DP contribute the same', () => {
  for (const track of ['pbc', 'sbc']) assert.equal(contribution(track, 'dynamic-programming', [0, 0, 12]), contribution(track, 'dynamic-programming', [0, 0, 50]));
  close(contribution('pbc', 'dynamic-programming', [0, 0, 12]), 100 * 5 / 215, 9);
});

test('multi-tag fixture (77 solves) and one extra Medium counted once under its primary', () => {
  const base = { 'dynamic-programming': [2, 8, 1], graph: [2, 6, 3], array: [20, 30, 5] };
  assert.equal(Object.values(base).flat().reduce((a, b) => a + b, 0), 77);
  const initial = scoreReadiness(policy, counts(base));
  close(initial.pbc.score, 5.484496, 6);
  close(initial.sbc.score, 7.03125, 6);
  const add = (topic) => { const next = structuredClone(base); next[topic][1] += 1; return scoreReadiness(policy, counts(next)); };
  close(add('dynamic-programming').pbc.score, 5.600775, 6);
  close(add('graph').pbc.score, 5.639535, 6);
  close(add('array').pbc.score, 5.484496, 6);
  for (const topic of ['dynamic-programming', 'graph', 'array']) close(add(topic).sbc.score, 7.03125, 6);
  // Marginal gain agrees with the difference, and a fresh topic beats a capped one.
  close(marginalGain(policy, 'pbc', counts(base), 'graph', 'Medium'), 5.639535 - 5.484496, 5);
  assert.equal(marginalGain(policy, 'pbc', counts(base), 'array', 'Medium'), 0);
  assert.equal(marginalGain(policy, 'sbc', counts(base), 'dynamic-programming', 'Medium'), 0);
  assert.ok(marginalGain(policy, 'sbc', counts(base), 'string', 'Medium') > 0);
});

test('breadth fixture', () => {
  const deep = scoreReadiness(policy, counts({ 'dynamic-programming': [0, 30, 0] }));
  close(deep.pbc.score, 2.325581, 6);
  close(deep.sbc.score, 1.5625, 6);
  const wide = scoreReadiness(policy, counts(Object.fromEntries(['array', 'string', 'hash-table', 'binary-search', 'dynamic-programming', 'graph'].map((key) => [key, [0, 5, 0]]))));
  close(wide.pbc.score, 4.922481, 6);
  close(wide.sbc.score, 11.425781, 6);
});

test('cutoffs use unrounded values; display never shows the cutoff for a value below it', () => {
  assert.equal(75 >= policy.tracks.pbc.cutoff, true);
  assert.equal(displayScore(74.9612, 75), '<75');
  assert.equal(displayScore(69.987, 70), '<70');
  assert.equal(displayScore(75, 75), '75.0');
  assert.equal(displayScore(70, 70), '70.0');
  assert.equal(displayScore(74.94, 75), '74.9');
  assert.equal(displayScore(NaN, 75), '—');
  // A full policy at exactly the cutoff passes: build counts that reach exactly 75 / 70 is
  // covered by `met` being a plain >= comparison.
  const all = scoreReadiness(policy, new Map(policy.topics.map((topic) => [topic.key, { Easy: 0, Medium: 0, Hard: 100 }])));
  close(all.pbc.score, 100, 9);
  close(all.sbc.score, 100, 9);
  assert.equal(all.pbc.met && all.sbc.met, true);
});

test('no evidence scores 0 with evidence count 0; zero-weight rows leave the denominator', () => {
  const empty = scoreReadiness(policy, new Map());
  assert.equal(empty.pbc.score, 0);
  assert.equal(empty.pbc.evidence, 0);
  assert.equal(empty.sbc.totalWeight, 128);
  const excluded = empty.sbc.topics.filter((topic) => topic.excluded).map((topic) => topic.key);
  assert.ok(excluded.includes('union-find') && excluded.includes('segment-tree'));
  assert.equal(excluded.length, 70 - policyTotals(policy).sbc.active);
});

test('validation: invalid targets, duplicates, priority range and empty tracks', () => {
  const broken = defaultPolicy();
  broken.topics[0].pbc.target = 0;
  broken.topics[1].sbc.priority = 9;
  broken.topics[2].pbc.weight = Number.NaN;
  broken.topics.push({ ...broken.topics[3] });
  const result = validatePolicy(broken);
  assert.equal(result.ok, false);
  const messages = result.errors.map((error) => `${error.topic}:${error.track || ''}:${error.field}`);
  assert.ok(messages.includes('array:pbc:target'));
  assert.ok(messages.includes('string:sbc:priority'));
  assert.ok(messages.includes('hash-table:pbc:weight'));
  assert.ok(messages.includes('sorting::key'));
  const none = defaultPolicy();
  for (const topic of none.topics) topic.sbc.weight = 0;
  assert.ok(validatePolicy(none).errors.some((error) => error.track === 'sbc' && error.field === 'weight'));
});

test('changing priority alone leaves the numbers unchanged', () => {
  const changed = defaultPolicy();
  for (const topic of changed.topics) if (topic.pbc.weight > 0) topic.pbc.priority = 1;
  const evidence = counts({ 'dynamic-programming': [2, 8, 4], array: [3, 2, 0] });
  assert.equal(scoreTrack(changed, 'pbc', evidence).score, scoreTrack(policy, 'pbc', evidence).score);
});

test('aliases normalise; distinct topics stay distinct', () => {
  assert.equal(canonicalTopic('string'), 'string');
  assert.equal(canonicalTopic('Sort'), 'sorting');
  assert.equal(canonicalTopic('Union Find'), 'union-find');
  assert.equal(canonicalTopic('union-find'), 'union-find');
  for (const name of ['Graph', 'Graphs', 'Graph Theory']) assert.equal(canonicalTopic(name), 'graph');
  assert.equal(canonicalTopic('DP'), 'dynamic-programming');
  assert.equal(canonicalTopic('BFS'), 'breadth-first-search');
  assert.equal(canonicalTopic('dfs'), 'depth-first-search');
  assert.equal(canonicalTopic('BST'), 'binary-search-tree');
  assert.equal(canonicalTopic('Heap'), 'heap');
  assert.equal(canonicalTopic('Heap (Priority Queue)'), 'heap');
  assert.equal(canonicalTopic('Priority Queue'), 'heap');
  const distinct = ['Tree', 'Binary Tree', 'Binary Search Tree', 'Graph', 'Breadth-First Search', 'Depth-First Search', 'Dynamic Programming', 'Memoization'].map((name) => canonicalTopic(name));
  assert.equal(new Set(distinct).size, distinct.length);
  assert.equal(canonicalTopic('Concurrency'), null);
  assert.deepEqual(canonicalTags(['Array', 'array', 'ARRAY', 'Shell', 'Hash Table']), { keys: ['array', 'hash-table'], unmapped: ['Shell'] });
});

test('primary topic: publisher first, else the most specific recognised tag, stable across order', () => {
  assert.equal(primaryTopic({ primary: 'Graph', tags: ['Array', 'Graph', 'DP'] }).topic, 'graph');
  assert.equal(primaryTopic({ primary: 'graph', tags: [] }).source, 'publisher');
  assert.equal(primaryTopic({ tags: ['Array', 'Dynamic Programming'] }).topic, 'dynamic-programming');
  assert.equal(primaryTopic({ tags: ['Dynamic Programming', 'Array'] }).topic, 'dynamic-programming');
  assert.equal(primaryTopic({ tags: ['Array', 'Sliding Window', 'Hash Table'] }).topic, 'sliding-window');
  assert.equal(primaryTopic({ tags: ['Hash Table', 'Array'] }).topic, 'array');
  assert.equal(primaryTopic({ tags: ['Math', 'Dynamic Programming', 'Memoization'] }).topic, 'dynamic-programming');
  assert.equal(primaryTopic({ tags: ['Shell'] }).topic, null);
  assert.deepEqual(primaryTopic({ tags: ['Shell'] }).unmapped, ['Shell']);
});

test('evidence rows become counts; unknown difficulty or topic is ignored', () => {
  const result = countsFromEvidence([{ topic: 'array', difficulty: 'easy' }, { topic: 'array', difficulty: 'MEDIUM' }, { topic: 'array', difficulty: '?' }, { topic: null, difficulty: 'Hard' }]);
  assert.deepEqual(result.get('array'), { Easy: 1, Medium: 1, Hard: 0 });
  assert.equal(result.size, 1);
});
