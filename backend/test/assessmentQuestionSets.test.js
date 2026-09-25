import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCandidateSetAssignments,
  appendCandidateSetAssignments,
  compareCandidatesForSetAllocation,
  buildDeliverySections,
  normalizeAssessmentSettings,
  sanitizeStudentAssessmentForResponse,
} from '../src/controllers/assessmentController.js';
import Assessment from '../src/models/Assessment.js';

test('settings normalization preserves toggles from a mongoose assessment subdocument', () => {
  const assessment = new Assessment({
    createdBy: '507f1f77bcf86cd799439011',
    settings: {
      enableFullscreen: true,
      tabSwitchDetection: true,
      disableCopyPaste: true,
      locationTracking: false,
      showResultsAfterSubmit: true,
      aiProctoring: { enabled: true, detectMobile: false },
    },
  });
  const normalized = normalizeAssessmentSettings(assessment.settings);
  assert.equal(normalized.enableFullscreen, true);
  assert.equal(normalized.tabSwitchDetection, true);
  assert.equal(normalized.disableCopyPaste, true);
  assert.equal(normalized.locationTracking, false);
  assert.equal(normalized.showResultsAfterSubmit, true);
  assert.equal(normalized.aiProctoring.enabled, true);
  assert.equal(normalized.aiProctoring.detectMobile, false);
});

test('candidate sets follow natural roll-number order and preserve overrides', () => {
  const users = [
    { _id: 'u10', studentId: 'ROLL-10' },
    { _id: 'u2', studentId: 'ROLL-2' },
    { _id: 'u1', studentId: 'ROLL-1' },
    { _id: 'u3', studentId: 'ROLL-3' },
  ];
  const assignments = buildCandidateSetAssignments({
    users,
    inputRows: [{ _id: 'u3', studentid: 'ROLL-3', assessmentSet: 4, assessmentSetSource: 'manual' }],
    settings: { questionSetEnabled: true, questionSetCount: 4, automaticSetAssignment: true, setStartingNumber: 1 },
  });

  assert.deepEqual(assignments.map((entry) => [entry.studentIdSnapshot, entry.setNumber, entry.source]), [
    ['ROLL-1', 1, 'automatic'],
    ['ROLL-2', 2, 'automatic'],
    ['ROLL-3', 4, 'manual'],
    ['ROLL-10', 4, 'automatic'],
  ]);
});

test('automatic candidate values are recalculated when the set formula changes', () => {
  const users = Array.from({ length: 8 }, (_, index) => ({
    _id: `u${index + 1}`,
    studentId: String(index + 1),
  }));
  const inputRows = users.map((student) => ({
    _id: student._id,
    studentid: student.studentId,
    assessmentSet: student.studentId <= 4 ? 1 : 2,
    assessmentSetSource: 'automatic',
  }));
  const assignments = buildCandidateSetAssignments({
    users,
    inputRows,
    settings: { questionSetEnabled: true, questionSetCount: 4, automaticSetAssignment: true, setStartingNumber: 1 },
  });
  assert.deepEqual(assignments.map((entry) => entry.setNumber), [1, 2, 3, 4, 1, 2, 3, 4]);
  assert.ok(assignments.every((entry) => entry.source === 'automatic'));
});

test('manual assignment mode leaves unassigned candidates for publish validation', () => {
  const assignments = buildCandidateSetAssignments({
    users: [{ _id: 'u1', studentId: '1' }, { _id: 'u2', studentId: '2' }],
    inputRows: [{ _id: 'u1', studentid: '1', assessmentSet: 2 }],
    settings: { questionSetEnabled: true, questionSetCount: 2, automaticSetAssignment: false },
  });
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].setNumber, 2);
});

test('set allocation supports name sorting and descending direction', () => {
  const users = [
    { _id: 'u1', name: 'Asha', studentId: '20' },
    { _id: 'u2', name: 'Zoya', studentId: '10' },
  ];
  const ordered = [...users].sort((left, right) => compareCandidatesForSetAllocation(left, right, {
    setAllocationSortBy: 'name',
    setAllocationSortDirection: 'desc',
  }));
  assert.deepEqual(ordered.map((student) => student.name), ['Zoya', 'Asha']);
});

test('new students receive the next modulo set without changing frozen assignments', () => {
  const existingAssignments = [{ student: 'u1', studentIdSnapshot: '1', setNumber: 1, source: 'automatic' }];
  const result = appendCandidateSetAssignments({
    existingAssignments,
    newUsers: [{ _id: 'u2', studentId: '2' }, { _id: 'u3', studentId: '3' }],
    settings: { questionSetEnabled: true, questionSetCount: 4, setStartingNumber: 1 },
  });
  assert.equal(result[0], existingAssignments[0]);
  assert.deepEqual(result.slice(1).map((entry) => entry.setNumber), [2, 3]);
});

test('delivery uses the candidate assigned set and returns its frozen set number', () => {
  const delivery = buildDeliverySections({
    _id: 'assessment-1',
    settings: { questionSetEnabled: true },
    candidateSetAssignments: [{ student: 'student-1', setNumber: 2 }],
    questionSets: [
      { setNumber: 1, sections: [{ sectionName: 'Set 1', type: 'mcq', questions: [{ questionId: 'a', type: 'mcq' }] }] },
      { setNumber: 2, sections: [{ sectionName: 'Set 2', type: 'mcq', questions: [{ questionId: 'b', type: 'mcq' }] }] },
    ],
  }, 'student-1');

  assert.equal(delivery.assignedSetNumber, 2);
  assert.equal(delivery.sections[0].sectionName, 'Set 2');
  assert.equal(delivery.sections[0].questions[0].questionId, 'b');
});

test('common-set delivery shuffles questions deterministically on the server', () => {
  const assessment = {
    _id: 'common-assessment',
    settings: { randomShuffle: true },
    sections: [{
      sectionName: 'Common',
      type: 'mcq',
      questions: Array.from({ length: 8 }, (_, index) => ({ questionId: `q${index + 1}`, type: 'mcq' })),
    }],
  };

  const first = buildDeliverySections(assessment, 'student-1');
  const resumed = buildDeliverySections(assessment, 'student-1');
  const anotherStudent = buildDeliverySections(assessment, 'student-2');
  const ids = (delivery) => delivery.sections[0].questions.map((question) => question.questionId);

  assert.deepEqual(ids(first), ids(resumed));
  assert.notDeepEqual(ids(first), ids(anotherStudent));
  assert.deepEqual([...ids(first)].sort(), assessment.sections[0].questions.map((question) => question.questionId).sort());
});

test('multi-set delivery shuffles only the assigned set and keeps it fixed for the candidate', () => {
  const makeQuestions = (prefix) => Array.from({ length: 8 }, (_, index) => ({
    questionId: `${prefix}${index + 1}`,
    type: 'mcq',
  }));
  const assessment = {
    _id: 'multi-set-shuffle',
    settings: { questionSetEnabled: true, randomShuffle: true },
    candidateSetAssignments: [{ student: 'student-2', setNumber: 2 }],
    questionSets: [
      { setNumber: 1, sections: [{ sectionName: 'Set 1', type: 'mcq', questions: makeQuestions('a') }] },
      { setNumber: 2, sections: [{ sectionName: 'Set 2', type: 'mcq', questions: makeQuestions('b') }] },
    ],
  };
  const first = buildDeliverySections(assessment, 'student-2');
  const resumed = buildDeliverySections(assessment, 'student-2');
  const ids = first.sections[0].questions.map((question) => question.questionId);
  assert.equal(first.assignedSetNumber, 2);
  assert.ok(ids.every((id) => id.startsWith('b')));
  assert.deepEqual(first.sections, resumed.sections);
});

test('server-side MCQ option shuffle keeps images and correct answers aligned', () => {
  const assessment = {
    _id: 'option-assessment',
    settings: { shuffleOptions: true },
    sections: [{
      sectionName: 'MCQ',
      type: 'mcq',
      questions: [{
        questionId: 'single',
        type: 'mcq',
        options: ['A', 'B', 'C', 'D'],
        optionImages: ['img-a', 'img-b', 'img-c', 'img-d'],
        correctOptionIndex: 2,
      }, {
        questionId: 'multiple',
        type: 'mcq',
        options: ['One', 'Two', 'Three', 'Four'],
        correctOptionIndexes: [0, 3],
        allowMultipleAnswers: true,
      }],
    }],
  };

  const delivery = buildDeliverySections(assessment, 'student-1');
  const [single, multiple] = delivery.sections[0].questions;

  assert.equal(single.options[single.correctOptionIndex], 'C');
  single.options.forEach((option, index) => {
    assert.equal(single.optionImages[index], `img-${option.toLowerCase()}`);
  });
  assert.deepEqual(multiple.correctOptionIndexes.map((index) => multiple.options[index]).sort(), ['Four', 'One']);
});

test('question-level option shuffle works when global option shuffle is disabled', () => {
  const assessment = {
    _id: 'per-question-option-shuffle',
    settings: { shuffleOptions: false },
    sections: [{
      sectionName: 'MCQ',
      type: 'mcq',
      questions: [{
        questionId: 'local-shuffle',
        type: 'mcq',
        shuffleOptions: true,
        options: ['North', 'South', 'East', 'West'],
        correctOptionIndex: 1,
      }],
    }],
  };
  const question = buildDeliverySections(assessment, 'student-1').sections[0].questions[0];
  assert.equal(question.options[question.correctOptionIndex], 'South');
});

test('student assessment response removes answer keys and hidden coding cases', () => {
  const response = sanitizeStudentAssessmentForResponse({
    _id: 'assessment-1',
    passwordHash: 'secret',
    sections: [{
      type: 'mcq',
      questions: [{
        type: 'mcq',
        correctOptionIndex: 1,
        correctOptionIndexes: [1],
        expectedAnswer: 'answer',
        keywords: ['answer'],
        answerExplanation: 'because',
        coding: { testCases: [{ input: 'public', hidden: false }, { input: 'private', hidden: true }] },
      }],
    }],
  });
  const question = response.sections[0].questions[0];

  assert.equal(response.passwordHash, undefined);
  assert.equal(question.correctOptionIndex, undefined);
  assert.equal(question.correctOptionIndexes, undefined);
  assert.equal(question.expectedAnswer, undefined);
  assert.equal(question.keywords, undefined);
  assert.equal(question.answerExplanation, undefined);
  assert.deepEqual(question.coding.testCases, [{ input: 'public', hidden: false }]);
});
