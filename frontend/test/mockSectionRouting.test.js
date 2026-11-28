import test from 'node:test';
import assert from 'node:assert/strict';
import { mockQuestionSectionIndex, mockSectionNameExists } from '../src/admin/prepMock/mockSectionRouting.js';

test('automatic PrepMock questions use the standard section even when a custom section comes first', () => {
  const sections = [
    { sectionName: 'Algorithms', type: 'coding', questions: [] },
    { sectionName: 'Coding Questions', type: 'coding', questions: [] },
    { sectionName: 'Reasoning', type: 'mcq', questions: [] },
  ];
  assert.equal(mockQuestionSectionIndex(sections, 'coding'), 1);
  assert.equal(mockQuestionSectionIndex(sections, 'mcq'), -1);
});

test('selected PrepMock section accepts its own type and never mixes question types', () => {
  const sections = [
    { sectionName: 'Algorithms', type: 'coding', questions: [] },
    { sectionName: 'Reasoning', type: 'mcq', questions: [] },
  ];
  assert.equal(mockQuestionSectionIndex(sections, 'coding', 0), 0);
  assert.equal(mockQuestionSectionIndex(sections, 'mcq', 0), -1);
  assert.equal(mockQuestionSectionIndex(sections, 'mcq', 1), 1);
  assert.equal(mockSectionNameExists(sections, '  REASONING '), true);
  assert.equal(mockSectionNameExists(sections, 'English'), false);
});
