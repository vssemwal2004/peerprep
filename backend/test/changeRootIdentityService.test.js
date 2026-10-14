import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareFunctionSourceForExecution} from '../src/services/functionProblemAdapterService.js';
import {validateChangeRootFixture} from '../src/services/changeRootIdentityService.js';

const problem={_id:'6ace186f6ca3216598beea65',title:'Change the Root of a Binary Tree',executionMode:'function',functionContract:{kind:'function',className:'Solution',methodName:'flipBinaryTree',parameters:[{name:'root',type:'custom'},{name:'leaf',type:'custom'}],returnType:'custom',outputMode:'return'}};
const input='root = [1,2,3,4,5], leaf = 4';
function run(code){const source=prepareFunctionSourceForExecution(problem,'javascript',code,input),dir=fs.mkdtempSync(path.join(os.tmpdir(),'peerprep-change-root-')),file=path.join(dir,'main.js');fs.writeFileSync(file,source);const result=spawnSync(process.execPath,[file],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);return result.stdout;}
test('fixture derives the exact identity-preserving reroot topology',()=>{assert.deepEqual(validateChangeRootFixture(problem,input).expected,[4,2,null,1,5,null,3]);});
test('private verifier rejects missing rewires, stale parent links, and replacement nodes',()=>{
 assert.match(run('var flipBinaryTree=function(root,leaf){return leaf;};'),/"verified":false/);
 assert.match(run('var flipBinaryTree=function(root,leaf){let c=leaf,p=c.parent;while(p){let g=p.parent;if(c.left)c.right=c.left;c.left=p;if(p.left===c)p.left=null;else p.right=null;c=p;p=g;}return leaf;};'),/"verified":false/);
 assert.match(run('var flipBinaryTree=function(root,leaf){return new Node(leaf.val);};'),/"verified":false/);
});
