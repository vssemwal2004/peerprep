import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tableComparator, validatePrepAnalysisQuery } from '../src/modules/prepAnalysis/prepAnalysis.service.js';

const row = (name, { prepScore = 0, semester, branch, status = '', languages = [], assessment = null, interview = null } = {}) => ({
  id: name, name, student: { semester, branch },
  coding: { prepScore, solved: { total: 0 }, accuracy: 0, review: { flagged: 0 }, practiceStatus: status, languages },
  assessment, interview, scores: { total: prepScore, features: {} },
});
const ROWS = [
  row('Chen', { prepScore: 30, semester: 10, branch: 'CSE', status: 'stopped', languages: ['python'], assessment: { taken: 0, passed: 0, missed: 1 } }),
  row('Asha', { prepScore: 50, semester: 2, branch: 'ME', status: 'active', languages: ['cpp', 'java'], assessment: { taken: 1, passed: 1, missed: 0 } }),
  row('Bilal', { prepScore: 10, semester: 2, branch: 'CSE', status: 'never', assessment: { taken: 1, passed: 0, missed: 0 } }),
];
const order = (sort, direction, area = 'coding') => [...ROWS].sort(tableComparator(sort, direction, area)).map((entry) => entry.name);

test('student table: "#" ascending is place 1 first, and every column sorts both ways', () => {
  assert.deepEqual(order('position', 'asc'), ['Asha', 'Chen', 'Bilal']);
  assert.deepEqual(order('position', 'desc'), ['Bilal', 'Chen', 'Asha']);
  assert.deepEqual(order('prepScore', 'desc'), ['Asha', 'Chen', 'Bilal'], 'numeric sorts are unchanged');
  assert.deepEqual(order('className', 'asc'), ['Bilal', 'Asha', 'Chen'], 'class = semester (numeric) then branch');
  assert.deepEqual(order('practiceStatus', 'asc'), ['Asha', 'Bilal', 'Chen'], 'text columns sort alphabetically');
  assert.deepEqual(order('languages', 'desc'), ['Chen', 'Asha', 'Bilal']);
  assert.deepEqual(order('testResult', 'desc', 'assessment'), ['Asha', 'Bilal', 'Chen'], 'passed, failed, missed');
  assert.deepEqual(order('name', 'asc'), ['Asha', 'Bilal', 'Chen']);
  assert.deepEqual(order('mockAndAi', 'desc', 'interview'), ['Asha', 'Bilal', 'Chen'], 'no interview data: ties keep name order');
});

test('student table: unknown or inherited sort keys fall back to the area default', () => {
  const sortOf = (sort) => validatePrepAnalysisQuery({ module: 'coding', table: { sort } }, undefined).table.sort;
  assert.equal(sortOf('className'), 'className');
  assert.equal(sortOf('name'), 'name');
  assert.equal(sortOf('constructor'), 'prepScore');
  assert.equal(sortOf('__proto__'), 'prepScore');
  assert.equal(sortOf('nonsense'), 'prepScore');
});
