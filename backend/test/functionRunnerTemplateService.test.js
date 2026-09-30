import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { generateFunctionRunnerTemplate } from '../src/services/functionRunnerTemplateService.js';
import { prepareFunctionSourceForExecution } from '../src/services/functionProblemAdapterService.js';
import { materializeFunctionInputPlaceholders } from '../src/services/functionTestInputService.js';

const contract = {
  className: 'Solution',
  methodName: 'twoSum',
  parameters: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }],
  returnType: 'integer[]',
  outputMode: 'return',
  outputParameterIndex: 0,
};

test('JavaScript runner keeps main private and materializes testcase arguments', () => {
  const starter = 'var twoSum = function(nums, target) { return [0, 1]; };';
  const runner = generateFunctionRunnerTemplate('javascript', contract, starter);
  const executable = prepareFunctionSourceForExecution({
    executionMode: 'function',
    functionContract: contract,
    executionHarnesses: { javascript: runner },
  }, 'javascript', starter, 'target = 9, nums = [2, 7]');
  assert.match(runner, /\{\{USER_CODE}}/);
  assert.doesNotMatch(executable, /\{\{USER_CODE}}|\{\{ARGUMENTS_JSON_STRING}}/);
  assert.match(executable, /JSON\.parse\("\[\[2,7\],9\]"\)/);
  assert.match(executable, /twoSum\(__ppArgs\[0\], __ppArgs\[1\]\)/);
  const output = [];
  vm.runInNewContext(executable, { console: { log: (value) => output.push(String(value)) } });
  assert.deepEqual(output, ['[0, 1]']);
});

test('TypeScript runner calls a Solution class when the template declares it', () => {
  const starter = 'class Solution { twoSum(nums: number[], target: number): number[] { return []; } }';
  const runner = generateFunctionRunnerTemplate('typescript', contract, starter);
  assert.match(runner, /new Solution\(\)\.twoSum/);
  assert.match(runner, /value: any/);
});

test('Java runner keeps main private and converts arguments through reflection', () => {
  const contract = {
    className: 'Solution',
    methodName: 'twoSum',
    parameters: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }],
    returnType: 'integer[]',
    outputMode: 'return',
  };
  const studentTemplate = 'class Solution { public int[] twoSum(int[] nums, int target) { return new int[]{0, 1}; } }';
  const runner = generateFunctionRunnerTemplate('java', contract, studentTemplate);
  const source = materializeFunctionInputPlaceholders(
    runner.replace('{{USER_CODE}}', studentTemplate),
    'nums = [2, 7], target = 9',
    { ...contract, runnerLanguage: 'java' },
  );

  assert.match(source, /class Main/);
  assert.match(source, /java\.util\.Arrays\.asList\(Long\.valueOf\(2L\), Long\.valueOf\(7L\)\)/);
  assert.doesNotMatch(studentTemplate, /static void main/);
});

test('C runner supplies hidden sizes and keeps main out of the student template', () => {
  const cContract = {
    className: '', methodName: 'twoSum',
    parameters: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }],
    returnType: 'integer[]', outputMode: 'return',
  };
  const studentTemplate = 'int* twoSum(int* nums, int numsSize, int target, int* returnSize) { return NULL; }';
  const runner = generateFunctionRunnerTemplate('c', cContract, studentTemplate);
  const source = materializeFunctionInputPlaceholders(
    runner.replace('{{USER_CODE}}', studentTemplate),
    'nums = [2, 7], target = 9',
    { ...cContract, runnerLanguage: 'c' },
  );
  assert.match(source, /int __ppArg0\[\] = \{2, 7};/);
  assert.match(source, /twoSum\(__ppArg0, \(int\)\(sizeof\(__ppArg0\)/);
  assert.doesNotMatch(studentTemplate, /int main/);
});

test('C runner prints pointer results using their declared element type', () => {
  const boolContract = {
    methodName: 'flags', parameters: [], returnType: 'boolean[]', outputMode: 'return',
  };
  const boolRunner = generateFunctionRunnerTemplate(
    'c', boolContract, 'bool* flags(int* returnSize) { return NULL; }',
  );
  assert.match(boolRunner, /__ppPrintBoolArray\(\(const bool\*\)__ppResult/);

  const longContract = {
    methodName: 'totals', parameters: [], returnType: 'integer[]', outputMode: 'return',
  };
  const longRunner = generateFunctionRunnerTemplate(
    'c', longContract, 'long long* totals(int* returnSize) { return NULL; }',
  );
  assert.match(longRunner, /__ppPrintLongArray\(\(const long long\*\)__ppResult/);
});

test('C runner makes string arguments writable and avoids duplicate node definitions', () => {
  const stringContract = {
    methodName: 'mutate', parameters: [{ name: 's', type: 'string' }], returnType: 'string', outputMode: 'return',
  };
  const stringRunner = generateFunctionRunnerTemplate('c', stringContract, 'char* mutate(char* s) { return s; }');
  assert.match(stringRunner, /char __ppArg0\[\] = \{\{ARG_0\}\};/);

  const treeContract = {
    methodName: 'walk', parameters: [{ name: 'root', type: 'tree-node' }], returnType: 'integer[]', outputMode: 'return',
  };
  const treeTemplate = 'struct TreeNode { int val; struct TreeNode* left; struct TreeNode* right; };\nint* walk(struct TreeNode* root, int* returnSize) { return NULL; }';
  const treeRunner = generateFunctionRunnerTemplate('c', treeContract, treeTemplate);
  assert.equal((treeRunner.match(/struct TreeNode \{/g) || []).length, 1);
});
