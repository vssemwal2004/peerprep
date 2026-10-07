import { validateStatefulFixture } from './statefulRunnerService.js';

const randomProfiles = new Map([
  ['Insert Delete GetRandom O(1)', 'RandomizedSet'],
  ['Insert Delete GetRandom O(1) - Duplicates allowed', 'RandomizedCollection'],
]);

// A single random draw has no fixed expected value. Membership is necessary;
// distribution and complexity remain separate algorithm/reference checks.
export function acceptsRandomizedStatefulOutput(problem, testCase, output) {
  const contract = problem?.functionContract;
  const className = randomProfiles.get(problem?.title);
  if (!className || contract?.kind !== 'stateful' || contract.className !== className
    || problem.executionMode !== 'function') return null;
  try {
    if ((contract.constructorParameters || []).length) return false;
    const methods = contract.operations;
    if (!Array.isArray(methods) || methods.length !== 3) return false;
    for (const [name, type, args] of [['insert','boolean',1],['remove','boolean',1],['getRandom','integer',0]]) {
      const method = methods.find(value => value.methodName === name);
      if (!method || method.returnType !== type || method.parameters?.length !== args
        || (args && method.parameters[0].type !== 'integer')) return false;
    }
    const fixture = validateStatefulFixture(contract, testCase.input);
    const actual = JSON.parse(String(output).trim());
    if (!Array.isArray(actual) || actual.length !== fixture.calls.length) return false;
    let counts = new Map();
    return fixture.calls.every((call, index) => {
      if (call.constructor) { counts = new Map(); return actual[index] === null; }
      const value = call.args[0], count = counts.get(value) || 0;
      if (call.methodName === 'insert') {
        if (className === 'RandomizedCollection' || !count) counts.set(value, count + 1);
        return actual[index] === (count === 0);
      }
      if (call.methodName === 'remove') {
        if (count === 1) counts.delete(value);
        else if (count > 1) counts.set(value, count - 1);
        return actual[index] === (count > 0);
      }
      return Number.isInteger(actual[index]) && actual[index] >= -2147483648
        && actual[index] <= 2147483647 && counts.has(actual[index]);
    });
  } catch { return false; }
}
