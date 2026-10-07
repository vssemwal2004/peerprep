// PeerPrep canonical node collections.
import { USER_CODE_PLACEHOLDER } from './functionProblemAdapterService.js';

const ARGUMENTS_JSON_STRING_PLACEHOLDER = '{{ARGUMENTS_JSON_STRING}}';

function cleanIdentifier(value, fallback) {
  const normalized = String(value || '').trim();
  return /^[A-Za-z_$][\w$]*$/.test(normalized) ? normalized : fallback;
}

function stripCStyleComments(value) {
  return String(value || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '');
}

function pythonRunner(functionContract) {
  const methodName = cleanIdentifier(functionContract?.methodName, 'solve');
  const className = cleanIdentifier(functionContract?.className, 'Solution');
  const parameterTypes = (functionContract?.parameters || []).map((parameter) => String(parameter?.type || 'any'));
  const outputMode = functionContract?.outputMode === 'parameter' ? 'parameter' : 'return';
  const outputParameterIndex = Math.max(0, Number(functionContract?.outputParameterIndex || 0));
  const outputDeclaredType = outputMode === 'parameter'
    ? parameterTypes[outputParameterIndex] || 'any'
    : String(functionContract?.returnType || 'any');
  const result = outputMode === 'parameter'
    ? `getattr(${className}(), ${JSON.stringify(methodName)})(*__pp_args)\n__pp_result = __pp_args[${outputParameterIndex}]`
    : `__pp_result = getattr(${className}(), ${JSON.stringify(methodName)})(*__pp_args)`;
  const outputType = outputMode === 'parameter'
    ? parameterTypes[outputParameterIndex] || 'any'
    : String(functionContract?.returnType || 'any');
  return `from __future__ import annotations
from typing import *
from collections import *
from functools import *
from itertools import *
from math import *
from builtins import pow
from heapq import *
from bisect import *
import json as __pp_json

# PeerPrep Python 3.8 compatible standard library aliases.
try:
    cache
except NameError:
    cache = lru_cache(maxsize=None)

try:
    pairwise
except NameError:
    def pairwise(values):
        iterator = iter(values)
        try: previous = next(iterator)
        except StopIteration: return
        for current in iterator:
            yield previous, current
            previous = current

class ListNode:
    def __init__(self, val=0, next=None): self.val, self.next = val, next
class TreeNode:
    def __init__(self, val=0, left=None, right=None): self.val, self.left, self.right = val, left, right

${USER_CODE_PLACEHOLDER}

# PeerPrep private runner. This block is never returned to students.
def __pp_list(values):
    dummy = ListNode(); tail = dummy
    for value in values or []: tail.next = ListNode(value); tail = tail.next
    return dummy.next

def __pp_tree(values):
    if not values: return None
    root = TreeNode(values[0]); queue = [root]; index = 1
    while queue and index < len(values):
        node = queue.pop(0)
        if index < len(values) and values[index] is not None: node.left = TreeNode(values[index]); queue.append(node.left)
        index += 1
        if index < len(values) and values[index] is not None: node.right = TreeNode(values[index]); queue.append(node.right)
        index += 1
    return root

def __pp_convert(value, declared_type):
    normalized = str(declared_type or 'any').lower()
    if normalized in ('list-node', 'listnode'): return __pp_list(value)
    if normalized in ('tree-node', 'treenode'): return __pp_tree(value)
    if normalized.endswith('[]') and isinstance(value, list): return [__pp_convert(entry, normalized[:-2]) for entry in value]
    return value

def __pp_format(value, declared_type=''):
    normalized = str(declared_type or '').lower()
    if normalized in ('list-node', 'listnode'):
        result, seen = [], set()
        while value is not None and id(value) not in seen: seen.add(id(value)); result.append(value.val); value = value.next
        return str(result) if result else 'None'
    if normalized in ('tree-node', 'treenode'):
        if value is None: return 'None'
        result, queue = [], [value]
        while queue:
            node = queue.pop(0)
            if node is None: result.append(None); continue
            result.append(node.val); queue.extend((node.left, node.right))
        while result and result[-1] is None: result.pop()
        return str(result)
    if normalized in ('tree-node[]', 'list-node[]'):
        child_type = normalized[:-2]
        return '[' + ', '.join('[]' if node is None else __pp_format(node, child_type) for node in value) + ']'
    if value is None: return 'None'
    return str(value)

__pp_raw_args = __pp_json.loads(${ARGUMENTS_JSON_STRING_PLACEHOLDER})
__pp_types = ${JSON.stringify(parameterTypes)}
__pp_args = [__pp_convert(value, __pp_types[index] if index < len(__pp_types) else 'any') for index, value in enumerate(__pp_raw_args)]
${result}
print(__pp_format(__pp_result, ${JSON.stringify(outputType)}))
`;
}

function javascriptInvocation(functionContract, studentTemplate) {
  const methodName = cleanIdentifier(functionContract?.methodName, 'solve');
  const className = cleanIdentifier(functionContract?.className, 'Solution');
  const argumentsList = (functionContract?.parameters || []).map((_, index) => `__ppArgs[${index}]`).join(', ');
  if (new RegExp(`\\bclass\\s+${className}\\b`).test(String(studentTemplate || ''))) {
    return `new ${className}().${methodName}(${argumentsList})`;
  }
  return `${methodName}(${argumentsList})`;
}

function javascriptRunner(functionContract, studentTemplate, { typescript = false } = {}) {
  const parameterTypes = (functionContract?.parameters || []).map((parameter) => String(parameter?.type || 'any'));
  const invocation = javascriptInvocation(functionContract, studentTemplate);
  const outputMode = functionContract?.outputMode === 'parameter' ? 'parameter' : 'return';
  const outputParameterIndex = Math.max(0, Number(functionContract?.outputParameterIndex || 0));
  const outputDeclaredType = outputMode === 'parameter'
    ? parameterTypes[outputParameterIndex] || 'any'
    : String(functionContract?.returnType || 'any');
  const type = (value) => (typescript ? value : '');
  const resultDeclaration = outputMode === 'parameter'
    ? `${invocation};\nconst __ppResult${type(': any')} = __ppArgs[${outputParameterIndex}];`
    : `const __ppResult${type(': any')} = ${invocation};`;
  const contractTypes = [...parameterTypes, String(functionContract?.returnType || '')]
    .map((entry) => entry.toLowerCase());
  const uncommentedStudentTemplate = stripCStyleComments(studentTemplate);
  // The TypeScript runner always contains conversion helpers for both node
  // types. TypeScript resolves identifiers while compiling those helpers even
  // when the current contract only uses primitives, so provide the private
  // definitions unless the submitted template already owns them. JavaScript
  // can keep the definitions contract-driven because unresolved names inside
  // uncalled functions are valid at runtime.
  const needsTreeDefinition = (typescript
    || contractTypes.some((entry) => entry.includes('tree-node') || entry.includes('treenode')))
    && !/\bclass\s+TreeNode\b/.test(uncommentedStudentTemplate);
  const needsListDefinition = (typescript
    || contractTypes.some((entry) => entry.includes('list-node') || entry.includes('listnode')))
    && !/\bclass\s+ListNode\b/.test(uncommentedStudentTemplate);
  const nodeDefinitions = [
    needsTreeDefinition
      ? `class TreeNode {\n  val${type(': any')}; left${type(': any')}; right${type(': any')};\n  constructor(val${type(': any')} = 0, left${type(': any')} = null, right${type(': any')} = null) { this.val = val; this.left = left; this.right = right; }\n}`
      : '',
    needsListDefinition
      ? `class ListNode {\n  val${type(': any')}; next${type(': any')};\n  constructor(val${type(': any')} = 0, next${type(': any')} = null) { this.val = val; this.next = next; }\n}`
      : '',
  ].filter(Boolean).join('\n\n');

  // Judge0 compiles with ESNext standard-library declarations. Redeclaring
  // native iterators as arrays breaks legitimate Map/Set algorithms.
  return `${nodeDefinitions}${nodeDefinitions ? '\n\n' : ''}${USER_CODE_PLACEHOLDER}

// PeerPrep private runner. This block is never returned to students.
function __ppTree(values${type(': any[]')})${type(': any')} {
  if (!Array.isArray(values) || values.length === 0) return null;
  const root${type(': any')} = new TreeNode(values[0]);
  const queue${type(': any[]')} = [root];
  let index = 1;
  while (queue.length && index < values.length) {
    const node = queue.shift();
    if (index < values.length && values[index] !== null) { node.left = new TreeNode(values[index]); queue.push(node.left); }
    index += 1;
    if (index < values.length && values[index] !== null) { node.right = new TreeNode(values[index]); queue.push(node.right); }
    index += 1;
  }
  return root;
}

function __ppList(values${type(': any[]')})${type(': any')} {
  let head${type(': any')} = null;
  let tail${type(': any')} = null;
  for (const value of Array.isArray(values) ? values : []) {
    const node${type(': any')} = new ListNode(value);
    if (tail) tail.next = node; else head = node;
    tail = node;
  }
  return head;
}

function __ppConvert(value${type(': any')}, declaredType${type(': string')})${type(': any')} {
  const normalized = String(declaredType || 'any').toLowerCase();
  if (normalized === 'tree-node' || normalized === 'treenode') return __ppTree(value);
  if (normalized === 'list-node' || normalized === 'listnode') return __ppList(value);
  if (normalized.slice(-2) === '[]' && Array.isArray(value)) {
    const childType = declaredType.slice(0, -2);
    return value.map((entry${type(': any')}) => __ppConvert(entry, childType));
  }
  return value;
}

function __ppTreeValues(root${type(': any')})${type(': any[]')} {
  if (!root) return [];
  const values${type(': any[]')} = [];
  const queue${type(': any[]')} = [root];
  while (queue.length) {
    const node = queue.shift();
    if (!node) { values.push(null); continue; }
    values.push(node.val); queue.push(node.left || null, node.right || null);
  }
  while (values.length && values[values.length - 1] === null) values.pop();
  return values;
}

function __ppListValues(head${type(': any')})${type(': any[]')} {
  const values${type(': any[]')} = [];
  const seen${type(': any[]')} = [];
  while (head && seen.indexOf(head) < 0) { seen.push(head); values.push(head.val); head = head.next; }
  return values;
}

function __ppQuoted(value${type(': string')})${type(': string')} {
  return "'" + JSON.stringify(value).slice(1, -1).split("'").join("\\\\'") + "'";
}

function __ppFormat(value${type(': any')}, nested = false, declaredType = '')${type(': string')} {
  const normalized = String(declaredType || '').toLowerCase();
  if (value === null || value === undefined) return nested && ['tree-node','list-node'].includes(normalized) ? '[]' : 'None';
  if (normalized === 'tree-node' || normalized === 'treenode') value = __ppTreeValues(value);
  if (normalized === 'list-node' || normalized === 'listnode') value = __ppListValues(value);
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'string') return nested ? __ppQuoted(value) : value;
  if (Array.isArray(value)) {
    const childType = normalized.slice(-2) === '[]' ? declaredType.slice(0, -2) : '';
    return '[' + value.map((entry${type(': any')}) => __ppFormat(entry, true, childType)).join(', ') + ']';
  }
  if (typeof value === 'object') {
    return '{' + Object.keys(value).map((key) => __ppQuoted(key) + ': ' + __ppFormat(value[key], true, '')).join(', ') + '}';
  }
  return String(value);
}

const __ppRawArgs${type(': any[]')} = JSON.parse(${ARGUMENTS_JSON_STRING_PLACEHOLDER});
const __ppTypes${type(': string[]')} = ${JSON.stringify(parameterTypes)};
const __ppArgs${type(': any[]')} = __ppRawArgs.map((value${type(': any')}, index${type(': number')}) => __ppConvert(value, __ppTypes[index] || 'any'));
${resultDeclaration}
console.log(__ppFormat(__ppResult, false, ${JSON.stringify(outputDeclaredType)}));
`;
}

function rubyRunner(functionContract, studentTemplate) {
  const templateMethod = String(studentTemplate || '').match(/^[ \t]*def\s+([A-Za-z_]\w*)/m)?.[1];
  const methodName = cleanIdentifier(templateMethod || functionContract?.methodName, 'solve');
  const parameterTypes = (functionContract?.parameters || []).map((parameter) => String(parameter?.type || 'any'));
  const outputMode = functionContract?.outputMode === 'parameter' ? 'parameter' : 'return';
  const outputParameterIndex = Math.max(0, Number(functionContract?.outputParameterIndex || 0));
  const result = outputMode === 'parameter'
    ? `${methodName}(*__pp_args)\n__pp_result = __pp_args[${outputParameterIndex}]`
    : `__pp_result = ${methodName}(*__pp_args)`;
  return `require 'json'

class TreeNode
  attr_accessor :val, :left, :right
  def initialize(val = 0, left = nil, right = nil); @val, @left, @right = val, left, right; end
end
class ListNode
  attr_accessor :val, :next
  def initialize(val = 0, nxt = nil); @val, @next = val, nxt; end
end

${USER_CODE_PLACEHOLDER}

# PeerPrep private runner. This block is never returned to students.
def __pp_tree(values)
  return nil unless values.is_a?(Array) && !values.empty?
  root = TreeNode.new(values[0]); queue = [root]; index = 1
  while !queue.empty? && index < values.length
    node = queue.shift
    if index < values.length && !values[index].nil?; node.left = TreeNode.new(values[index]); queue << node.left; end
    index += 1
    if index < values.length && !values[index].nil?; node.right = TreeNode.new(values[index]); queue << node.right; end
    index += 1
  end
  root
end
def __pp_list(values)
  dummy = ListNode.new; tail = dummy
  (values.is_a?(Array) ? values : []).each { |value| tail.next = ListNode.new(value); tail = tail.next }
  dummy.next
end
def __pp_convert(value, declared_type)
  normalized = declared_type.to_s.downcase
  return __pp_tree(value) if ['tree-node', 'treenode'].include?(normalized)
  return __pp_list(value) if ['list-node', 'listnode'].include?(normalized)
  return value.map { |entry| __pp_convert(entry, declared_type[0...-2]) } if normalized.end_with?('[]') && value.is_a?(Array)
  value
end
def __pp_tree_values(root)
  return [] if root.nil?
  values = []; queue = [root]
  until queue.empty?
    node = queue.shift
    if node.nil?; values << nil; next; end
    values << node.val; queue << node.left << node.right
  end
  values.pop while !values.empty? && values[-1].nil?
  values
end
def __pp_list_values(head)
  values = []; seen = {}
  while head && !seen[head.object_id]; seen[head.object_id] = true; values << head.val; head = head.next; end
  values
end
def __pp_format(value, nested = false, declared_type = '')
  normalized = declared_type.to_s.downcase
  value = __pp_tree_values(value) if ['tree-node', 'treenode'].include?(normalized)
  value = __pp_list_values(value) if ['list-node', 'listnode'].include?(normalized)
  return 'None' if value.nil?
  return value ? 'True' : 'False' if value == true || value == false
  return nested ? "'" + value.gsub('\\\\', '\\\\\\\\').gsub("'", "\\\\'") + "'" : value if value.is_a?(String)
  if value.is_a?(Array)
    child_type = normalized.end_with?('[]') ? declared_type[0...-2] : ''
    return '[' + value.map { |entry| __pp_format(entry, true, child_type) }.join(', ') + ']'
  end
  return '{' + value.map { |key, entry| __pp_format(key.to_s, true) + ': ' + __pp_format(entry, true) }.join(', ') + '}' if value.is_a?(Hash)
  value.to_s
end

__pp_raw_args = JSON.parse(${ARGUMENTS_JSON_STRING_PLACEHOLDER})
__pp_types = ${JSON.stringify(parameterTypes)}
__pp_args = __pp_raw_args.each_with_index.map { |value, index| __pp_convert(value, __pp_types[index] || 'any') }
${result}
puts __pp_format(__pp_result, false, ${JSON.stringify(String(functionContract?.returnType || 'any'))})
`;
}

function phpRunner(functionContract, studentTemplate) {
  const templateMethod = String(studentTemplate || '').match(/\bfunction\s+([A-Za-z_]\w*)\s*\(/)?.[1];
  const methodName = cleanIdentifier(templateMethod || functionContract?.methodName, 'solve');
  const className = cleanIdentifier(functionContract?.className, 'Solution');
  const parameterTypes = (functionContract?.parameters || []).map((parameter) => String(parameter?.type || 'any'));
  const outputMode = functionContract?.outputMode === 'parameter' ? 'parameter' : 'return';
  const outputParameterIndex = Math.max(0, Number(functionContract?.outputParameterIndex || 0));
  const invocation = `(new ${className}())->${methodName}(...$__ppArgs)`;
  const result = outputMode === 'parameter'
    ? `${invocation};\n$__ppResult = $__ppArgs[${outputParameterIndex}];`
    : `$__ppResult = ${invocation};`;
  return `<?php
class TreeNode { public $val; public $left; public $right; function __construct($val = 0, $left = null, $right = null) { $this->val = $val; $this->left = $left; $this->right = $right; } }
class ListNode { public $val; public $next; function __construct($val = 0, $next = null) { $this->val = $val; $this->next = $next; } }

${USER_CODE_PLACEHOLDER}

// PeerPrep private runner. This block is never returned to students.
function __ppConvert($value, $type) {
  $normalized = strtolower((string)$type);
  if (($normalized === 'tree-node' || $normalized === 'treenode') && is_array($value)) {
    if (count($value) === 0) return null; $root = new TreeNode($value[0]); $queue = [$root]; $index = 1;
    while (count($queue) && $index < count($value)) { $node = array_shift($queue); if ($index < count($value) && $value[$index] !== null) { $node->left = new TreeNode($value[$index]); $queue[] = $node->left; } $index++; if ($index < count($value) && $value[$index] !== null) { $node->right = new TreeNode($value[$index]); $queue[] = $node->right; } $index++; } return $root;
  }
  if (($normalized === 'list-node' || $normalized === 'listnode') && is_array($value)) { $dummy = new ListNode(); $tail = $dummy; foreach ($value as $entry) { $tail->next = new ListNode($entry); $tail = $tail->next; } return $dummy->next; }
  if (substr($normalized, -2) === '[]' && is_array($value)) return array_map(fn($entry) => __ppConvert($entry, substr($type, 0, -2)), $value);
  return $value;
}
function __ppFormat($value, $nested = false) {
  if ($value === null) return 'None'; if (is_bool($value)) return $value ? 'True' : 'False';
  if (is_string($value)) return $nested ? "'" . str_replace(["\\\\", "'"], ["\\\\\\\\", "\\\\'"], $value) . "'" : $value;
  if (is_array($value)) { $parts = []; foreach ($value as $entry) $parts[] = __ppFormat($entry, true); return '[' . implode(', ', $parts) . ']'; }
  if ($value instanceof ListNode) { $values = []; $seen = []; while ($value && !isset($seen[spl_object_id($value)])) { $seen[spl_object_id($value)] = true; $values[] = $value->val; $value = $value->next; } return __ppFormat($values); }
  return (string)$value;
}
$__ppRawArgs = json_decode(${ARGUMENTS_JSON_STRING_PLACEHOLDER}, true, 512, JSON_THROW_ON_ERROR);
$__ppTypes = ${JSON.stringify(parameterTypes)};
$__ppArgs = []; foreach ($__ppRawArgs as $index => $value) $__ppArgs[] = __ppConvert($value, $__ppTypes[$index] ?? 'any');
${result}
echo __ppFormat($__ppResult, false);
`;
}

function goType(declaredType) {
  const normalized = String(declaredType || 'any').toLowerCase();
  if (normalized.slice(-2) === '[]') return `[]${goType(normalized.slice(0, -2))}`;
  return ({
    integer: 'int', int: 'int', long: 'int64', double: 'float64', float: 'float64',
    boolean: 'bool', bool: 'bool', string: 'string', character: 'byte', char: 'byte',
    'tree-node': '*TreeNode', treenode: '*TreeNode', 'list-node': '*ListNode', listnode: '*ListNode',
  })[normalized] || 'interface{}';
}

function goRunner(functionContract, studentTemplate) {
  const templateMethod = String(studentTemplate || '').match(/\bfunc\s+([A-Za-z_]\w*)\s*\(/)?.[1];
  const methodName = cleanIdentifier(templateMethod || functionContract?.methodName, 'solve');
  const parameters = functionContract?.parameters || [];
  const declarations = parameters.map((parameter, index) => {
    const normalized = String(parameter?.type || '').toLowerCase();
    if (['tree-node', 'treenode'].includes(normalized)) return `var __ppRaw${index} []interface{}\n  json.Unmarshal(__ppInput[${index}], &__ppRaw${index})\n  __ppArg${index} := __ppTree(__ppRaw${index})`;
    if (['list-node', 'listnode'].includes(normalized)) return `var __ppRaw${index} []interface{}\n  json.Unmarshal(__ppInput[${index}], &__ppRaw${index})\n  __ppArg${index} := __ppList(__ppRaw${index})`;
    return `var __ppArg${index} ${goType(parameter?.type)}\n  json.Unmarshal(__ppInput[${index}], &__ppArg${index})`;
  }).join('\n  ');
  const argumentsList = parameters.map((_, index) => `__ppArg${index}`).join(', ');
  const outputMode = functionContract?.outputMode === 'parameter' ? 'parameter' : 'return';
  const outputIndex = Math.max(0, Number(functionContract?.outputParameterIndex || 0));
  const invocation = outputMode === 'parameter'
    ? `${methodName}(${argumentsList})\n  __ppResult := __ppArg${outputIndex}`
    : `__ppResult := ${methodName}(${argumentsList})`;
  const returnType = String(functionContract?.returnType || '').toLowerCase();
  const printable = ['tree-node', 'treenode'].includes(returnType)
    ? '__ppTreeValues(__ppResult)'
    : (['list-node', 'listnode'].includes(returnType) ? '__ppListValues(__ppResult)' : '__ppResult');
  return `package main

import (
  "encoding/json"
  "fmt"
  "reflect"
  "strconv"
  "strings"
)

type TreeNode struct { Val int; Left *TreeNode; Right *TreeNode }
type ListNode struct { Val int; Next *ListNode }

${USER_CODE_PLACEHOLDER}

// PeerPrep private runner. This block is never returned to students.
func __ppInt(value interface{}) int { switch typed := value.(type) { case float64: return int(typed); case int: return typed }; return 0 }
func __ppTree(values []interface{}) *TreeNode {
  if len(values) == 0 || values[0] == nil { return nil }
  root := &TreeNode{Val: __ppInt(values[0])}; queue := []*TreeNode{root}; index := 1
  for len(queue) > 0 && index < len(values) { node := queue[0]; queue = queue[1:]; if index < len(values) && values[index] != nil { node.Left = &TreeNode{Val: __ppInt(values[index])}; queue = append(queue, node.Left) }; index++; if index < len(values) && values[index] != nil { node.Right = &TreeNode{Val: __ppInt(values[index])}; queue = append(queue, node.Right) }; index++ }
  return root
}
func __ppList(values []interface{}) *ListNode { dummy := &ListNode{}; tail := dummy; for _, value := range values { tail.Next = &ListNode{Val: __ppInt(value)}; tail = tail.Next }; return dummy.Next }
func __ppTreeValues(root *TreeNode) []interface{} { if root == nil { return []interface{}{} }; values := []interface{}{}; queue := []*TreeNode{root}; for len(queue) > 0 { node := queue[0]; queue = queue[1:]; if node == nil { values = append(values, nil); continue }; values = append(values, node.Val); queue = append(queue, node.Left, node.Right) }; for len(values) > 0 && values[len(values)-1] == nil { values = values[:len(values)-1] }; return values }
func __ppListValues(head *ListNode) []int { values := []int{}; seen := map[*ListNode]bool{}; for head != nil && !seen[head] { seen[head] = true; values = append(values, head.Val); head = head.Next }; return values }
func __ppFormat(value interface{}, nested bool) string {
  if value == nil { return "None" }; reflected := reflect.ValueOf(value); if reflected.Kind() == reflect.Ptr { if reflected.IsNil() { return "None" }; return __ppFormat(reflected.Elem().Interface(), nested) }
  switch reflected.Kind() { case reflect.Bool: if reflected.Bool() { return "True" }; return "False"; case reflect.String: escaped := strings.ReplaceAll(strings.ReplaceAll(reflected.String(), "\\\\", "\\\\\\\\"), "'", "\\\\'"); if nested { return "'" + escaped + "'" }; return escaped; case reflect.Slice, reflect.Array: parts := []string{}; for index := 0; index < reflected.Len(); index++ { parts = append(parts, __ppFormat(reflected.Index(index).Interface(), true)) }; return "[" + strings.Join(parts, ", ") + "]"; case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64: return strconv.FormatInt(reflected.Int(), 10); case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64: return strconv.FormatUint(reflected.Uint(), 10); case reflect.Float32, reflect.Float64: return strconv.FormatFloat(reflected.Float(), 'g', -1, 64) }
  return fmt.Sprint(value)
}

func main() {
  var __ppInput []json.RawMessage
  if err := json.Unmarshal([]byte(${ARGUMENTS_JSON_STRING_PLACEHOLDER}), &__ppInput); err != nil { panic(err) }
  ${declarations}
  ${invocation}
  fmt.Print(__ppFormat(${printable}, false))
}
`;
}

function cppRunner(functionContract, studentTemplate) {
  const methodName = cleanIdentifier(functionContract?.methodName, 'solve');
  const className = cleanIdentifier(functionContract?.className, 'Solution');
  const parameters = functionContract?.parameters || [];
  const declarations = parameters.map((_, index) => `auto __ppArg${index} = {{ARG_${index}}};`).join('\n  ');
  const argumentsList = parameters.map((_, index) => `__ppArg${index}`).join(', ');
  const classBased = new RegExp(`\\bclass\\s+${className}\\b`).test(String(studentTemplate || ''));
  const call = classBased ? `${className}().${methodName}(${argumentsList})` : `${methodName}(${argumentsList})`;
  const contractTypes = [
    ...parameters.map((parameter) => String(parameter?.type || '').toLowerCase()),
    String(functionContract?.returnType || '').toLowerCase(),
  ];
  const needsTreeNode = contractTypes.some((type) => type.includes('tree-node') || type.includes('treenode'));
  const needsListNode = contractTypes.some((type) => type.includes('list-node') || type.includes('listnode'));
  const uncommentedTemplate = stripCStyleComments(studentTemplate);
  const declaresTreeNode = /\b(?:struct|class)\s+TreeNode\b/.test(uncommentedTemplate);
  const declaresListNode = /\b(?:struct|class)\s+ListNode\b/.test(uncommentedTemplate);
  const nodeDefinitions = [
    needsTreeNode && !declaresTreeNode
      ? 'struct TreeNode { int val; TreeNode *left; TreeNode *right; TreeNode(int value = 0, TreeNode *l = nullptr, TreeNode *r = nullptr) : val(value), left(l), right(r) {} };'
      : '',
    needsListNode && !declaresListNode
      ? 'struct ListNode { int val; ListNode *next; ListNode(int value = 0, ListNode *n = nullptr) : val(value), next(n) {} };'
      : '',
  ].filter(Boolean).join('\n');
  const nodeBuilders = [
    needsTreeNode
      ? `TreeNode* __ppBuildTree(const vector<long long>& values) {
  if (values.empty() || values[0] == LLONG_MIN) return nullptr;
  auto *root = new TreeNode((int)values[0]); queue<TreeNode*> nodes; nodes.push(root); size_t index = 1;
  while (!nodes.empty() && index < values.size()) { auto *node = nodes.front(); nodes.pop(); if (index < values.size() && values[index] != LLONG_MIN) { node->left = new TreeNode((int)values[index]); nodes.push(node->left); } ++index; if (index < values.size() && values[index] != LLONG_MIN) { node->right = new TreeNode((int)values[index]); nodes.push(node->right); } ++index; }
  return root;
}`
      : '',
    needsListNode
      ? 'ListNode* __ppBuildList(const vector<int>& values) { ListNode dummy; auto *tail = &dummy; for (int value : values) { tail->next = new ListNode(value); tail = tail->next; } return dummy.next; }'
      : '',
  ].filter(Boolean).join('\n');
  const outputMode = functionContract?.outputMode === 'parameter' ? 'parameter' : 'return';
  const outputIndex = Math.max(0, Number(functionContract?.outputParameterIndex || 0));
  const invocation = outputMode === 'parameter'
    ? `${call};\n  cout << __ppTop(__ppArg${outputIndex});`
    : `auto __ppResult = ${call};\n  cout << __ppTop(__ppResult);`;
  const nodeFormatters = [
    needsListNode
      ? 'string __ppFormat(ListNode *head, bool = true) { if (!head) return "None"; vector<int> values; unordered_set<ListNode*> seen; while (head && !seen.count(head)) { seen.insert(head); values.push_back(head->val); head = head->next; } return __ppFormat(values); }'
      : '',
    needsTreeNode
      ? 'string __ppFormat(TreeNode *root, bool = true) { if (!root) return "None"; vector<string> values; queue<TreeNode*> nodes; nodes.push(root); while (!nodes.empty()) { auto *node = nodes.front(); nodes.pop(); if (!node) { values.push_back("None"); continue; } values.push_back(to_string(node->val)); nodes.push(node->left); nodes.push(node->right); } while (!values.empty() && values.back() == "None") values.pop_back(); string output = "["; for (size_t index = 0; index < values.size(); ++index) { if (index) output += ", "; output += values[index]; } return output + "]"; }'
      : '',
  ].filter(Boolean).join('\n');
  return `#include <bits/stdc++.h>
using namespace std;

${nodeDefinitions}

${USER_CODE_PLACEHOLDER}

${nodeBuilders}

// PeerPrep private runner. This block is never returned to students.
string __ppEscape(const string& value) { string output; for (char ch : value) { if (ch == 92 || ch == 39) output += char(92); output += ch; } return output; }
string __ppFormat(const string& value, bool nested = true) { return nested ? "'" + __ppEscape(value) + "'" : value; }
string __ppFormat(const char value, bool = true) { return string("'") + value + "'"; }
string __ppFormat(const bool value, bool = true) { return value ? "True" : "False"; }
string __ppFormat(nullptr_t, bool = true) { return "None"; }
template <typename T, typename enable_if<is_arithmetic<T>::value && !is_same<T, bool>::value && !is_same<T, char>::value, int>::type = 0>
string __ppFormat(const T& value, bool = true) { ostringstream output; if (is_floating_point<T>::value) output << setprecision(numeric_limits<T>::max_digits10); output << value; return output.str(); }
template <typename T> string __ppFormat(const vector<T>& values, bool = true) { string output = "["; for (size_t index = 0; index < values.size(); ++index) { if (index) output += ", "; output += __ppFormat(values[index], true); } return output + "]"; }
${nodeFormatters}
${needsTreeNode ? 'string __ppFormat(const vector<TreeNode*>& nodes, bool = true) { string output = "["; for (size_t index=0; index<nodes.size(); ++index) { if(index) output += ", "; output += nodes[index] ? __ppFormat(nodes[index]) : "[]"; } return output + "]"; }' : ''}
${needsListNode ? 'string __ppFormat(const vector<ListNode*>& nodes, bool = true) { string output = "["; for (size_t index=0; index<nodes.size(); ++index) { if(index) output += ", "; output += nodes[index] ? __ppFormat(nodes[index]) : "[]"; } return output + "]"; }' : ''}
template <typename T> string __ppTop(const T& value) { return __ppFormat(value, false); }

int main() {
  ios::sync_with_stdio(false); cin.tie(nullptr);
  ${declarations}
  ${invocation}
  return 0;
}
`;
}

function javaRunner(functionContract, studentTemplate) {
  const methodName = cleanIdentifier(functionContract?.methodName, 'solve');
  const className = cleanIdentifier(functionContract?.className, 'Solution');
  const parameters = functionContract?.parameters || [];
  const rawArguments = parameters.map((_, index) => `{{ARG_${index}}}`).join(', ');
  const outputMode = functionContract?.outputMode === 'parameter' ? 'parameter' : 'return';
  const outputIndex = Math.max(0, Number(functionContract?.outputParameterIndex || 0));
  const resultExpression = outputMode === 'parameter'
    ? `__ppArgs[${outputIndex}]`
    : '__ppReturned';
  const contractTypes = [
    ...(functionContract?.parameters || []).map((parameter) => String(parameter?.type || '').toLowerCase()),
    String(functionContract?.returnType || '').toLowerCase(),
  ];
  const uncommentedTemplate = stripCStyleComments(studentTemplate);
  const nodeDefinitions = [
    contractTypes.some((type) => type.includes('tree-node') || type.includes('treenode'))
      && !/\b(?:class|record)\s+TreeNode\b/.test(uncommentedTemplate)
      ? 'class TreeNode { int val; TreeNode left; TreeNode right; TreeNode() {} TreeNode(int val) { this.val = val; } TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; } }'
      : '',
    contractTypes.some((type) => type.includes('list-node') || type.includes('listnode'))
      && !/\b(?:class|record)\s+ListNode\b/.test(uncommentedTemplate)
      ? 'class ListNode { int val; ListNode next; ListNode() {} ListNode(int val) { this.val = val; } ListNode(int val, ListNode next) { this.val = val; this.next = next; } }'
      : '',
  ].filter(Boolean).join('\n');
  return `import java.util.*;
import java.math.*;
import java.util.function.*;

${USER_CODE_PLACEHOLDER}

${nodeDefinitions}

// PeerPrep private runner. This block is never returned to students.
class Main {
  private static Object __ppConvert(Object value, Class<?> target, java.lang.reflect.Type genericType) throws Exception {
    if (value == null) return null;
    if (target == Object.class) {
      if (genericType instanceof java.lang.reflect.ParameterizedType) {
        java.lang.reflect.Type rawType = ((java.lang.reflect.ParameterizedType) genericType).getRawType();
        if (rawType instanceof Class) target = (Class<?>) rawType;
        else return value;
      } else return value;
    }
    if (target == String.class) return String.valueOf(value);
    if (target == char.class || target == Character.class) return String.valueOf(value).charAt(0);
    if (target == boolean.class || target == Boolean.class) return (Boolean) value;
    if (value instanceof Number) {
      Number number = (Number) value;
      if (target == int.class || target == Integer.class) return number.intValue();
      if (target == long.class || target == Long.class) return number.longValue();
      if (target == double.class || target == Double.class) return number.doubleValue();
      if (target == float.class || target == Float.class) return number.floatValue();
      if (target == short.class || target == Short.class) return number.shortValue();
      if (target == byte.class || target == Byte.class) return number.byteValue();
    }
    if (target.isArray() && value instanceof java.util.List) {
      java.util.List<?> values = (java.util.List<?>) value;
      Class<?> child = target.getComponentType();
      Object array = java.lang.reflect.Array.newInstance(child, values.size());
      for (int index = 0; index < values.size(); index++) {
        java.lang.reflect.Array.set(array, index, __ppConvert(values.get(index), child, child));
      }
      return array;
    }
    if (java.util.Collection.class.isAssignableFrom(target) && value instanceof java.util.List) {
      java.util.List<?> values = (java.util.List<?>) value;
      java.util.List<Object> converted = new java.util.ArrayList<>();
      java.lang.reflect.Type childType = Object.class;
      if (genericType instanceof java.lang.reflect.ParameterizedType) {
        java.lang.reflect.Type[] types = ((java.lang.reflect.ParameterizedType) genericType).getActualTypeArguments();
        if (types.length > 0) childType = types[0];
      }
      Class<?> childClass = childType instanceof Class ? (Class<?>) childType : Object.class;
      for (Object entry : values) converted.add(__ppConvert(entry, childClass, childType));
      return converted;
    }
    if ((target.getSimpleName().equals("TreeNode") || target.getSimpleName().equals("ListNode"))
        && value instanceof java.util.List) {
      return target.getSimpleName().equals("TreeNode")
        ? __ppTree((java.util.List<?>) value, target)
        : __ppList((java.util.List<?>) value, target);
    }
    return value;
  }

  private static Object __ppNewNode(Class<?> type, Object value) throws Exception {
    for (java.lang.reflect.Constructor<?> constructor : type.getDeclaredConstructors()) {
      constructor.setAccessible(true);
      if (constructor.getParameterCount() == 1) {
        return constructor.newInstance(__ppConvert(value, constructor.getParameterTypes()[0], constructor.getGenericParameterTypes()[0]));
      }
      if (constructor.getParameterCount() == 0) {
        Object node = constructor.newInstance();
        java.lang.reflect.Field field = type.getDeclaredField("val"); field.setAccessible(true);
        field.set(node, __ppConvert(value, field.getType(), field.getGenericType()));
        return node;
      }
    }
    throw new IllegalArgumentException("Node constructor is not supported");
  }

  private static void __ppSet(Object target, String fieldName, Object value) throws Exception {
    java.lang.reflect.Field field = target.getClass().getDeclaredField(fieldName);
    field.setAccessible(true); field.set(target, value);
  }

  private static Object __ppTree(java.util.List<?> values, Class<?> type) throws Exception {
    if (values.isEmpty() || values.get(0) == null) return null;
    Object root = __ppNewNode(type, values.get(0));
    java.util.ArrayDeque<Object> queue = new java.util.ArrayDeque<>(); queue.add(root);
    int index = 1;
    while (!queue.isEmpty() && index < values.size()) {
      Object node = queue.remove();
      if (index < values.size() && values.get(index) != null) { Object left = __ppNewNode(type, values.get(index)); __ppSet(node, "left", left); queue.add(left); }
      index++;
      if (index < values.size() && values.get(index) != null) { Object right = __ppNewNode(type, values.get(index)); __ppSet(node, "right", right); queue.add(right); }
      index++;
    }
    return root;
  }

  private static Object __ppList(java.util.List<?> values, Class<?> type) throws Exception {
    Object head = null, tail = null;
    for (Object value : values) {
      Object node = __ppNewNode(type, value);
      if (head == null) head = node; else __ppSet(tail, "next", node);
      tail = node;
    }
    return head;
  }

  private static Object __ppField(Object value, String name) throws Exception {
    java.lang.reflect.Field field = value.getClass().getDeclaredField(name); field.setAccessible(true); return field.get(value);
  }

  private static String __ppFormat(Object value, boolean nested) throws Exception {
    if (value == null) return "None";
    if (value instanceof Boolean) return ((Boolean) value) ? "True" : "False";
    if (value instanceof Character || value instanceof String) {
      String text = String.valueOf(value).replace("\\\\", "\\\\\\\\").replace("'", "\\\\'");
      return nested ? "'" + text + "'" : String.valueOf(value);
    }
    Class<?> type = value.getClass();
    if (type.isArray()) {
      java.util.List<String> parts = new java.util.ArrayList<>();
      for (int index = 0; index < java.lang.reflect.Array.getLength(value); index++) parts.add(__ppFormat(java.lang.reflect.Array.get(value, index), true));
      return "[" + String.join(", ", parts) + "]";
    }
    if (value instanceof Iterable) {
      java.util.List<String> parts = new java.util.ArrayList<>();
      for (Object entry : (Iterable<?>) value) parts.add(__ppFormat(entry, true));
      return "[" + String.join(", ", parts) + "]";
    }
    if (type.getSimpleName().equals("TreeNode")) {
      java.util.List<String> parts = new java.util.ArrayList<>(); java.util.List<Object> queue = new java.util.ArrayList<>(); queue.add(value);
      for (int index = 0; index < queue.size(); index++) {
        Object node = queue.get(index);
        if (node == null) { parts.add("None"); continue; }
        parts.add(__ppFormat(__ppField(node, "val"), true)); queue.add(__ppField(node, "left")); queue.add(__ppField(node, "right"));
      }
      while (!parts.isEmpty() && parts.get(parts.size() - 1).equals("None")) parts.remove(parts.size() - 1);
      return "[" + String.join(", ", parts) + "]";
    }
    if (type.getSimpleName().equals("ListNode")) {
      java.util.List<String> parts = new java.util.ArrayList<>(); java.util.Set<Object> seen = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
      while (value != null && seen.add(value)) { parts.add(__ppFormat(__ppField(value, "val"), true)); value = __ppField(value, "next"); }
      return "[" + String.join(", ", parts) + "]";
    }
    return String.valueOf(value);
  }

  private static String __ppNodeCollection(Object value) throws Exception {
    java.util.List<String> parts = new java.util.ArrayList<>();
    if (value == null) throw new IllegalArgumentException("Node collection result cannot be null");
    if (value.getClass().isArray()) {
      for(int index=0; index<java.lang.reflect.Array.getLength(value); index++) { Object node=java.lang.reflect.Array.get(value,index); parts.add(node==null ? "[]" : __ppFormat(node,true)); }
    } else if(value instanceof Iterable) {
      for(Object node : (Iterable<?>)value) parts.add(node==null ? "[]" : __ppFormat(node,true));
    } else throw new IllegalArgumentException("Node collection result requires an array or list");
    return "[" + String.join(", ",parts) + "]";
  }

  public static void main(String[] ignored) throws Exception {
    Object[] __ppRaw = new Object[]{${rawArguments}};
    java.lang.reflect.Method __ppMethod = null;
    for (java.lang.reflect.Method candidate : ${className}.class.getDeclaredMethods()) {
      if (candidate.getName().equals(${JSON.stringify(methodName)}) && candidate.getParameterCount() == __ppRaw.length) { __ppMethod = candidate; break; }
    }
    if (__ppMethod == null) throw new NoSuchMethodException(${JSON.stringify(methodName)});
    __ppMethod.setAccessible(true);
    Object[] __ppArgs = new Object[__ppRaw.length];
    Class<?>[] __ppTypes = __ppMethod.getParameterTypes();
    java.lang.reflect.Type[] __ppGenericTypes = __ppMethod.getGenericParameterTypes();
    for (int index = 0; index < __ppRaw.length; index++) __ppArgs[index] = __ppConvert(__ppRaw[index], __ppTypes[index], __ppGenericTypes[index]);
    Object __ppReceiver = java.lang.reflect.Modifier.isStatic(__ppMethod.getModifiers()) ? null : ${className}.class.getDeclaredConstructor().newInstance();
    Object __ppReturned = __ppMethod.invoke(__ppReceiver, __ppArgs);
    System.out.print(${['tree-node[]','list-node[]'].includes(String(outputMode === 'parameter' ? parameters[outputIndex]?.type : functionContract?.returnType).toLowerCase()) ? `__ppNodeCollection(${resultExpression})` : `__ppFormat(${resultExpression}, false)`});
  }
}
`;
}

function cRunner(functionContract, studentTemplate) {
  const methodName = cleanIdentifier(functionContract?.methodName, 'solve');
  const parameters = functionContract?.parameters || [];
  const signature = String(studentTemplate || '').match(new RegExp(`([\\w\\s*]+?)\\b${methodName}\\s*\\(([^)]*)\\)\\s*\\{`));
  if (!signature) return '';
  const returnDeclaration = signature[1].trim();
  const normalizedReturnDeclaration = returnDeclaration.replace(/\s+/g, ' ').toLowerCase();
  const returnsBoolPointer = /\b(?:bool|_bool)\s*\*/.test(normalizedReturnDeclaration);
  const returnsLongPointer = /\b(?:long\s+long|int64_t|uint64_t)\s*\*/.test(normalizedReturnDeclaration);
  const actualParameters = signature[2].split(',').map((entry) => entry.trim()).filter((entry) => entry && entry !== 'void').map((entry) => ({
    declaration: entry,
    name: entry.match(/([A-Za-z_]\w*)\s*(?:\[\s*\])?\s*$/)?.[1] || '',
  }));
  const canonicalNames = new Map(parameters.map((parameter, index) => [String(parameter?.name || '').toLowerCase(), index]));
  const typeBase = (type) => ({ integer: 'int', int: 'int', long: 'long long', double: 'double', float: 'double', boolean: 'bool', bool: 'bool', string: 'char*', character: 'char', char: 'char' })[String(type || '').toLowerCase()] || 'int';
  const declarations = parameters.map((parameter, index) => {
    const type = String(parameter?.type || 'integer').toLowerCase();
    if (['list-node', 'listnode'].includes(type)) return `int __ppArg${index}Values[] = {{ARG_${index}}};\n  struct ListNode* __ppArg${index} = __ppBuildList(__ppArg${index}Values, sizeof(__ppArg${index}Values) / sizeof(int));`;
    if (['tree-node', 'treenode'].includes(type)) return `int __ppArg${index}Values[] = {{ARG_${index}}};\n  struct TreeNode* __ppArg${index} = __ppBuildTree(__ppArg${index}Values, sizeof(__ppArg${index}Values) / sizeof(int));`;
    if (['tree-node[]','list-node[]'].includes(type)) return `struct ${type === 'tree-node[]' ? 'TreeNode' : 'ListNode'}* __ppArg${index}[] = {{ARG_${index}}};`;
    if (type.endsWith('[][]')) {
      const base = typeBase(type.slice(0, -4));
      return `${base}* __ppArg${index}[] = {{ARG_${index}}};\n  int __ppArg${index}ColSizes[] = {{ARG_${index}_COL_SIZES}};`;
    }
    if (type.endsWith('[]')) return `${typeBase(type.slice(0, -2))} __ppArg${index}[] = {{ARG_${index}}};`;
    if (type === 'string') return `char __ppArg${index}[] = {{ARG_${index}}};`;
    return `${typeBase(type)} __ppArg${index} = {{ARG_${index}}};`;
  }).join('\n  ');
  const callArguments = actualParameters.map(({ name }) => {
    const lower = name.toLowerCase();
    if (lower === 'returnsize') return '&__ppReturnSize';
    if (lower === 'returncolumnsizes' || lower === 'returncolsizes') return '&__ppReturnColumnSizes';
    if (canonicalNames.has(lower)) return `__ppArg${canonicalNames.get(lower)}`;
    const sizeMatch = lower.match(/^(.*?)(?:colsize|columnsize)$/);
    if (sizeMatch && canonicalNames.has(sizeMatch[1])) return `__ppArg${canonicalNames.get(sizeMatch[1])}ColSizes`;
    const lengthMatch = lower.match(/^(.*?)(?:size|length)$/);
    if (lengthMatch && canonicalNames.has(lengthMatch[1])) {
      const index = canonicalNames.get(lengthMatch[1]);
      return `(int)(sizeof(__ppArg${index}) / sizeof(__ppArg${index}[0]))`;
    }
    return '0';
  }).join(', ');
  const outputMode = functionContract?.outputMode === 'parameter' ? 'parameter' : 'return';
  const outputIndex = Math.max(0, Number(functionContract?.outputParameterIndex || 0));
  const returnType = String(functionContract?.returnType || '').toLowerCase();
  const cArrayPrinter = (type, value, count) => {
    const normalized = String(type || '').toLowerCase();
    const elementType = normalized.endsWith('[]') ? normalized.slice(0, -2) : normalized;
    if (['tree-node','list-node'].includes(elementType)) return `__ppPrint${elementType === 'tree-node' ? 'Tree' : 'List'}Collection(${value}, ${count});`;
    if (['boolean', 'bool'].includes(elementType)) return `__ppPrintBoolArray((const bool*)${value}, ${count});`;
    if (elementType === 'string') return `__ppPrintStringArray((char**)${value}, ${count});`;
    if (['long'].includes(elementType)) return `__ppPrintLongArray((const long long*)${value}, ${count});`;
    if (['double', 'float'].includes(elementType)) return `__ppPrintDoubleArray((const double*)${value}, ${count});`;
    if (['character', 'char'].includes(elementType)) return `__ppPrintCharArray((const char*)${value}, ${count});`;
    return `__ppPrintIntArray((const int*)${value}, ${count});`;
  };
  const cMatrixPrinter = (type, value, rows, columns) => {
    const normalized = String(type || '').toLowerCase();
    const elementType = normalized.endsWith('[][]') ? normalized.slice(0, -4) : normalized;
    if (['boolean', 'bool'].includes(elementType)) return `__ppPrintBoolMatrix((bool**)${value}, ${rows}, ${columns});`;
    if (elementType === 'string') return `__ppPrintStringMatrix((char***)${value}, ${rows}, ${columns});`;
    if (elementType === 'long') return `__ppPrintLongMatrix((long long**)${value}, ${rows}, ${columns});`;
    if (['double', 'float'].includes(elementType)) return `__ppPrintDoubleMatrix((double**)${value}, ${rows}, ${columns});`;
    if (['character', 'char'].includes(elementType)) return `__ppPrintCharMatrix((char**)${value}, ${rows}, ${columns});`;
    return `__ppPrintIntMatrix((int**)${value}, ${rows}, ${columns});`;
  };
  const cScalarPrinter = (type, value) => {
    const normalized = String(type || '').toLowerCase();
    if (['list-node', 'listnode'].includes(normalized)) return `__ppPrintList(${value});`;
    if (['tree-node', 'treenode'].includes(normalized)) return `__ppPrintTree(${value});`;
    if (normalized === 'string') return `printf("%s", ${value} ? ${value} : "");`;
    if (['boolean', 'bool'].includes(normalized)) return `printf("%s", ${value} ? "True" : "False");`;
    if (['double', 'float'].includes(normalized)) return `printf("%.15g", (double)${value});`;
    if (['character', 'char'].includes(normalized)) return `putchar(${value});`;
    return `printf("%lld", (long long)${value});`;
  };
  let output;
  if (outputMode === 'parameter') {
    const type = String(parameters[outputIndex]?.type || '').toLowerCase();
    const size = `(int)(sizeof(__ppArg${outputIndex}) / sizeof(__ppArg${outputIndex}[0]))`;
    output = type.endsWith('[][]')
      ? cMatrixPrinter(type, `__ppArg${outputIndex}`, size, `__ppArg${outputIndex}ColSizes`)
      : type.endsWith('[]')
        ? cArrayPrinter(type, `__ppArg${outputIndex}`, size)
        : cScalarPrinter(type, `__ppArg${outputIndex}`);
  } else if (['list-node', 'listnode'].includes(returnType)) output = '__ppPrintList(__ppResult);';
  else if (['tree-node', 'treenode'].includes(returnType)) output = '__ppPrintTree(__ppResult);';
  else if (returnType.endsWith('[][]')) output = cMatrixPrinter(returnType, '__ppResult', '__ppReturnSize', '__ppReturnColumnSizes');
  else if (['boolean[]', 'bool[]'].includes(returnType) || returnsBoolPointer) output = '__ppPrintBoolArray((const bool*)__ppResult, __ppReturnSize);';
  else if (returnType.endsWith('[]')) output = returnsLongPointer
    ? '__ppPrintLongArray((const long long*)__ppResult, __ppReturnSize);'
    : cArrayPrinter(returnType, '__ppResult', '__ppReturnSize');
  else if (returnType === 'string') output = 'printf("%s", __ppResult ? __ppResult : "");';
  else if (returnType === 'boolean' || returnType === 'bool') output = 'printf("%s", __ppResult ? "True" : "False");';
  else if (returnType === 'character' || returnType === 'char') output = 'putchar(__ppResult);';
  else if (returnType === 'double' || returnType === 'float') output = 'printf("%.15g", (double)__ppResult);';
  else output = 'printf("%lld", (long long)__ppResult);';
  const resultDeclaration = outputMode === 'parameter' || /\bvoid\b/.test(returnDeclaration)
    ? `${methodName}(${callArguments});`
    : `${returnDeclaration} __ppResult = ${methodName}(${callArguments});`;
  return `#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <limits.h>

struct ListNode { int val; struct ListNode* next; };
struct TreeNode { int val; struct TreeNode* left; struct TreeNode* right; };

${USER_CODE_PLACEHOLDER}

/* PeerPrep private runner. This block is never returned to students. */
static struct ListNode* __ppBuildList(const int* values, int count) { struct ListNode dummy = {0, NULL}; struct ListNode* tail = &dummy; for (int i = 0; i < count; ++i) { tail->next = malloc(sizeof(struct ListNode)); tail = tail->next; tail->val = values[i]; tail->next = NULL; } return dummy.next; }
static struct TreeNode* __ppBuildTree(const int* values, int count) { if (!count || values[0] == INT_MIN) return NULL; struct TreeNode* root = calloc(1, sizeof(struct TreeNode)); root->val = values[0]; struct TreeNode** queue = malloc(sizeof(struct TreeNode*) * count); int head = 0, tail = 0, index = 1; queue[tail++] = root; while (head < tail && index < count) { struct TreeNode* node = queue[head++]; if (index < count && values[index] != INT_MIN) { node->left = calloc(1, sizeof(struct TreeNode)); node->left->val = values[index]; queue[tail++] = node->left; } index++; if (index < count && values[index] != INT_MIN) { node->right = calloc(1, sizeof(struct TreeNode)); node->right->val = values[index]; queue[tail++] = node->right; } index++; } free(queue); return root; }
static void __ppPrintBoolArray(const bool* values, int count) { putchar('['); for (int i = 0; i < count; ++i) { if (i) printf(", "); printf("%s", values[i] ? "True" : "False"); } putchar(']'); }
static void __ppPrintBoolMatrix(bool** values, int rows, const int* columns) { putchar('['); for (int row = 0; row < rows; ++row) { if (row) printf(", "); __ppPrintBoolArray(values[row], columns ? columns[row] : 0); } putchar(']'); }
static void __ppPrintIntArray(const int* values, int count) { putchar('['); for (int i = 0; i < count; ++i) { if (i) printf(", "); printf("%d", values[i]); } putchar(']'); }
static void __ppPrintLongArray(const long long* values, int count) { putchar('['); for (int i = 0; i < count; ++i) { if (i) printf(", "); printf("%lld", values[i]); } putchar(']'); }
static void __ppPrintDoubleArray(const double* values, int count) { putchar('['); for (int i = 0; i < count; ++i) { if (i) printf(", "); printf("%.15g", values[i]); } putchar(']'); }
static void __ppPrintCharArray(const char* values, int count) { putchar('['); for (int i = 0; i < count; ++i) { if (i) printf(", "); printf("'%c'", values[i]); } putchar(']'); }
static void __ppPrintIntMatrix(int** values, int rows, const int* columns) { putchar('['); for (int row = 0; row < rows; ++row) { if (row) printf(", "); __ppPrintIntArray(values[row], columns ? columns[row] : 0); } putchar(']'); }
static void __ppPrintLongMatrix(long long** values, int rows, const int* columns) { putchar('['); for (int row = 0; row < rows; ++row) { if (row) printf(", "); __ppPrintLongArray(values[row], columns ? columns[row] : 0); } putchar(']'); }
static void __ppPrintDoubleMatrix(double** values, int rows, const int* columns) { putchar('['); for (int row = 0; row < rows; ++row) { if (row) printf(", "); __ppPrintDoubleArray(values[row], columns ? columns[row] : 0); } putchar(']'); }
static void __ppPrintCharMatrix(char** values, int rows, const int* columns) { putchar('['); for (int row = 0; row < rows; ++row) { if (row) printf(", "); __ppPrintCharArray(values[row], columns ? columns[row] : 0); } putchar(']'); }
static void __ppPrintStringArray(char** values, int count) { putchar('['); for (int i = 0; i < count; ++i) { if (i) printf(", "); printf("'%s'", values[i]); } putchar(']'); }
static void __ppPrintStringMatrix(char*** values, int rows, const int* columns) { putchar('['); for (int row = 0; row < rows; ++row) { if (row) printf(", "); __ppPrintStringArray(values[row], columns ? columns[row] : 0); } putchar(']'); }
static void __ppPrintList(struct ListNode* node) { if (!node) { printf("None"); return; } putchar('['); int first = 1; while (node) { if (!first) printf(", "); printf("%d", node->val); first = 0; node = node->next; } putchar(']'); }
static void __ppPrintTree(struct TreeNode* root) { if (!root) { printf("None"); return; } struct TreeNode* queue[100000]; int head = 0, tail = 0; queue[tail++] = root; int values[100000], present[100000], count = 0; while (head < tail) { struct TreeNode* node = queue[head++]; if (!node) { present[count++] = 0; continue; } present[count] = 1; values[count++] = node->val; queue[tail++] = node->left; queue[tail++] = node->right; } while (count && !present[count - 1]) count--; putchar('['); for (int i = 0; i < count; ++i) { if (i) printf(", "); if (present[i]) printf("%d", values[i]); else printf("None"); } putchar(']'); }

static void __ppPrintTreeCollection(struct TreeNode** values, int count) { putchar('['); for(int index=0; index<count; index++) { if(index) printf(", " ); if(values[index]) __ppPrintTree(values[index]); else printf("[]"); } putchar(']'); }
static void __ppPrintListCollection(struct ListNode** values, int count) { putchar('['); for(int index=0; index<count; index++) { if(index) printf(", " ); if(values[index]) __ppPrintList(values[index]); else printf("[]"); } putchar(']'); }

int main(void) {
  ${declarations}
  int __ppReturnSize = 0;
  int* __ppReturnColumnSizes = NULL;
  ${resultDeclaration}
  ${output}
  return 0;
}
`;
}

export const AUTO_RUNNER_LANGUAGES = ['python', 'javascript', 'typescript', 'ruby', 'php', 'go', 'cpp', 'java', 'c'];

export function generateFunctionRunnerTemplate(language, functionContract, studentTemplate = '') {
  if (!functionContract?.methodName) return '';
  if (language === 'python') return pythonRunner(functionContract);
  if (language === 'javascript') return javascriptRunner(functionContract, studentTemplate);
  if (language === 'typescript') return javascriptRunner(functionContract, studentTemplate, { typescript: true });
  if (language === 'ruby') return rubyRunner(functionContract, studentTemplate);
  if (language === 'php') return phpRunner(functionContract, studentTemplate);
  if (language === 'go') return goRunner(functionContract, studentTemplate);
  if (language === 'cpp') return cppRunner(functionContract, studentTemplate);
  if (language === 'java') return javaRunner(functionContract, studentTemplate);
  if (language === 'c') return cRunner(functionContract, studentTemplate);
  return '';
}
