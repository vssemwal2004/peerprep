import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateProblemSubmissionResult } from '../src/services/problemSubmissionEvaluationService.js';

test('stateful results share strict typed JSON grading in publication and learner execution',()=>{
 const problem={executionMode:'function',functionContract:{kind:'stateful',className:'TextStore',constructorParameters:[],operations:[{methodName:'get',parameters:[],returnType:'string'}]}};
 const fixture={input:'["TextStore","get"]\n[[],[]]',output:'[null, "a  b"]'};
 const grade=stdout=>evaluateProblemSubmissionResult(problem,{status:{id:3},stdout},fixture).internalStatus;
 assert.equal(grade('[null,"a  b"]\n'),'AC');
 assert.equal(grade('[null,"a b"]'),'WA');
 assert.equal(grade('[0,"a  b"]'),'WA');
 assert.equal(evaluateProblemSubmissionResult(problem,{status:{id:6},stdout:fixture.output},fixture).internalStatus,'CE');
});

const result = stdout => ({ status: { id: 3 }, stdout });
test('production grading respects allowed SQL row order and duplicate rows', () => {
  const problem = { category: 'SQL', description: 'Return the result in **any** order.' };
  const fixture = { output: 'a|1\nb|2\na|1' };
  assert.equal(evaluateProblemSubmissionResult(problem, result('b|2.0\na|1\na|1'), fixture).internalStatus, 'AC');
  assert.equal(evaluateProblemSubmissionResult(problem, result('b|2\na|1'), fixture).internalStatus, 'WA');
  assert.equal(evaluateProblemSubmissionResult({ category: 'SQL', description: 'Order by name.' }, result('b|2\na|1'), { output: 'a|1\nb|2' }).internalStatus, 'WA');
});
test('learner function submissions use input-proven alternative answers', () => {
  const problem = { executionMode: 'function', functionContract: { methodName: 'twoSum', parameters: [{ name: 'nums' }, { name: 'target' }], returnType: 'integer[]' } };
  const fixture = { input: 'nums = [2,7,2], target = 9', output: '[0,1]' };
  assert.equal(evaluateProblemSubmissionResult(problem, result('[1,2]'), fixture).internalStatus, 'AC');
  assert.equal(evaluateProblemSubmissionResult(problem, result('[0,2]'), fixture).internalStatus, 'WA');
  assert.equal(evaluateProblemSubmissionResult(problem, { status: { id: 11 }, stdout: '[1,2]', stderr: 'failure' }, fixture).internalStatus, 'RE');
});
test('explicit source tolerance accepts approximations and rejects relative-only matches', () => {
  const problem = { executionMode: 'function', functionContract: { returnType: 'double', absoluteTolerance: 1e-5 } };
  assert.equal(evaluateProblemSubmissionResult(problem, result('8'), { output: '7.999999046325684' }).internalStatus, 'AC');
  assert.equal(evaluateProblemSubmissionResult(problem, result('8.00002'), { output: '8' }).internalStatus, 'WA');
  assert.equal(evaluateProblemSubmissionResult(problem, result('1000000000001'), { output: '1000000000000' }).internalStatus, 'WA');
  assert.equal(evaluateProblemSubmissionResult(problem, result('Infinity'), { output: 'Infinity' }).internalStatus, 'WA');
});

test('documented floating array tolerance retains dimensions, order and finiteness', () => {
  const problem = { executionMode: 'function', functionContract: { returnType: 'double[][]', absoluteTolerance: 1e-5 } };
  const fixture = { output:'[[1,2],[3]]' };
  assert.equal(evaluateProblemSubmissionResult(problem,result('[[1.000001,2],[3]]'),fixture).internalStatus,'AC');
  for(const wrong of ['[[2,1],[3]]','[[1,2,3]]','[[1.00002,2],[3]]','[[1,2],[3,0]]']) assert.equal(evaluateProblemSubmissionResult(problem,result(wrong),fixture).internalStatus,'WA');
});
