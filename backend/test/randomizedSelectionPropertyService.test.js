import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateRandomPickIndexFixture,validateLinkedListRandomFixture,validateShuffleArrayFixture} from '../src/services/randomizedSelectionPropertyService.js';
import {prepareFunctionSourceForExecution} from '../src/services/functionProblemAdapterService.js';

const randomPick={_id:'6ace186b6ca3216598bee842',title:'Random Pick Index',executionMode:'function',functionContract:{kind:'stateful',className:'Solution',constructorParameters:[{name:'nums',type:'integer[]'}],operations:[{methodName:'pick',parameters:[{name:'target',type:'integer'}],returnType:'integer'}]}};
const linked={_id:'6ace186a6ca3216598bee7f2',title:'Linked List Random Node',executionMode:'function',functionContract:{kind:'function',className:'Solution',methodName:'getRandom',parameters:[],returnType:'integer'}};
const shuffle={_id:'6ace186a6ca3216598bee815',title:'Shuffle an Array',executionMode:'function',functionContract:{kind:'stateful',className:'Solution',constructorParameters:[{name:'nums',type:'integer[]'}],operations:[{methodName:'reset',parameters:[],returnType:'integer[]'},{methodName:'shuffle',parameters:[],returnType:'integer[]'}]}};
const runJs=(problem,code,input)=>{const source=prepareFunctionSourceForExecution(problem,'javascript',code,input),directory=fs.mkdtempSync(path.join(os.tmpdir(),'peerprep-random-probe-')),file=path.join(directory,'main.js');fs.writeFileSync(file,source);const result=spawnSync(process.execPath,[file],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);return result.stdout;};

test('random pick fixtures require present targets and derive canonical display output',()=>{const f=validateRandomPickIndexFixture(randomPick,'["Solution","pick"]\n[[[4,7,4]],[4]]');assert.deepEqual(f.expected,[null,0]);assert.throws(()=>validateRandomPickIndexFixture(randomPick,'["Solution","pick"]\n[[[4,7,4]],[9]]'));});
test('linked random fixtures preserve physical-node multiplicity',()=>{const f=validateLinkedListRandomFixture(linked,'["Solution","getRandom"]\n[[[2,2,9]],[]]');assert.deepEqual(f.values,[2,2,9]);assert.deepEqual(f.expected,[null,2]);});
test('shuffle fixtures require unique data and exact reset-shaped oracle',()=>{const f=validateShuffleArrayFixture(shuffle,'["Solution","shuffle","reset"]\n[[[3,1,2]],[],[]]');assert.deepEqual(f.expected,[null,[3,1,2],[3,1,2]]);assert.throws(()=>validateShuffleArrayFixture(shuffle,'["Solution","shuffle"]\n[[[1,1]],[]]'));});
test('private randomized probes reject constant, head-only, and identity-biased implementations',()=>{const pick=runJs(randomPick,'var Solution=function(nums){this.a=nums};Solution.prototype.pick=function(target){return this.a.indexOf(target)};','["Solution","pick"]\n[[[1,1,1,2]],[1]]');const head=runJs(linked,'var Solution=function(head){this.head=head};Solution.prototype.getRandom=function(){return this.head.val};','["Solution","getRandom"]\n[[[1,2,3]],[]]');const identity=runJs(shuffle,'var Solution=function(nums){this.a=nums.slice()};Solution.prototype.reset=function(){return this.a.slice()};Solution.prototype.shuffle=function(){return this.a.slice()};','["Solution","shuffle"]\n[[[1,2,3]],[]]');for(const output of[pick,head,identity])assert.match(output,/"verified":false/);});
