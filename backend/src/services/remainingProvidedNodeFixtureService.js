import {parseFunctionTestInput} from './functionTestInputService.js';
import {decodeNextBinary} from './nextCustomNodeFixtureService.js';

// These contracts describe the learner's actual provided-object APIs. The
// serialized setup remains private to the adapter and is never a replacement
// parameter passed to the learner's method.
export const REMAINING_PROVIDED_NODE_APIS = [
 {id:'6ac280e319051acf30c4c2a6',title:'Convert Doubly Linked List to Array I',kind:'dll-array-head',methodName:'toArray',parameters:[['root','doubly-node']],returnType:'integer[]'},
 {id:'6ac280e519051acf30c4c309',title:'Convert Doubly Linked List to Array II',kind:'dll-array-selected',methodName:'toArray',parameters:[['node','doubly-node']],returnType:'integer[]'},
 {id:'6ac280cf19051acf30c4bd4c',title:'Extract Kth Character From The Rope Tree',kind:'rope-character',methodName:'getKthCharacter',parameters:[['root','rope-node'],['k','integer']],returnType:'character'},
 {id:'6ababf367dd728ca2c938f6f',title:'Find a Corresponding Node of a Binary Tree in a Clone of That Tree',kind:'corresponding-clone',methodName:'getTargetCopy',parameters:[['original','tree-node'],['cloned','tree-node'],['target','tree-node']],returnType:'tree-node'},
 {id:'6ac2807119051acf30c4a63f',title:'Insert into a Sorted Circular Linked List',kind:'circular-insert',methodName:'insert',parameters:[['head','circular-node'],['insertVal','integer']],returnType:'circular-node'},
 {id:'6ac280389b62de7b2370960d',title:'Flatten a Multilevel Doubly Linked List',kind:'multilevel-flatten',methodName:'flatten',parameters:[['head','multilevel-doubly-node']],returnType:'multilevel-doubly-node'},
 {id:'6ac280369b62de7b237095d9',title:'Convert Binary Search Tree to Sorted Doubly Linked List',kind:'bst-circular-dll',methodName:'treeToDoublyList',parameters:[['root','bst-doubly-node']],returnType:'bst-doubly-node'},
 {id:'6ac280ad19051acf30c4b3c2',title:'Shortest Path in a Hidden Grid',kind:'hidden-grid-unweighted',methodName:'findShortestPath',parameters:[['master','grid-master']],returnType:'integer'},
 {id:'6ac280af19051acf30c4b461',title:'Minimum Path Cost in a Hidden Grid',kind:'hidden-grid-weighted',methodName:'findShortestPath',parameters:[['master','grid-master']],returnType:'integer'},
 {id:'6ac27feb50fef4f698aa217f',title:'Robot Room Cleaner',kind:'robot-clean',methodName:'cleanRoom',parameters:[['robot','robot-api']],returnType:'void'},
];
export const remainingProvidedNodeContract=r=>({className:'Solution',methodName:r.methodName,parameters:r.parameters.map(([name,type])=>({name,type})),returnType:r.returnType,outputMode:'return'});
export function remainingProvidedNodeRule(p) {
 const c=p?.functionContract;
 return REMAINING_PROVIDED_NODE_APIS.find(r=>p.executionMode==='function'&&p.title===r.title&&c?.className==='Solution'&&c.kind!=='stateful'&&c.methodName===r.methodName&&c.returnType===r.returnType&&c.outputMode!=='parameter'&&c.parameters?.length===r.parameters.length&&r.parameters.every(([name,type],i)=>c.parameters[i].name===name&&c.parameters[i].type===type))??null;
}
const int=(x,lo,hi)=>Number.isInteger(x)&&x>=lo&&x<=hi;
function setup(input,required,optional=[]) {
 const {named,positional}=parseFunctionTestInput(input);
 if(positional.length||required.some(k=>!Object.hasOwn(named,k))||Object.keys(named).some(k=>![...required,...optional].includes(k)))throw Error('Missing or unsupported private provided-object setup field.');
 return named;
}
function list(a,{minimum=0,maximum=50000,lo=-1000000,hi=1000000,unique=false}={}) {
 if(!Array.isArray(a)||a.length<minimum||a.length>maximum||a.some(v=>!int(v,lo,hi))||unique&&new Set(a).size!==a.length)throw Error('Linked-list values violate the source domain.');
 return a.slice();
}
export function decodeRope(a) {
 if(!Array.isArray(a)||!a.length||a.length>2001)throw Error('Rope requires a nonempty bounded tree.');
 const values=[],lengths=[],left=[],right=[];
 function add(v) {
  if(!(int(v,1,10000)||typeof v==='string'&&/^[a-z]{1,50}$/.test(v))||values.length>=1000)throw Error('Invalid RopeTreeNode leaf or internal length.');
  const id=values.length;values.push(typeof v==='string'?v:'');lengths.push(typeof v==='string'?0:v);left.push(-1);right.push(-1);return id;
 }
 add(a[0]);let at=1;
 for(let p=0;p<values.length&&at<a.length;p++)for(const side of[left,right]){if(at<a.length&&a[at]!==null)side[p]=add(a[at]);at++;}
 if(a.slice(at).some(v=>v!==null))throw Error('Unreachable rope node.');
 const sizes=Array(values.length).fill(0);
 for(let p=values.length-1;p>=0;p--) {
  const child=left[p]>=0||right[p]>=0;
  if(child&&values[p]||!child&&!values[p])throw Error('Rope leaves and internal nodes have inconsistent payloads.');
  sizes[p]=child?(left[p]<0?0:sizes[left[p]])+(right[p]<0?0:sizes[right[p]]):values[p].length;
  if(child&&sizes[p]!==lengths[p])throw Error('Rope internal length differs from its actual subtree string.');
 }
 const order=[],stack=[0];while(stack.length){const id=stack.pop();if(values[id])order.push(id);else{if(right[id]>=0)stack.push(right[id]);if(left[id]>=0)stack.push(left[id]);}}
 return {values,lengths,left,right,sizes,root:0,text:order.map(id=>values[id]).join('')};
}
export function decodeMultilevelList(a) {
 if(!Array.isArray(a)||a.length>1000001)throw Error('Invalid multilevel serialization.');
 const values=[],next=[],prev=[],child=[];
 let at=0,previousRow=null;
 while(at<a.length) {
  let parent=-1;
  if(previousRow) {
   if(a[at++]!==null)throw Error('Missing child-level separator.');
   let offset=0;while(at<a.length&&a[at]===null){offset++;at++;}
   if(at===a.length)break;
   if(offset>=previousRow.length)throw Error('Child level refers beyond its original parent row.');
   parent=previousRow[offset];
  }
  const row=[];
  while(at<a.length&&a[at]!==null) {
   const value=a[at++];if(!int(value,1,100000)||values.length>=1000)throw Error('Invalid multilevel node value/count.');
   const id=values.length;values.push(value);next.push(-1);prev.push(row.at(-1)??-1);child.push(-1);if(row.length)next[row.at(-1)]=id;row.push(id);
  }
  if(!row.length)throw Error('Empty serialized child level.');
  if(parent>=0)child[parent]=row[0];previousRow=row;
 }
 const order=[],stack=values.length?[0]:[];
 while(stack.length){const id=stack.pop();order.push(id);if(next[id]>=0)stack.push(next[id]);if(child[id]>=0)stack.push(child[id]);}
 return {values,next,prev,child,root:values.length?0:-1,order,expected:order.map(id=>values[id])};
}
function matrix(a,rows,columns,lo,hi) {
 if(!Array.isArray(a)||!a.length||a.length>rows||!Array.isArray(a[0])||!a[0].length||a[0].length>columns||a.some(r=>!Array.isArray(r)||r.length!==a[0].length||r.some(v=>!int(v,lo,hi))))throw Error('Private grid violates the source dimensions or cell domain.');
 return {grid:a,rows:a.length,columns:a[0].length};
}
const neighbors=(id,rows,columns)=>{const r=Math.floor(id/columns),c=id%columns;return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([x,y])=>x>=0&&x<rows&&y>=0&&y<columns).map(([x,y])=>x*columns+y);};
function reachable(e) {
 const seen=new Uint8Array(e.rows*e.columns),q=[e.start];seen[e.start]=1;
 for(let at=0;at<q.length;at++)for(const id of neighbors(q[at],e.rows,e.columns))if(!seen[id]&&e.grid[Math.floor(id/e.columns)][id%e.columns]!==0){seen[id]=1;q.push(id);}
 return q;
}
// Independent Dijkstra oracle over actual private cells, separate from the
// learner's exploration through GridMaster.canMove/move/isTarget.
export function shortestPrivateGridPath(e,weighted) {
 const distance=Array(e.rows*e.columns).fill(Infinity),heap=[];distance[e.start]=0;
 function push(v){heap.push(v);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<=v[0])break;heap[i]=heap[p];i=p;}heap[i]=v;}
 function pop(){const top=heap[0],v=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1][0]<heap[j][0])j++;if(heap[j][0]>=v[0])break;heap[i]=heap[j];i=j;}heap[i]=v;}return top;}
 push([0,e.start]);while(heap.length){const[d,id]=pop();if(d!==distance[id])continue;if(id===e.target)return d;for(const n of neighbors(id,e.rows,e.columns)){const cell=e.grid[Math.floor(n/e.columns)][n%e.columns];if(cell===0)continue;const nd=d+(weighted?cell:1);if(nd<distance[n]){distance[n]=nd;push([nd,n]);}}}
 return -1;
}
export function circularInsertionWitness(original,insertVal,result) {
 if(!Array.isArray(result)||result.length!==original.length+1||result.some(v=>!int(v,-1000000,1000000)))return false;
 let descents=0;for(let i=0;i<result.length;i++)if(result[i]>result[(i+1)%result.length])descents++;
 if(descents>1||original.length&&result[0]!==original[0])return false;
 // Only one occurrence is newly inserted. Removing it must preserve the
 // existing head and the complete original traversal, including duplicates.
 for(let i=original.length?1:0;i<result.length;i++)if(result[i]===insertVal){const removed=result.slice(0,i).concat(result.slice(i+1));if(removed.every((v,j)=>v===original[j]))return true;}
 return false;
}
function canonicalInsert(a,v) {
 if(!a.length)return[v];let chosen=a.length-1;
 for(let i=0;i<a.length;i++){const x=a[i],y=a[(i+1)%a.length];if(x<=v&&v<=y||x>y&&(v>=x||v<=y)){chosen=i;break;}}
 return a.slice(0,chosen+1).concat(v,a.slice(chosen+1));
}
export function validateRemainingProvidedNodeFixture(p,input) {
 const rule=remainingProvidedNodeRule(p);if(!rule)throw Error('Unsupported exact remaining provided-object contract.');let v,t,expected,selected=-1;
 switch(rule.kind) {
  case 'dll-array-head':case 'dll-array-selected': {
   v=setup(input,rule.kind==='dll-array-selected'?['head','node']:['head']);
   const selectedList=rule.kind==='dll-array-selected';const values=list(v.head,{minimum:1,maximum:selectedList?500:50,lo:1,hi:selectedList?1000:50,unique:selectedList});
   selected=selectedList?values.indexOf(v.node):0;if(selected<0)throw Error('Doubly linked selector must be an existing original node.');
   t={values,selected};expected=values;break;
  }
  case 'rope-character':v=setup(input,['root','k']);t=decodeRope(v.root);if(!int(v.k,1,t.sizes[0]))throw Error('Rope position outside the actual string.');t.k=v.k;expected=t.text[v.k-1];break;
  case 'multilevel-flatten':v=setup(input,['head']);t=decodeMultilevelList(v.head);expected=t.expected;break;
  case 'bst-circular-dll': {
   v=setup(input,['root']);t=decodeNextBinary(v.root,{maximum:2000,lo:-1000,hi:1000,unique:true});
   const stack=t.root<0?[]:[[0,-Infinity,Infinity]];while(stack.length){const[id,lo,hi]=stack.pop();if(t.values[id]<=lo||t.values[id]>=hi)throw Error('Provided tree must be a strict BST.');if(t.left[id]>=0)stack.push([t.left[id],lo,t.values[id]]);if(t.right[id]>=0)stack.push([t.right[id],t.values[id],hi]);}
   t.order=t.values.map((_,id)=>id).sort((a,b)=>t.values[a]-t.values[b]);expected=t.order.map(id=>t.values[id]);break;
  }
  case 'corresponding-clone': {
   v=setup(input,['original','cloned','target'],['targetIndex']);t=decodeNextBinary(v.original,{maximum:10000,minimum:1,unique:v.targetIndex===undefined});const clone=decodeNextBinary(v.cloned,{maximum:10000,minimum:1,unique:v.targetIndex===undefined});
   for(const key of['values','left','right'])if(JSON.stringify(t[key])!==JSON.stringify(clone[key]))throw Error('Provided clone must match the original structure and values.');
   selected=v.targetIndex===undefined?t.values.indexOf(v.target):t.slots.indexOf(v.targetIndex);
   if(selected<0||t.values[selected]!==v.target)throw Error('Target must select an existing original node.');t.selected=selected;expected=t.values[selected];break;
  }
  case 'circular-insert': {
   v=setup(input,['head','insertVal']);const values=list(v.head);if(!int(v.insertVal,-1000000,1000000))throw Error('Inserted value outside the source domain.');let descents=0;for(let i=0;i<values.length;i++)if(values[i]>values[(i+1)%values.length])descents++;if(descents>1)throw Error('Provided circular list must be sorted cyclically.');t={values,insertVal:v.insertVal};expected=canonicalInsert(values,v.insertVal);break;
  }
  case 'hidden-grid-unweighted':case 'hidden-grid-weighted': {
   const weighted=rule.kind==='hidden-grid-weighted';v=setup(input,weighted?['grid','r1','c1','r2','c2']:['grid']);t=matrix(v.grid,weighted?100:500,weighted?100:500,weighted?0:-1,weighted?100:2);
   if(weighted){for(const k of['r1','r2'])if(!int(v[k],0,t.rows-1))throw Error('Start/target row invalid.');for(const k of['c1','c2'])if(!int(v[k],0,t.columns-1))throw Error('Start/target column invalid.');t.start=v.r1*t.columns+v.c1;t.target=v.r2*t.columns+v.c2;if(t.start===t.target||!v.grid[v.r1][v.c1]||!v.grid[v.r2][v.c2])throw Error('Weighted endpoints must be different open cells.');}
   else{const starts=[],targets=[];v.grid.forEach((r,x)=>r.forEach((value,y)=>{if(value===-1)starts.push(x*t.columns+y);if(value===2)targets.push(x*t.columns+y);}));if(starts.length!==1||targets.length!==1)throw Error('Hidden grid requires exactly one start and one target.');t.start=starts[0];t.target=targets[0];}
   expected=shortestPrivateGridPath(t,weighted);break;
  }
  case 'robot-clean': {
   v=setup(input,['room','row','col']);t=matrix(v.room,100,200,0,1);if(!int(v.row,0,t.rows-1)||!int(v.col,0,t.columns-1)||v.room[v.row][v.col]!==1)throw Error('Robot starts in an open cell.');t.start=v.row*t.columns+v.col;t.reachable=reachable(t);if(t.reachable.length!==v.room.flat().filter(Boolean).length)throw Error('Robot source requires all open cells reachable.');expected='Robot cleaned all rooms.';break;
  }
 }
 return {rule,...t,expected,selected};
}
export function validateRemainingProvidedNodeOracle(p,tc) {
 try{const f=validateRemainingProvidedNodeFixture(p,tc.input);const text=String(tc.output).trim();const out=f.rule.kind==='robot-clean'?text:text==='None'||text==='null'?null:JSON.parse(text);return f.rule.kind==='circular-insert'?circularInsertionWitness(f.values,f.insertVal,out):JSON.stringify(out)===JSON.stringify(f.expected);}catch{return false;}
}
