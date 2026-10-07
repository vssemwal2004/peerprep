import {generateFunctionRunnerTemplate} from './functionRunnerTemplateService.js';
import {materializeFunctionInputPlaceholders} from './functionTestInputService.js';
import {validateNextCustomNodeFixture,nextCustomNodeRule} from './nextCustomNodeFixtureService.js';
import {parseNodeResultEnvelope,wrapVerifiedNodeCapture} from './customNodeResultEnvelopeService.js';
const supported=new Set(['nary-diameter','parent-lca','parent-successor','binary-lca-list','binary-nearest']);
const active=s=>String(s).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\r\n]*/g,'');
const literal=a=>a.length?a.join(','):'0';
const javaArray=a=>{if(!a.length)return'new int[0]';const csv=a.join(','),chunks=[];for(let i=0;i<csv.length;i+=16000)chunks.push(JSON.stringify(csv.slice(i,i+16000)));return`java.util.Arrays.stream(String.join("",new String[]{${chunks.join(',')}}).split(",")).mapToInt(Integer::parseInt).toArray()`;};
export function acceptsNextNodeScalarOutput(p,tc,raw){const rule=nextCustomNodeRule(p);if(!rule||!supported.has(rule.kind))return undefined;try{const result=parseNodeResultEnvelope(raw),expected=validateNextCustomNodeFixture(p,tc.input).expected;return !!result&&JSON.stringify(result.value)===JSON.stringify(expected);}catch{return false;}}
export function prepareNextNodeScalarSource(language,p,userCode,input){
 const f=validateNextCustomNodeFixture(p,input);if(!supported.has(f.rule.kind))throw Error('Unsupported selected-node/scalar private adapter.');
 const n=f.values.length,nary=f.rule.kind==='nary-diameter',parent=f.rule.kind.startsWith('parent'),binary=!nary&&!parent;
 const type=binary?'TreeNode':language==='javascript'||language==='typescript'?'_Node':'Node',cpp=language==='cpp',ts=language==='typescript';
 const starts=[0],edges=[];if(nary)for(const kids of f.children){edges.push(...kids);starts.push(edges.length);}
 const source=active(userCode);let prefix='',wrapper='',setup='',call;
 function args(at,collection){if(nary)return at(0);if(f.rule.kind==='parent-lca')return f.selectors.map(at).join(',');if(f.rule.kind==='parent-successor')return at(f.selectors[0]);if(f.rule.kind==='binary-nearest')return at(0)+','+at(f.selectors[0]);return at(0)+','+collection;}
 if(language==='c'||cpp){
  const T=cpp?type+'*':'struct '+type+'*',nil=cpp?'nullptr':'NULL';
  if(!binary&&!new RegExp((cpp?'class':'struct')+'\\s+Node\\s*\\{').test(source))prefix=nary?(cpp?'class Node{public:int val;std::vector<Node*>children;Node(int v=0):val(v){}};':'struct Node{int val;int numChildren;struct Node**children;};'):(cpp?'class Node{public:int val;Node*left,*right,*parent;Node(int v=0):val(v),left(nullptr),right(nullptr),parent(nullptr){}};':'struct Node{int val;struct Node*left,*right,*parent;};');
  prefix+=`\nstatic int _ppNextVals[]={${literal(f.values)}};`+(nary?`static int _ppNextStarts[]={${literal(starts)}},_ppNextEdges[]={${literal(edges)}};`:`static int _ppNextLeft[]={${literal(f.left)}},_ppNextRight[]={${literal(f.right)}};`);
  setup=`${T}nodes[${n}];for(int i=0;i<${n};i++){nodes[i]=${cpp?'new '+type+'(_ppNextVals[i])':'calloc(1,sizeof(struct '+type+'))'};nodes[i]->val=_ppNextVals[i];}`;
  if(nary)setup+=`for(int i=0;i<${n};i++){${cpp?'':`nodes[i]->numChildren=_ppNextStarts[i+1]-_ppNextStarts[i];nodes[i]->children=calloc(nodes[i]->numChildren?nodes[i]->numChildren:1,sizeof(${T}));`}for(int j=_ppNextStarts[i];j<_ppNextStarts[i+1];j++)${cpp?'nodes[i]->children.push_back(nodes[_ppNextEdges[j]])':'nodes[i]->children[j-_ppNextStarts[i]]=nodes[_ppNextEdges[j]]'};}`;
  else setup+=`for(int i=0;i<${n};i++){nodes[i]->left=_ppNextLeft[i]<0?${nil}:nodes[_ppNextLeft[i]];nodes[i]->right=_ppNextRight[i]<0?${nil}:nodes[_ppNextRight[i]];${parent?'if(nodes[i]->left)nodes[i]->left->parent=nodes[i];if(nodes[i]->right)nodes[i]->right->parent=nodes[i];':''}}`;
  const at=id=>`nodes[${id}]`;let collection='';
  if(f.rule.kind==='binary-lca-list'){collection='selected';prefix+=`static int _ppNextSelected[]={${literal(f.selectors)}};`;setup+=cpp?`std::vector<TreeNode*>selected;selected.reserve(${f.selectors.length});for(int i=0;i<${f.selectors.length};i++)selected.push_back(nodes[_ppNextSelected[i]]);`:`struct TreeNode*selected[${f.selectors.length}];for(int i=0;i<${f.selectors.length};i++)selected[i]=nodes[_ppNextSelected[i]];`;}
  call=(cpp?'Solution().':'')+f.rule.methodName+'('+args(at,collection)+(f.rule.kind==='binary-lca-list'&&!cpp?','+f.selectors.length:'')+')';
  const check=nary?`int result=${call};return result==${f.expected};`:`${T}result=${call};return result==${f.selected<0?nil:at(f.selected)}${f.selected<0?'':`&&result->val==${f.expected}`};`;
  wrapper=cpp?`class NextNodeScalarCapture{public:bool captureNode(int seed){${setup}${check}}};`:`bool captureNode(int seed){${setup}${check}}`;
 }else if(language==='java'){
  if(!binary&&!/class\s+Node\s*\{/.test(source))prefix=nary?'class Node{public int val;public java.util.List<Node>children=new java.util.ArrayList<>();public Node(int v){val=v;}}':'class Node{public int val;public Node left,right,parent;public Node(int v){val=v;}}';
  setup=`int[]values=${javaArray(f.values)};${type}[]nodes=new ${type}[${n}];for(int i=0;i<${n};i++)nodes[i]=new ${type}(values[i]);`;
  if(nary)setup+=`int[]starts=${javaArray(starts)},edges=${javaArray(edges)};for(int i=0;i<${n};i++)for(int j=starts[i];j<starts[i+1];j++)nodes[i].children.add(nodes[edges[j]]);`;
  else setup+=`int[]left=${javaArray(f.left)},right=${javaArray(f.right)};for(int i=0;i<${n};i++){nodes[i].left=left[i]<0?null:nodes[left[i]];nodes[i].right=right[i]<0?null:nodes[right[i]];${parent?'if(nodes[i].left!=null)nodes[i].left.parent=nodes[i];if(nodes[i].right!=null)nodes[i].right.parent=nodes[i];':''}}`;
  if(f.rule.kind==='binary-lca-list')setup+=`int[]selectedIds=${javaArray(f.selectors)};TreeNode[]selected=new TreeNode[selectedIds.length];for(int i=0;i<selectedIds.length;i++)selected[i]=nodes[selectedIds[i]];`;
  const at=id=>`nodes[${id}]`,collection='selected';call=`new Solution().${f.rule.methodName}(${args(at,collection)})`;
  wrapper=`class NextNodeScalarCapture{public boolean captureNode(int seed){${setup}${nary?`int result=${call};return result==${f.expected};`:`${type} result=${call};return result==${f.selected<0?'null':at(f.selected)}${f.selected<0?'':`&&result.val==${f.expected}`};`}}}`;
 }else if(language==='python'){
  if(!binary&&!/class\s+Node\s*[:(]/.test(source))prefix=nary?'class Node:\n    def __init__(self,val=0):\n        self.val=val\n        self.children=[]\n':'class Node:\n    def __init__(self,val=0):\n        self.val=val\n        self.left=self.right=self.parent=None\n';
  setup=`        nodes=[${type}(v) for v in ${JSON.stringify(f.values)}]\n`;
  if(nary)setup+=`        children=${JSON.stringify(f.children)}\n        for i,row in enumerate(children):\n            nodes[i].children=[nodes[j] for j in row]\n`;
  else setup+=`        left=${JSON.stringify(f.left)}\n        right=${JSON.stringify(f.right)}\n        for i in range(${n}):\n            nodes[i].left=nodes[left[i]] if left[i]>=0 else None\n            nodes[i].right=nodes[right[i]] if right[i]>=0 else None\n`+(parent?'            if nodes[i].left is not None: nodes[i].left.parent=nodes[i]\n            if nodes[i].right is not None: nodes[i].right.parent=nodes[i]\n':'');
  const at=id=>`nodes[${id}]`,collection='['+f.selectors.map(at).join(',')+']';call=`Solution().${f.rule.methodName}(${args(at,collection)})`;
  wrapper=`class NextNodeScalarCapture:\n    def captureNode(self,seed):\n${setup}        result=${call}\n        return ${nary?`type(result) is int and result==${f.expected}`:`result is ${f.selected<0?'None':at(f.selected)}${f.selected<0?'':` and result.val==${f.expected}`}`}\n`;
 }else if(language==='javascript'||ts){
  if(!binary&&!/class\s+_Node\s*\{/.test(source))prefix=nary?(ts?'class _Node{val:number;children:_Node[];constructor(val=0){this.val=val;this.children=[];}}':'class _Node{constructor(val=0){this.val=val;this.children=[];}}'):(ts?'class _Node{val:number;left:_Node|null=null;right:_Node|null=null;parent:_Node|null=null;constructor(val=0){this.val=val;}}':'class _Node{constructor(val=0){this.val=val;this.left=this.right=this.parent=null;}}');
  setup=`const nodes${ts?':'+type+'[]':''}=${JSON.stringify(f.values)}.map(v=>new ${type}(v));`;
  if(nary)setup+=`const children=${JSON.stringify(f.children)};for(let i=0;i<${n};i++)nodes[i].children=children[i].map(j=>nodes[j]);`;
  else setup+=`const left=${JSON.stringify(f.left)},right=${JSON.stringify(f.right)};for(let i=0;i<${n};i++){nodes[i].left=left[i]<0?null:nodes[left[i]];nodes[i].right=right[i]<0?null:nodes[right[i]];${parent?'if(nodes[i].left)nodes[i].left!.parent=nodes[i];if(nodes[i].right)nodes[i].right!.parent=nodes[i];':''}}`.replaceAll('!.',ts?'!.':'.');
  const at=id=>`nodes[${id}]`,collection='['+f.selectors.map(at).join(',')+']';call=(/class\s+Solution\b/.test(source)?'new Solution().':'')+f.rule.methodName+'('+args(at,collection)+')';
  wrapper=`function captureNode(seed${ts?':number':''}){${setup}const result=${call};return ${nary?`Number.isInteger(result)&&result===${f.expected}`:`result===${f.selected<0?'null':at(f.selected)}${f.selected<0?'':`&&result.val===${f.expected}`}`};}`;
 }else throw Error('Six-language selected-node adapter required.');
 const privateWrapper=wrapVerifiedNodeCapture(language,wrapper,'NextNodeScalarCapture',f.expected);
 let wrapped=privateWrapper;
 if(language==='c')wrapped=wrapped.replace('char* captureNode(int seed)','char* captureNode(int seed,struct TreeNode*unused)');
 if(cpp)wrapped=wrapped.replace('std::string captureNode(int seed)','std::string captureNode(int seed,TreeNode*unused)');
 if(language==='java')wrapped=wrapped.replace('public String captureNode(int seed)','public String captureNode(int seed,TreeNode unused)');
 if(language==='python')wrapped=wrapped.replace('def captureNode(self,seed):','def captureNode(self,seed,unused):');
 if(language==='javascript')wrapped=wrapped.replace('function captureNode(seed){','function captureNode(seed,unused){');
 if(ts)wrapped=wrapped.replace('function captureNode(seed:number){','function captureNode(seed:number,unused:any){');
 const joined=language==='java'?userCode+'\n'+prefix+'\n'+wrapped:prefix+'\n'+userCode+'\n'+wrapped;
 const contract={className:'NextNodeScalarCapture',methodName:'captureNode',parameters:[{name:'seed',type:'integer'},{name:'privateRoot',type:'tree-node'}],returnType:'string',outputMode:'return',runnerLanguage:language};
 const template=generateFunctionRunnerTemplate(language,contract,joined);if(!template)throw Error('Private selected-node runner generation failed.');return materializeFunctionInputPlaceholders(template,'seed=0,privateRoot=[]',contract).replace('{{USER_CODE}}',joined);
}
