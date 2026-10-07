import {hasExhaustiveParenthesesQueensDomain} from '../parentheses-queens-finite-domain.js';
import {hasExhaustiveSpecialGridDomain} from '../special-grid-finite-domain.js';
import {customNodeRule,validateCustomNodeFixture,validateCustomNodeOracle,prepareCustomNodeSource} from '../../../src/services/customNodeRunnerService.js';
import { providedObjectRule, validateProvidedObjectFixture, acceptsProvidedObjectOutput, prepareProvidedObjectSource } from '../../../src/services/providedObjectApiNextRunnerService.js';
import { isRead4Problem, validateRead4Fixture, acceptsRead4Output, prepareRead4Source } from '../../../src/services/read4ApiRunnerService.js';
import { hasExhaustiveContestMatchDomain } from '../contest-match-finite-domain.js';
import { isAbsentIdentityTreeSelectorProblem, validateAbsentIdentityTreeSelectorOutput, prepareAbsentIdentityTreeSelectorSource } from '../../../src/services/absentIdentityTreeSelectorRunnerService.js';
import { isExactScalarLongProblem, validateExactScalarLongFixture, prepareExactScalarLongSource } from '../../../src/services/exactScalarLongRunnerService.js';
import { isGuessNumberProblem, validateGuessNumberFixture, prepareGuessNumberSource } from '../../../src/services/guessNumberApiRunnerService.js';
import { isSourceSupportedStatefulTolerance } from '../../../src/services/statefulFloatingOutputPolicyService.js';
import { acceptsRandomizedStatefulOutput } from '../../../src/services/randomizedStatefulOutputService.js';
// PeerPrep canonical node collections.
import { createHash } from 'node:crypto';

import { buildJudge0Options, KEY_TO_LANGUAGE_ID, runJudge0 } from '../../../src/services/executionService.js';
import { prepareFunctionSourceForExecution } from '../../../src/services/functionProblemAdapterService.js';
import { evaluateProblemSubmissionResult } from '../../../src/services/problemSubmissionEvaluationService.js';
import { generateFunctionRunnerTemplate } from '../../../src/services/functionRunnerTemplateService.js';
import { buildFunctionInputPayload, parseFunctionTestInput } from '../../../src/services/functionTestInputService.js';
import { validateNodeCollectionFixture, normalizeNodeCollectionContract } from '../../../src/services/nodeCollectionContractService.js';
import { prepareStatefulSource, validateStatefulFixture } from '../../../src/services/statefulRunnerService.js';
import { isIdentityTreeSelectorContract, validateIdentityTreeSelectorFixture, prepareIdentityTreeSelectorSource } from '../../../src/services/identityTreeSelectorRunnerService.js';

export const REQUIRED_LANGUAGES = Object.freeze([
  'python', 'cpp', 'c', 'java', 'javascript', 'typescript',
]);

// These contracts have fewer than thirteen possible inputs. Complete domain
// coverage is stronger evidence than manufacturing extra out-of-domain cases.
export function hasExhaustiveFiniteDomain(candidate) {
  if (hasExhaustiveParenthesesQueensDomain(candidate)) return true;
  if (hasExhaustiveSpecialGridDomain(candidate)) return true;
  if (hasExhaustiveContestMatchDomain(candidate)) return true;
  const domains = {
    countNumbersWithUniqueDigits: [0, 8], totalNQueens: [1, 9],
    largestPalindrome: [1, 8], readBinaryWatch: [0, 10],
    generateTrees: [1, 8],
    selfDivisiblePermutationCount: [1, 12],
  };
  const contract = candidate?.functionContract;
  const bounds = domains[contract?.methodName];
  if (!bounds || contract.parameters?.length !== 1 || contract.parameters[0].type !== 'integer') return false;
  if (contract.methodName === 'generateTrees' && (candidate.title !== 'Unique Binary Search Trees II' || normalizeNodeCollectionContract(contract).returnType !== 'tree-node[]')) return false;
  if (contract.methodName === 'largestPalindrome' && !['integer', 'long'].includes(contract.returnType)) return false;
  if (contract.methodName === 'selfDivisiblePermutationCount' && (candidate.title !== 'Number of Self-Divisible Permutations' || contract.returnType !== 'integer' || contract.parameters[0].name !== 'n' || contract.kind === 'stateful')) return false;
  const covered = new Set();
  try {
    for (const entry of [...(candidate.sampleTestCases || []), ...(candidate.hiddenTestCases || [])]) {
      if (contract.methodName === 'selfDivisiblePermutationCount') {
        const parsed = parseFunctionTestInput(entry.input), named = Object.keys(parsed.named);
        if (named.length ? named.length !== 1 || named[0] !== 'n' : parsed.positional.length !== 1) return false;
      }
      const [value] = buildFunctionInputPayload(entry.input, contract).args;
      if (!Number.isInteger(value) || value < bounds[0] || value > bounds[1] || covered.has(value)) return false;
      covered.add(value);
    }
  } catch { return false; }
  return covered.size === bounds[1] - bounds[0] + 1;
}

const LANGUAGE_ALIASES = Object.freeze({
  python3: 'python', python: 'python', cpp: 'cpp', 'c++': 'cpp', c: 'c',
  java: 'java', javascript: 'javascript', js: 'javascript', typescript: 'typescript', ts: 'typescript',
});

const SCALAR_TYPES = new Set([
  'integer', 'long', 'double', 'boolean', 'string', 'character', 'tree-node', 'list-node', 'void',
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function codeMap(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (!Array.isArray(value)) return value;
  return Object.fromEntries(value.map((entry) => [
    LANGUAGE_ALIASES[String(entry?.lang || '').trim().toLowerCase()] || String(entry?.lang || '').trim().toLowerCase(),
    String(entry?.code || ''),
  ]).filter(([language]) => language));
}

function splitTopLevel(value, separator = ',') {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if ('[({<'.includes(character)) depth += 1;
    else if ('])}>'.includes(character)) depth -= 1;
    else if (character === separator && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

export function canonicalType(annotation) {
  let source = String(annotation || '').trim();
  source = source.replace(/^['"]|['"]$/g, '').replace(/\s+/g, '');
  source = source.replace(/^typing\./i, '');
  source = source.replace(/^Optional\[(.*)]$/i, '$1').replace(/\|None$/i, '');
  const listMatch = source.match(/^(?:List|list|Array|Sequence|Iterable)\[(.*)]$/i);
  if (listMatch) {
    const child = canonicalType(listMatch[1]);
    return child ? `${child}[]` : '';
  }
  if (/\[\]$/.test(source)) {
    const child = canonicalType(source.slice(0, -2));
    return child ? `${child}[]` : '';
  }
  return ({
    int: 'integer', integer: 'integer', number: 'integer', i32: 'integer',
    long: 'long', int64: 'long', i64: 'long', bigint: 'long',
    float: 'double', double: 'double', numberfloat: 'double',
    bool: 'boolean', boolean: 'boolean',
    str: 'string', string: 'string',
    char: 'character', character: 'character',
    treenode: 'tree-node', 'tree-node': 'tree-node',
    listnode: 'list-node', 'list-node': 'list-node',
    none: 'void', nonetype: 'void', void: 'void',
  })[source.toLowerCase()] || '';
}

export function isRunnerSupportedType(type, { allowVoid = false } = {}) {
  let normalized = String(type || '').toLowerCase();
  let dimensions = 0;
  while (normalized.endsWith('[]')) {
    dimensions += 1;
    normalized = normalized.slice(0, -2);
  }
  if (dimensions > 2) return false;
  if (!SCALAR_TYPES.has(normalized)) return false;
  if (normalized === 'void') return allowVoid && dimensions === 0;
  if (['tree-node', 'list-node'].includes(normalized) && dimensions > 1) return false;
  return true;
}

function parsePythonContract(source) {
  const text = String(source || '');
  const className = text.match(/^\s*class\s+Solution\s*(?:\([^)]*\))?\s*:/m)
    ? 'Solution'
    : (text.match(/^\s*class\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*:/m)?.[1] || 'Solution');
  const signatures = [...text.matchAll(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^\n]*)\)\s*(?:->\s*([^:\n]+))?\s*:/gm)];
  const signature = signatures.find((entry) => !/^__.*__$/.test(entry[1])) || signatures[0];
  if (!signature) return null;
  const rawParameters = splitTopLevel(signature[2]).filter((entry) => !/^(?:self|cls)(?:\s*:.*)?$/.test(entry));
  const parameters = rawParameters.map((entry) => {
    const withoutDefault = splitTopLevel(entry, '=')[0] || entry;
    const match = withoutDefault.match(/^([A-Za-z_]\w*)\s*:\s*(.+)$/);
    return match ? { name: match[1], type: canonicalType(match[2]) } : { name: withoutDefault.trim(), type: '' };
  });
  return {
    className,
    methodName: signature[1],
    parameters,
    returnType: canonicalType(signature[3] || ''),
    outputMode: 'return',
    outputParameterIndex: 0,
  };
}

function parseTypeScriptContract(source) {
  const text = String(source || '');
  const className = text.match(/\bclass\s+([A-Za-z_$][\w$]*)\b/)?.[1] || 'Solution';
  const signature = text.match(/(?:\bfunction\s+|(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*)([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*:\s*([^\s{;]+)/);
  if (!signature) return null;
  const parameters = splitTopLevel(signature[2]).map((entry) => {
    const match = entry.match(/^([A-Za-z_$][\w$]*)\??\s*:\s*(.+)$/);
    return match ? { name: match[1], type: canonicalType(match[2]) } : { name: entry.trim(), type: '' };
  });
  return {
    className,
    methodName: signature[1],
    parameters,
    returnType: canonicalType(signature[3]),
    outputMode: 'return',
    outputParameterIndex: 0,
  };
}

export function inferFunctionContract(codeSnippets) {
  const snippets = codeMap(codeSnippets);
  const candidates = [parsePythonContract(snippets.python), parseTypeScriptContract(snippets.typescript)].filter(Boolean);
  return candidates.sort((left, right) => {
    const score = (contract) => (contract.parameters || []).filter((parameter) => parameter.type).length
      + (contract.returnType ? 1 : 0)
      + (portableContractShape(contract) ? 1000 : 0);
    return score(right) - score(left);
  })[0] || null;
}

function portableContractShape(contract) {
  return Boolean(contract?.methodName)
    && (contract.parameters || []).every((parameter) => parameter.name && isRunnerSupportedType(parameter.type))
    && isRunnerSupportedType(contract.returnType, { allowVoid: true });
}

function containsUndefined(value) {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === 'object') return Object.values(value).some(containsUndefined);
  return false;
}

function issue(code, message, detail = {}) {
  return { code, message, ...detail };
}

export function buildExecutionArtifacts(candidate) {
  const templates = codeMap(candidate?.codeTemplates || candidate?.codeSnippets);
  const originalContract = normalizeNodeCollectionContract(candidate?.functionContract || inferFunctionContract(templates));
  const contract = isIdentityTreeSelectorContract(originalContract) ? { ...originalContract, parameters: originalContract.parameters.map(parameter => ({ ...parameter, type: 'tree-node' })), returnType: 'tree-node' } : originalContract;
  const executionHarnesses = {};
  if (contract?.methodName && contract.kind !== 'stateful' && !isIdentityTreeSelectorContract(contract) && !providedObjectRule({...candidate,functionContract:contract}) && !customNodeRule({...candidate,functionContract:contract})) {
    for (const language of REQUIRED_LANGUAGES) {
      if (!String(templates[language] || '').trim()) continue;
      executionHarnesses[language] = generateFunctionRunnerTemplate(language, contract, templates[language]);
    }
  }
  return { codeTemplates: templates, functionContract: contract, executionHarnesses };
}

export function candidateFingerprint(candidate, artifacts = buildExecutionArtifacts(candidate)) {
  const references = codeMap(candidate?.referenceSolutions);
  const cases = [...(candidate?.sampleTestCases || []), ...(candidate?.hiddenTestCases || [])].map((entry) => ({
    kind: entry.kind || '', position: entry.position || 0,
    input: String(entry.input || ''), output: String(entry.output || ''),
  }));
  const payload = {
    engine: 'hf-execution-v1',
    problemTitle: String(candidate?.title || ''),
    languages: REQUIRED_LANGUAGES,
    contract: artifacts.functionContract,
    codeTemplates: artifacts.codeTemplates,
    executionHarnesses: artifacts.executionHarnesses,
    referenceSolutions: references,
    limits: buildJudge0Options(candidate),
    cases,
  };
  return createHash('sha256').update(stableJson(payload)).digest('hex');
}

export function candidateLanguageFingerprint(candidate, artifacts, language) {
  if (!REQUIRED_LANGUAGES.includes(language)) throw new Error('Unknown validation language.');
  const references = codeMap(candidate.referenceSolutions);
  return candidateFingerprint({ ...candidate, referenceSolutions: { [language]: references[language] || '' } }, {
    functionContract: artifacts.functionContract,
    codeTemplates: { [language]: artifacts.codeTemplates[language] || '' },
    executionHarnesses: { [language]: artifacts.executionHarnesses[language] || '' },
  });
}

export function analyzeExecutionCandidate(candidate) {
  const artifacts = buildExecutionArtifacts(candidate);
  const references = codeMap(candidate?.referenceSolutions);
  const problems = [];
  const contract = artifacts.functionContract;
  const stateful = contract?.kind === 'stateful';
  const identityTree = isIdentityTreeSelectorContract(contract);
  const absentIdentityTree = isAbsentIdentityTreeSelectorProblem({...candidate,functionContract:contract});
  const exactScalarLong = isExactScalarLongProblem({...candidate,functionContract:contract});
  const guessNumber = isGuessNumberProblem({...candidate,functionContract:contract});
  const read4 = isRead4Problem({...candidate,functionContract:contract});
  const providedObject = providedObjectRule({...candidate,functionContract:contract});
  const customNode = customNodeRule({...candidate,functionContract:contract});
  const tolerance = contract?.absoluteTolerance;
  if (tolerance !== undefined && (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 0.01 || (tolerance && (stateful ? !isSourceSupportedStatefulTolerance(contract) : !/^(double|float)(\[\]){0,2}$/.test(contract.returnType || ''))))) {
    problems.push(issue('ABSOLUTE_TOLERANCE_INVALID', 'Tolerance must be finite, bounded, and apply to a floating-point function return or floating-point array.'));
  }
  if (!stateful && !contract?.methodName) problems.push(issue('CONTRACT_MISSING', 'A typed Python or TypeScript function signature is required.'));
  if (stateful) {
    if (!/^[A-Za-z_]\w*$/.test(contract.cConstructorName || '') || (contract.operations || []).some((operation) => !/^[A-Za-z_]\w*$/.test(operation.cFunctionName || ''))) {
      problems.push(issue('STATEFUL_C_BINDING_MISSING', 'Stateful constructor and operations need explicit C function bindings.'));
    }
  }
  if (contract && !stateful) {
    for (const [index, parameter] of (contract.parameters || []).entries()) {
      if (!parameter.name || (!isRunnerSupportedType(parameter.type) && !providedObject && !customNode)) {
        problems.push(issue('CONTRACT_PARAMETER_UNSUPPORTED', `Parameter ${index + 1} cannot be represented by every requested runner.`, { parameter }));
      }
    }
    if (!isRunnerSupportedType(contract.returnType, { allowVoid: true }) && !customNode) {
      problems.push(issue('CONTRACT_RETURN_UNSUPPORTED', 'Return type cannot be represented by every requested runner.', { returnType: contract.returnType }));
    }
    if (contract.returnType === 'void' && contract.outputMode !== 'parameter' && customNode?.kind !== 'robot-clean') {
      problems.push(issue(
        'VOID_OUTPUT_MODE_UNRESOLVED',
        'A void LeetCode method must identify the mutated output parameter before test outputs can be compared.',
      ));
    }
    if (contract.outputMode === 'parameter') {
      const outputIndex = Number(contract.outputParameterIndex);
      if (!Number.isInteger(outputIndex) || outputIndex < 0 || outputIndex >= (contract.parameters || []).length) {
        problems.push(issue('OUTPUT_PARAMETER_INVALID', 'The mutated output parameter index is outside the function contract.'));
      }
    }
  }
  for (const language of REQUIRED_LANGUAGES) {
    if (!String(artifacts.codeTemplates[language] || '').trim()) {
      problems.push(issue('STARTER_MISSING', `Missing ${language} starter template.`, { language }));
    }
    if (!String(references[language] || '').trim()) {
      problems.push(issue('REFERENCE_MISSING', `Missing independently executable ${language} reference solution.`, { language }));
    }
    if (!stateful && !identityTree && !read4 && !providedObject && !customNode && !String(artifacts.executionHarnesses[language] || '').trim()) {
      problems.push(issue('RUNNER_MISSING', `Could not generate the ${language} private runner.`, { language }));
    }
  }
  const samples = candidate?.sampleTestCases || [];
  const hidden = candidate?.hiddenTestCases || [];
  if (samples.length < 3) problems.push(issue('SAMPLES_INSUFFICIENT', 'At least 3 sample cases are required.', { count: samples.length }));
  if ((hidden.length < 10 || hidden.length > 12) && !hasExhaustiveFiniteDomain(candidate)) {
    problems.push(issue('HIDDEN_CASE_COUNT', 'Hidden case count must be between 10 and 12.', { count: hidden.length }));
  }
  const seen = new Set();
  const coveredOperations = new Set();
  for (const [index, testCase] of [...samples, ...hidden].entries()) {
    const key = stableJson([String(testCase.input || '').trim(), String(testCase.output || '').trim()]);
    if (seen.has(key)) problems.push(issue('TESTCASE_DUPLICATE', 'Testcases must be unique.', { caseIndex: index }));
    seen.add(key);
    if (!String(testCase.input || '').trim()) problems.push(issue('TESTCASE_INPUT_EMPTY', 'Testcase input is empty.', { caseIndex: index }));
    if (testCase.output === undefined || testCase.output === null || !String(testCase.output).trim()) {
      problems.push(issue('TESTCASE_OUTPUT_EMPTY', 'Testcase output is empty.', { caseIndex: index }));
    }
    if (stateful) {
      try {
        const fixture = validateStatefulFixture(contract, testCase.input);
        const expected = JSON.parse(testCase.output);
        const randomOracle = acceptsRandomizedStatefulOutput({...candidate,functionContract:contract}, testCase, testCase.output);
        if (randomOracle === false) problems.push(issue('STATEFUL_RANDOM_ORACLE_INVALID', 'Randomized fixture outputs must respect current state and deterministic operation results.', {caseIndex:index}));
        if (!Array.isArray(expected) || expected.length !== fixture.calls.length || fixture.calls.some((call, position) => (call.constructor || call.returnType === 'void') && expected[position] !== null)) {
          problems.push(issue('STATEFUL_OUTPUT_SHAPE_INVALID', 'Stateful output requires one result per operation and null for constructors or void methods.', { caseIndex: index }));
        }
        fixture.calls.filter((call) => !call.constructor).forEach((call) => coveredOperations.add(call.methodName));
        for (const language of REQUIRED_LANGUAGES) {
          if (String(references[language] || '').trim()) prepareStatefulSource(language, contract, references[language], testCase.input);
        }
      } catch (error) {
        problems.push(issue('STATEFUL_TESTCASE_INVALID', error.message, { caseIndex: index }));
      }
    } else if (customNode) {
      try {
        const nodeProblem={...candidate,functionContract:contract};
        validateCustomNodeFixture(nodeProblem,testCase.input);
        if(!validateCustomNodeOracle(nodeProblem,testCase))throw Error('Custom-node oracle disagrees with independently derived structure.');
        for(const language of REQUIRED_LANGUAGES)if(String(references[language]||'').trim())prepareCustomNodeSource(language,nodeProblem,references[language],testCase.input);
      }catch(error){problems.push(issue('CUSTOM_NODE_TESTCASE_INVALID',error.message,{caseIndex:index}));}
    } else if (providedObject) {
      try {
        const apiProblem={...candidate,functionContract:contract};
        validateProvidedObjectFixture(apiProblem,testCase.input);
        if(acceptsProvidedObjectOutput(apiProblem,testCase,testCase.output)!==true)throw Error('Provided-interface oracle disagrees with its independent private environment.');
        for(const language of REQUIRED_LANGUAGES)if(String(references[language]||'').trim())prepareProvidedObjectSource(language,apiProblem,references[language],testCase.input);
      } catch(error){problems.push(issue('PROVIDED_OBJECT_TESTCASE_INVALID',error.message,{caseIndex:index}));}
    } else if (read4) {
      try {
        const apiProblem={...candidate,functionContract:contract};
        validateRead4Fixture(apiProblem,testCase.input);
        if(acceptsRead4Output(apiProblem,testCase,testCase.output)!==true)throw Error('read4 oracle must match exact physical stream lengths.');
        for(const language of REQUIRED_LANGUAGES)if(String(references[language]||'').trim())prepareRead4Source(language,apiProblem,references[language],testCase.input);
      } catch(error){problems.push(issue('READ4_TESTCASE_INVALID',error.message,{caseIndex:index}));}
    } else if (guessNumber) {
      try {
        const apiProblem = {...candidate,functionContract:contract};
        const {pick} = validateGuessNumberFixture(apiProblem, testCase.input);
        if (String(testCase.output).trim() !== String(pick)) throw new Error('Guess Number output must equal the private picked value.');
        for (const language of REQUIRED_LANGUAGES) if (String(references[language] || '').trim()) prepareGuessNumberSource(language, apiProblem, references[language], testCase.input);
      } catch (error) {
        problems.push(issue('GUESS_NUMBER_TESTCASE_INVALID', error.message, {caseIndex:index}));
      }
    } else if (exactScalarLong) {
      try {
        const exactProblem = {...candidate,functionContract:contract};
        validateExactScalarLongFixture(exactProblem, testCase.input);
        for (const language of REQUIRED_LANGUAGES) if (String(references[language] || '').trim()) prepareExactScalarLongSource(language, exactProblem, references[language], testCase.input);
      } catch (error) {
        problems.push(issue('EXACT_SCALAR_LONG_TESTCASE_INVALID', error.message, {caseIndex:index}));
      }
    } else if (absentIdentityTree) {
      try {
        const selectorProblem = {...candidate,functionContract:contract};
        validateAbsentIdentityTreeSelectorOutput(selectorProblem, testCase.input, testCase.output);
        for (const language of REQUIRED_LANGUAGES) if (String(references[language] || '').trim()) prepareAbsentIdentityTreeSelectorSource(language, selectorProblem, references[language], testCase.input);
      } catch (error) {
        problems.push(issue('ABSENT_IDENTITY_TREE_TESTCASE_INVALID', error.message, {caseIndex:index}));
      }
    } else if (identityTree) {
      try {
        validateIdentityTreeSelectorFixture(contract, testCase.input);
        const expected = JSON.parse(testCase.output);
        if (!Array.isArray(expected) || !expected.length || expected[0] === null || expected.some(value => value !== null && !Number.isSafeInteger(value))) throw new Error('Tree selector output must serialize the returned subtree in level order.');
        for (const language of REQUIRED_LANGUAGES) if (String(references[language] || '').trim()) prepareIdentityTreeSelectorSource(language, contract, references[language], testCase.input);
      } catch (error) {
        problems.push(issue('IDENTITY_TREE_TESTCASE_INVALID', error.message, { caseIndex: index }));
      }
    } else if (contract?.methodName) {
      try {
        validateNodeCollectionFixture(contract, testCase.input, testCase.output);
        const payload = buildFunctionInputPayload(testCase.input, contract);
        if (payload.args.length !== contract.parameters.length || containsUndefined(payload.args)) {
          problems.push(issue('TESTCASE_ARGUMENT_MISMATCH', 'Testcase arguments do not satisfy the function contract.', { caseIndex: index }));
        }
      } catch (error) {
        problems.push(issue('TESTCASE_PARSE_ERROR', error.message, { caseIndex: index }));
      }
    }
  }
  if (stateful) {
    for (const operation of contract.operations || []) if (!coveredOperations.has(operation.methodName)) {
      problems.push(issue('STATEFUL_OPERATION_UNTESTED', `No fixture exercises ${operation.methodName}.`));
    }
  }
  return {
    valid: problems.length === 0,
    issues: problems,
    fingerprint: candidateFingerprint(candidate, artifacts),
    artifacts,
  };
}

export async function validateCandidateOnJudge0(candidate, { stopOnFirstFailure = true } = {}) {
  const preflight = analyzeExecutionCandidate(candidate);
  if (!preflight.valid) return { ...preflight, executions: [], passed: false };
  const references = codeMap(candidate.referenceSolutions);
  const testCases = [...candidate.sampleTestCases, ...candidate.hiddenTestCases];
  const executionProblem = {
    ...candidate,
    executionMode: 'function',
    functionContract: preflight.artifacts.functionContract,
    codeTemplates: preflight.artifacts.codeTemplates,
    executionHarnesses: preflight.artifacts.executionHarnesses,
  };
  const executions = [];
  for (const language of REQUIRED_LANGUAGES) {
    for (let caseIndex = 0; caseIndex < testCases.length; caseIndex += 1) {
      const testCase = testCases[caseIndex];
      try {
        const source = prepareFunctionSourceForExecution(executionProblem, language, references[language], testCase.input);
        const result = await runJudge0(source, KEY_TO_LANGUAGE_ID[language], testCase.input, buildJudge0Options(candidate));
        const evaluation = evaluateProblemSubmissionResult(executionProblem, result, testCase);
        const semanticallyEquivalent = Boolean(evaluation.semanticallyEquivalent);
        const internalStatus = evaluation.internalStatus;
        const record = {
          language, caseIndex, statusId: Number(result.status?.id || 0),
          status: internalStatus,
          semanticallyEquivalent,
          actual: String(result.stdout || '').slice(0, 1000),
          expected: String(testCase.output || '').slice(0, 1000),
          error: String(evaluation.error || result.compile_output || result.stderr || '').slice(0, 1000),
        };
        executions.push(record);
        if (record.statusId !== 3 || record.status !== 'AC') {
          if (stopOnFirstFailure) return { ...preflight, executions, passed: false };
          break;
        }
      } catch (error) {
        executions.push({ language, caseIndex, status: 'EXECUTION_ERROR', error: error.message });
        if (stopOnFirstFailure) return { ...preflight, executions, passed: false };
        break;
      }
    }
  }
  return {
    ...preflight,
    executions,
    passed: REQUIRED_LANGUAGES.every((language) => (
      executions.filter((entry) => entry.language === language).length === testCases.length
      && executions.filter((entry) => entry.language === language).every((entry) => entry.status === 'AC' && entry.statusId === 3)
    )),
  };
}
