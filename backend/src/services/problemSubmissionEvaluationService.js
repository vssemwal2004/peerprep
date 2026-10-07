import {acceptsCustomNodeOutput} from './customNodeRunnerService.js';
import {acceptsTypedCharacterOutput} from './typedCharacterOutputService.js';
import { acceptsProvidedObjectOutput } from './providedObjectApiNextRunnerService.js';
import { acceptsRead4Output } from './read4ApiRunnerService.js';
import { acceptsSourceNamedFlexibleOutput } from './sourceNamedFlexibleOutputService.js';
import { acceptsExactScalarLongOutput } from './exactScalarLongRunnerService.js';
import { evaluateSubmissionResult } from './executionService.js';
import { acceptsEquivalentFunctionOutput } from './functionOutputEquivalenceService.js';
import { sqlOutputsEquivalent } from './sqlOutputEquivalenceService.js';
import { parseFunctionTestInput } from './functionTestInputService.js';
import { acceptsEquivalentStatefulOutput } from './statefulOutputEquivalenceService.js';
import { acceptsEquivalentNodeCollectionOutput } from './nodeCollectionOutputEquivalenceService.js';

// Use the same problem contract for publication and learner submissions.
export function evaluateProblemSubmissionResult(problem, result, testCase) {
  const evaluation = evaluateSubmissionResult(result, testCase?.output ?? '');
  if (!['AC', 'WA'].includes(evaluation.internalStatus) || Number(result.status?.id) !== 3) return evaluation;
  const customNodeOutput=acceptsCustomNodeOutput(problem,testCase,result.stdout);
  if(customNodeOutput!==undefined)return {...evaluation,verdict:customNodeOutput?'Accepted':'Wrong Answer',internalStatus:customNodeOutput?'AC':'WA'};
  const typedCharacterOutput=acceptsTypedCharacterOutput(problem,testCase,result.stdout);
  if(typedCharacterOutput!==undefined)return {...evaluation,verdict:typedCharacterOutput?'Accepted':'Wrong Answer',internalStatus:typedCharacterOutput?'AC':'WA'};
  const providedOutput=acceptsProvidedObjectOutput(problem,testCase,result.stdout);
  if(providedOutput!==undefined)return {...evaluation,verdict:providedOutput?'Accepted':'Wrong Answer',internalStatus:providedOutput?'AC':'WA'};
  const read4Output=acceptsRead4Output(problem,testCase,result.stdout);
  if(read4Output!==undefined)return {...evaluation,verdict:read4Output?'Accepted':'Wrong Answer',internalStatus:read4Output?'AC':'WA'};
  let accepted = evaluation.internalStatus === 'AC';
  const tolerance = Number(problem?.functionContract?.absoluteTolerance || 0);
  const sourceNamedOutput = acceptsSourceNamedFlexibleOutput(problem, testCase, result.stdout);
  if(sourceNamedOutput !== null) return {...evaluation, verdict:sourceNamedOutput?'Accepted':'Wrong Answer',internalStatus:sourceNamedOutput?'AC':'WA'};
  if (problem?.category === 'SQL') {
    accepted = sqlOutputsEquivalent(problem, result.stdout, testCase?.output);
  } else if (problem?.executionMode === 'function') {
    const exactScalarOutput = acceptsExactScalarLongOutput(problem, testCase, result.stdout);
    if (exactScalarOutput !== null) {
      accepted = exactScalarOutput;
    } else if (problem.functionContract?.kind === 'stateful') {
      accepted = acceptsEquivalentStatefulOutput(problem, testCase, result.stdout);
    } else if (['tree-node[]','list-node[]'].includes(problem.functionContract?.outputMode === 'parameter' ? problem.functionContract.parameters?.[problem.functionContract.outputParameterIndex]?.type : problem.functionContract?.returnType)) {
      accepted = acceptsEquivalentNodeCollectionOutput(problem, testCase, result.stdout);
    } else if (tolerance > 0 && tolerance <= 0.01 && /^(double|float)(\[\]){0,2}$/.test(problem.functionContract?.returnType)) {
      const dimensions = (problem.functionContract.returnType.match(/\[\]/g) || []).length;
      const numeric = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i;
      const actual = String(result.stdout ?? '').trim(), expected = String(testCase?.output ?? '').trim();
      accepted = dimensions === 0 && numeric.test(actual) && numeric.test(expected)
        && Number.isFinite(Number(actual)) && Number.isFinite(Number(expected))
        && Math.abs(Number(actual) - Number(expected)) <= tolerance;
      if (dimensions) {
        const close = (left, right, depth) => depth ? Array.isArray(left) && Array.isArray(right)
          && left.length === right.length && left.every((entry, i) => close(entry, right[i], depth - 1))
          : typeof left === 'number' && typeof right === 'number'
            && Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
        try {
          const left = parseFunctionTestInput(actual).positional, right = parseFunctionTestInput(expected).positional;
          accepted = left.length === 1 && right.length === 1 && close(left[0], right[0], dimensions);
        } catch { accepted = false; }
      }
    } else if (!accepted) {
      accepted = acceptsEquivalentFunctionOutput(problem, testCase, result.stdout);
    }
  }
  return { ...evaluation, verdict: accepted ? 'Accepted' : 'Wrong Answer', internalStatus: accepted ? 'AC' : 'WA' };
}
