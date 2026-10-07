import { acceptsSourceScopedUnorderedOutput } from './sourceScopedUnorderedOutputService.js';
import { acceptsAdditionalOutputProperty } from './additionalOutputPropertyService.js';
import { acceptsRootFlexibleOutput } from './flexibleOutputPropertyService.js';
import { buildFunctionInputPayload, parseFunctionTestInput } from './functionTestInputService.js';

function parseArrayOutput(value) {
  try {
    const parsed = parseFunctionTestInput(String(value || '').trim());
    return parsed.positional.length === 1 && Array.isArray(parsed.positional[0])
      ? parsed.positional[0]
      : null;
  } catch {
    return null;
  }
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sortArray(values) {
  return [...values].sort((left, right) => stable(left).localeCompare(stable(right)));
}

function sameOuterCollection(actual, expected, normalizeEntry = (entry) => entry) {
  return stable(sortArray(actual.map(normalizeEntry))) === stable(sortArray(expected.map(normalizeEntry)));
}

function twoSumEquivalent(args, actual, expectedText) {
  const values = Array.isArray(args[0]) ? args[0] : [];
  const target = Number(args[1]);
  const indices = parseArrayOutput(actual);
  if (!Array.isArray(indices)) return false;
  if (indices.length === 0) {
    if (!['None', '[]'].includes(expectedText)) return false;
    for (let left = 0; left < values.length; left += 1) {
      for (let right = left + 1; right < values.length; right += 1) {
        if (Number(values[left]) + Number(values[right]) === target) return false;
      }
    }
    return true;
  }
  return indices.length === 2
    && indices[0] !== indices[1]
    && indices.every((index) => Number.isInteger(index) && index >= 0 && index < values.length)
    && Number(values[indices[0]]) + Number(values[indices[1]]) === target;
}

function wiggleEquivalent(args, actual, strict = true) {
  const values = parseArrayOutput(actual);
  const input = Array.isArray(args[0]) ? args[0] : [];
  if (!Array.isArray(values) || values.length !== input.length) return false;
  const actualSorted = [...values].sort((left, right) => Number(left) - Number(right));
  const inputSorted = [...input].sort((left, right) => Number(left) - Number(right));
  const sameValues = actualSorted.every((value, index) => value === inputSorted[index]);
  return sameValues && values.every((value, index) => index === 0
    || (index % 2 === 1 ? (strict ? value > values[index - 1] : value >= values[index - 1]) : (strict ? value < values[index - 1] : value <= values[index - 1])));
}

function strictSearchTreeValues(values) {
  if (!Array.isArray(values)) return null;
  if (!values.length || values[0] === null) return values.every(v => v === null) ? [] : null;
  const root = { value: values[0] }, queue = [root]; let cursor = 1;
  for (let i = 0; i < queue.length && cursor < values.length; i++) for (const side of ['left', 'right']) {
    const value = values[cursor++];
    if (value === undefined || value === null) continue;
    queue[i][side] = { value }; queue.push(queue[i][side]);
  }
  if (values.slice(cursor).some(v => v !== null)) return null;
  const ordered = [], stack = []; let node = root;
  while (node || stack.length) {
    while (node) { stack.push(node); node = node.left; }
    node = stack.pop(); ordered.push(node.value); node = node.right;
  }
  return ordered.every((v, i) => Number.isInteger(v) && (!i || v > ordered[i - 1])) ? ordered : null;
}

function balancedSearchTreeEquivalent(args, actualText) {
  const input = args[0];
  const values = parseArrayOutput(actualText);
  if (!Array.isArray(input) || !Array.isArray(values)) return false;
  if (!input.length) return values.length === 0 || values.every((value) => value === null);
  if (!values.length || values[0] === null) return false;
  const root = { value: values[0] };
  const queue = [root];
  let cursor = 1;
  for (let index = 0; index < queue.length && cursor < values.length; index += 1) {
    for (const side of ['left', 'right']) {
      const value = values[cursor++];
      if (value === null || value === undefined) continue;
      queue[index][side] = { value };
      queue.push(queue[index][side]);
    }
  }
  if (values.slice(cursor).some((value) => value !== null)) return false;
  if (queue.length !== input.length) return false;
  const ordered = [];
  const stack = [];
  let node = root;
  while (node || stack.length) {
    while (node) { stack.push(node); node = node.left; }
    node = stack.pop();
    ordered.push(node.value);
    node = node.right;
  }
  if (!ordered.every((value, index) => Number.isFinite(value) && value === input[index]
    && (index === 0 || value >= ordered[index - 1]))) return false;
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const current = queue[index];
    const leftHeight = current.left?.height || 0;
    const rightHeight = current.right?.height || 0;
    if (Math.abs(leftHeight - rightHeight) > 1) return false;
    current.height = 1 + Math.max(leftHeight, rightHeight);
  }
  return true;
}

function kSmallestPairsEquivalent(args, actualText) {
  const [left, right, requested] = args;
  const actual = parseArrayOutput(actualText);
  if (!Array.isArray(left) || !Array.isArray(right) || !Array.isArray(actual) || !Number.isInteger(requested) || requested < 0) return false;
  if ([left, right].some((values) => values.some((value, index) => !Number.isFinite(value) || (index > 0 && value < values[index - 1])))) return false;
  const count = Math.min(requested, left.length * right.length);
  if (actual.length !== count || count > 10000) return false;
  const occurrences = (values) => {
    const result = new Map();
    for (const value of values) result.set(value, (result.get(value) || 0) + 1);
    return result;
  };
  const leftCounts = occurrences(left), rightCounts = occurrences(right), used = new Map();
  for (const pair of actual) {
    if (!Array.isArray(pair) || pair.length !== 2 || !leftCounts.has(pair[0]) || !rightCounts.has(pair[1])) return false;
    const key = JSON.stringify(pair);
    used.set(key, (used.get(key) || 0) + 1);
    if (used.get(key) > leftCounts.get(pair[0]) * rightCounts.get(pair[1])) return false;
  }
  if (!count) return true;
  const heap = [];
  const push = (node) => {
    heap.push(node);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent].sum <= node.sum) break;
      heap[index] = heap[parent]; index = parent;
    }
    heap[index] = node;
  };
  const pop = () => {
    const result = heap[0], tail = heap.pop();
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].sum < heap[child].sum) child++;
        if (heap[child].sum >= tail.sum) break;
        heap[index] = heap[child]; index = child;
      }
      heap[index] = tail;
    }
    return result;
  };
  for (let row = 0; row < Math.min(left.length, count); row++) push({ row, column: 0, sum: left[row] + right[0] });
  const actualSums = actual.map(([a, b]) => a + b).sort((a, b) => a - b);
  for (let index = 0; index < count; index++) {
    const next = pop();
    if (actualSums[index] !== next.sum) return false;
    if (next.column + 1 < right.length) push({ row: next.row, column: next.column + 1, sum: left[next.row] + right[next.column + 1] });
  }
  return true;
}

function validThresholdSubarray(args, actualText) {
 const [nums,threshold]=args;
 if(!Array.isArray(nums)||!nums.length||!nums.every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isSafeInteger(threshold)||threshold<0||!/^(-1|[1-9]\d*)$/.test(actualText))return false;
 const length=Number(actualText);if(!Number.isSafeInteger(length)||length>nums.length)return false;
 const enough=(minimum,width)=>BigInt(minimum)*BigInt(width)>BigInt(threshold);
 if(length===-1){
  const stack=[];
  for(let i=0;i<=nums.length;i++){
   while(stack.length&&(i===nums.length||nums[stack[stack.length-1]]>=nums[i])){
    const at=stack.pop(),width=i-(stack.length?stack[stack.length-1]:-1)-1;
    if(enough(nums[at],width))return false;
   }
   if(i<nums.length)stack.push(i);
  }return true;
 }
 const deque=[];let head=0;
 for(let i=0;i<nums.length;i++){
  while(deque.length>head&&nums[deque[deque.length-1]]>=nums[i])deque.pop();
  deque.push(i);while(deque[head]<=i-length)head++;
  if(i>=length-1&&enough(nums[deque[head]],length))return true;
 }return false;
}
function validCharacterPairRearrangement(args,actualText){
 const [s,x,y]=args;if(typeof s!=='string'||typeof x!=='string'||typeof y!=='string'||x.length!==1||y.length!==1||x===y)return false;
 let output=actualText;
 if(/^['"]/.test(actualText)){try{const values=parseFunctionTestInput(actualText).positional;if(values.length!==1||typeof values[0]!=='string')return false;output=values[0];}catch{return false;}}
 if(output.length!==s.length||[...output].sort().join('')!==[...s].sort().join(''))return false;
 const firstX=output.indexOf(x),lastY=output.lastIndexOf(y);return firstX<0||lastY<0||lastY<firstX;
}

/**
 * Accepts a different textual output only when the problem-specific property
 * can be verified from the testcase input. This must remain an allow-list: a
 * generic array, null/empty, or ordering relaxation can hide a bad oracle.
 */
export function acceptsEquivalentFunctionOutput(problem, testCase, actualOutput) {
  const expectedText = String(testCase?.output || '').trim();
  const actualText = String(actualOutput || '').trim();
  const methodName = String(problem?.functionContract?.methodName || '').toLowerCase();
  let args;
  try {
    args = buildFunctionInputPayload(testCase?.input || '', problem?.functionContract || {}).args;
  } catch {
    return false;
  }

  const sourceScopedOrder = acceptsSourceScopedUnorderedOutput(problem, actualText, expectedText);
  if (sourceScopedOrder !== null) return sourceScopedOrder;

  const inputProperty = acceptsAdditionalOutputProperty(problem?.functionContract?.methodName, args, actualText);
  if (inputProperty !== null) return inputProperty;
  const flexibleProperty = acceptsRootFlexibleOutput(problem, args, actualText, expectedText);
  if (flexibleProperty !== null) return flexibleProperty;

  if (methodName === 'validsubarraysize' && problem?.functionContract?.returnType === 'integer') return validThresholdSubarray(args, actualText);
  if (methodName === 'rearrangestring' && problem?.title === 'Rearrange String to Avoid Character Pair') return validCharacterPairRearrangement(args, actualText);

  if (['boolean', 'bool'].includes(problem?.functionContract?.returnType)) {
    if (/^(true|false)$/i.test(actualText) && /^(true|false)$/i.test(expectedText)) {
      return actualText.toLowerCase() === expectedText.toLowerCase();
    }
  }
  if (['sortarraybyparity', 'sortarraybyparityii'].includes(methodName)) {
    const values = parseArrayOutput(actualText), input = args[0];
    if (!Array.isArray(values) || !Array.isArray(input) || !values.every(Number.isInteger)
      || !sameOuterCollection(values, input)) return false;
    if (methodName.endsWith('ii')) return values.every((value, index) => Math.abs(value % 2) === index % 2);
    let seenOdd = false;
    for (const value of values) {
      if (value % 2) seenOdd = true;
      else if (seenOdd) return false;
    }
    return true;
  }
  if (methodName === 'allcellsdistorder') {
    const [rows, columns, originRow, originColumn] = args, values = parseArrayOutput(actualText);
    if (![rows, columns, originRow, originColumn].every(Number.isInteger)
      || rows < 1 || columns < 1 || !Array.isArray(values) || values.length !== rows * columns) return false;
    const seen = new Set(); let previous = -1;
    for (const pair of values) {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isInteger)
        || pair[0] < 0 || pair[0] >= rows || pair[1] < 0 || pair[1] >= columns) return false;
      const key = JSON.stringify(pair), distance = Math.abs(pair[0] - originRow) + Math.abs(pair[1] - originColumn);
      if (seen.has(key) || distance < previous) return false;
      seen.add(key); previous = distance;
    }
    return true;
  }
  if (methodName === 'reorganizestring') {
    const input = String(args[0] || ''), counts = new Map();
    for (const c of input) counts.set(c, (counts.get(c) || 0) + 1);
    if (!actualText) return Math.max(0, ...counts.values()) > Math.ceil(input.length / 2);
    return sameOuterCollection([...input], [...actualText])
      && [...actualText].every((c, index) => index === 0 || c !== actualText[index - 1]);
  }
  if (methodName === 'longestdiversestring' && problem?.functionContract?.returnType === 'string') {
    if (args.length !== 3 || !args.every(value => Number.isInteger(value) && value >= 0)) return false;
    const counts = [0, 0, 0];
    for (const character of actualText) {
      const index = 'abc'.indexOf(character);
      if (index < 0 || ++counts[index] > args[index]) return false;
    }
    if (/(.)\1\1/.test(actualText)) return false;
    const total = args.reduce((sum, value) => sum + value, 0), others = total - Math.max(...args);
    return actualText.length === Math.min(total, 3 * others + 2);
  }
  if (methodName === 'maximumevensplit') {
    const values = parseArrayOutput(actualText), sum = args[0];
    if (!Number.isSafeInteger(sum) || sum < 1 || !Array.isArray(values)) return false;
    if (sum % 2) return values.length === 0;
    if (!values.every(value => Number.isSafeInteger(value) && value > 0 && value % 2 === 0)
      || new Set(values).size !== values.length || values.reduce((total, value) => total + value, 0) !== sum) return false;
    const count = values.length;
    return count * (count + 1) <= sum && (count + 1) * (count + 2) > sum;
  }
  if (methodName === 'validarrangement') {
    const values = parseArrayOutput(actualText), input = args[0];
    return Array.isArray(input) && Array.isArray(values)
      && values.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isSafeInteger))
      && sameOuterCollection(values, input)
      && values.every((pair, i) => !i || values[i - 1][1] === pair[0]);
  }
  if (methodName === 'restorematrix') {
    const [rows, columns] = args, matrix = parseArrayOutput(actualText);
    return Array.isArray(rows) && Array.isArray(columns) && Array.isArray(matrix)
      && matrix.length === rows.length
      && matrix.every((row, i) => Array.isArray(row) && row.length === columns.length
        && row.every(value => Number.isSafeInteger(value) && value >= 0)
        && row.reduce((sum, value) => sum + value, 0) === rows[i])
      && columns.every((sum, j) => matrix.reduce((total, row) => total + row[j], 0) === sum);
  }
  if (methodName === 'finddifferentbinarystring') {
    const input = args[0];
    return Array.isArray(input) && input.length >= 1 && input.length <= 16
      && actualText.length === input.length && /^[01]+$/.test(actualText) && !input.includes(actualText);
  }
  if (methodName === 'graycode') {
    const n = args[0], values = parseArrayOutput(actualText);
    if (!Number.isInteger(n) || n < 1 || n > 16 || !Array.isArray(values) || values.length !== 2 ** n
      || values[0] !== 0 || new Set(values).size !== values.length
      || !values.every(value => Number.isInteger(value) && value >= 0 && value < 2 ** n)) return false;
    return values.every((value, i) => { const bits = value ^ values[(i + 1) % values.length]; return bits !== 0 && (bits & (bits - 1)) === 0; });
  }
  if (methodName === 'buildmatrix') {
    const [k, rowConditions, colConditions] = args, matrix = parseArrayOutput(actualText);
    if (!Number.isInteger(k) || k < 1 || k > 400 || !Array.isArray(matrix)
      || ![rowConditions, colConditions].every(conditions => Array.isArray(conditions)
        && conditions.every(pair => Array.isArray(pair) && pair.length === 2
          && pair.every(value => Number.isInteger(value) && value >= 1 && value <= k)))) return false;
    if (!matrix.length) {
      const acyclic = conditions => {
        const edges = Array.from({length:k + 1}, () => []), indegrees = Array(k + 1).fill(0);
        for (const [a, b] of conditions) { edges[a].push(b); indegrees[b]++; }
        const queue = Array.from({length:k}, (_, i) => i + 1).filter(value => !indegrees[value]);
        for (let i = 0; i < queue.length; i++) for (const next of edges[queue[i]]) if (--indegrees[next] === 0) queue.push(next);
        return queue.length === k;
      };
      return !acyclic(rowConditions) || !acyclic(colConditions);
    }
    if (matrix.length !== k || !matrix.every(row => Array.isArray(row) && row.length === k)) return false;
    const positions = new Map();
    for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) {
      const value = matrix[r][c];
      if (!Number.isInteger(value) || value < 0 || value > k || (value && positions.has(value))) return false;
      if (value) positions.set(value, [r,c]);
    }
    return positions.size === k
      && rowConditions.every(([a,b]) => positions.get(a)[0] < positions.get(b)[0])
      && colConditions.every(([a,b]) => positions.get(a)[1] < positions.get(b)[1]);
  }
  if (methodName === 'shortestsuperstring') {
    if (!Array.isArray(args[0]) || !args[0].every(w => typeof w === 'string') || args[0].length > 12) return false;
    const unique = [...new Set(args[0])];
    const words = unique.filter((word, i) => !unique.some((other, j) => i !== j && other.includes(word)));
    if (!words.every(word => actualText.includes(word))) return false;
    if (!words.length) return actualText === '';
    const count = words.length, overlap = words.map(a => words.map(b => {
      for (let k = Math.min(a.length, b.length); k >= 1; k--) if (a.endsWith(b.slice(0, k))) return k;
      return 0;
    }));
    const costs = Array.from({length: 1 << count}, () => Array(count).fill(Infinity));
    for (let i = 0; i < count; i++) costs[1 << i][i] = words[i].length;
    for (let mask = 1; mask < costs.length; mask++) for (let end = 0; end < count; end++) {
      if (!Number.isFinite(costs[mask][end])) continue;
      for (let next = 0; next < count; next++) if (!(mask & (1 << next))) {
        const after = mask | (1 << next);
        costs[after][next] = Math.min(costs[after][next], costs[mask][end] + words[next].length - overlap[end][next]);
      }
    }
    return actualText.length === Math.min(...costs.at(-1));
  }
  if (methodName === 'faircandyswap') {
    const [a, b] = args, pair = parseArrayOutput(actualText);
    if (!Array.isArray(a) || !Array.isArray(b) || !Array.isArray(pair) || pair.length !== 2
      || !a.includes(pair[0]) || !b.includes(pair[1])) return false;
    return a.reduce((s, n) => s + n, 0) - pair[0] + pair[1] === b.reduce((s, n) => s + n, 0) - pair[1] + pair[0];
  }
  if (methodName === 'findpeakelement') {
    const nums = args[0], index = Number(actualText);
    return Array.isArray(nums) && /^\d+$/.test(actualText) && Number.isInteger(index) && index < nums.length
      && (index === 0 || nums[index] > nums[index - 1]) && (index === nums.length - 1 || nums[index] > nums[index + 1]);
  }

  if (methodName === 'twosum') return twoSumEquivalent(args, actualText, expectedText);
  if (methodName === 'advantagecount') {
    const [left, right] = args, values = parseArrayOutput(actualText);
    if (![left, right, values].every(Array.isArray) || left.length !== right.length
      || values.length !== left.length || ![...left, ...right, ...values].every(Number.isFinite)
      || !sameOuterCollection(left, values)) return false;
    const sortedLeft = [...left].sort((a, b) => a - b), sortedRight = [...right].sort((a, b) => a - b);
    let maximum = 0;
    for (const value of sortedLeft) if (value > sortedRight[maximum]) maximum++;
    return values.filter((value, index) => value > right[index]).length === maximum;
  }
  if (methodName === 'ksmallestpairs') return kSmallestPairsEquivalent(args, actualText);
  if (methodName === 'sortedlisttobst' || methodName === 'sortedarraytobst') {
    return balancedSearchTreeEquivalent(args, actualText);
  }
  if (methodName === 'balancebst') {
    const input = strictSearchTreeValues(args[0]);
    return input !== null && balancedSearchTreeEquivalent([input], actualText);
  }
  if (methodName === 'wigglesort' || methodName === 'wigglesortii') return wiggleEquivalent(args, actualText, String(problem.title || '').trim().toLowerCase() !== 'wiggle sort');
  if (methodName === 'deletenode' && ['tree-node', 'tree', 'treenode'].includes(String(problem?.functionContract?.returnType).toLowerCase())) {
    const original = strictSearchTreeValues(args[0]);
    const actual = /^(none|null)$/i.test(actualText) ? [] : strictSearchTreeValues(parseArrayOutput(actualText));
    if (!original || !actual || !Number.isInteger(args[1])) return false;
    const remaining = original.filter(value => value !== args[1]);
    return stable(actual) === stable(remaining);
  }
  if (methodName === 'frequencySort'.toLowerCase() && problem?.functionContract?.returnType === 'string') {
    const source = String(args[0] || '');
    const counts = new Map();
    for (const character of source) counts.set(character, (counts.get(character) || 0) + 1);
    if ([...actualText].length !== [...source].length) return false;
    let previousCount = Infinity;
    const seen = new Set();
    const blocks = actualText.match(/(.)\1*/gs) || [];
    for (const block of blocks) {
      const character = block[0], count = [...block].length;
      if (seen.has(character) || count !== counts.get(character) || count > previousCount) return false;
      seen.add(character); previousCount = count;
    }
    return seen.size === counts.size;
  }
  if (methodName === 'constructarray') {
    const values = parseArrayOutput(actualText), [n, k] = args;
    if (!Array.isArray(values) || values.length !== n || new Set(values).size !== n
      || !values.every((value) => Number.isInteger(value) && value >= 1 && value <= n)) return false;
    return new Set(values.slice(1).map((value, index) => Math.abs(value - values[index]))).size === k;
  }
  if (methodName === 'cracksafe') {
    const [n, k] = args, size = k ** n;
    if (!Number.isInteger(n) || !Number.isInteger(k) || n < 1 || k < 1 || k > 10 || size > 4096
      || actualText.length !== size + n - 1 || ![...actualText].every((character) => /^\d$/.test(character) && Number(character) < k)) return false;
    const passwords = new Set();
    for (let index = 0; index <= actualText.length - n; index++) passwords.add(actualText.slice(index, index + n));
    return passwords.size === size;
  }
  if (methodName === 'longestpalindrome') {
    const source = String(args[0] || '');
    return actualText.length === expectedText.length
      && source.includes(actualText)
      && actualText === [...actualText].reverse().join('');
  }

  const actual = parseArrayOutput(actualText);
  const expected = parseArrayOutput(expectedText);
  if (problem?.functionContract?.returnType === 'string') {
    try {
      const parsed = parseFunctionTestInput(expectedText).positional;
      if (parsed.length === 1 && typeof parsed[0] === 'string' && actualText === parsed[0]) return true;
    } catch { /* Raw expected strings are compared by the ordinary comparator. */ }
  }
  // Python literals and JSON encode the same arrays differently. Preserve all
  // element values, multiplicities and ordering when comparing their data.
  if (Array.isArray(actual) && Array.isArray(expected) && stable(actual) === stable(expected)) return true;
  const floatingArrayType = String(problem?.functionContract?.returnType || '').toLowerCase();
  if (/^(double|float)\[\](\[\])?$/.test(floatingArrayType)) {
    const depth = floatingArrayType.endsWith('[][]') ? 2 : 1;
    const close = (left, right, remaining) => {
      if (remaining > 0) return Array.isArray(left) && Array.isArray(right)
        && left.length === right.length
        && left.every((value, index) => close(value, right[index], remaining - 1));
      return typeof left === 'number' && typeof right === 'number'
        && Number.isFinite(left) && Number.isFinite(right)
        && Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
    };
    if (close(actual, expected, depth)) return true;
  }
  if (['character', 'char'].includes(problem?.functionContract?.returnType)) {
    try {
      const parsed = parseFunctionTestInput(actualText).positional;
      if (parsed.length === 1 && typeof parsed[0] === 'string' && parsed[0].length === 1) {
        return parsed[0] === expectedText;
      }
    } catch { /* Unquoted characters are handled by the ordinary comparator. */ }
  }
  if (!Array.isArray(actual) || !Array.isArray(expected)) return false;

  const outerOrderOnly = new Set([
    'findrepeateddnasequences', 'permute', 'permuteunique', 'palindromepairs', 'pacificatlantic',
    'diffwaystocompute', 'findminheighttrees', 'removeinvalidparentheses', 'findladders',
    'lettercombinations', 'generateparenthesis', 'restoreipaddresses', 'readbinarywatch',
    'findduplicates', 'finddisappearednumbers', 'findrestaurant', 'outertrees',
    'accountsmerge', 'ambiguouscoordinates', 'uncommonfromsentences',
    'killprocess', 'getfactors',
    'validstrings', 'getgoodindices',
    'lettercasepermutation', 'findsubsequences',
  ]);
  if (outerOrderOnly.has(methodName)) return sameOuterCollection(actual, expected);
  if (methodName === 'partition' && problem?.functionContract?.returnType === 'string[][]') return sameOuterCollection(actual, expected);
  if (methodName === 'wordbreak' && problem?.functionContract?.returnType === 'string[]') {
    return actual.every((entry) => typeof entry === 'string') && sameOuterCollection(actual, expected);
  }
  if (methodName === 'singlenumber' && problem?.functionContract?.returnType === 'integer[]') {
    return actual.every(Number.isInteger) && sameOuterCollection(actual, expected);
  }

  const scalarSet = new Set(['majorityelement', 'findwords', 'intersection', 'intersect', 'findfrequentsubtreesum']);
  if (scalarSet.has(methodName)) return sameOuterCollection(actual, expected);
  if (methodName === 'topkfrequent' && problem?.title === 'Top K Frequent Elements' && problem?.functionContract?.returnType === 'integer[]') return sameOuterCollection(actual, expected);

  const setOfSets = new Set(['subsets', 'subsetswithdup', 'groupanagrams', 'groupstrings', 'combine', 'combinationsum', 'combinationsum2', 'combinationsum3']);
  if (methodName === 'findduplicate' && problem?.functionContract?.returnType === 'string[][]') setOfSets.add(methodName);
  if (setOfSets.has(methodName)) {
    return sameOuterCollection(actual, expected, (entry) => (Array.isArray(entry) ? sortArray(entry) : entry));
  }

  return false;
}
