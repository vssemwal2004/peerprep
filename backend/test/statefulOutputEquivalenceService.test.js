import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsEquivalentStatefulOutput } from '../src/services/statefulOutputEquivalenceService.js';
const problem={executionMode:'function',functionContract:{kind:'stateful',className:'Fixture',constructorParameters:[],operations:[{methodName:'boolean',parameters:[],returnType:'boolean'},{methodName:'integer',parameters:[],returnType:'integer'},{methodName:'text',parameters:[],returnType:'string'},{methodName:'matrix',parameters:[],returnType:'integer[][]'},{methodName:'mutate',parameters:[],returnType:'void'}]}};
const testcase={input:'["Fixture","boolean","integer","text","matrix","mutate"]\n[[],[],[],[],[],[]]',output:'[null, true, 4, "a  b", [[1,2],[]], null]'};
test('stateful JSON formatting is accepted before ordinary function input parsing',()=>{
 assert.equal(acceptsEquivalentStatefulOutput(problem,testcase,'[null,true,4,"a  b",[[1,2],[]],null]\n'),true);
 const calendar={executionMode:'function',functionContract:{kind:'stateful',className:'MyCalendar',constructorParameters:[],operations:[{methodName:'book',parameters:[{name:'start',type:'integer'},{name:'end',type:'integer'}],returnType:'boolean'}]}};
 assert.equal(acceptsEquivalentStatefulOutput(calendar,{input:'["MyCalendar","book","book","book"]\n[[],[10,20],[15,25],[20,30]]',output:'[null, true, false, true]'},'[null,true,false,true]'),true);
});
test('stateful operation order, value types, strings and array dimensions stay exact',()=>{
 for(const actual of ['[null,1,4,"a  b",[[1,2],[]],null]','[null,true,"4","a  b",[[1,2],[]],null]','[null,true,4,"a b",[[1,2],[]],null]','[null,true,4,"a  b",[1,2],null]','[null,true,4,"a  b",[[2,1],[]],null]','[null,true,4,"a  b",[[1,2],[]],0]','[0,true,4,"a  b",[[1,2],[]],null]','[null,true,4,"a  b",[[1,2],[]]]','[null,true,4,"a  b",[[1,2],[]],null,null]'])assert.equal(acceptsEquivalentStatefulOutput(problem,testcase,actual),false,actual);
});
test('malformed fixtures, unsupported outputs and nonfinite values are rejected safely',()=>{
 for(const actual of ['garbage','[null,True,4,"a  b",[[1,2],[]],null]','[null,true,NaN,"a  b",[[1,2],[]],null]','{"0":null}','[null,true,2147483648,"a  b",[[1,2],[]],null]'])assert.equal(acceptsEquivalentStatefulOutput(problem,testcase,actual),false);
 assert.equal(acceptsEquivalentStatefulOutput(problem,{...testcase,input:'malformed'},testcase.output),false);
 assert.equal(acceptsEquivalentStatefulOutput({...problem,functionContract:{...problem.functionContract,kind:'function'}},testcase,testcase.output),false);
});
