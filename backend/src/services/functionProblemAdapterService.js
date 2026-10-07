import {normalizeJavaScalarStringFormatter} from './javaScalarStringFormatterService.js';
import {customNodeRule,prepareCustomNodeSource} from './customNodeRunnerService.js';
import { providedObjectRule, prepareProvidedObjectSource } from './providedObjectApiNextRunnerService.js';
import { isRead4Problem, prepareRead4Source } from './read4ApiRunnerService.js';
import { prepareJavaScriptFunctionSource } from './javascriptFunctionCompatibilityService.js';
import { isAbsentIdentityTreeSelectorProblem, prepareAbsentIdentityTreeSelectorSource } from './absentIdentityTreeSelectorRunnerService.js';
import { isExactScalarLongProblem, prepareExactScalarLongSource } from './exactScalarLongRunnerService.js';
import { isGuessNumberProblem, prepareGuessNumberSource } from './guessNumberApiRunnerService.js';
import { materializeFunctionInputPlaceholders } from './functionTestInputService.js';
import { prepareBundledCHeader } from './bundledCHeaderService.js';
import { prepareStatefulSource } from './statefulRunnerService.js';
import { normalizeNodeCollectionContract, hasNodeCollectionContract, validateNodeCollectionFixture } from './nodeCollectionContractService.js';
import { isIdentityTreeSelectorContract, prepareIdentityTreeSelectorSource } from './identityTreeSelectorRunnerService.js';

const PYTHON_ADAPTER_MARKER = '# PeerPrep generated function adapter. Keep this section unchanged.';
export const USER_CODE_PLACEHOLDER = '{{USER_CODE}}';

function asTemplateObject(codeTemplates) {
  if (!codeTemplates) return {};
  if (codeTemplates instanceof Map) return Object.fromEntries(codeTemplates.entries());
  return typeof codeTemplates === 'object' ? codeTemplates : {};
}

export function hasPythonFunctionAdapter(sourceCode) {
  return String(sourceCode || '').includes(PYTHON_ADAPTER_MARKER);
}

function splitPythonFunctionTemplate(sourceCode) {
  const source = String(sourceCode || '').replace(/\r\n/g, '\n');
  const markerIndex = source.indexOf(PYTHON_ADAPTER_MARKER);
  if (markerIndex < 0) return null;

  const beforeAdapter = source.slice(0, markerIndex).trimEnd();
  const adapter = source.slice(markerIndex).trim();
  const classMatch = [...beforeAdapter.matchAll(/^class\s+Solution\s*:/gm)].pop();
  if (!classMatch) return null;

  return {
    prelude: beforeAdapter.slice(0, classMatch.index).trim(),
    starterCode: beforeAdapter.slice(classMatch.index).trim(),
    adapter,
  };
}

function normalizePythonAdapterEscapes(adapterSource) {
  // The original bulk importer emitted a few Python raw-regex literals with
  // two backslashes. In a Python raw string that matches a literal "\\w" or
  // "\\b", so named testcase inputs such as `nums = [1, 2]` were not parsed.
  // Keep this repair deliberately narrow so user/reference code is untouched.
  return String(adapterSource || '')
    .replaceAll("r'\\\\bnull\\\\b'", "r'\\bnull\\b'")
    .replaceAll("r'\\\\btrue\\\\b'", "r'\\btrue\\b'")
    .replaceAll("r'\\\\bfalse\\\\b'", "r'\\bfalse\\b'")
    .replaceAll(
      "r'(\\\\w+)\\\\s*=\\\\s*(.+?)(?=,\\\\s*\\\\w+\\\\s*=|$)'",
      "r'(\\w+)\\s*=\\s*(.+?)(?=,\\s*\\w+\\s*=|$)'",
    );
}

export function buildHiddenPythonHarness(sourceCode) {
  const parts = splitPythonFunctionTemplate(sourceCode);
  if (!parts) return '';
  return [parts.prelude, USER_CODE_PLACEHOLDER, normalizePythonAdapterEscapes(parts.adapter)]
    .filter(Boolean)
    .join('\n\n');
}

export function getVisibleCodeTemplate(languageKey, sourceCode) {
  if (String(languageKey || '').toLowerCase() !== 'python') return String(sourceCode || '');
  return splitPythonFunctionTemplate(sourceCode)?.starterCode || String(sourceCode || '');
}

export function getVisibleCodeTemplates(codeTemplates) {
  return Object.fromEntries(Object.entries(asTemplateObject(codeTemplates)).map(([languageKey, sourceCode]) => [
    languageKey,
    getVisibleCodeTemplate(languageKey, sourceCode),
  ]));
}

export function prepareFunctionSourceForExecution(problem, languageKey, submittedSource, testInput = '') {
  let source = problem?.executionMode === 'full_program' ? String(submittedSource || '') : prepareBundledCHeader(languageKey, String(submittedSource || ''));
  if (problem?.executionMode === 'full_program') return source;
  source = prepareJavaScriptFunctionSource(languageKey, source);

  const harnesses = asTemplateObject(problem?.executionHarnesses);
  const normalizedLanguage = String(languageKey || '').toLowerCase();
  const storedContract = normalizeNodeCollectionContract(problem?.functionContract?.toObject?.() || problem?.functionContract || {});
  if (hasNodeCollectionContract(storedContract) && !customNodeRule({title:problem?.title,executionMode:problem?.executionMode,functionContract:storedContract})) validateNodeCollectionFixture(storedContract, testInput);
  const absentIdentityProblem = {title:problem?.title,executionMode:problem?.executionMode,functionContract:storedContract};
  if (isAbsentIdentityTreeSelectorProblem(absentIdentityProblem)) return prepareAbsentIdentityTreeSelectorSource(normalizedLanguage, absentIdentityProblem, source, testInput);
  const exactLongProblem = {title:problem?.title,executionMode:problem?.executionMode,functionContract:storedContract};
  if (isExactScalarLongProblem(exactLongProblem)) return prepareExactScalarLongSource(normalizedLanguage, exactLongProblem, source, testInput);
  const apiProblem = {title:problem?.title,executionMode:problem?.executionMode,functionContract:storedContract};
  if (customNodeRule(apiProblem)) return prepareCustomNodeSource(normalizedLanguage, apiProblem, source, testInput);
  if (providedObjectRule(apiProblem)) return prepareProvidedObjectSource(normalizedLanguage, apiProblem, source, testInput);
  if (isRead4Problem(apiProblem)) return prepareRead4Source(normalizedLanguage, apiProblem, source, testInput);
  if (isGuessNumberProblem(apiProblem)) return prepareGuessNumberSource(normalizedLanguage, apiProblem, source, testInput);
  if (isIdentityTreeSelectorContract(storedContract)) {
    return prepareIdentityTreeSelectorSource(normalizedLanguage, storedContract, source, testInput);
  }
  if (storedContract.kind === 'stateful') {
    return prepareStatefulSource(normalizedLanguage, storedContract, source, testInput);
  }
  const submittedPythonParts = normalizedLanguage === 'python'
    ? splitPythonFunctionTemplate(source)
    : null;
  // Imported private Python references originally contained their own CLI
  // adapter. When a separately stored private runner exists, injecting that
  // complete source would execute two mains: the first consumes stdin and the
  // second crashes on empty input. Only inject the reference prelude + Solution.
  let injectableSource = submittedPythonParts
    ? [submittedPythonParts.prelude, submittedPythonParts.starterCode].filter(Boolean).join('\n\n')
    : source;
  if (normalizedLanguage === 'java') {
    const javaClassName = String(storedContract.className || 'Solution').replace(/[^A-Za-z0-9_$]/g, '') || 'Solution';
    injectableSource = injectableSource.replace(
      new RegExp(`(^|\\n)\\s*public\\s+class\\s+${javaClassName}\\b`),
      `$1class ${javaClassName}`,
    );
  }
  if (normalizedLanguage === 'c') {
    // The private runner owns these canonical definitions. Imported snippets
    // frequently repeat them, which otherwise produces a C redefinition error.
    injectableSource = injectableSource
      .replace(/\bstruct\s+TreeNode\s*\{[^}]*\}\s*;/gs, '')
      .replace(/\bstruct\s+ListNode\s*\{[^}]*\}\s*;/gs, '');
  }
  const runtimeContract = { ...storedContract, runnerLanguage: normalizedLanguage };
  const originalConfiguredHarness = String(harnesses[normalizedLanguage] || '');
  const configuredHarness = normalizedLanguage === 'java' ? normalizeJavaScalarStringFormatter(originalConfiguredHarness) : originalConfiguredHarness;
  if (configuredHarness.trim()) {
    if (configuredHarness.includes(USER_CODE_PLACEHOLDER)) {
      return materializeFunctionInputPlaceholders(
        configuredHarness.split(USER_CODE_PLACEHOLDER).join(injectableSource),
        testInput,
        runtimeContract,
      );
    }
    if (normalizedLanguage === 'python') {
      const legacyParts = splitPythonFunctionTemplate(configuredHarness);
      if (legacyParts) {
        return materializeFunctionInputPlaceholders(
          [legacyParts.prelude, injectableSource.trim(), legacyParts.adapter].filter(Boolean).join('\n\n'),
          testInput,
          runtimeContract,
        );
      }
    }
    return materializeFunctionInputPlaceholders(
      [injectableSource.trim(), configuredHarness.trim()].filter(Boolean).join('\n\n'),
      testInput,
      runtimeContract,
    );
  }

  if (normalizedLanguage !== 'python' || hasPythonFunctionAdapter(source)) return source;

  const templates = asTemplateObject(problem?.codeTemplates);
  const parts = splitPythonFunctionTemplate(templates.python);
  if (!parts) return source;

  return materializeFunctionInputPlaceholders(
    [parts.prelude, source.trim(), parts.adapter].filter(Boolean).join('\n\n'),
    testInput,
    runtimeContract,
  );
}

export function cleanImportedProblemDescription(description, codeTemplates) {
  const templates = asTemplateObject(codeTemplates);
  if (!hasPythonFunctionAdapter(templates.python)) return String(description || '');

  return String(description || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*(?:examples?(?:\s+\d+)?|constraints?)\s*:?\s*$/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export { PYTHON_ADAPTER_MARKER };
