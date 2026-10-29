import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractDeclaredIdentifiers,
  MAX_IDENTIFIER_SUGGESTIONS,
} from '../src/student/editor/identifierExtraction.js';
import {
  acquireIdentifierCompletions,
  getIdentifierCompletionState,
  provideIdentifierSignatureHelp,
} from '../src/student/editor/identifierCompletion.js';

const kindsOf = (source, language) => Object.fromEntries(
  extractDeclaredIdentifiers(source, language).map(({ name, kind }) => [name, kind]),
);

test('C++: functions, parameters, locals, containers and bindings, not library words', () => {
  const found = kindsOf(`#include <bits/stdc++.h>
using namespace std;
#define MOD 1000000007
using ll = long long;
// int commentedOut = 1;
int solve(vector<int>& nums, int target) {
  long long total = 0, best = -1;
  vector<int> dp(n + 1, 0);
  map<string, vector<int>> groups;
  for (int i = 0; i < n; i++) total += nums[i];
  for (auto& [key, value] : groups) {}
  auto cmp = [&](int a, int b) { return a < b; };
  string label = "int fakeInString = 2";
  return total;
}
int main() { int t; cin >> t; cout << solve(v, t) << endl; }`, 'cpp');

  assert.equal(found.solve, 'function');
  assert.equal(found.main, 'function');
  assert.equal(found.cmp, 'function');
  for (const name of ['nums', 'target', 'total', 'best', 'dp', 'groups', 'i', 'key', 'value', 'a', 'b', 'label', 't', 'MOD']) {
    assert.equal(found[name], 'variable', `${name} is a variable`);
  }
  assert.equal(found.ll, 'class');
  const details = Object.fromEntries(extractDeclaredIdentifiers(`int solve(vector<int>& nums, int target) {
  map<string, vector<int>> groups; long long total = 0, best = -1; return 0; }`, 'cpp').map(({ name, detail }) => [name, detail]));
  assert.equal(details.solve, 'int solve(vector<int>& nums, int target)');
  assert.equal(details.nums, 'vector<int>&');
  assert.equal(details.groups, 'map<string, vector<int>>');
  assert.equal(details.best, 'long long');
  for (const absent of ['commentedOut', 'fakeInString', 'cout', 'cin', 'endl', 'std', 'vector', 'int', 'return', 'include', 'bits']) {
    assert.equal(found[absent], undefined, `${absent} is not suggested`);
  }
});

test('C: pointers and prototypes', () => {
  const found = kindsOf(`int add(int x, int y);
int main(void) {
  int *arr = malloc(10 * sizeof(int));
  char **names;
  return add(arr[0], 2);
}`, 'c');
  assert.equal(found.add, 'function');
  assert.equal(found.main, 'function');
  for (const name of ['x', 'y', 'arr', 'names']) assert.equal(found[name], 'variable');
});

test('Java: class, methods, generics, arrays and enhanced for', () => {
  const found = kindsOf(`import java.util.*;
public class Main {
  static int[] memo;
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    Map<Integer, List<Integer>> graph = new HashMap<>();
    for (int node : graph.keySet()) System.out.println(node);
  }
  private static long countWays(int n, int[] coins) throws Exception { return 0; }
}`, 'java');
  assert.equal(found.Main, 'class');
  assert.equal(found.main, 'function');
  assert.equal(found.countWays, 'function');
  for (const name of ['memo', 'args', 'sc', 'graph', 'node', 'n', 'coins']) assert.equal(found[name], 'variable');
  for (const absent of ['Scanner', 'System', 'println', 'HashMap', 'java']) assert.equal(found[absent], undefined);
});

test('Python: def, params, assignments, for targets, with/except aliases, lambda, imports', () => {
  const found = kindsOf(`import heapq
from collections import defaultdict, deque
class Solution:
    def two_sum(self, nums: list[int], target: int = 0, *args, **kwargs) -> list[int]:
        """def notReal(): pass"""
        seen = {}  # ghost = 1
        left, right = 0, len(nums) - 1
        for idx, value in enumerate(nums):
            pass
        square = lambda x: x * x
        with open("f") as handle:
            pass
        if (count := len(nums)) > 2:
            pass
        return [seen, square]
`, 'python');
  assert.equal(found.Solution, 'class');
  assert.equal(found.two_sum, 'function');
  assert.equal(found.square, 'function');
  for (const name of ['nums', 'target', 'args', 'kwargs', 'seen', 'left', 'right', 'idx', 'value', 'x', 'handle', 'count']) {
    assert.equal(found[name], 'variable', `${name} is a variable`);
  }
  for (const name of ['heapq', 'defaultdict', 'deque']) assert.equal(found[name], 'module');
  for (const absent of ['self', 'notReal', 'ghost', 'enumerate', 'len', 'open', 'pass']) assert.equal(found[absent], undefined);
});

test('JavaScript and TypeScript: functions, arrows, destructuring, methods, params', () => {
  const js = kindsOf(`const { alpha, beta: renamed, ...rest } = input;
let [first, , third] = list, counter = 0;
function twoSum(nums, target = 0) { const map = new Map(); return map; }
const helper = async (left, right) => left + right;
const double = n => n * 2;
class Solver {
  solve(grid) { for (const row of grid) {} }
}
try {} catch (err) {}
// const hidden = 1;
const text = \`const fake = 1\`;`, 'javascript');
  assert.equal(js.twoSum, 'function');
  assert.equal(js.helper, 'function');
  assert.equal(js.double, 'function');
  assert.equal(js.solve, 'function');
  assert.equal(js.Solver, 'class');
  for (const name of ['alpha', 'renamed', 'rest', 'first', 'third', 'counter', 'nums', 'target', 'map', 'left', 'right', 'n', 'grid', 'row', 'err', 'text']) {
    assert.equal(js[name], 'variable', `${name} is a variable`);
  }
  for (const absent of ['beta', 'hidden', 'fake', 'input', 'Map', 'list']) assert.equal(js[absent], undefined, `${absent} is not suggested`);

  const ts = kindsOf(`interface Point { x: number }
function dist(a: Point, b?: Point): number { const dx: number = a.x; return dx; }
const sum = (values: number[]): number => values.length;`, 'typescript');
  assert.equal(ts.Point, 'class');
  assert.equal(ts.dist, 'function');
  assert.equal(ts.sum, 'function');
  for (const name of ['a', 'b', 'dx', 'values']) assert.equal(ts[name], 'variable');
  assert.equal(ts.number, undefined);
});

test('Go, Kotlin, Rust and Swift basics', () => {
  const go = kindsOf('func maxSum(nums []int, k int) int {\n  best := 0\n  for i, v := range nums { best += v + i }\n  var total int\n  return best\n}', 'go');
  assert.equal(go.maxSum, 'function');
  for (const name of ['nums', 'k', 'best', 'i', 'v', 'total']) assert.equal(go[name], 'variable');

  const kotlin = kindsOf('fun solve(n: Int, vararg xs: Int): Int {\n  val (a, b) = Pair(1, 2)\n  var acc = 0\n  for (x in xs) acc += x\n  return acc\n}', 'kotlin');
  assert.equal(kotlin.solve, 'function');
  for (const name of ['n', 'xs', 'a', 'b', 'acc', 'x']) assert.equal(kotlin[name], 'variable');

  const rust = kindsOf("fn longest<'a>(left: &'a str, mut right: Vec<i32>) -> usize {\n  let mut count = 0;\n  let add = |p: i32, q: i32| p + q;\n  for (i, c) in right.iter().enumerate() {}\n  count\n}", 'rust');
  assert.equal(rust.longest, 'function');
  assert.equal(rust.add, 'function');
  for (const name of ['left', 'right', 'count', 'p', 'q', 'i', 'c']) assert.equal(rust[name], 'variable');

  const swift = kindsOf('func area(_ width: Int, height h: Int) -> Int {\n  let result = width * h\n  return result\n}', 'swift');
  assert.equal(swift.area, 'function');
  for (const name of ['width', 'h', 'result']) assert.equal(swift[name], 'variable');
});

test('a word reserved in one language stays a valid name in another', () => {
  assert.equal(kindsOf('def union(a, b):\n    double = 2', 'python').union, 'function');
  assert.equal(kindsOf('def union(a, b):\n    double = 2', 'python').double, 'variable');
  assert.equal(kindsOf('const double = (x) => x * 2;', 'javascript').double, 'function');
  assert.equal(kindsOf('double union = 1.5;', 'cpp').union, undefined);
});

test('unsupported languages, empty input and the suggestion cap', () => {
  assert.deepEqual(extractDeclaredIdentifiers('SELECT * FROM t', 'sql'), []);
  assert.deepEqual(extractDeclaredIdentifiers('', 'python'), []);
  const many = Array.from({ length: 500 }, (_, index) => `value${index} = ${index}`).join('\n');
  const found = extractDeclaredIdentifiers(many, 'python');
  assert.equal(found.length, MAX_IDENTIFIER_SUGGESTIONS);
  assert.equal(found[0].name, 'value0', 'Earliest declarations are kept');
});

test('large files stay fast', () => {
  const block = 'int helper(int a, int b) {\n  long long sum = a + b; // note\n  vector<int> items(sum);\n  return sum;\n}\n';
  const source = block.repeat(2500);
  const started = performance.now();
  extractDeclaredIdentifiers(source, 'cpp');
  extractDeclaredIdentifiers(source.replace(/int |long long |vector<int> /g, 'let '), 'javascript');
  assert.ok(performance.now() - started < 1500, 'Extraction of ~250KB finishes quickly');
});

function createFakeMonaco() {
  const registered = [];
  const signatureProviders = [];
  const editors = [];
  const monaco = {
    languages: {
      CompletionItemKind: { Method: 0, Function: 1, Field: 3, Variable: 4, Class: 5, Module: 8, Keyword: 17, Text: 18, Reference: 21 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      registerCompletionItemProvider(languageId, provider) {
        const entry = { languageId, provider, disposed: false };
        registered.push(entry);
        return { dispose() { entry.disposed = true; } };
      },
      registerSignatureHelpProvider(languageId, provider) {
        const entry = { languageId, provider, disposed: false };
        signatureProviders.push(entry);
        return { dispose() { entry.disposed = true; } };
      },
    },
    editor: { getEditors: () => editors },
  };
  return { monaco, registered, signatureProviders, editors };
}

function createModel(text, languageId) {
  const lines = text.split('\n');
  const wordAt = (position) => {
    const line = lines[position.lineNumber - 1];
    let start = position.column - 1;
    while (start > 0 && /\w/.test(line[start - 1])) start -= 1;
    let end = position.column - 1;
    while (end < line.length && /\w/.test(line[end])) end += 1;
    return { line, start, end };
  };
  return {
    getValue: () => text,
    getVersionId: () => 1,
    getLanguageId: () => languageId,
    getLineContent: (lineNumber) => lines[lineNumber - 1],
    getWordUntilPosition(position) {
      const { line, start } = wordAt(position);
      return { word: line.slice(start, position.column - 1), startColumn: start + 1, endColumn: position.column };
    },
    getWordAtPosition(position) {
      const { line, start, end } = wordAt(position);
      return end > start ? { word: line.slice(start, end), startColumn: start + 1, endColumn: end + 1 } : null;
    },
  };
}

test('providers are registered once, scoped to student editors and disposed with the last one', () => {
  const { monaco, registered, signatureProviders, editors } = createFakeMonaco();
  const studentNode = { id: 'student-editor' };
  const studentScope = { contains: (node) => node === studentNode };
  const otherScope = { contains: () => false };

  const releaseFirst = acquireIdentifierCompletions(monaco, studentScope);
  const releaseSecond = acquireIdentifierCompletions(monaco, otherScope);
  const providerCount = registered.length;
  assert.ok(providerCount >= 6, 'One provider per supported language');
  assert.equal(new Set(registered.map((entry) => entry.languageId)).size, providerCount, 'No language is registered twice');
  for (const language of ['c', 'cpp', 'java', 'python', 'javascript', 'typescript']) {
    assert.ok(registered.some((entry) => entry.languageId === language), `${language} is covered`);
  }

  const model = createModel('def helper(count):\n    total = count\n    ', 'python');
  const python = registered.find((entry) => entry.languageId === 'python').provider;
  const position = { lineNumber: 3, column: 5 };

  assert.equal(python.provideCompletionItems(model, position), undefined, 'Models outside student editors are left alone');

  editors.push({ getModel: () => model, getDomNode: () => studentNode });
  const result = python.provideCompletionItems(model, position);
  const nameOf = (item) => (typeof item.label === 'string' ? item.label : item.label.label);
  const byName = new Map(result.suggestions.map((item) => [nameOf(item), item]));
  for (const name of ['count', 'helper', 'total']) assert.ok(byName.get(name).sortText.startsWith('0'), `${name} is a declared name`);
  assert.ok(!byName.has('return'), 'Keywords are not suggested');
  assert.ok(!byName.has('range'), 'Library names are not suggested');
  const helper = byName.get('helper');
  assert.equal(helper.kind, 1);
  assert.equal(helper.detail, 'def helper(count)', 'Functions show their signature');
  assert.equal(helper.insertText, 'helper(${1:count})$0', 'Functions insert a callable snippet with parameter stops');
  assert.equal(helper.insertTextRules, 4);
  assert.equal(byName.get('total').kind, 4);
  assert.deepEqual(helper.range, { startLineNumber: 3, endLineNumber: 3, startColumn: 5, endColumn: 5 });
  const sorted = [...result.suggestions].sort((a, b) => a.sortText.localeCompare(b.sortText)).map(nameOf);
  assert.deepEqual(sorted, ['count', 'helper', 'total'], 'Only declared variables and functions are returned');

  const memberModel = createModel('stack = []\nstack.sort()\nstack.ap', 'python');
  editors.push({ getModel: () => memberModel, getDomNode: () => studentNode });
  const members = python.provideCompletionItems(memberModel, { lineNumber: 3, column: 9 }).suggestions.map(nameOf);
  assert.deepEqual(members, [], 'Library and member names are not suggested after a dot');

  const typedModel = createModel('vector<int> nums;\nint best = 0;\nnu', 'cpp');
  editors.push({ getModel: () => typedModel, getDomNode: () => studentNode });
  const cpp = registered.find((entry) => entry.languageId === 'cpp').provider;
  const typed = new Map(cpp.provideCompletionItems(typedModel, { lineNumber: 3, column: 3 }).suggestions.map((item) => [nameOf(item), item]));
  assert.equal(typed.get('nums').label.description, 'vector<int>', 'Variables show their declared type');
  assert.ok(!typed.has('best'), 'Non-matching declared names stay hidden');

  const comparison = createModel('a = 1\nif a >', 'python');
  editors.push({ getModel: () => comparison, getDomNode: () => studentNode });
  assert.deepEqual(python.provideCompletionItems(comparison, { lineNumber: 2, column: 7 }, { triggerKind: 1 }).suggestions, [], '`>` alone does not open the list');

  const unmatchedModel = createModel('int total = 0;\ncount', 'cpp');
  editors.push({ getModel: () => unmatchedModel, getDomNode: () => studentNode });
  assert.deepEqual(
    cpp.provideCompletionItems(unmatchedModel, { lineNumber: 2, column: 6 }).suggestions,
    [],
    'An undeclared unmatched word does not show unrelated declarations',
  );

  const orderedModel = createModel('int early = 0;\nea\nint later = 1;', 'cpp');
  editors.push({ getModel: () => orderedModel, getDomNode: () => studentNode });
  const ordered = cpp.provideCompletionItems(orderedModel, { lineNumber: 2, column: 3 }).suggestions.map(nameOf);
  assert.ok(ordered.includes('early'), 'A variable declared before the cursor is suggested');
  assert.ok(!ordered.includes('later'), 'A declaration after the cursor is not suggested');

  const callModel = createModel('def helper(count, total=0):\n    return count + total\nhelper(1, ', 'python');
  editors.push({ getModel: () => callModel, getDomNode: () => studentNode });
  const signature = provideIdentifierSignatureHelp(monaco, callModel, { lineNumber: 3, column: 11 });
  assert.equal(signature.value.signatures[0].label, 'def helper(count, total=0)');
  assert.equal(signature.value.activeParameter, 1);
  assert.deepEqual(signature.value.signatures[0].parameters.map((item) => item.label), ['count', 'total=0']);
  assert.equal(signatureProviders.length, providerCount, 'Each completion language also receives signature help');

  releaseFirst();
  releaseFirst();
  assert.deepEqual(getIdentifierCompletionState(), { providers: providerCount, holders: 1 }, 'Releasing twice is harmless');
  assert.ok(registered.every((entry) => !entry.disposed), 'Providers stay while an editor is mounted');
  releaseSecond();
  assert.ok(registered.every((entry) => entry.disposed), 'The last editor disposes every provider');
  assert.ok(signatureProviders.every((entry) => entry.disposed), 'Signature providers are disposed too');
  assert.deepEqual(getIdentifierCompletionState(), { providers: 0, holders: 0 });

  acquireIdentifierCompletions(monaco, studentScope)();
  assert.equal(registered.length, providerCount * 2, 'A later mount registers again');
});

test('completion reads only the text before the word and reuses the result for the same model version', () => {
  const { monaco, registered } = createFakeMonaco();
  const text = 'int total = 0;\nint later = 1;\nto';
  let version = 1;
  const reads = { getValue: 0, ranges: [] };
  const base = createModel(text, 'cpp');
  const lines = text.split('\n');
  const model = {
    ...base,
    getVersionId: () => version,
    getValue: () => { reads.getValue += 1; return text; },
    getValueInRange(range) {
      reads.ranges.push(range);
      const selected = lines.slice(range.startLineNumber - 1, range.endLineNumber);
      selected[selected.length - 1] = selected[selected.length - 1].slice(0, range.endColumn - 1);
      return selected.join('\n');
    },
  };
  const release = acquireIdentifierCompletions(monaco, { contains: () => false }, (candidate) => candidate === model);
  const cpp = registered.find((entry) => entry.languageId === 'cpp').provider;
  const labelsAt = (position) => cpp.provideCompletionItems(model, position).suggestions
    .map((item) => (typeof item.label === 'string' ? item.label : item.label.label));

  assert.deepEqual(labelsAt({ lineNumber: 3, column: 3 }), ['total']);
  assert.equal(reads.getValue, 0, 'The whole document is not copied per keystroke');
  assert.deepEqual(reads.ranges, [{ startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 1 }]);

  assert.deepEqual(labelsAt({ lineNumber: 3, column: 3 }), ['total']);
  assert.equal(reads.ranges.length, 1, "Monaco's repeat request for the same position is served from memory");

  version += 1;
  labelsAt({ lineNumber: 3, column: 3 });
  assert.equal(reads.ranges.length, 2, 'An edit invalidates the remembered result');
  release();
});

test('automatic suggestions use explicit model ownership without Monaco editor enumeration', () => {
  const { monaco, registered } = createFakeMonaco();
  delete monaco.editor.getEditors;
  const model = createModel('int total = 0;\ntotal', 'cpp');
  const release = acquireIdentifierCompletions(
    monaco,
    { contains: () => false },
    (candidateModel) => candidateModel === model,
  );

  const cpp = registered.find((entry) => entry.languageId === 'cpp').provider;
  const result = cpp.provideCompletionItems(model, { lineNumber: 2, column: 6 });
  const labels = result.suggestions.map((item) => (
    typeof item.label === 'string' ? item.label : item.label.label
  ));

  assert.ok(labels.includes('total'), 'The fully typed declared variable remains suggestible');
  release();
});
