import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHiddenPythonHarness,
  cleanImportedProblemDescription,
  getVisibleCodeTemplates,
  prepareFunctionSourceForExecution,
  PYTHON_ADAPTER_MARKER,
} from '../src/services/functionProblemAdapterService.js';
import { serializeProblem } from '../src/controllers/compilerHelpers.js';

const storedPython = `from typing import *

class TreeNode:
    pass

class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        

${PYTHON_ADAPTER_MARKER}
print(Solution().twoSum([2, 7], 9))`;

test('returns only the editable Solution skeleton to the client', () => {
  const templates = getVisibleCodeTemplates({ python: storedPython, cpp: 'class Solution {};' });
  assert.match(templates.python, /^class Solution:/);
  assert.doesNotMatch(templates.python, /TreeNode|PeerPrep generated|print\(/);
  assert.equal(templates.cpp, 'class Solution {};');
});

test('rebuilds the hidden Python harness only for execution', () => {
  const submitted = `class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]`;
  const executable = prepareFunctionSourceForExecution({ codeTemplates: { python: storedPython } }, 'python', submitted);
  assert.match(executable, /class TreeNode/);
  assert.match(executable, /return \[0, 1\]/);
  assert.match(executable, /PeerPrep generated function adapter/);
  assert.equal(prepareFunctionSourceForExecution({}, 'cpp', 'int main() {}'), 'int main() {}');
});

test('repairs legacy double-escaped Python testcase parser regexes', () => {
  const imported = `class Solution:\n    def solve(self, nums):\n        return 0\n\n# PeerPrep generated function adapter. Keep this section unchanged.\ndef _pp_parse(raw):\n    matches = list(_pp_re.finditer(r'(\\\\w+)\\\\s*=\\\\s*(.+?)(?=,\\\\s*\\\\w+\\\\s*=|$)', raw))`;
  const harness = buildHiddenPythonHarness(imported);

  assert.ok(harness.includes("r'(\\w+)\\s*=\\s*(.+?)(?=,\\s*\\w+\\s*=|$)'"));
  assert.ok(!harness.includes("r'(\\\\w+)\\\\s*="));
});

test('uses a separately stored hidden harness after migration', () => {
  const submitted = `class Solution:\n    def twoSum(self, nums, target):\n        return [1, 0]`;
  const executable = prepareFunctionSourceForExecution({
    codeTemplates: { python: 'class Solution:\n    pass' },
    executionHarnesses: { python: storedPython },
  }, 'python', submitted);
  assert.match(executable, /return \[1, 0\]/);
  assert.match(executable, /PeerPrep generated function adapter/);
});

test('strips a legacy Python adapter before injecting the private runner', () => {
  const referenceWithLegacyAdapter = `${storedPython.replace('        \n', '        return [0, 1]\n')}`;
  const source = prepareFunctionSourceForExecution({
    executionMode: 'function',
    executionHarnesses: { python: `{{USER_CODE}}\n\n${PYTHON_ADAPTER_MARKER}\nprint('private runner')` },
  }, 'python', referenceWithLegacyAdapter, 'nums = [2, 7], target = 9');

  assert.equal(source.match(new RegExp(PYTHON_ADAPTER_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length, 1);
  assert.match(source, /return \[0, 1\]/);
});

test('injects function submissions into a language runner placeholder', () => {
  const executable = prepareFunctionSourceForExecution({
    executionMode: 'function',
    executionHarnesses: {
      cpp: '#include <iostream>\n{{USER_CODE}}\nint main() { std::cout << solve(); }',
    },
  }, 'cpp', 'int solve() { return 42; }');

  assert.match(executable, /int solve\(\) \{ return 42; \}/);
  assert.match(executable, /int main\(\)/);
  assert.doesNotMatch(executable, /\{\{USER_CODE\}\}/);
});

test('C execution strips duplicate runner-owned node definitions', () => {
  const source = prepareFunctionSourceForExecution({
    executionMode: 'function',
    executionHarnesses: {
      c: 'struct TreeNode { int val; struct TreeNode* left; struct TreeNode* right; };\n{{USER_CODE}}\nint main(void) { return 0; }',
    },
  }, 'c', 'struct TreeNode { int val; struct TreeNode *left; struct TreeNode *right; };\nint solve(struct TreeNode* root) { return root ? root->val : 0; }');

  assert.equal((source.match(/struct TreeNode\s*\{/g) || []).length, 1);
  assert.match(source, /int solve\(struct TreeNode\* root\)/);
});

test('full-program mode never injects a configured runner', () => {
  const source = '#include <iostream>\nint main() { std::cout << 7; }';
  assert.equal(prepareFunctionSourceForExecution({
    executionMode: 'full_program',
    executionHarnesses: { cpp: '{{USER_CODE}}\nint main() {}' },
  }, 'cpp', source), source);
});

test('serialization keeps hidden runners private from students and exposes them only to authoring requests', () => {
  const base = {
    _id: 'runner-privacy', title: 'Runner privacy', description: '', difficulty: 'Easy',
    supportedLanguages: ['cpp'], codeTemplates: { cpp: 'int solve();' },
    executionHarnesses: { cpp: '{{USER_CODE}}\nint main() {}' }, status: 'draft',
  };
  const student = serializeProblem(base);
  assert.equal(student.executionHarnesses, undefined);
  assert.equal(student.studentRunnerTemplates, undefined);

  const admin = serializeProblem(base, { includeExecutionHarnesses: true });
  assert.match(admin.executionHarnesses.cpp, /int main/);

  const visible = serializeProblem({ ...base, showExecutionHarness: true });
  assert.equal(visible.showExecutionHarness, false);
  assert.equal(visible.studentRunnerTemplates, undefined);
});

test('removes imported duplicate empty section labels without changing normal content', () => {
  const cleaned = cleanImportedProblemDescription(
    'Find the pair.\nExample 1:\nExample 2:\nConstraints:',
    { python: storedPython },
  );
  assert.equal(cleaned, 'Find the pair.');
  assert.equal(cleanImportedProblemDescription('Example 1:\nKeep this author content.', {}), 'Example 1:\nKeep this author content.');
});

test('problem serialization preserves editorial content after an edit', () => {
  const serialized = serializeProblem({
    _id: 'problem-id',
    title: 'Editorial test',
    description: 'Statement',
    difficulty: 'Easy',
    supportedLanguages: ['python'],
    codeTemplates: { python: 'class Solution:\n    pass' },
    editorial: '## Approach\nUse a hash map.',
    status: 'draft',
  });
  assert.equal(serialized.editorial, '## Approach\nUse a hash map.');
});
