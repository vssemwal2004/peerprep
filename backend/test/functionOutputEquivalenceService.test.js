import assert from 'node:assert/strict';
import test from 'node:test';

import { acceptsEquivalentFunctionOutput } from '../src/services/functionOutputEquivalenceService.js';

const problem = (methodName, parameters, returnType = 'integer[]') => ({
  functionContract: { methodName, parameters, returnType },
});

test('accepts every valid threshold subarray length and proves the impossible case',()=>{
 const target=problem('validSubarraySize',[{name:'nums'},{name:'threshold'}],'integer');
 const fixture={input:'nums = [6,5,6,5,8], threshold = 4',output:'1'};
 for(const value of ['1','2','3','4','5'])assert.equal(acceptsEquivalentFunctionOutput(target,fixture,value),true);
 for(const value of ['-1','0','6','2.5'])assert.equal(acceptsEquivalentFunctionOutput(target,fixture,value),false);
 assert.equal(acceptsEquivalentFunctionOutput(target,{input:'nums = [1,1], threshold = 2',output:'-1'},'-1'),true);
});

test('character pair permutations preserve counts and all y-before-x precedence',()=>{
 const target=problem('rearrangeString',[{name:'s'},{name:'x'},{name:'y'}],'string');target.title='Rearrange String to Avoid Character Pair';
 const fixture={input:'s = "aabc", x = "a", y = "c"',output:'"cbaa"'};
 assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'bcaa'),true);
 for(const value of ['aabc','cbba','cba'])assert.equal(acceptsEquivalentFunctionOutput(target,fixture,value),false);
 target.title='Unrelated rearrangement problem';assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'bcaa'),false);
});

test('duplicate file groups retain membership while allowing both documented orders', () => {
  const target = problem('findDuplicate', [{name:'paths'}], 'string[][]');
  const fixture = { input: 'paths = []', output: '[["a","b"],["c","d"]]' };
  assert.equal(acceptsEquivalentFunctionOutput(target, fixture, '[["d","c"],["b","a"]]'), true);
  assert.equal(acceptsEquivalentFunctionOutput(target, fixture, '[["a","c"],["b","d"]]'), false);
  target.functionContract.returnType = 'integer[][]';
  assert.equal(acceptsEquivalentFunctionOutput(target, fixture, '[["d","c"],["b","a"]]'), false);
});

test('happy strings require maximum feasible length, counts and absence of triples', () => {
  const target = problem('longestDiverseString', [{name:'a'},{name:'b'},{name:'c'}], 'string');
  const fixture = { input: 'a = 1, b = 1, c = 7', output: 'ccaccbcc' };
  assert.equal(acceptsEquivalentFunctionOutput(target, fixture, 'ccbccacc'), true);
  for (const wrong of ['cccaccbc', 'ccbccac', 'ccbccabb', 'ccbccacx']) assert.equal(acceptsEquivalentFunctionOutput(target, fixture, wrong), false);
  assert.equal(acceptsEquivalentFunctionOutput(target, { input:'a = 7, b = 0, c = 0', output:'aa' }, 'aa'), true);
});

test('maximum even splits require optimal cardinality and unique positive even summands', () => {
  const target = problem('maximumEvenSplit', [{name:'finalSum'}], 'long[]');
  const fixture = { input:'finalSum = 14', output:'[2,4,8]' };
  assert.equal(acceptsEquivalentFunctionOutput(target, fixture, '[6,2,6]'), false);
  assert.equal(acceptsEquivalentFunctionOutput(target, fixture, '[4,10]'), false);
  assert.equal(acceptsEquivalentFunctionOutput(target, fixture, '[8,4,2]'), true);
  assert.equal(acceptsEquivalentFunctionOutput(target, {input:'finalSum = 15',output:'[]'}, '[]'), true);
  assert.equal(acceptsEquivalentFunctionOutput(target, {input:'finalSum = 2',output:'[2]'}, '[0,2]'), false);
});

test('Euler arrangements must retain every edge and connect consecutive pairs', () => {
  const target=problem('validArrangement',[{name:'pairs'}],'integer[][]'), fixture={input:'pairs = [[1,2],[2,1],[1,3],[3,1]]',output:'[[1,2],[2,1],[1,3],[3,1]]'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[[1,3],[3,1],[1,2],[2,1]]'),true);
  for(const wrong of ['[[1,3],[1,2],[3,1],[2,1]]','[[1,3],[3,1]]','[[1,3],[3,1],[1,3],[3,1]]'])assert.equal(acceptsEquivalentFunctionOutput(target,fixture,wrong),false);
});

test('restored matrices must have exact nonnegative integer row and column sums', () => {
  const target=problem('restoreMatrix',[{name:'rowSum'},{name:'colSum'}],'integer[][]'), fixture={input:'rowSum = [3,3], colSum = [2,4]',output:'[[2,1],[0,3]]'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[[1,2],[1,2]]'),true);
  for(const wrong of ['[[1,2],[2,1]]','[[1,2,0],[1,2,0]]','[[-1,4],[3,0]]','[[0.5,2.5],[1.5,1.5]]'])assert.equal(acceptsEquivalentFunctionOutput(target,fixture,wrong),false);
});

test('missing binary strings must have the required length and be absent from input', () => {
  const target=problem('findDifferentBinaryString',[{name:'nums'}],'string'), fixture={input:'nums = ["00","01"]',output:'10'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'11'),true);
  for(const wrong of ['00','1','111','ab'])assert.equal(acceptsEquivalentFunctionOutput(target,fixture,wrong),false);
});

test('Gray codes require complete range coverage and one-bit adjacency including wraparound', () => {
  const target=problem('grayCode',[{name:'n'}],'integer[]'), fixture={input:'n = 2',output:'[0,1,3,2]'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[0,2,3,1]'),true);
  for(const wrong of ['[0,1,2,3]','[1,3,2,0]','[0,1,3,1]','[0,1,3]'])assert.equal(acceptsEquivalentFunctionOutput(target,fixture,wrong),false);
});

test('condition matrices retain all labels and both strict precedence relations', () => {
  const target=problem('buildMatrix',[{name:'k'},{name:'rowConditions'},{name:'colConditions'}],'integer[][]'), fixture={input:'k = 3, rowConditions = [[1,2]], colConditions = [[2,3]]',output:'[[0,1,0],[2,0,0],[0,0,3]]'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[[1,0,0],[0,2,3],[0,0,0]]'),true);
  for(const wrong of ['[]','[[1,0,0],[0,2,2],[0,0,3]]','[[0,2,3],[1,0,0],[0,0,0]]','[[1,0,0],[3,2,0],[0,0,0]]'])assert.equal(acceptsEquivalentFunctionOutput(target,fixture,wrong),false);
  assert.equal(acceptsEquivalentFunctionOutput(target,{input:'k = 2, rowConditions = [[1,2],[2,1]], colConditions = [[1,2]]',output:'[]'},'[]'),true);
});

test('accepts any valid Two Sum pair and proves the no-pair case', () => {
  const target = problem('twoSum', [{ name: 'nums' }, { name: 'target' }]);
  assert.equal(acceptsEquivalentFunctionOutput(target, {
    input: 'nums = [2, 7, 11, 15], target = 9', output: '[1, 0]',
  }, '[0, 1]'), true);
  assert.equal(acceptsEquivalentFunctionOutput(target, {
    input: 'nums = [1, 2], target = 7', output: 'None',
  }, '[]'), true);
  assert.equal(acceptsEquivalentFunctionOutput(target, {
    input: 'nums = [2, 7], target = 9', output: 'None',
  }, '[]'), false);
});

test('does not relax arbitrary array, null, or nested ordering comparisons', () => {
  const ordinary = problem('solve', [{ name: 'nums' }]);
  assert.equal(acceptsEquivalentFunctionOutput(ordinary, { input: 'nums = []', output: 'None' }, '[]'), false);
  assert.equal(acceptsEquivalentFunctionOutput(ordinary, { input: 'nums = []', output: '[[1, 2]]' }, '[[2, 1]]'), false);
});

test('preserves ordered pairs while allowing outer order for palindrome pairs', () => {
  const pairs = problem('palindromePairs', [{ name: 'words' }], 'integer[][]');
  const testCase = { input: 'words = ["bat", "tab"]', output: '[[0, 1], [1, 0]]' };
  assert.equal(acceptsEquivalentFunctionOutput(pairs, testCase, '[[1, 0], [0, 1]]'), true);
  assert.equal(acceptsEquivalentFunctionOutput(pairs, testCase, '[[0, 1], [0, 1]]'), false);
});

test('accepts alternate balanced BSTs only with the complete sorted input', () => {
  const target = problem('sortedListToBST', [{ name: 'head' }], 'tree-node');
  const testCase = { input: 'head = [1, 2, 3, 4]', output: '[3,2,4,1]' };
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, '[2,1,3,null,null,null,4]'), true);
  for (const invalid of ['[1,null,2,null,3,null,4]', '[2,3,1,null,null,null,4]', '[2,1,3]', '[2,1,3,null,null,null,5]', '[2,1,3,null,null,null,4,null,null,9]']) {
    assert.equal(acceptsEquivalentFunctionOutput(target, testCase, invalid), false, invalid);
  }
});

test('allows Word Break II sentence order while retaining every complete sentence', () => {
  const target = problem('wordBreak', [{ name: 's' }, { name: 'wordDict' }], 'string[]');
  const testCase = { input: 's = "catsanddog", wordDict = ["cat","cats","and","sand","dog"]', output: '["cats and dog","cat sand dog"]' };
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, '["cat sand dog","cats and dog"]'), true);
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, '["cat sand dog"]'), false);
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, '["cat sand dog","cat sand dog"]'), false);
});

test('compares JSON and Python array literals without relaxing values or order', () => {
  const target = problem('solve', [{ name: 'board' }], 'character[][]');
  const testCase = { input: 'board = [["X","O"]]', output: '[["X", "O"]]' };
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, "[['X', 'O']]"), true);
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, "[['O', 'X']]"), false);
});

test('compares typed floating arrays with tolerance while preserving shape and order', () => {
  const target = problem('calcEquation', [{ name: 'queries' }], 'double[]');
  const fixture = { input: 'queries = []', output: '[0.09090909090909091, -1]' };
  assert.equal(acceptsEquivalentFunctionOutput(target, fixture, '[0.0909090909090909, -1.0]'), true);
  for (const wrong of ['[0.0909091,-1]', '[-1,0.0909090909090909]', '[[0.0909090909090909],-1]', '[0.0909090909090909]']) {
    assert.equal(acceptsEquivalentFunctionOutput(target, fixture, wrong), false, wrong);
  }
  target.functionContract.returnType = 'double[][]';
  assert.equal(acceptsEquivalentFunctionOutput(target, { ...fixture, output: '[[0.09090909090909091],[-1]]' }, '[[0.0909090909090909],[-1.0]]'), true);
  target.functionContract.returnType = 'integer[]';
  assert.equal(acceptsEquivalentFunctionOutput(target, fixture, '[0.0909090909090909,-1]'), false);
});

test('allows Single Number III order and retains exact singleton multiplicities', () => {
  const target = problem('singleNumber', [{ name: 'nums' }], 'integer[]');
  const testCase = { input: 'nums = [1,2,1,3,2,5]', output: '[3,5]' };
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, '[5,3]'), true);
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, '[3,3]'), false);
});

test('normalizes quoted output only for the character return contract', () => {
  const target = problem('findTheDifference', [{ name: 's' }, { name: 't' }], 'character');
  const testCase = { input: 's = "ab", t = "abe"', output: 'e' };
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, "'e'"), true);
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, "'b'"), false);
});

test('accepts tied k-smallest pairs while proving minimum sums and pair availability', () => {
  const target = problem('kSmallestPairs', [{ name: 'nums1' }, { name: 'nums2' }, { name: 'k' }], 'integer[][]');
  const testCase = { input: 'nums1 = [1,2], nums2 = [1,2], k = 2', output: '[[1,1],[1,2]]' };
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, '[[2,1],[1,1]]'), true);
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, '[[1,1],[2,2]]'), false);
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, '[[1,1],[1,1]]'), false);
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, '[[0,2],[1,1]]'), false);
});

test('retains required frequency ordering for Top K Frequent Words', () => {
  const target = problem('topKFrequent', [{ name: 'words' }, { name: 'k' }], 'string[]');
  const testCase = { input: 'words = ["i","love","i","love","coding"], k = 2', output: '["i","love"]' };
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, '["love","i"]'), false);
});

test('verifies frequency-sort character counts and grouped frequency ordering', () => {
  const target = problem('frequencySort', [{ name: 's' }], 'string');
  const testCase = { input: 's = "tree"', output: 'eert' };
  assert.equal(acceptsEquivalentFunctionOutput(target, testCase, 'eetr'), true);
  for (const output of ['tree', 'etet', 'eeet']) assert.equal(acceptsEquivalentFunctionOutput(target, testCase, output), false);
});

test('proves construction properties instead of matching a single valid answer', () => {
  const arrange = problem('constructArray', [{ name: 'n' }, { name: 'k' }]);
  const testCase = { input: 'n = 3, k = 2', output: '[1,3,2]' };
  assert.equal(acceptsEquivalentFunctionOutput(arrange, testCase, '[3,1,2]'), true);
  assert.equal(acceptsEquivalentFunctionOutput(arrange, testCase, '[1,2,3]'), false);
  assert.equal(acceptsEquivalentFunctionOutput(arrange, testCase, '[1,3,1]'), false);
  const safe = problem('crackSafe', [{ name: 'n' }, { name: 'k' }], 'string');
  assert.equal(acceptsEquivalentFunctionOutput(safe, { input: 'n = 2, k = 2', output: '00110' }, '01100'), true);
  assert.equal(acceptsEquivalentFunctionOutput(safe, { input: 'n = 2, k = 2', output: '00110' }, '00100'), false);
});

test('accepts advantage permutations only when they maximize wins using the original multiset', () => {
  const target = problem('advantageCount', [{ name: 'nums1' }, { name: 'nums2' }], 'integer[]');
  const fixture = { input: 'nums1 = [2,3,4], nums2 = [1,2,5]', output: '[2,3,4]' };
  assert.equal(acceptsEquivalentFunctionOutput(target, fixture, '[3,4,2]'), true);
  assert.equal(acceptsEquivalentFunctionOutput(target, fixture, '[4,2,3]'), false);
  assert.equal(acceptsEquivalentFunctionOutput(target, fixture, '[3,4,4]'), false);
});

test('normalizes boolean spelling only for declared boolean output', () => {
  const target = problem('isValid', [{name:'s'}], 'boolean'), fixture={input:'s = "abc"',output:'true'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'True'),true);
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'False'),false);
  target.functionContract.returnType='string';
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'True'),false);
});

test('validates parity grouping and preserves every original occurrence', () => {
  const target=problem('sortArrayByParity',[{name:'nums'}],'integer[]'), fixture={input:'nums = [3,1,2,4]',output:'[4,2,1,3]'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[2,4,3,1]'),true);
  for(const value of ['[2,3,4,1]','[2,4,3,3]','[2,4]']) assert.equal(acceptsEquivalentFunctionOutput(target,fixture,value),false);
  target.functionContract.methodName='sortArrayByParityII';
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[2,3,4,1]'),true);
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[2,4,3,1]'),false);
});

test('validates distance order and complete matrix coverage with arbitrary tied cells', () => {
  const target=problem('allCellsDistOrder',[{name:'rows'},{name:'cols'},{name:'rCenter'},{name:'cCenter'}],'integer[][]'), fixture={input:'rows = 2, cols = 2, rCenter = 0, cCenter = 0',output:'[[0,0],[0,1],[1,0],[1,1]]'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[[0,0],[1,0],[0,1],[1,1]]'),true);
  for(const value of ['[[0,0],[0,1],[1,1],[1,0]]','[[0,0],[1,0],[1,0],[1,1]]','[[0,0],[1,0]]']) assert.equal(acceptsEquivalentFunctionOutput(target,fixture,value),false);
});

test('validates reorganized character counts, adjacency, and impossibility', () => {
  const target=problem('reorganizeString',[{name:'s'}],'string'), fixture={input:'s = "aabb"',output:'abab'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'baba'),true);
  for(const value of ['abba','abac','']) assert.equal(acceptsEquivalentFunctionOutput(target,fixture,value),false);
  assert.equal(acceptsEquivalentFunctionOutput(target,{input:'s = "aaaab"',output:''},''),true);
});

test('accepts alternate shortest superstrings only with all words and optimal length', () => {
  const target=problem('shortestSuperstring',[{name:'words'}],'string');
  const fixture={input:'words = ["ab","ba"]',output:'aba'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'bab'),true);
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'abba'),false);
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'aba'.slice(0,2)),false);
  assert.equal(acceptsEquivalentFunctionOutput(target,{input:'words = ["abc","b","abc"]',output:'abc'},'abc'),true);
});

test('accepts candy swaps only from the available bags and with equal resulting totals', () => {
  const target=problem('fairCandySwap',[{name:'aliceSizes'},{name:'bobSizes'}],'integer[]');
  const fixture={input:'aliceSizes = [1,2], bobSizes = [2,3]',output:'[1,2]'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[2,3]'),true);
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[1,3]'),false);
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[3,4]'),false);
});

test('accepts any strict peak with negative-infinity boundaries', () => {
  const target=problem('findPeakElement',[{name:'nums'}],'integer');
  const fixture={input:'nums = [3,1,2]',output:'0'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'2'),true);
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'1'),false);
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'3'),false);
});

test('allows documented factor/process/group ordering while retaining contents and factor order', () => {
  const factors=problem('getFactors',[{name:'n'}],'integer[][]'), fixture={input:'n = 12',output:'[[2,6],[2,2,3],[3,4]]'};
  assert.equal(acceptsEquivalentFunctionOutput(factors,fixture,'[[3,4],[2,6],[2,2,3]]'),true);
  assert.equal(acceptsEquivalentFunctionOutput(factors,fixture,'[[4,3],[2,6],[2,2,3]]'),false);
  const groups=problem('groupStrings',[{name:'strings'}],'string[][]'), groupCase={input:'strings = ["abc","bcd","a"]',output:'[["abc","bcd"],["a"]]'};
  assert.equal(acceptsEquivalentFunctionOutput(groups,groupCase,'[["a"],["bcd","abc"]]'),true);
  assert.equal(acceptsEquivalentFunctionOutput(groups,groupCase,'[["a","abc"],["bcd"]]'),false);
  const process=problem('killProcess',[{name:'pid'},{name:'ppid'},{name:'kill'}],'integer[]'), processCase={input:'pid = [1,2], ppid = [0,1], kill = 1',output:'[1,2]'};
  assert.equal(acceptsEquivalentFunctionOutput(process,processCase,'[2,1]'),true);
  assert.equal(acceptsEquivalentFunctionOutput(process,processCase,'[2,2]'),false);
});

test('distinguishes nonstrict Wiggle Sort from strict Wiggle Sort II',()=>{
  const target=problem('wiggleSort',[{name:'nums'}],'integer[]'), fixture={input:'nums = [1,1,2]',output:'[1,2,1]'};
  target.title='Wiggle Sort';
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[1,1,2]'),false);
  assert.equal(acceptsEquivalentFunctionOutput(target,{input:'nums = [1,1,1]',output:'[1,1,1]'},'[1,1,1]'),true);
  target.title='Wiggle Sort II';
  assert.equal(acceptsEquivalentFunctionOutput(target,{input:'nums = [1,1,1]',output:'[1,1,1]'},'[1,1,1]'),false);
});

test('accepts BST deletion with alternate replacement choices and exact retained keys',()=>{
  const target=problem('deleteNode',[{name:'root'},{name:'key'}],'tree-node'), fixture={input:'root = [5,3,7,2,4,6,8], key = 5',output:'[6,3,7,2,4,null,8]'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[4,3,7,2,null,6,8]'),true);
  for(const wrong of ['[4,3,7,2,null,5,8]','[4,7,3,2,null,6,8]','[4,3,7,2,null,6,8,null,null,9]'])assert.equal(acceptsEquivalentFunctionOutput(target,fixture,wrong),false);
  assert.equal(acceptsEquivalentFunctionOutput(target,{input:'root = [1], key = 1',output:'None'},'[]'),true);
});

test('accepts any balanced BST retaining all valid source tree keys',()=>{
  const target=problem('balanceBST',[{name:'root'}],'tree-node'), fixture={input:'root = [1,null,2,null,3,null,4]',output:'[3,2,4,1]'};
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[2,1,3,null,null,null,4]'),true);
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[1,null,2,null,3,null,4]'),false);
  assert.equal(acceptsEquivalentFunctionOutput(target,fixture,'[2,1,4]'),false);
  assert.equal(acceptsEquivalentFunctionOutput(target,{input:'root = [2,3,1]',output:'[2,1,3]'},'[2,1,3]'),false);
});
