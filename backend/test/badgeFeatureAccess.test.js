import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { badgeCategoryAllowed } from '../src/services/adaptiveEngagementRules.js';
import { effectiveStudentAccess, studentDomains } from '../src/services/studentEffectiveAccess.js';
import { allowedLifetimeTracks, evaluateLifetimeBadges, lifetimeBadgeBoard, LIFETIME_TRACKS } from '../src/services/lifetimeBadges.js';
import { evaluateMonthlyBadges } from '../src/services/monthlyBadges.js';

// No badge, locked badge or target for a feature the student cannot use (2026-11-23).
const student = (features) => ({
  _id: new mongoose.Types.ObjectId(), role: 'student', accessScope: 'full',
  featureAccess: features ? { mode: 'custom', features } : { mode: 'all' },
});

test('engagement domains follow the student\'s own feature access, not only the university licence', () => {
  const all = ['coding', 'learning', 'assessments', 'interviews', 'events'];
  assert.deepEqual(studentDomains(student(null), all), all, 'All access keeps every licensed domain');
  assert.deepEqual(studentDomains(student(['prep_coding', 'assessments']), all), ['coding', 'assessments']);
  assert.deepEqual(studentDomains(student(['ai_interviews']), all), ['interviews'], 'AI interviews and peer interviews are separate features');
  assert.deepEqual(studentDomains(student(['prep_coding']), ['learning']), [], 'a student feature never adds a domain the university turned off');
});

test('badge categories: Quick Prep needs coding and Quick Prep; daily-challenge badges need some feature', () => {
  assert.equal(badgeCategoryAllowed('coding', ['coding']), true);
  assert.equal(badgeCategoryAllowed('learning', ['coding']), false);
  assert.equal(badgeCategoryAllowed('quests', ['coding']), true);
  assert.equal(badgeCategoryAllowed('quests', ['coding'], { quickprep: false }), false, 'no Quick Prep access → no Quick Prep badges');
  assert.equal(badgeCategoryAllowed('quests', ['learning']), false);
  assert.equal(badgeCategoryAllowed('momentum', ['learning']), true);
  assert.equal(badgeCategoryAllowed('momentum', []), false, 'no feature at all → no daily-challenge badges');
});

test('effective access = university licence AND the student\'s features', async () => {
  const access = await effectiveStudentAccess(student(['prep_coding', 'learning']));
  assert.equal(access.coding, true);
  assert.equal(access.learning, true);
  assert.equal(access.quickprep, false, 'Quick Prep is its own feature');
  assert.equal(access.assessments, false);
  assert.equal(access.aiInterviews, false);
  assert.equal(access.peerInterviews, false);
  assert.equal((await effectiveStudentAccess({ ...student(null), accessScope: 'assessment_only' })).coding, false, 'assessment-only students have no coding');
});

test('lifetime tracks: coding tracks need Prep Coding, the sheets track needs Quick Prep', () => {
  assert.deepEqual([...allowedLifetimeTracks({ coding: true, quickprep: false })], LIFETIME_TRACKS.filter((track) => track.key !== 'sheets').map((track) => track.key));
  assert.deepEqual([...allowedLifetimeTracks({ coding: true, quickprep: true })].length, LIFETIME_TRACKS.length);
  assert.deepEqual([...allowedLifetimeTracks({ coding: false, quickprep: false })], []);
});

test('without Prep Coding: no lifetime board, no lifetime awards, no monthly badges or targets', async () => {
  const noCoding = student(['assessments', 'resume']);
  assert.deepEqual(await lifetimeBadgeBoard(noCoding), []);
  assert.deepEqual(await evaluateLifetimeBadges(noCoding), []);
  const monthly = await evaluateMonthlyBadges(noCoding, new Date('2026-11-23T10:00:00Z'));
  assert.equal(monthly.available, false);
  assert.deepEqual(monthly.tracks, []);
  assert.deepEqual(monthly.newLevels, []);
});
