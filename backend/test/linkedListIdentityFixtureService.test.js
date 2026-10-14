import assert from 'node:assert/strict';
import test from 'node:test';
import {linkedListIdentityRule,validateLinkedListIdentityFixture,validateLinkedListIdentityOracle} from '../src/services/linkedListIdentityFixtureService.js';
import {prepareFunctionSourceForExecution} from '../src/services/functionProblemAdapterService.js';

const problem=(id,title,methodName,parameters,returnType)=>({_id:id,title,executionMode:'function',functionContract:{kind:'function',className:'Solution',methodName,parameters,returnType,outputMode:'return'}});
const cycle=problem('6ace18656ca3216598bee728','Linked List Cycle','hasCycle',[{name:'head',type:'list-node'}],'boolean');
const entry=problem('6ace18656ca3216598bee729','Linked List Cycle II','detectCycle',[{name:'head',type:'list-node'}],'list-node');
const intersection=problem('6ace18656ca3216598bee72a','Intersection of Two Linked Lists','getIntersectionNode',[{name:'headA',type:'list-node'},{name:'headB',type:'list-node'}],'list-node');

test('identity rules are exact-ID and exact-contract scoped',()=>{
 assert.equal(linkedListIdentityRule(cycle)?.kind,'cycle-boolean');
 assert.equal(linkedListIdentityRule({...cycle,_id:'6ace18656ca3216598bee720'}),null);
 assert.equal(linkedListIdentityRule({...entry,functionContract:{...entry.functionContract,returnType:'integer'}}),null);
});
test('cycle fixtures preserve private pos semantics and node identity oracle',()=>{
 assert.deepEqual(validateLinkedListIdentityFixture(cycle,'head = [3,2,0,-4], pos = 1').expected,true);
 assert.deepEqual(validateLinkedListIdentityFixture(entry,'head = [3,2,0,-4], pos = 1').expected,1);
 assert.equal(validateLinkedListIdentityOracle(entry,{input:'head = [1], pos = -1',output:'null'}),true);
 assert.throws(()=>validateLinkedListIdentityFixture(cycle,'head = [], pos = 0'));
});
test('intersection fixtures require one shared suffix rather than equal values alone',()=>{
 const valid='intersectVal = 8, listA = [4,1,8,4,5], listB = [5,6,1,8,4,5], skipA = 2, skipB = 3';
 assert.equal(validateLinkedListIdentityFixture(intersection,valid).expected,2);
 assert.throws(()=>validateLinkedListIdentityFixture(intersection,'intersectVal = 8, listA = [4,8,5], listB = [8,6], skipA = 1, skipB = 0'));
 assert.equal(validateLinkedListIdentityOracle(intersection,{input:'intersectVal = 0, listA = [1], listB = [1], skipA = 1, skipB = 1',output:'null'}),true);
});
test('function adapter retains the exact problem id when selecting the identity runner',()=>{
 const source=prepareFunctionSourceForExecution(cycle,'c','bool hasCycle(struct ListNode* head){return head != NULL;}','head = [1], pos = 0');
 assert.match(source,/bool _ppVerifyNode\(int seed\)/);
 assert.match(source,/peerprepNodeResult/);
});
