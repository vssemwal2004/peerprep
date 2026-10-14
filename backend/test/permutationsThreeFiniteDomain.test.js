import assert from 'node:assert/strict';
import test from 'node:test';
import { hasExhaustiveFiniteDomain } from '../scripts/lib/hf-execution/candidateValidation.js';

const exact=()=>({
  _id:'6ace18746ca3216598beebad',title:'Permutations III',
  functionContract:{kind:'function',methodName:'permute',parameters:[{name:'n',type:'integer'}],returnType:'integer[][]'},
  sampleTestCases:[2,3,4].map((n,index)=>({kind:'sample',position:index+1,input:`n = ${n}`,output:'[]'})),
  hiddenTestCases:[1,5,6,7,8,9,10].map((n,index)=>({kind:'hidden',position:index+1,input:`n = ${n}`,output:'[]'})),
});

test('Permutations III accepts exactly the complete ten-value legal domain',()=>{
  assert.equal(hasExhaustiveFiniteDomain(exact()),true);
  const missing=exact();missing.hiddenTestCases.pop();assert.equal(hasExhaustiveFiniteDomain(missing),false);
  const duplicate=exact();duplicate.hiddenTestCases[0]={...duplicate.hiddenTestCases[0],input:'n = 2'};assert.equal(hasExhaustiveFiniteDomain(duplicate),false);
});

test('finite-domain exception is scoped to exact identity, title and contract',()=>{
  for(const mutate of [
    value=>{value._id='6ace18746ca3216598beebae';},value=>{value.title='Permutations II';},
    value=>{value.functionContract.methodName='solve';},value=>{value.functionContract.returnType='integer[]';},
    value=>{value.functionContract.parameters[0].name='value';},value=>{value.functionContract.parameters[0].type='long';},
  ]){const value=exact();mutate(value);assert.equal(hasExhaustiveFiniteDomain(value),false);}
});
