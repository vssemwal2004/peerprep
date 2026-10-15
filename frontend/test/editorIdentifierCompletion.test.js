import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractDeclaredIdentifiers,
  MAX_IDENTIFIER_SUGGESTIONS,
} from '../src/student/editor/identifierExtraction.js';
import {
  acquireIdentifierCompletions,
  getIdentifierCompletionState,
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
  const editors = [];
  const monaco = {
    languages: {
      CompletionItemKind: { Function: 1, Variable: 4, Class: 5, Module: 8 },
      registerCompletionItemProvider(languageId, provider) {
        const entry = { languageId, provider, disposed: false };
        registered.push(entry);
        return { dispose() { entry.disposed = true; } };
      },
    },
    editor: { getEditors: () => editors },
  };
  return { monaco, registered, editors };
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
  const { monaco, registered, editors } = createFakeMonaco();
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

  const model = createModel('def helper(count):\n    total = count\n    to', 'python');
  const python = registered.find((entry) => entry.languageId === 'python').provider;
  const position = { lineNumber: 3, column: 7 };

  assert.equal(python.provideCompletionItems(model, position), undefined, 'Models outside student editors are left alone');

  editors.push({ getModel: () => model, getDomNode: () => studentNode });
  const result = python.provideCompletionItems(model, position);
  const labels = result.suggestions.map((item) => item.label);
  assert.deepEqual(labels.sort(), ['count', 'helper', 'total']);
  assert.ok(!labels.includes('to'), 'The word being typed is not suggested back');
  const helper = result.suggestions.find((item) => item.label === 'helper');
  assert.equal(helper.kind, 1);
  assert.equal(result.suggestions.find((item) => item.label === 'total').kind, 4);
  assert.deepEqual(helper.range, { startLineNumber: 3, endLineNumber: 3, startColumn: 5, endColumn: 7 });
  assert.ok(helper.sortText.startsWith('0'));

  const memberModel = createModel('items = []\nitems.ap', 'python');
  editors.push({ getModel: () => memberModel, getDomNode: () => studentNode });
  assert.equal(python.provideCompletionItems(memberModel, { lineNumber: 2, column: 9 }), undefined, 'Member access is left to Monaco');

  releaseFirst();
  releaseFirst();
  assert.deepEqual(getIdentifierCompletionState(), { providers: providerCount, holders: 1 }, 'Releasing twice is harmless');
  assert.ok(registered.every((entry) => !entry.disposed), 'Providers stay while an editor is mounted');
  releaseSecond();
  assert.ok(registered.every((entry) => entry.disposed), 'The last editor disposes every provider');
  assert.deepEqual(getIdentifierCompletionState(), { providers: 0, holders: 0 });

  acquireIdentifierCompletions(monaco, studentScope)();
  assert.equal(registered.length, providerCount * 2, 'A later mount registers again');
});
