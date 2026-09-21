import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LANGUAGES } from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import {
  KEY_TO_LANGUAGE_ID,
  LANGUAGE_ID_TO_KEY,
  evaluateSubmissionResult,
  mapRunStatusCode,
  resolveLanguageRequest,
  sanitizeExecutionText,
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

test('successful R output on stderr is not treated as a runtime error', () => {
  const acceptedWithMessage = {
    status: { id: 3, description: 'Accepted' },
    stdout: '42\n',
    stderr: 'calculation completed\n',
  };

  assert.equal(mapRunStatusCode(acceptedWithMessage), 'AC');
  assert.equal(evaluateSubmissionResult(acceptedWithMessage, '42').internalStatus, 'AC');
});

test('GNU C++ mapping preserves the bits standard library include', () => {
  const source = '#include <bits/stdc++.h>\nusing namespace std;\nint main() { cout << 42; }';

  assert.equal(KEY_TO_LANGUAGE_ID.cpp, 54);
  assert.equal(LANGUAGE_ID_TO_KEY[54], 'cpp');
  assert.deepEqual(resolveLanguageRequest({ language: 'cpp' }), {
    languageId: 54,
    languageKey: 'cpp',
  });
  assert.equal(sanitizeExecutionText(source, 50 * 1024, 'Source code'), source);
});
