import assert from 'node:assert/strict';
import test from 'node:test';
import {validateInorderSuccessorFixture} from '../src/services/inorderSuccessorIdentityService.js';
import {validateBinaryTreeCodecFixture} from '../src/services/binaryTreeCodecPropertyService.js';
import {validatePeekingIteratorFixture} from '../src/services/peekingIteratorProvidedService.js';
import {prepareFunctionSourceForExecution} from '../src/services/functionProblemAdapterService.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const problem=(id,title,className,methodName,parameters,returnType)=>({_id:id,title,executionMode:'function',functionContract:{kind:'function',className,methodName,parameters,returnType,outputMode:'return'}});
const successor=problem('6ace18696ca3216598bee78e','Inorder Successor in BST','Solution','inorderSuccessor',[{name:'root',type:'tree-node'},{name:'p',type:'tree-node'}],'tree-node');
const codec=problem('6ace18696ca3216598bee798','Serialize and Deserialize Binary Tree','Codec','serialize',[{name:'root',type:'tree-node'}],'string');
const peeking=problem('6ace18696ca3216598bee773','Peeking Iterator','PeekingIterator','peek',[],'integer');

test('BST successor oracle derives the next original value and rejects a non-BST',()=>{
 assert.equal(validateInorderSuccessorFixture(successor,'root = [8,3,10,1,6,null,14,null,null,4,7,13], p = 7').expected,8);
 assert.equal(validateInorderSuccessorFixture(successor,'root = [2,1,3], p = 3').expected,null);
 assert.throws(()=>validateInorderSuccessorFixture(successor,'root = [2,3,1], p = 3'));
});
test('codec fixture canonicalizes only trailing nulls and accepts empty trees',()=>{
 assert.deepEqual(validateBinaryTreeCodecFixture(codec,'root = []').canonical,[]);
 assert.deepEqual(validateBinaryTreeCodecFixture(codec,'root = [1,2,null,null,null]').canonical,[1,2]);
});
test('peeking trace is simulated independently and rejects invalid consumption',()=>{
 const input='["PeekingIterator","peek","peek","next","hasNext"]\n[[[4]],[],[],[],[]]';
 assert.deepEqual(validatePeekingIteratorFixture(peeking,input).expected,[null,4,4,4,false]);
 assert.throws(()=>validatePeekingIteratorFixture(peeking,'["PeekingIterator","next","peek"]\n[[[4]],[],[]]'));
});
test('exact-id adapter routing emits private property captures',()=>{
 const codecSource=prepareFunctionSourceForExecution(codec,'javascript','var serialize=root=>"#";var deserialize=data=>null;','root = []');
 const peekSource=prepareFunctionSourceForExecution(peeking,'javascript','class PeekingIterator{constructor(x){this.x=x;}peek(){return this.x.next();}next(){return this.x.next();}hasNext(){return this.x.hasNext();}}','["PeekingIterator","next","hasNext"]\n[[[1]],[],[]]');
 assert.match(codecSource,/peerprepNodeResult/);assert.match(peekSource,/peerprepNodeResult/);
});
test('Peeking Iterator private TypeScript provider compiles without colliding with lib Iterator',()=>{
 const reference='class PeekingIterator{private it:Iterator;constructor(iterator:Iterator){this.it=iterator;}peek():number{return this.it.next();}next():number{return this.it.next();}hasNext():boolean{return this.it.hasNext();}}';
 const source=prepareFunctionSourceForExecution(peeking,'typescript',reference,'["PeekingIterator","next","hasNext"]\n[[[1]],[],[]]');
 assert.match(source,/class PPProvidedIterator\b/);assert.doesNotMatch(source,/class Iterator\b/);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'peerprep-peek-tsc-')),input=path.join(directory,'main.ts'),output=path.join(directory,'main.js'),tsc=fileURLToPath(new URL('../node_modules/typescript/bin/tsc',import.meta.url));fs.writeFileSync(input,source);
 const result=spawnSync(process.execPath,[tsc,input,'--target','ES2019','--module','none','--skipLibCheck','true','--outFile',output],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr||result.stdout);assert.equal(fs.existsSync(output),true);
});
