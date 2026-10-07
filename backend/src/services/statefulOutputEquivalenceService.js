import { acceptsRandomizedStatefulOutput } from './randomizedStatefulOutputService.js';
import { acceptsSourceSupportedStatefulFloat } from './statefulFloatingOutputPolicyService.js';
import { validateStatefulFixture } from './statefulRunnerService.js';

function typedEqual(actual, expected, type) {
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
    const fixture = validateStatefulFixture(problem.functionContract, testCase.input);
    const actual = JSON.parse(String(actualOutput).trim());
    const expected = JSON.parse(String(testCase.output).trim());
    return Array.isArray(actual) && Array.isArray(expected)
      && actual.length === fixture.calls.length && expected.length === fixture.calls.length
      && fixture.calls.every((call, index) => typedEqual(actual[index], expected[index], call.constructor ? 'void' : call.returnType));
  } catch { return false; }
}
