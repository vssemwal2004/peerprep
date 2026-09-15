import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LANGUAGES } from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import {
  KEY_TO_LANGUAGE_ID,
  LANGUAGE_ID_TO_KEY,
  resolveLanguageRequest,
} from '../src/services/executionService.js';

test('R is supported consistently by the compiler and Judge0 mapping', () => {
  assert.equal(SUPPORTED_LANGUAGES.includes('r'), true);
  assert.equal(Submission.schema.path('language').enumValues.includes('r'), true);
  assert.equal(KEY_TO_LANGUAGE_ID.r, 80);
  assert.equal(LANGUAGE_ID_TO_KEY[80], 'r');
  assert.deepEqual(resolveLanguageRequest({ language: 'r' }), {
    languageId: 80,
    languageKey: 'r',
  });
  assert.deepEqual(resolveLanguageRequest({ language_id: 80 }), {
    languageId: 80,
    languageKey: 'r',
  });
});
