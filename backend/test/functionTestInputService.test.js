import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFunctionInputPayload,
  materializeFunctionInputPlaceholders,
  parseFunctionTestInput,
} from '../src/services/functionTestInputService.js';

test('parses Python-style named arguments without evaluating source code', () => {
  assert.deepEqual(
    parseFunctionTestInput('nums = [1, -2, 3], target = 2, enabled = True, note = \'ok\''),
    {
      named: { nums: [1, -2, 3], target: 2, enabled: true, note: 'ok' },
      positional: [],
      values: [[1, -2, 3], 2, true, 'ok'],
    },
  );
});

test('supports nested lists, null values, objects and positional arguments', () => {
  assert.deepEqual(parseFunctionTestInput('[[1, None], [2, 3]], {key: false}').positional, [
    [[1, null], [2, 3]],
    { key: false },
  ]);
});

test('orders named values using the stored function contract', () => {
  assert.deepEqual(buildFunctionInputPayload('target = 9, nums = [2, 7]', {
    parameters: [{ name: 'nums' }, { name: 'target' }],
  }).args, [[2, 7], 9]);
});

test('materializes private runner JSON placeholders', () => {
  const output = materializeFunctionInputPlaceholders(
    'const input = {{TEST_INPUT_JSON_STRING}}; const args = {{ARGUMENTS_JSON}};',
    'nums = [2, 7], target = 9',
    { parameters: [{ name: 'nums' }, { name: 'target' }] },
  );
  assert.equal(output, 'const input = "{\\"nums\\":[2,7],\\"target\\":9}"; const args = [[2,7],9];');
});

test('rejects executable expressions', () => {
  assert.throws(() => parseFunctionTestInput('value = process.exit()'), /unsupported literal/i);
});

