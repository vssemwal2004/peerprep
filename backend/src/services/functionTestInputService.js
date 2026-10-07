import {renderLargeCppStringArray} from './cppLargeStringArrayInputService.js';
import { renderLargeCppNumericMatrix } from './cppLargeNumericMatrixInputService.js';
import { flattenLargeCMatrixDeclarations } from './cLargeNumericMatrixInputService.js';
// Compact generated native array separators; input string contents stay intact.
// PeerPrep canonical node collections.
import { HttpError } from '../utils/errors.js';

const MAX_INPUT_DEPTH = 64;

class LiteralParser {
  constructor(source) {
    this.source = String(source ?? '');
    this.index = 0;
  }

  error(message) {
    throw new HttpError(400, `Invalid function testcase input near character ${this.index + 1}: ${message}`);
  }

  skipWhitespace() {
    while (/\s/.test(this.source[this.index] || '')) this.index += 1;
  }

  peek() {
    this.skipWhitespace();
    return this.source[this.index];
  }

  consume(expected) {
    this.skipWhitespace();
    if (this.source[this.index] !== expected) this.error(`expected "${expected}"`);
    this.index += 1;
  }

  parseString() {
    this.skipWhitespace();
    const quote = this.source[this.index];
    this.index += 1;
    let value = '';
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      this.index += 1;
      if (character === quote) return value;
      if (character !== '\\') {
        value += character;
        continue;
      }
      if (this.index >= this.source.length) this.error('unterminated escape sequence');
      const escaped = this.source[this.index];
      this.index += 1;
      const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\\': '\\', "'": "'", '"': '"' };
      if (escaped === 'u') {
        const hex = this.source.slice(this.index, this.index + 4);
        if (!/^[0-9a-f]{4}$/i.test(hex)) this.error('invalid unicode escape');
        value += String.fromCharCode(Number.parseInt(hex, 16));
        this.index += 4;
      } else {
        value += escapes[escaped] ?? escaped;
      }
    }
    this.error('unterminated string');
    return '';
  }

  parseNumber() {
    this.skipWhitespace();
    const match = this.source.slice(this.index).match(/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) this.error('invalid number');
    this.index += match[0].length;
    const numeric = Number(match[0]);
    if (!Number.isFinite(numeric)) this.error('number must be finite');
    return numeric;
  }

  parseIdentifier() {
    this.skipWhitespace();
    const match = this.source.slice(this.index).match(/^[A-Za-z_]\w*/);
    if (!match) this.error('expected a literal value');
    this.index += match[0].length;
    const normalized = match[0].toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    if (normalized === 'none' || normalized === 'null' || normalized === 'nil') return null;
    this.error(`unsupported literal "${match[0]}"`);
    return null;
  }

  parseList(depth) {
    if (depth > MAX_INPUT_DEPTH) this.error('maximum nesting depth exceeded');
    const opening = this.peek();
    const closing = opening === '[' ? ']' : ')';
    this.index += 1;
    const values = [];
    if (this.peek() === closing) {
      this.index += 1;
      return values;
    }
    while (this.index < this.source.length) {
      values.push(this.parseValue(depth + 1));
      const next = this.peek();
      if (next === closing) {
        this.index += 1;
        return values;
      }
      this.consume(',');
      if (this.peek() === closing) {
        this.index += 1;
        return values;
      }
    }
    this.error(`expected "${closing}"`);
    return values;
  }

  parseObject(depth) {
    if (depth > MAX_INPUT_DEPTH) this.error('maximum nesting depth exceeded');
    this.consume('{');
    const value = {};
    if (this.peek() === '}') {
      this.index += 1;
      return value;
    }
    while (this.index < this.source.length) {
      const next = this.peek();
      let key;
      if (next === '"' || next === "'") key = this.parseString();
      else {
        const match = this.source.slice(this.index).match(/^[A-Za-z_]\w*/);
        if (!match) this.error('object keys must be strings or identifiers');
        key = match[0];
        this.index += match[0].length;
      }
      this.consume(':');
      value[key] = this.parseValue(depth + 1);
      const separator = this.peek();
      if (separator === '}') {
        this.index += 1;
        return value;
      }
      this.consume(',');
    }
    this.error('expected "}"');
    return value;
  }

  parseValue(depth = 0) {
    const next = this.peek();
    if (next === '"' || next === "'") return this.parseString();
    if (next === '[' || next === '(') return this.parseList(depth);
    if (next === '{') return this.parseObject(depth);
    if (next === '-' || next === '.' || /\d/.test(next || '')) return this.parseNumber();
    return this.parseIdentifier();
  }
}

function readAssignmentName(parser) {
  parser.skipWhitespace();
  const start = parser.index;
  const match = parser.source.slice(start).match(/^[A-Za-z_]\w*/);
  if (!match) return null;
  parser.index += match[0].length;
  parser.skipWhitespace();
  if (parser.source[parser.index] !== '=') {
    parser.index = start;
    return null;
  }
  parser.index += 1;
  return match[0];
}

export function parseFunctionTestInput(rawInput) {
  const parser = new LiteralParser(rawInput);
  parser.skipWhitespace();
  if (!parser.source.trim()) return { named: {}, positional: [], values: [] };

  const firstName = readAssignmentName(parser);
  if (firstName) {
    const named = { [firstName]: parser.parseValue() };
    while (parser.index < parser.source.length) {
      parser.skipWhitespace();
      if (parser.index >= parser.source.length) break;
      parser.consume(',');
      const name = readAssignmentName(parser);
      if (!name) parser.error('expected another named argument');
      if (Object.prototype.hasOwnProperty.call(named, name)) parser.error(`duplicate argument "${name}"`);
      named[name] = parser.parseValue();
    }
    return { named, positional: [], values: Object.values(named) };
  }

  parser.index = 0;
  const positional = [];
  while (parser.index < parser.source.length) {
    positional.push(parser.parseValue());
    parser.skipWhitespace();
    if (parser.index >= parser.source.length) break;
    parser.consume(',');
  }
  return { named: {}, positional, values: positional };
}

export function buildFunctionInputPayload(rawInput, functionContract = {}) {
  const parsed = parseFunctionTestInput(rawInput);
  const parameters = Array.isArray(functionContract?.parameters) ? functionContract.parameters : [];
  const args = parameters.length
    ? parameters.map((parameter, index) => {
      const name = String(parameter?.name || '').trim();
      if (name && Object.prototype.hasOwnProperty.call(parsed.named, name)) return parsed.named[name];
      return parsed.positional[index] ?? parsed.values[index];
    })
    : parsed.values;
  return {
    named: parsed.named,
    args,
  };
}


// PeerPrep bounds each Java UTF8 constant without compile-time concatenation.
export function renderJavaJsonString(value) {
  if (value.length <= 8192) return JSON.stringify(value);
  const chunks=[]; for(let offset=0;offset<value.length;offset+=8192) chunks.push(JSON.stringify(value.slice(offset,offset+8192)));
  return 'new StringBuilder()'+chunks.map(chunk=>'.append('+chunk+')').join('')+'.toString()';
}
const JAVA_LARGE_INPUT_PARSER = "\n  private static Object __ppReadLargeJson(String source) {\n    __ppLargeJsonReader reader = new __ppLargeJsonReader(source);\n    Object value = reader.read(0); reader.space();\n    if (reader.position != source.length()) throw new IllegalArgumentException(\"Trailing input JSON\");\n    return value;\n  }\n  private static final class __ppLargeJsonReader {\n    final String source; int position;\n    __ppLargeJsonReader(String source) { this.source = source; }\n    void space() { while (position < source.length() && Character.isWhitespace(source.charAt(position))) position++; }\n    char take() { if (position >= source.length()) throw new IllegalArgumentException(\"Incomplete input JSON\"); return source.charAt(position++); }\n    String string() {\n      if (take() != '\"') throw new IllegalArgumentException(\"Expected JSON string\");\n      StringBuilder result = new StringBuilder();\n      while (true) {\n        char next = take(); if (next == '\"') return result.toString();\n        if (next != '\\\\') { result.append(next); continue; }\n        next = take();\n        switch (next) {\n          case '\"': case '\\\\': case '/': result.append(next); break;\n          case 'b': result.append('\\b'); break; case 'f': result.append('\\f'); break;\n          case 'n': result.append('\\n'); break; case 'r': result.append('\\r'); break; case 't': result.append('\\t'); break;\n          case 'u':\n            if (position + 4 > source.length()) throw new IllegalArgumentException(\"Incomplete unicode escape\");\n            result.append((char)Integer.parseInt(source.substring(position, position + 4), 16)); position += 4; break;\n          default: throw new IllegalArgumentException(\"Invalid JSON escape\");\n        }\n      }\n    }\n    Object read(int depth) {\n      if (depth > 64) throw new IllegalArgumentException(\"Input JSON nesting limit\");\n      space(); if (position >= source.length()) throw new IllegalArgumentException(\"Missing input JSON\");\n      char first = source.charAt(position);\n      if (first == '\"') return string();\n      if (first == '[') {\n        position++; java.util.ArrayList<Object> values = new java.util.ArrayList<>(); space();\n        if (position < source.length() && source.charAt(position) == ']') { position++; return values; }\n        while (true) { values.add(read(depth + 1)); space(); char next = take(); if (next == ']') return values; if (next != ',') throw new IllegalArgumentException(\"Invalid JSON array\"); }\n      }\n      if (first == '{') {\n        position++; java.util.LinkedHashMap<String,Object> values = new java.util.LinkedHashMap<>(); space();\n        if (position < source.length() && source.charAt(position) == '}') { position++; return values; }\n        while (true) { space(); String key = string(); space(); if (take() != ':') throw new IllegalArgumentException(\"Invalid JSON object\"); values.put(key, read(depth + 1)); space(); char next = take(); if (next == '}') return values; if (next != ',') throw new IllegalArgumentException(\"Invalid JSON object\"); }\n      }\n      for (String literal : new String[]{\"true\", \"false\", \"null\"}) {\n        if (source.startsWith(literal, position)) { position += literal.length(); return literal.equals(\"null\") ? null : Boolean.valueOf(literal); }\n      }\n      int start = position;\n      while (position < source.length() && \"-+0123456789.eE\".indexOf(source.charAt(position)) >= 0) position++;\n      if (position == start) throw new IllegalArgumentException(\"Invalid input JSON value\");\n      String number = source.substring(start, position);\n      if (number.indexOf('.') >= 0 || number.indexOf('e') >= 0 || number.indexOf('E') >= 0) return Double.valueOf(number);\n      return Long.valueOf(number);\n    }\n  }\n";
function injectJavaLargeInputParser(source, language) {
  if (language !== 'java' || !source.includes('__ppReadLargeJson(')) return source;
  if (source.includes('private static Object __ppReadLargeJson')) return source;
  if (source.split('class Main {').length !== 2) throw new HttpError(400, 'Large Java inputs require the canonical private runner.');
  return source.replace('class Main {', 'class Main {' + JAVA_LARGE_INPUT_PARSER);
}

export function materializeFunctionInputPlaceholders(template, rawInput, functionContract = {}) {
  const source = String(template || '');
  if (!source.includes('{{TEST_INPUT_') && !source.includes('{{ARGUMENTS_JSON') && !source.includes('{{ARG_')) return source;
  const payload = buildFunctionInputPayload(rawInput, functionContract);
  const inputValue = Object.keys(payload.named).length ? payload.named : payload.args;
  const inputJson = JSON.stringify(inputValue);
  const argumentsJson = JSON.stringify(payload.args);
  const language = String(functionContract?.runnerLanguage || '').toLowerCase();
  const parameters = Array.isArray(functionContract?.parameters) ? functionContract.parameters : [];
  const prepared = flattenLargeCMatrixDeclarations(source, payload, parameters, language)
    .split('{{TEST_INPUT_JSON}}').join(inputJson)
    .split('{{TEST_INPUT_JSON_STRING}}').join(language === 'java' ? renderJavaJsonString(inputJson) : JSON.stringify(inputJson))
    .split('{{ARGUMENTS_JSON}}').join(argumentsJson)
    .split('{{ARGUMENTS_JSON_STRING}}').join(language === 'java' ? renderJavaJsonString(argumentsJson) : JSON.stringify(argumentsJson))
    .replace(/\{\{ARG_(\d+)_COL_SIZES}}/g, (placeholder, rawIndex) => {
      const index = Number(rawIndex);
      if (language !== 'c') throw new HttpError(400, 'Column-size literals are only available for the C runner.');
      return renderCColumnSizes(payload.args[index]);
    })
    .replace(/\{\{ARG_(\d+)}}/g, (placeholder, rawIndex) => {
      const index = Number(rawIndex);
      return renderNativeArgument(language, parameters[index]?.type || 'any', payload.args[index]);
    });
  return injectJavaLargeInputParser(prepared, language);
}

function cppType(type) {
  const normalized = String(type || 'any').toLowerCase();
  if (normalized.slice(-2) === '[]') return `vector<${cppType(normalized.slice(0, -2))}>`;
  return ({
    'tree-node': 'TreeNode*', treenode: 'TreeNode*', 'list-node': 'ListNode*', listnode: 'ListNode*',
    integer: 'int', int: 'int', long: 'long long', double: 'double', float: 'double',
    boolean: 'bool', bool: 'bool', string: 'string', character: 'char', char: 'char',
  })[normalized] || 'int';
}

function cppScalar(value, type) {
  const normalized = String(type || '').toLowerCase();
  if (value === null || value === undefined) return 'nullptr';
  if (normalized === 'string') return JSON.stringify(String(value));
  if (normalized === 'character' || normalized === 'char') {
    const character = String(value || '\0').slice(0, 1).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `'${character}'`;
  }
  if (normalized === 'boolean' || normalized === 'bool') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  return JSON.stringify(value);
}

function renderCpp(value, type) {
  const normalized = String(type || 'any').toLowerCase();
  const largeStrings=renderLargeCppStringArray(value,normalized);
  if(largeStrings!==null)return largeStrings;
  const largeMatrix = renderLargeCppNumericMatrix(value, normalized, cppScalar);
  if (largeMatrix !== null) return largeMatrix;
  if (['tree-node', 'treenode'].includes(normalized)) {
    const values = Array.isArray(value) ? value.map((entry) => (entry === null ? 'LLONG_MIN' : String(Number(entry)))) : [];
    return `__ppBuildTree(vector<long long>{${values.join(',')}})`;
  }
  if (['list-node', 'listnode'].includes(normalized)) {
    const values = Array.isArray(value) ? value.map((entry) => String(Number(entry))) : [];
    return `__ppBuildList(vector<int>{${values.join(',')}})`;
  }
  if (normalized.slice(-2) === '[]') {
    const childType = normalized.slice(0, -2);
    const values = Array.isArray(value) ? value : [];
    return `${cppType(normalized)}{${values.map((entry) => renderCpp(entry, childType)).join(',')}}`;
  }
  return cppScalar(value, normalized);
}

function renderJavaObject(value) {
  if (typeof value === 'string') return renderJavaJsonString(value);
  if (value !== null && typeof value === 'object') {
    const json = JSON.stringify(value);
    if (json.length > 4096) return '__ppReadLargeJson(' + renderJavaJsonString(json) + ')';
  }
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return `java.util.Arrays.asList(${value.map((entry) => renderJavaObject(entry)).join(', ')})`;
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Boolean.TRUE' : 'Boolean.FALSE';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return `Long.valueOf(${value}L)`;
    return `Double.valueOf(${String(value)})`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return `new java.util.LinkedHashMap<String, Object>() {{ ${entries.map(([key, entry]) => (
      `put(${JSON.stringify(key)}, ${renderJavaObject(entry)});`
    )).join(' ')} }}`;
  }
  return 'null';
}

function cScalar(value, type) {
  const normalized = String(type || '').toLowerCase();
  if (value === null || value === undefined) return 'NULL';
  if (normalized === 'string') return JSON.stringify(String(value));
  if (normalized === 'character' || normalized === 'char') {
    const character = String(value || '\0').slice(0, 1).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `'${character}'`;
  }
  if (normalized === 'boolean' || normalized === 'bool') return value ? 'true' : 'false';
  return String(value);
}

function renderMutableCStringArrayEntry(value, type) {
  if (type === 'string' && value !== null && value !== undefined) return '(char[]){' + JSON.stringify(String(value)) + '}';
  return cScalar(value, type);
}

function renderC(value, type) {
  const normalized = String(type || 'integer').toLowerCase();
  if (['tree-node', 'treenode', 'list-node', 'listnode'].includes(normalized)) {
    return `{${(Array.isArray(value) ? value : []).map((entry) => (entry === null ? 'INT_MIN' : String(entry))).join(',')}}`;
  }
  if (['tree-node[]','list-node[]'].includes(normalized)) {
    const builder = normalized === 'tree-node[]' ? '__ppBuildTree' : '__ppBuildList';
    return `{${value.map(values => !values.length ? 'NULL' : `${builder}((int[]){${values.map(entry => entry === null ? 'INT_MIN' : String(entry)).join(',')}}, ${values.length})`).join(',')}}`;
  }
  if (normalized.slice(-2) === '[]') {
    const childType = normalized.slice(0, -2);
    const values = Array.isArray(value) ? value : [];
    if (childType.endsWith('[]')) {
      const scalarType = childType.slice(0, -2);
      const base = ({ integer: 'int', int: 'int', long: 'long long', double: 'double', float: 'double', string: 'char*', character: 'char', char: 'char' })[scalarType] || 'int';
      return `{${values.map((entry) => `(${base}[]){${(Array.isArray(entry) ? entry : []).map((item) => renderMutableCStringArrayEntry(item, scalarType)).join(',')}}`).join(',')}}`;
    }
    return `{${values.map((entry) => renderMutableCStringArrayEntry(entry, childType)).join(',')}}`;
  }
  return cScalar(value, normalized);
}

function renderCColumnSizes(value) {
  return `{${(Array.isArray(value) ? value : []).map((entry) => (Array.isArray(entry) ? entry.length : 0)).join(',')}}`;
}

export function renderNativeArgument(language, type, value) {
  if (language === 'cpp') return renderCpp(value, type);
  if (language === 'java') return renderJavaObject(value);
  if (language === 'c') return renderC(value, type);
  throw new HttpError(400, `Native testcase literal generation is not available for ${language || 'this runner'}.`);
}
