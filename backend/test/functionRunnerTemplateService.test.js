import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';

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

function typeScriptDiagnostics(source) {
  const fileName = 'peerprep-runner.ts';
  // This source is a standalone Judge0 script. Do not load ambient Node types:
  // they are not present in Judge0 and can pull optional undici declarations
  // into this otherwise isolated compiler check.
  const options = { noEmit: true, target: ts.ScriptTarget.ES2019, lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'], module: ts.ModuleKind.None, types: [] };
  const host = ts.createCompilerHost(options);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultFileExists = host.fileExists.bind(host);
  const defaultReadFile = host.readFile.bind(host);
  host.getSourceFile = (requestedFile, languageVersion, ...rest) => (
    requestedFile === fileName
      ? ts.createSourceFile(requestedFile, source, languageVersion, true)
      : defaultGetSourceFile(requestedFile, languageVersion, ...rest)
  );
  host.fileExists = (requestedFile) => requestedFile === fileName || defaultFileExists(requestedFile);
  host.readFile = (requestedFile) => requestedFile === fileName ? source : defaultReadFile(requestedFile);
  const program = ts.createProgram([fileName], options, host);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => (
    `${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
  ));
}

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
  const executable = prepareFunctionSourceForExecution({
    executionMode: 'function',
    functionContract: contract,
    executionHarnesses: { typescript: runner },
  }, 'typescript', starter, 'nums = [2, 7], target = 9');
  assert.deepEqual(typeScriptDiagnostics(executable), []);
});

test('TypeScript runner uses standard Map iterators and typed Array.from overloads', () => {
  const iteratorContract = { className: 'Solution', methodName: 'solve', parameters: [], returnType: 'integer' };
  const source = `function solve(): number { const values = new Map<string, number>([['a', 2]]); const next = values.values().next(); const sorted = Array.from(values.values()).sort((a, b) => a - b); return next.value + sorted[0]; }`;
  const runner = generateFunctionRunnerTemplate('typescript', iteratorContract, source);
  const executable = materializeFunctionInputPlaceholders(runner.replace('{{USER_CODE}}', source), '', iteratorContract);
  assert.deepEqual(typeScriptDiagnostics(executable), []);
});

test('JavaScript runner builds real LeetCode-style node instances', () => {
  const nodeContract = {
    className: 'Solution',
    methodName: 'validateNodes',
    parameters: [{ name: 'root', type: 'tree-node' }, { name: 'head', type: 'list-node' }],
    returnType: 'boolean[]',
    outputMode: 'return',
  };
  const starter = `class Solution {
  validateNodes(root, head) {
    return [root instanceof TreeNode, root.left instanceof TreeNode, head instanceof ListNode, head.next instanceof ListNode];
  }
}`;
  const runner = generateFunctionRunnerTemplate('javascript', nodeContract, starter);
  const executable = prepareFunctionSourceForExecution({
    executionMode: 'function',
    functionContract: nodeContract,
    executionHarnesses: { javascript: runner },
  }, 'javascript', starter, 'root = [1, 2, 3], head = [4, 5]');
  const output = [];

  vm.runInNewContext(executable, { console: { log: (value) => output.push(String(value)) } });

  assert.deepEqual(output, ['[True, True, True, True]']);
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

test('Java runner recursively converts nested generic collections', () => {
  const nestedContract = {
    className: 'Solution', methodName: 'flatten',
    parameters: [{ name: 'values', type: 'integer[][]' }],
    returnType: 'integer[]', outputMode: 'return',
  };
  const runner = generateFunctionRunnerTemplate(
    'java',
    nestedContract,
    'class Solution { List<Integer> flatten(List<List<Integer>> values) { return values.get(0); } }',
  );

  assert.match(runner, /genericType instanceof java\.lang\.reflect\.ParameterizedType/);
  assert.match(runner, /target = \(Class<\?>\) rawType/);
});

test('C++ runner invokes the contract method even when a helper is declared later', () => {
  const studentTemplate = `class Solution {
public:
  vector<int> twoSum(vector<int>& nums, int target) { return {0, 1}; }

private:
  int helper(int value) { return value; }
};`;
  const runner = generateFunctionRunnerTemplate('cpp', contract, studentTemplate);

  assert.match(runner, /Solution\(\)\.twoSum\(__ppArg0, __ppArg1\)/);
  assert.doesNotMatch(runner, /Solution\(\)\.helper\(/);
  assert.doesNotMatch(runner, /struct TreeNode|struct ListNode/);
});

test('C++ and Java runners do not duplicate node classes supplied by templates', () => {
  const nodeContract = {
    className: 'Solution', methodName: 'identity',
    parameters: [{ name: 'head', type: 'list-node' }],
    returnType: 'list-node', outputMode: 'return',
  };
  const cppTemplate = `struct ListNode {
  int val;
  ListNode *next;
  ListNode(int value = 0) : val(value), next(nullptr) {}
};
class Solution { public: ListNode* identity(ListNode* head) { return head; } };`;
  const javaTemplate = `class ListNode {
  int val;
  ListNode next;
  ListNode(int val) { this.val = val; }
}
class Solution { ListNode identity(ListNode head) { return head; } }`;

  const cppRunner = generateFunctionRunnerTemplate('cpp', nodeContract, cppTemplate);
  const javaRunner = generateFunctionRunnerTemplate('java', nodeContract, javaTemplate);
  assert.equal((cppRunner.match(/struct ListNode\s*\{/g) || []).length, 0);
  assert.equal((javaRunner.match(/class ListNode\s*\{/g) || []).length, 0);
});

test('commented LeetCode node definitions do not suppress private runner definitions', () => {
  const nodeContract = {
    className: 'Solution', methodName: 'identity',
    parameters: [{ name: 'head', type: 'list-node' }],
    returnType: 'list-node', outputMode: 'return',
  };
  const cppTemplate = `/** Definition for singly-linked list.
 * struct ListNode { int val; ListNode *next; };
 */
class Solution { public: ListNode* identity(ListNode* head) { return head; } };`;
  const javaTemplate = `/** Definition for singly-linked list.
 * class ListNode { int val; ListNode next; }
 */
class Solution { ListNode identity(ListNode head) { return head; } }`;

  assert.equal((generateFunctionRunnerTemplate('cpp', nodeContract, cppTemplate).match(/struct ListNode\s*\{/g) || []).length, 1);
  assert.equal((generateFunctionRunnerTemplate('java', nodeContract, javaTemplate).match(/class ListNode\s*\{/g) || []).length, 1);
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

  const doubleContract = {
    methodName: 'averages', parameters: [], returnType: 'double[]', outputMode: 'return',
  };
  const doubleRunner = generateFunctionRunnerTemplate(
    'c', doubleContract, 'double* averages(int* returnSize) { return NULL; }',
  );
  assert.match(doubleRunner, /__ppPrintDoubleArray\(\(const double\*\)__ppResult/);

  const characterContract = {
    methodName: 'letters', parameters: [], returnType: 'character[]', outputMode: 'return',
  };
  const characterRunner = generateFunctionRunnerTemplate(
    'c', characterContract, 'char* letters(int* returnSize) { return NULL; }',
  );
  assert.match(characterRunner, /__ppPrintCharArray\(\(const char\*\)__ppResult/);
});

test('C runner preserves element types when a matrix parameter is the output', () => {
  const matrixContract = {
    methodName: 'normalize',
    parameters: [{ name: 'values', type: 'double[][]' }],
    returnType: 'void',
    outputMode: 'parameter',
    outputParameterIndex: 0,
  };
  const runner = generateFunctionRunnerTemplate(
    'c', matrixContract,
    'void normalize(double** values, int valuesSize, int* valuesColSize) {}',
  );

  assert.match(runner, /__ppPrintDoubleMatrix\(\(double\*\*\)__ppArg0/);
  assert.doesNotMatch(runner, /__ppPrintIntMatrix\(__ppArg0/);
});

test('C runner formats scalar output parameters by their contract type', () => {
  const boolContract = {
    methodName: 'toggle',
    parameters: [{ name: 'value', type: 'boolean' }],
    returnType: 'void',
    outputMode: 'parameter',
    outputParameterIndex: 0,
  };
  const doubleContract = {
    methodName: 'halve',
    parameters: [{ name: 'value', type: 'double' }],
    returnType: 'void',
    outputMode: 'parameter',
    outputParameterIndex: 0,
  };

  const boolRunner = generateFunctionRunnerTemplate('c', boolContract, 'void toggle(bool value) {}');
  const doubleRunner = generateFunctionRunnerTemplate('c', doubleContract, 'void halve(double value) {}');
  assert.match(boolRunner, /printf\("%s", __ppArg0 \? "True" : "False"\)/);
  assert.match(doubleRunner, /printf\("%\.15g", \(double\)__ppArg0\)/);
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
