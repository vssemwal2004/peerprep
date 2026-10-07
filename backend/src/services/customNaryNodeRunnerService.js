import {parseFunctionTestInput,materializeFunctionInputPlaceholders} from './functionTestInputService.js';
import {generateFunctionRunnerTemplate} from './functionRunnerTemplateService.js';

export const NARY_NODE_APIS=[
  {id:'6ac280379b62de7b237095fc',sourceId:429,title:'N-ary Tree Level Order Traversal',methodName:'levelOrder',returnType:'integer[][]'},
  {id:'6ac280399b62de7b23709653',sourceId:559,title:'Maximum Depth of N-ary Tree',methodName:'maxDepth',returnType:'integer'},
  {id:'6ac2803a9b62de7b23709664',sourceId:589,title:'N-ary Tree Preorder Traversal',methodName:'preorder',returnType:'integer[]'},
  {id:'6ac2807119051acf30c4a65b',sourceId:590,title:'N-ary Tree Postorder Traversal',methodName:'postorder',returnType:'integer[]'},
];
export const naryNodeContract=rule=>({className:'Solution',methodName:rule.methodName,parameters:[{name:'root',type:'nary-node'}],returnType:rule.returnType,outputMode:'return'});
export function naryNodeRule(problem){
  const c=problem?.functionContract;
  return NARY_NODE_APIS.find(r=>problem.executionMode==='function'&&problem.title===r.title&&c?.kind!=='stateful'&&c?.className==='Solution'&&c.methodName===r.methodName&&c.returnType===r.returnType&&c.outputMode!=='parameter'&&c.parameters?.length===1&&c.parameters[0].name==='root'&&c.parameters[0].type==='nary-node')||null;
}

// Breadth-first child groups separated by null; absent trailing groups are empty.
// Values may repeat. Identity is the node position, never a lookup by value.
export function decodeNaryTree(serialized){
  if(!Array.isArray(serialized)||serialized.length>20001)throw Error('N-ary input must be a bounded serialized array.');
  if(!serialized.length)return {values:[],children:[],depth:0};
  if(serialized[0]===null){if(serialized.length===1)return {values:[],children:[],depth:0};throw Error('Null root cannot have descendants.');}
  const valid=v=>Number.isInteger(v)&&v>=0&&v<=10000;
  if(!valid(serialized[0]))throw Error('N-ary node values must be integers in0..10000.');
  const values=[serialized[0]],children=[[]],depths=[1];let index=1,parent=0,maxDepth=1;
  if(index<serialized.length){if(serialized[index++]!==null)throw Error('N-ary root must be followed by its child-group separator.');}
  while(index<serialized.length){
    if(parent>=values.length)throw Error('Unattached N-ary child group.');
    while(index<serialized.length&&serialized[index]!==null){
      const value=serialized[index++];if(!valid(value))throw Error('Invalid N-ary node value.');
      if(values.length>=10000)throw Error('N-ary tree exceeds10000nodes.');
      const id=values.length,depth=depths[parent]+1;if(depth>1000)throw Error('N-ary tree exceeds source depth1000.');
      children[parent].push(id);values.push(value);children.push([]);depths.push(depth);maxDepth=Math.max(maxDepth,depth);
    }
    if(index<serialized.length)index++;parent++;
  }
  return {values,children,depth:maxDepth};
}
export function validateNaryNodeFixture(problem,input){
  const rule=naryNodeRule(problem);if(!rule)throw Error('Unsupported exact N-ary public contract.');
  const parsed=parseFunctionTestInput(input);if(parsed.positional.length||Object.keys(parsed.named).length!==1||!Object.hasOwn(parsed.named,'root'))throw Error('N-ary fixture requires exactly named root.');
  const tree=decodeNaryTree(parsed.named.root),{values,children}=tree;
  let expected;
  if(rule.methodName==='maxDepth')expected=tree.depth;
  else if(rule.methodName==='levelOrder'){
    expected=[];let level=values.length?[0]:[];
    while(level.length){expected.push(level.map(id=>values[id]));level=level.flatMap(id=>children[id]);}
  }else{
    expected=[];const stack=values.length?[0]:[];
    while(stack.length){const id=stack.pop();expected.push(values[id]);const kids=children[id];for(let i=rule.methodName==='postorder'?0:kids.length-1;rule.methodName==='postorder'?i<kids.length:i>=0;rule.methodName==='postorder'?i++:i--)stack.push(kids[i]);}
    if(rule.methodName==='postorder')expected.reverse();
  }
  return {rule,...tree,expected};
}
export function acceptsNaryNodeOutput(problem,testCase,raw){if(!naryNodeRule(problem))return undefined;try{return JSON.stringify(JSON.parse(String(raw).trim()))===JSON.stringify(validateNaryNodeFixture(problem,testCase.input).expected);}catch{return false;}}

const uncomment=code=>String(code).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\r\n]*/g,'');
const javaArray=a=>a.length?`java.util.Arrays.stream(${JSON.stringify(a.join(','))}.split(",")).mapToInt(Integer::parseInt).toArray()`:'new int[0]';

export function prepareNaryNodeSource(language,problem,userCode,input){
  const f=validateNaryNodeFixture(problem,input),n=f.values.length,starts=[],edges=[];
  for(const kids of f.children){starts.push(edges.length);edges.push(...kids);}starts.push(edges.length);
  const vals=f.values.join(','),offsets=starts.join(','),links=edges.join(','),method=f.rule.methodName;
  const active=uncomment(userCode);let prefix='',wrapper='',setup='';
  if(language==='c'){
    prefix=(/struct\s+Node\s*\{/.test(active)?'':'struct Node{int val;int numChildren;struct Node**children;};')+`\nstatic int _ppNaryVals[]={${vals||0}},_ppNaryStarts[]={${offsets}},_ppNaryEdges[]={${links||0}};`;
    setup=`struct Node**nodes=calloc(${n||1},sizeof(struct Node*));for(int i=0;i<${n};i++){nodes[i]=calloc(1,sizeof(struct Node));nodes[i]->val=_ppNaryVals[i];nodes[i]->numChildren=_ppNaryStarts[i+1]-_ppNaryStarts[i];nodes[i]->children=calloc(nodes[i]->numChildren?nodes[i]->numChildren:1,sizeof(struct Node*));}for(int i=0;i<${n};i++)for(int j=_ppNaryStarts[i];j<_ppNaryStarts[i+1];j++)nodes[i]->children[j-_ppNaryStarts[i]]=nodes[_ppNaryEdges[j]];struct Node*root=${n?'nodes[0]':'NULL'};`;
    const t=f.rule.returnType==='integer'?'int':f.rule.returnType==='integer[]'?'int*':'int**',extra=t==='int'?'':t==='int*'?',int*returnSize':',int*returnSize,int**returnColumnSizes';
    wrapper=`${t} captureNode(int seed${extra}){${setup}return ${method}(root${t==='int'?'':t==='int*'?',returnSize':',returnSize,returnColumnSizes'});}`;
  }else if(language==='cpp'){
    prefix=(/class\s+Node\s*\{/.test(active)?'':'class Node{public:int val;std::vector<Node*>children;Node():val(0){}Node(int v):val(v){}Node(int v,std::vector<Node*>c):val(v),children(c){}};')+`\nstatic int _ppNaryVals[]={${vals||0}},_ppNaryStarts[]={${offsets}},_ppNaryEdges[]={${links||0}};`;
    setup=`std::vector<Node*>nodes;nodes.reserve(${n});for(int i=0;i<${n};i++)nodes.push_back(new Node(_ppNaryVals[i]));for(int i=0;i<${n};i++)for(int j=_ppNaryStarts[i];j<_ppNaryStarts[i+1];j++)nodes[i]->children.push_back(nodes[_ppNaryEdges[j]]);Node*root=${n?'nodes[0]':'nullptr'};`;
    const t=f.rule.returnType==='integer'?'int':f.rule.returnType==='integer[]'?'std::vector<int>':'std::vector<std::vector<int>>';wrapper=`class CustomNodeCapture{public:${t} captureNode(int seed){${setup}return Solution().${method}(root);}};`;
  }else if(language==='java'){
    prefix=/class\s+Node\s*\{/.test(active)?'':'class Node{public int val;public java.util.List<Node>children;public Node(){children=new java.util.ArrayList<>();}public Node(int v){val=v;children=new java.util.ArrayList<>();}public Node(int v,java.util.List<Node>c){val=v;children=c;}}';
    setup=`int[]v=${javaArray(f.values)},s=${javaArray(starts)},e=${javaArray(edges)};Node[]nodes=new Node[${n}];for(int i=0;i<${n};i++)nodes[i]=new Node(v[i]);for(int i=0;i<${n};i++)for(int j=s[i];j<s[i+1];j++)nodes[i].children.add(nodes[e[j]]);Node root=${n?'nodes[0]':'null'};`;
    const t=f.rule.returnType==='integer'?'int':f.rule.returnType==='integer[]'?'java.util.List<Integer>':'java.util.List<java.util.List<Integer>>';wrapper=`class CustomNodeCapture{public ${t} captureNode(int seed){${setup}return new Solution().${method}(root);}}`;
  }else if(language==='python'){
    prefix=/^class\s+Node\b/m.test(userCode)?'':'class Node:\n    def __init__(self,val=0,children=None): self.val,self.children=val,[] if children is None else children\n';
    wrapper=`class CustomNodeCapture:\n    def captureNode(self,seed):\n        nodes=[Node(v,[]) for v in ${JSON.stringify(f.values)}]\n        children=${JSON.stringify(f.children)}\n        for i,kids in enumerate(children): nodes[i].children=[nodes[j] for j in kids]\n        return Solution().${method}(nodes[0] if nodes else None)\n`;
  }else if(['javascript','typescript'].includes(language)){
    const ts=language==='typescript';prefix=/class\s+_Node\s*\{/.test(active)?'':ts?'class _Node{val:number;children:_Node[];constructor(val=0,children:_Node[]=[]){this.val=val;this.children=children;}}':'class _Node{constructor(val=0,children=[]){this.val=val;this.children=children;}}';
    const call=/class\s+Solution\b/.test(active)?'new Solution().':'';
    wrapper=`function captureNode(seed${ts?':number':''}){const nodes=${JSON.stringify(f.values)}.map(v=>new _Node(v,[])),kids=${JSON.stringify(f.children)};for(let i=0;i<nodes.length;i++)nodes[i].children=kids[i].map(j=>nodes[j]);return ${call}${method}(nodes.length?nodes[0]:null);}`;
  }else throw Error('Unsupported N-ary language.');
  const code=language==='java'?String(userCode).replace(/(^|\n)\s*public\s+class\s+Solution\b/,'$1class Solution'):userCode;
  const contract={className:'CustomNodeCapture',methodName:'captureNode',parameters:[{name:'seed',type:'integer'}],returnType:f.rule.returnType,outputMode:'return',runnerLanguage:language};
  const joined=language==='java'?code+'\n'+prefix+'\n'+wrapper:prefix+'\n'+code+'\n'+wrapper;
  return materializeFunctionInputPlaceholders(generateFunctionRunnerTemplate(language,contract,joined).replace('{{USER_CODE}}',joined),'seed = 0',contract);
}
