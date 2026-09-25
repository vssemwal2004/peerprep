import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidateAllocationPreview } from '../src/admin/assessment/setAllocation.js';

test('200 students are divided evenly across four sets in serial order', () => {
  const students = Array.from({ length: 200 }, (_, index) => ({
    studentid: String(index + 1),
    name: `Student ${index + 1}`,
    assessmentSet: index < 129 ? 1 : 2,
    assessmentSetSource: 'automatic',
  }));
  const result = buildCandidateAllocationPreview(students, {
    automaticSetAssignment: true,
    setAllocationSortBy: 'student_id',
    setAllocationSortDirection: 'asc',
    setStartingNumber: 1,
  }, 4);
  assert.deepEqual(result.slice(0, 8).map((student) => student.assessmentSet), [1, 2, 3, 4, 1, 2, 3, 4]);
  assert.deepEqual([1, 2, 3, 4].map((set) => result.filter((student) => student.assessmentSet === set).length), [50, 50, 50, 50]);
  assert.ok(result.every((student) => student.assessmentSetSource === 'automatic'));
});

test('manual and CSV set overrides remain fixed while automatic rows follow the formula', () => {
  const result = buildCandidateAllocationPreview([
    { studentid: '1', assessmentSet: 4, assessmentSetSource: 'manual' },
    { studentid: '2', assessmentSet: 3, assessmentSetSource: 'csv' },
    { studentid: '3', assessmentSet: 1, assessmentSetSource: 'automatic' },
    { studentid: '4' },
  ], { automaticSetAssignment: true, setStartingNumber: 1 }, 4);
  assert.deepEqual(result.map((student) => student.assessmentSet), [4, 3, 3, 4]);
  assert.deepEqual(result.map((student) => student.assessmentSetSource), ['manual', 'csv', 'automatic', 'automatic']);
});
