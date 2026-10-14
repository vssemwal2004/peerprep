import {validateStatefulFixture} from './statefulRunnerService.js';
import {finishProvidedCapture,withoutDefinitionComments} from './remainingProvidedCaptureService.js';
import {parseNodeResultEnvelope} from './customNodeResultEnvelopeService.js';

const ID='6ace186d6ca3216598bee9d3';

export function findElementsRule(problem){
 const c=problem?.functionContract;
 return String(problem?._id||'')===ID&&problem?.title==='Find Elements in a Contaminated Binary Tree'&&problem?.executionMode==='function'&&c?.kind==='stateful'&&c?.className==='FindElements'&&c?.constructorParameters?.length===1&&c.constructorParameters[0]?.name==='root'&&c.constructorParameters[0]?.type==='tree-node'&&c?.operations?.length===1&&c.operations[0]?.methodName==='find'&&c.operations[0]?.parameters?.length===1&&c.operations[0].parameters[0]?.name==='target'&&c.operations[0].parameters[0]?.type==='integer'&&c.operations[0]?.returnType==='boolean';
}

function treeFixture(values){
 if(!Array.isArray(values)||!values.length||values.length>10000)throw Error('root must contain 1..10000 nodes/slots.');
 if(values.some(value=>value!==null&&value!==-1))throw Error('Every supplied node must be contaminated with value -1.');
 if(values[0]!==-1)throw Error('root must be a contaminated node.');
 const recovered=[0],left=[],right=[];let cursor=1;
 for(let head=0;head<recovered.length&&cursor<values.length;head++){
  for(const [side,value] of [[left,2*recovered[head]+1],[right,2*recovered[head]+2]]){
   if(cursor>=values.length)break;
   const item=values[cursor++];
   if(item===null)side[head]=-1;
   else{side[head]=recovered.length;recovered.push(value);}
  }
  if(left[head]===undefined)left[head]=-1;if(right[head]===undefined)right[head]=-1;
 }
 if(values.slice(cursor).some(value=>value!==null))throw Error('root contains an unreachable node.');
 while(left.length<recovered.length){left.push(-1);right.push(-1);}
 return{recovered,left,right};
}

export function validateFindElementsFixture(problem,input){
 if(!findElementsRule(problem))throw Error('Unsupported FindElements contract.');
 const state=validateStatefulFixture(problem.functionContract,input),first=state.calls[0];
 if(!first?.constructor||state.calls.slice(1).some(call=>call.constructor||call.methodName!=='find'))throw Error('Expected one constructor followed only by find operations.');
 if(state.calls.length<2||state.calls.length>10001)throw Error('Expected 1..10000 find calls.');
 const tree=treeFixture(first.args[0]),present=new Set(tree.recovered),targets=state.calls.slice(1).map(call=>call.args[0]);
 if(targets.some(target=>target<0||target>1000000))throw Error('target must be in [0, 1000000].');
 return{...tree,targets,expected:[null,...targets.map(target=>present.has(target))]};
}

export function validateFindElementsOracle(problem,testCase){
 try{return JSON.stringify(JSON.parse(String(testCase.output).trim()))===JSON.stringify(validateFindElementsFixture(problem,testCase.input).expected);}catch{return false;}
}

export function acceptsFindElementsOutput(problem,testCase,raw){
 if(!findElementsRule(problem))return undefined;
 try{const envelope=parseNodeResultEnvelope(raw);return !!envelope&&JSON.stringify(envelope.value)===JSON.stringify(validateFindElementsFixture(problem,testCase.input).expected);}catch{return false;}
}

const csv=values=>values.length?values.join(','):'0';
function native(language,f,source){
 const cpp=language==='cpp',node=cpp?'TreeNode*':'struct TreeNode*',nil=cpp?'nullptr':'NULL',n=f.recovered.length,q=f.targets,answers=f.expected.slice(1);
 let prefix=cpp?'struct TreeNode{int val;TreeNode*left,*right;TreeNode(int x=-1):val(x),left(nullptr),right(nullptr){}};':'';
 prefix+=`static int _ppE[]={${csv(f.recovered)}},_ppL[]={${csv(f.left)}},_ppR[]={${csv(f.right)}},_ppQ[]={${csv(q)}};static bool _ppA[]={${answers.map(Boolean).join(',')||'false'}};`;
 let body=`${node}N[${n}];for(int i=0;i<${n};i++){N[i]=${cpp?'new TreeNode(-1)':'calloc(1,sizeof(struct TreeNode))'};N[i]->val=-1;}for(int i=0;i<${n};i++){N[i]->left=_ppL[i]<0?${nil}:N[_ppL[i]];N[i]->right=_ppR[i]<0?${nil}:N[_ppR[i]];}`;
 body+=cpp?`FindElements object(N[0]);`:`FindElements*object=findElementsCreate(N[0]);if(!object)return false;`;
 body+=`for(int i=0;i<${n};i++)if(N[i]->val!=_ppE[i]||N[i]->left!=(_ppL[i]<0?${nil}:N[_ppL[i]])||N[i]->right!=(_ppR[i]<0?${nil}:N[_ppR[i]]))return false;`;
 body+=`for(int i=0;i<${q.length};i++)if(${cpp?'object.find(_ppQ[i])':'findElementsFind(object,_ppQ[i])'}!=_ppA[i])return false;`;
 body+=`for(int i=${q.length}-1;i>=0;i--)if(${cpp?'object.find(_ppQ[i])':'findElementsFind(object,_ppQ[i])'}!=_ppA[i])return false;`;
 body+=`for(int i=0;i<${n};i++)if(N[i]->val!=_ppE[i]||N[i]->left!=(_ppL[i]<0?${nil}:N[_ppL[i]])||N[i]->right!=(_ppR[i]<0?${nil}:N[_ppR[i]]))return false;return true;`;
 return{prefix,wrapper:cpp?`class FindElementsCapture{public:bool captureNode(int seed){${body}}};`:`bool captureNode(int seed){${body}}`};
}

function managed(language,f){
 const E=JSON.stringify(f.recovered),L=JSON.stringify(f.left),R=JSON.stringify(f.right),Q=JSON.stringify(f.targets),A=JSON.stringify(f.expected.slice(1));
 if(language==='python'){const PA=f.expected.slice(1).map(value=>value?'True':'False').join(',');return{prefix:'class TreeNode:\n    def __init__(self,val=-1): self.val,self.left,self.right=val,None,None\n',wrapper:`class FindElementsCapture:\n    def captureNode(self,seed):\n        E,L,R,Q,A=${E},${L},${R},${Q},[${PA}];N=[TreeNode() for _ in E]\n        for i in range(len(N)): N[i].left=None if L[i]<0 else N[L[i]];N[i].right=None if R[i]<0 else N[R[i]]\n        obj=FindElements(N[0])\n        if any(x.val!=E[i] or x.left is not (None if L[i]<0 else N[L[i]]) or x.right is not (None if R[i]<0 else N[R[i]]) for i,x in enumerate(N)): return False\n        if any(obj.find(x)!=A[i] for i,x in enumerate(Q)) or any(obj.find(Q[i])!=A[i] for i in range(len(Q)-1,-1,-1)): return False\n        return all(x.val==E[i] and x.left is (None if L[i]<0 else N[L[i]]) and x.right is (None if R[i]<0 else N[R[i]]) for i,x in enumerate(N))\n`};}
 if(language==='java')return{prefix:'class TreeNode{int val=-1;TreeNode left,right;TreeNode(){}}',wrapper:`class FindElementsCapture{public boolean captureNode(int seed){int[]E=${javaInts(f.recovered)},L=${javaInts(f.left)},R=${javaInts(f.right)},Q=${javaInts(f.targets)};boolean[]A=new boolean[]{${f.expected.slice(1)}};TreeNode[]N=new TreeNode[E.length];for(int i=0;i<N.length;i++)N[i]=new TreeNode();for(int i=0;i<N.length;i++){N[i].left=L[i]<0?null:N[L[i]];N[i].right=R[i]<0?null:N[R[i]];}FindElements obj=new FindElements(N[0]);for(int i=0;i<N.length;i++)if(N[i].val!=E[i]||N[i].left!=(L[i]<0?null:N[L[i]])||N[i].right!=(R[i]<0?null:N[R[i]]))return false;for(int i=0;i<Q.length;i++)if(obj.find(Q[i])!=A[i])return false;for(int i=Q.length-1;i>=0;i--)if(obj.find(Q[i])!=A[i])return false;for(int i=0;i<N.length;i++)if(N[i].val!=E[i]||N[i].left!=(L[i]<0?null:N[L[i]])||N[i].right!=(R[i]<0?null:N[R[i]]))return false;return true;}}`};
 const ts=language==='typescript',bang=ts?'!':'',nodeType=ts?':TreeNode[]':'',boolType=ts?':boolean':'';
 return{prefix:'',wrapper:`function captureNode(seed${ts?':number':''})${boolType}{const E=${E},L=${L},R=${R},Q=${Q},A=${A},N${nodeType}=E.map(()=>new TreeNode());for(let i=0;i<N.length;i++){N[i]${bang}.left=L[i]<0?null:N[L[i]];N[i]${bang}.right=R[i]<0?null:N[R[i]];}const obj=new FindElements(N[0]);for(let i=0;i<N.length;i++)if(N[i]${bang}.val!==E[i]||N[i]${bang}.left!==(L[i]<0?null:N[L[i]])||N[i]${bang}.right!==(R[i]<0?null:N[R[i]]))return false;for(let i=0;i<Q.length;i++)if(obj.find(Q[i])!==A[i])return false;for(let i=Q.length-1;i>=0;i--)if(obj.find(Q[i])!==A[i])return false;for(let i=0;i<N.length;i++)if(N[i]${bang}.val!==E[i]||N[i]${bang}.left!==(L[i]<0?null:N[L[i]])||N[i]${bang}.right!==(R[i]<0?null:N[R[i]]))return false;return true;}`};
}
const javaInts=values=>`new int[]{${values.join(',')}}`;

export function prepareFindElementsSource(language,problem,userCode,input){
 const fixture=validateFindElementsFixture(problem,input),source=withoutDefinitionComments(userCode),parts=language==='c'||language==='cpp'?native(language,fixture,source):managed(language,fixture);
 return finishProvidedCapture(language,source,parts.prefix,parts.wrapper,'FindElementsCapture',fixture.expected);
}
