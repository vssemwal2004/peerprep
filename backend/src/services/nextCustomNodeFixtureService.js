import {parseFunctionTestInput} from './functionTestInputService.js';
export const NEXT_CUSTOM_NODE_APIS=[
 {id:'6ac2809719051acf30c4af5f',sourceId:1490,title:'Clone N-ary Tree',methodName:'cloneTree',kind:'nary-clone',parameters:[['root','nary-node']],returnType:'nary-node'},
 {id:'6ac2809b19051acf30c4affa',sourceId:1522,title:'Diameter of N-Ary Tree',methodName:'diameter',kind:'nary-diameter',parameters:[['root','nary-node']],returnType:'integer'},
 {id:'6ac2809819051acf30c4af7f',sourceId:1506,title:'Find Root of N-Ary Tree',methodName:'findRoot',kind:'nary-root',parameters:[['tree','nary-node[]']],returnType:'nary-node'},
 {id:'6ac2809c19051acf30c4b042',sourceId:1516,title:'Move Sub-Tree of N-Ary Tree',methodName:'moveSubTree',kind:'nary-move',parameters:[['root','nary-node'],['p','nary-node'],['q','nary-node']],returnType:'nary-node'},
 {id:'6ac280a919051acf30c4b263',sourceId:1660,title:'Correct a Binary Tree',methodName:'correctBinaryTree',kind:'binary-correct',parameters:[['root','tree-node']],returnType:'tree-node'},
 {id:'6ac280a919051acf30c4b284',sourceId:1676,title:'Lowest Common Ancestor of a Binary Tree IV',methodName:'lowestCommonAncestor',kind:'binary-lca-list',parameters:[['root','tree-node'],['nodes','tree-node[]']],returnType:'tree-node'},
 {id:'6ac280a619051acf30c4b208',sourceId:1650,title:'Lowest Common Ancestor of a Binary Tree III',methodName:'lowestCommonAncestor',kind:'parent-lca',parameters:[['p','parent-node'],['q','parent-node']],returnType:'parent-node'},
 {id:'6ababf467dd728ca2c939e8b',sourceId:1602,title:'Find Nearest Right Node In Binary Tree',methodName:'findNearestRightNode',kind:'binary-nearest',parameters:[['root','tree-node'],['u','tree-node']],returnType:'tree-node'},
 {id:'6ac280389b62de7b23709631',sourceId:510,title:'Inorder Successor in BST II',methodName:'inorderSuccessor',kind:'parent-successor',parameters:[['node','parent-node']],returnType:'parent-node'},
 {id:'6ac2809919051acf30c4afb5',sourceId:1485,title:'Clone Binary Tree With Random Pointer',methodName:'copyRandomBinaryTree',kind:'binary-random-clone',parameters:[['root','random-tree-node']],returnType:'random-tree-node-copy'},
];
export const nextCustomNodeContract=rule=>({className:'Solution',methodName:rule.methodName,parameters:rule.parameters.map(([name,type])=>({name,type})),returnType:rule.returnType,outputMode:'return'});
export function nextCustomNodeRule(p){const c=p?.functionContract;return NEXT_CUSTOM_NODE_APIS.find(r=>p.executionMode==='function'&&p.title===r.title&&c?.className==='Solution'&&c.kind!=='stateful'&&c.methodName===r.methodName&&c.returnType===r.returnType&&c.outputMode!=='parameter'&&c.parameters?.length===r.parameters.length&&r.parameters.every(([name,type],i)=>c.parameters[i].name===name&&c.parameters[i].type===type))||null;}
const integer=(v,lo=-2147483648,hi=2147483647)=>Number.isInteger(v)&&v>=lo&&v<=hi;
function named(input,required,optional=[]){const p=parseFunctionTestInput(input),v=p.named;if(p.positional.length||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>![...required,...optional].includes(k)))throw Error('Fixture has missing or unsupported private setup fields.');return v;}
export function decodeNextNary(a,{maximum=10000,height=1000,minimum=0,unique=false}={}){
 if(!Array.isArray(a)||a.length>2*maximum+1)throw Error('Invalid bounded N-ary serialization.');
 if(!a.length||a.length===1&&a[0]===null){if(minimum)throw Error('N-ary tree cannot be empty.');return{values:[],children:[],parents:[],depths:[],root:-1};}
 if(!integer(a[0]))throw Error('Node values require exact signed 32-bit integers.');
 const values=[a[0]],children=[[]],parents=[-1],depths=[0];let i=1,parent=0;
 if(i<a.length&&a[i++]!==null)throw Error('Missing root child-group separator.');
 while(i<a.length){if(parent>=values.length)throw Error('Orphan N-ary child group.');while(i<a.length&&a[i]!==null){const value=a[i++],depth=depths[parent]+1;if(!integer(value)||values.length>=maximum||depth+1>height)throw Error('N-ary node value/count/depth exceeds the source domain.');const id=values.length;children[parent].push(id);values.push(value);children.push([]);parents.push(parent);depths.push(depth);}if(i<a.length)i++;parent++;}
 if(values.length<minimum||unique&&new Set(values).size!==values.length)throw Error('N-ary node count or source uniqueness is invalid.');return{values,children,parents,depths,root:0};
}
export function serializeNextNary(tree){if(tree.root<0)return[];const queue=[tree.root],out=[tree.values[tree.root],null];for(let i=0;i<queue.length;i++){for(const id of tree.children[queue[i]]){out.push(tree.values[id]);queue.push(id);}out.push(null);}while(out.at(-1)===null)out.pop();return out;}
export function decodeNextBinary(a,{maximum=100000,minimum=0,unique=false,lo=-1000000000,hi=1000000000,random=false}={}){
 if(!Array.isArray(a)||a.length>2*maximum+1)throw Error('Invalid bounded binary serialization.');
 if(!a.length||a.length===1&&a[0]===null){if(minimum)throw Error('Binary tree cannot be empty.');return{values:[],left:[],right:[],parents:[],depths:[],slots:[],random:[],root:-1};}
 const values=[],left=[],right=[],parents=[],depths=[],slots=[],randomSlots=[];
 function add(raw,parent,slot){const value=random?raw?.[0]:raw;if(!integer(value,lo,hi)||random&&(!Array.isArray(raw)||raw.length!==2||raw[1]!==null&&!integer(raw[1],0,a.length-1)))throw Error('Malformed binary node value or random slot.');if(values.length>=maximum)throw Error('Binary node count exceeds the source domain.');const id=values.length;values.push(value);left.push(-1);right.push(-1);parents.push(parent);depths.push(parent<0?0:depths[parent]+1);slots.push(slot);randomSlots.push(random?raw[1]:null);return id;}
 add(a[0],-1,0);let at=1;
 for(let parent=0;parent<values.length&&at<a.length;parent++){for(const side of[left,right]){if(at<a.length){if(a[at]!==null)side[parent]=add(a[at],parent,at);at++;}}}
 if(a.slice(at).some(v=>v!==null)||values.length<minimum||unique&&new Set(values).size!==values.length)throw Error('Orphan binary node or invalid source uniqueness/count.');
 const bySlot=new Map(slots.map((slot,id)=>[slot,id])),randomIds=randomSlots.map(slot=>slot===null?-1:bySlot.get(slot));if(randomIds.some(v=>v===undefined))throw Error('Random pointer must select an existing original node.');
 return{values,left,right,parents,depths,slots,random:randomIds,root:0};
}
export function serializeNextBinary(t,{random=false}={}){if(t.root<0)return[];const queue=[t.root],ids=[];for(let i=0;i<queue.length;i++){const id=queue[i];ids.push(id);if(id>=0)queue.push(t.left[id],t.right[id]);}while(ids.at(-1)===-1)ids.pop();const positions=new Map(ids.map((id,i)=>[id,i]));return ids.map(id=>id<0?null:random?[t.values[id],t.random[id]<0?null:positions.get(t.random[id])]:t.values[id]);}
const selector=(t,value)=>{if(!t.selectorIndex)t.selectorIndex=new Map(t.values.map((v,id)=>[v,id]));if(!integer(value)||!t.selectorIndex.has(value))throw Error('Selector must reference an existing unique original node.');return t.selectorIndex.get(value);};
function diameter(t){const far=start=>{const distance=new Int32Array(t.values.length).fill(-1),q=[start];distance[start]=0;let end=start;for(let i=0;i<q.length;i++){const id=q[i];end=id;for(const next of [...t.children[id],t.parents[id]])if(next>=0&&distance[next]<0){distance[next]=distance[id]+1;q.push(next);}}return{end,distance:distance[end]};};return far(far(0).end).distance;}
function ancestor(t,ids){const targets=new Set(ids),counts=t.values.map((_,id)=>targets.has(id)?1:0);let result=-1;for(let i=t.values.length-1;i>=0;i--){if(counts[i]===targets.size&&result<0)result=i;if(t.parents[i]>=0)counts[t.parents[i]]+=counts[i];}return result;}
export function validateNextCustomNodeFixture(p,input){
 const rule=nextCustomNodeRule(p);if(!rule)throw Error('Unsupported exact next custom-node contract.');let t,v,expected,selected=-1,order=null,selectors=[];
 if(rule.kind.startsWith('nary')){
  const key=rule.kind==='nary-root'?'tree':'root',required=rule.kind==='nary-move'?[key,'p','q']:[key];v=named(input,required,rule.kind==='nary-root'?['nodeOrder']:[]);
  t=decodeNextNary(v[key],{maximum:rule.kind==='nary-root'?50000:rule.kind==='nary-move'?1000:10000,height:rule.kind==='nary-root'?50000:1000,minimum:rule.kind==='nary-clone'?0:rule.kind==='nary-move'?2:1,unique:['nary-root','nary-move'].includes(rule.kind)});
  if(rule.kind==='nary-diameter')expected=diameter(t);
  else if(rule.kind==='nary-move'){
   const a=selector(t,v.p),b=selector(t,v.q);if(a===b)throw Error('Move selectors must be different original nodes.');selectors=[a,b];const moved={...t,children:t.children.map(c=>c.slice())};
   if(t.parents[a]!==b){let cur=b;while(cur>=0&&cur!==a)cur=t.parents[cur];const ap=t.parents[a],ai=ap<0?-1:moved.children[ap].indexOf(a);
    if(cur===a){const bp=t.parents[b];moved.children[bp].splice(moved.children[bp].indexOf(b),1);if(ap<0)moved.root=b;else moved.children[ap].splice(ai,1,b);}
    else moved.children[ap].splice(ai,1);moved.children[b].push(a);
   }
   expected=serializeNextNary(moved);t.expectedChildren=moved.children;t.expectedRoot=moved.root;
  }else{expected=serializeNextNary(t);if(rule.kind==='nary-root'){order=v.nodeOrder??t.values.map((_,i)=>t.values.length-1-i);if(!Array.isArray(order)||order.length!==t.values.length||order.some(id=>!integer(id,0,t.values.length-1))||new Set(order).size!==order.length)throw Error('nodeOrder must be a complete permutation of original BFS node indices.');selected=t.root;}}
 }else{
  const key=rule.kind==='parent-successor'?'tree':'root';const required=rule.kind==='binary-correct'?[key,'fromNode','toNode']:rule.kind==='binary-lca-list'?[key,'nodes']:rule.kind==='parent-lca'?[key,'p','q']:rule.kind==='binary-nearest'?[key,'u']:rule.kind==='parent-successor'?[key,'node']:[key];v=named(input,required);
  const random=rule.kind==='binary-random-clone',maximum=random?1000:['binary-correct','binary-lca-list','parent-successor'].includes(rule.kind)?10000:100000,minimum=random?0:rule.kind==='binary-correct'?3:rule.kind==='parent-lca'?2:1;
  t=decodeNextBinary(v[key],{maximum,minimum,unique:!random,lo:random?1:rule.kind==='binary-nearest'?1:rule.kind==='parent-successor'?-100000:-1000000000,hi:random?1000000:rule.kind==='binary-nearest'||rule.kind==='parent-successor'?100000:1000000000,random});
  if(rule.kind==='binary-random-clone')expected=serializeNextBinary(t,{random:true});
  else if(rule.kind==='binary-correct'){
   const a=selector(t,v.fromNode),b=selector(t,v.toNode);if(a===b||t.depths[a]!==t.depths[b]||b<a||t.right[a]>=0)throw Error('Corruption must point from an empty right link to another node on the right at the same depth.');selectors=[a,b];const corrected={...t,left:t.left.slice(),right:t.right.slice()},parent=t.parents[a];if(parent<0)throw Error('Root cannot have a same-depth corruption target.');if(corrected.left[parent]===a)corrected.left[parent]=-1;else corrected.right[parent]=-1;expected=serializeNextBinary(corrected);t.expectedLeft=corrected.left;t.expectedRight=corrected.right;
  }else{
   if(rule.kind==='binary-lca-list'){if(!Array.isArray(v.nodes)||!v.nodes.length)throw Error('Ancestor selectors must be a nonempty node list.');selectors=v.nodes.map(value=>selector(t,value));if(new Set(selectors).size!==selectors.length)throw Error('Ancestor selectors must be distinct.');selected=ancestor(t,selectors);}
   if(rule.kind==='parent-lca'){selectors=[selector(t,v.p),selector(t,v.q)];if(selectors[0]===selectors[1])throw Error('Parent ancestor selectors must be different.');selected=ancestor(t,selectors);}
   if(rule.kind==='binary-nearest'){selectors=[selector(t,v.u)];const id=selectors[0];selected=id+1<t.values.length&&t.depths[id+1]===t.depths[id]?id+1:-1;}
   if(rule.kind==='parent-successor'){
    selectors=[selector(t,v.node)];const stack=t.root<0?[]:[[t.root,-Infinity,Infinity]];while(stack.length){const[id,lo,hi]=stack.pop(),value=t.values[id];if(value<=lo||value>=hi)throw Error('Parent successor requires a strict binary search tree.');if(t.left[id]>=0)stack.push([t.left[id],lo,value]);if(t.right[id]>=0)stack.push([t.right[id],value,hi]);}
    const id=selectors[0];if(t.right[id]>=0){selected=t.right[id];while(t.left[selected]>=0)selected=t.left[selected];}else{let cur=id;while(t.parents[cur]>=0&&t.right[t.parents[cur]]===cur)cur=t.parents[cur];selected=t.parents[cur];}
   }
   expected=selected<0?null:t.values[selected];
  }
 }
 return{rule,...t,expected,selected,order,selectors};
}
export function validateNextCustomNodeOracle(p,tc){try{const f=validateNextCustomNodeFixture(p,tc.input),text=String(tc.output).trim(),output=['None','null'].includes(text)?null:JSON.parse(text);return JSON.stringify(output)===JSON.stringify(f.expected);}catch{return false;}}
