import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSyncAssessmentQuestionToLibrary } from '../src/services/questionLibraryService.js';

test('assessment-only questions are not copied into the question library', () => {
  assert.equal(shouldSyncAssessmentQuestionToLibrary({ saveToLibrary: false }), false);
});

test('questions already linked to a library item are not duplicated', () => {
  assert.equal(shouldSyncAssessmentQuestionToLibrary({
    saveToLibrary: true,
    librarySourceId: 'library-question-1',
  }), false);
});

test('legacy assessment questions continue syncing by default', () => {
  assert.equal(shouldSyncAssessmentQuestionToLibrary({ questionId: 'legacy-question' }), true);
});
