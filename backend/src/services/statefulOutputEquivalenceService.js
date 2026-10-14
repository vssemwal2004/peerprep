import { acceptsRandomizedStatefulOutput } from './randomizedStatefulOutputService.js';
import { acceptsSourceSupportedStatefulFloat } from './statefulFloatingOutputPolicyService.js';
import { validateStatefulFixture } from './statefulRunnerService.js';
import { isBstIteratorProblem, validateBstIteratorFixture } from './bstIteratorRunnerService.js';
import { nestedIntegerRule, validateNestedIntegerFixture, nestedIteratorCalls } from './nestedIntegerRunnerService.js';

function typedEqual(actual, expected, type) {
  if(type==='tree-node'){
    if(!Array.isArray(actual)||!Array.isArray(expected))return false;
    const normalize=value=>{const result=value.slice();while(result.at(-1)===null)result.pop();return result;};
    return JSON.stringify(normalize(actual))===JSON.stringify(normalize(expected));
  }
  if (type.endsWith('[]')) return Array.isArray(actual) && Array.isArray(expected)
    && actual.length === expected.length
    && actual.every((value, index) => typedEqual(value, expected[index], type.slice(0, -2)));
  if (type === 'void') return actual === null && expected === null;
  if (['integer', 'long'].includes(type)) return Number.isSafeInteger(actual) && Number.isSafeInteger(expected)
    && actual === expected && (type === 'long' || (actual >= -2147483648 && actual <= 2147483647));
  if (['double', 'float'].includes(type)) return typeof actual === 'number' && typeof expected === 'number'
    && Number.isFinite(actual) && Number.isFinite(expected) && actual === expected;
  if (type === 'boolean') return typeof actual === 'boolean' && typeof expected === 'boolean' && actual === expected;
  if (['string', 'char', 'character'].includes(type)) return typeof actual === 'string' && typeof expected === 'string'
    && actual === expected && (type === 'string' || actual.length === 1);
  return false;
}

// Whitespace outside JSON values is formatting. Operation order, result types,
// strings, array dimensions and every constructor/void null remain exact.
export function acceptsEquivalentStatefulOutput(problem, testCase, actualOutput) {
  if (problem?.executionMode !== 'function' || problem?.functionContract?.kind !== 'stateful') return false;
  const randomized = acceptsRandomizedStatefulOutput(problem, testCase, actualOutput);
  if (randomized !== null) return randomized;
  const floating = acceptsSourceSupportedStatefulFloat(problem, testCase, actualOutput);
  if (floating !== null) return floating;
  try {
    const nested=nestedIntegerRule(problem);
    const fixture = isBstIteratorProblem(problem)
      ? validateBstIteratorFixture(problem, testCase.input)
      : nested?.kind==='iterator' ? validateNestedIntegerFixture(problem,testCase.input)
      : validateStatefulFixture(problem.functionContract, testCase.input);
    const calls = fixture.calls || (nested?.kind==='iterator'?nestedIteratorCalls(fixture):fixture.names.map((methodName,index)=>({
      constructor:index===0,
      returnType:index===0?'void':methodName==='next'?'integer':'boolean',
    })));
    const actual = JSON.parse(String(actualOutput).trim());
    const expected = JSON.parse(String(testCase.output).trim());
    return Array.isArray(actual) && Array.isArray(expected)
      && actual.length === calls.length && expected.length === calls.length
      && calls.every((call, index) => typedEqual(actual[index], expected[index], call.constructor ? 'void' : call.returnType));
  } catch { return false; }
}
