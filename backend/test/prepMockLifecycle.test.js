import test from 'node:test';
import assert from 'node:assert/strict';
import { resetMockDefinition, unpublishMockDefinition } from '../src/services/prepMockLifecycle.js';

test('reset clears mock access and schedule while preserving content and history', () => {
  const submissions = [{ score: 84 }];
  const mock = {
    lifecycleStatus: 'published', isVisible: true, targetType: 'selected',
    assignedStudents: ['student-1'], draftAssignedStudents: ['student-2'],
    candidateSetAssignments: [{ studentId: 'student-1', setNumber: 1 }],
    startTime: new Date('2026-01-01'), endTime: new Date('9999-12-31'),
    availabilityMode: 'always', manuallyCompletedAt: new Date(),
    sections: [{ questions: [{ questionText: 'Example' }] }],
    submissions, version: 2,
  };
  resetMockDefinition(mock, new Date('2026-02-01'));
  assert.equal(mock.lifecycleStatus, 'draft');
  assert.equal(mock.isVisible, false);
  assert.equal(mock.targetType, 'selected');
  assert.deepEqual(mock.assignedStudents, []);
  assert.deepEqual(mock.draftAssignedStudents, []);
  assert.deepEqual(mock.candidateSetAssignments, []);
  assert.equal(mock.startTime, null);
  assert.equal(mock.endTime, null);
  assert.equal(mock.availabilityMode, 'scheduled');
  assert.equal(mock.manuallyCompletedAt, null);
  assert.equal(mock.mockHasHistory, true);
  assert.equal(mock.version, 3);
  assert.equal(mock.sections[0].questions[0].questionText, 'Example');
  assert.equal(mock.submissions, submissions);
});

test('unpublish hides mock while retaining availability and student selections', () => {
  const mock = { lifecycleStatus: 'published', isVisible: true, assignedStudents: ['student-1'], startTime: new Date('2026-01-01'), endTime: new Date('2026-01-02'), availabilityMode: 'scheduled', version: 1 };
  unpublishMockDefinition(mock);
  assert.equal(mock.lifecycleStatus, 'draft');
  assert.equal(mock.isVisible, false);
  assert.equal(mock.mockHasHistory, true);
  assert.deepEqual(mock.assignedStudents, ['student-1']);
  assert.equal(mock.availabilityMode, 'scheduled');
  assert.equal(mock.endTime.toISOString(), '2026-01-02T00:00:00.000Z');
});
