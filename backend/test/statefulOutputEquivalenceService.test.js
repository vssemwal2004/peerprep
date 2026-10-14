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
test('BST iterator tree-node fixtures compare mixed null, integer and boolean outputs exactly',()=>{
 const bst={title:'Binary Search Tree Iterator',executionMode:'function',functionContract:{kind:'stateful',className:'BSTIterator',constructorParameters:[{name:'root',type:'tree-node'}],operations:[{methodName:'next',parameters:[],returnType:'integer'},{methodName:'hasNext',parameters:[],returnType:'boolean'}]}};
 const tc={input:'["BSTIterator","hasNext","next","hasNext"]\n[[[2,1,3]],[],[],[]]',output:'[null,true,1,true]'};
 assert.equal(acceptsEquivalentStatefulOutput(bst,tc,'[null,true,1,true]\n'),true);
 assert.equal(acceptsEquivalentStatefulOutput(bst,tc,'[null,1,1,true]'),false);
 assert.equal(acceptsEquivalentStatefulOutput(bst,tc,'[null,true,"1",true]'),false);
});
test('All O`one accepts any current extreme key and rejects stale or non-extreme keys',()=>{
 const allOne={title:'All O`one Data Structure',executionMode:'function',functionContract:{kind:'stateful',className:'AllOne',constructorParameters:[],operations:[{methodName:'inc',parameters:[{name:'key',type:'string'}],returnType:'void'},{methodName:'dec',parameters:[{name:'key',type:'string'}],returnType:'void'},{methodName:'getMaxKey',parameters:[],returnType:'string'},{methodName:'getMinKey',parameters:[],returnType:'string'}]}};
 const tc={input:'["AllOne","inc","inc","inc","getMaxKey","getMinKey"]\n[[],["a"],["b"],["a"],[],[]]',output:'[null,null,null,null,"a","b"]'};
 assert.equal(acceptsEquivalentStatefulOutput(allOne,tc,'[null,null,null,null,"a","b"]'),true);
 assert.equal(acceptsEquivalentStatefulOutput(allOne,tc,'[null,null,null,null,"a","b"]'),true);
 assert.equal(acceptsEquivalentStatefulOutput(allOne,tc,'[null,null,null,null,"b","b"]'),false);
 assert.equal(acceptsEquivalentStatefulOutput(allOne,tc,'[null,null,null,null,"a","a"]'),false);
});
test('random pick validators enforce legal support and reject gross distribution bias',()=>{
 const weighted={title:'Random Pick with Weight',executionMode:'function',functionContract:{kind:'stateful',className:'Solution',constructorParameters:[{name:'w',type:'integer[]'}],operations:[{methodName:'pickIndex',parameters:[],returnType:'integer'}]}};
 const names=['Solution',...Array(600).fill('pickIndex')],args=[[[1,3]],...Array.from({length:600},()=>[])];
 const weightedCase={input:JSON.stringify(names)+'\n'+JSON.stringify(args),output:'[]'};
 assert.equal(acceptsEquivalentStatefulOutput(weighted,weightedCase,JSON.stringify([null,...Array.from({length:600},(_,i)=>i%4?1:0)])),true);
 assert.equal(acceptsEquivalentStatefulOutput(weighted,weightedCase,JSON.stringify([null,...Array(600).fill(0)])),false);
 const blacklist={title:'Random Pick with Blacklist',executionMode:'function',functionContract:{kind:'stateful',className:'Solution',constructorParameters:[{name:'n',type:'integer'},{name:'blacklist',type:'integer[]'}],operations:[{methodName:'pick',parameters:[],returnType:'integer'}]}};
 const blackCase={input:JSON.stringify(['Solution',...Array(600).fill('pick')])+'\n'+JSON.stringify([[4,[1,3]],...Array.from({length:600},()=>[])]),output:'[]'};
 assert.equal(acceptsEquivalentStatefulOutput(blacklist,blackCase,JSON.stringify([null,...Array.from({length:600},(_,i)=>i%2?2:0)])),true);
 assert.equal(acceptsEquivalentStatefulOutput(blacklist,blackCase,JSON.stringify([null,...Array(600).fill(1)])),false);
 assert.equal(acceptsEquivalentStatefulOutput(blacklist,blackCase,JSON.stringify([null,...Array(600).fill(0)])),false);
});
