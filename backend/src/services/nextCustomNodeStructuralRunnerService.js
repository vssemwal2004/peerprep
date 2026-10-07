import {generateFunctionRunnerTemplate} from './functionRunnerTemplateService.js';
import {materializeFunctionInputPlaceholders} from './functionTestInputService.js';
import {validateNextCustomNodeFixture,nextCustomNodeRule} from './nextCustomNodeFixtureService.js';
import {parseNodeResultEnvelope,wrapVerifiedNodeCapture} from './customNodeResultEnvelopeService.js';

const kinds=new Set(['nary-clone','nary-root','nary-move','binary-correct','binary-random-clone']);
const lit=a=>a.length?a.join(','):'0';
const ja=a=>{if(!a.length)return'new int[0]';const csv=a.join(','),chunks=[];for(let i=0;i<csv.length;i+=16000)chunks.push(JSON.stringify(csv.slice(i,i+16000)));return`java.util.Arrays.stream(String.join("",new String[]{${chunks.join(',')}}).split(",")).mapToInt(Integer::parseInt).toArray()`;};
const flattened=rows=>{const starts=[0],edges=[];for(const row of rows){edges.push(...row);starts.push(edges.length);}return{starts,edges};};

export function acceptsNextNodeStructuralOutput(p,tc,raw){const rule=nextCustomNodeRule(p);if(!rule||!kinds.has(rule.kind))return undefined;try{const v=parseNodeResultEnvelope(raw);return !!v&&JSON.stringify(v.value)===JSON.stringify(validateNextCustomNodeFixture(p,tc.input).expected);}catch{return false;}}

// A private checker observes the actual provided objects and the returned graph.
// Students keep their original method signature; expected output is emitted only
// after its concrete structure and required identity/freshness checks succeed.
export function prepareNextNodeStructuralSource(language,p,userCode,input){
 const f=validateNextCustomNodeFixture(p,input),kind=f.rule.kind;if(!kinds.has(kind))throw Error('Unsupported structural provided-node contract.');
 const n=f.values.length,nary=kind.startsWith('nary'),clone=kind==='nary-clone'||kind==='binary-random-clone',random=kind==='binary-random-clone',correct=kind==='binary-correct',move=kind==='nary-move';
 const source=String(userCode).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\r\n]*/g,'').replace(/^\s*#[^\r\n]*/gm,'');
 const cpp=language==='cpp',ts=language==='typescript',T=correct?'TreeNode':language==='javascript'||ts?'_Node':'Node',R=random?(language==='javascript'||ts?'_NodeCopy':'NodeCopy'):T;
 const orig=flattened(f.children??[]),wanted=flattened(f.expectedChildren??f.children??[]),el=f.expectedLeft??f.left,er=f.expectedRight??f.right;
 const root=f.expectedRoot??f.root,reachable=[];
 if(!nary&&root>=0){reachable.push(root);for(let i=0;i<reachable.length;i++){const id=reachable[i];if(el[id]>=0)reachable.push(el[id]);if(er[id]>=0)reachable.push(er[id]);}}
 let prefix='',body='',wrapper='';
 const callFor=(at,list)=>{if(kind==='nary-root')return list;if(move)return at(0)+','+f.selectors.map(at).join(',');return n?at(0):'NULL';};
 if(language==='c'||cpp){
  const ct=cpp?T+'*':'struct '+T+'*',rt=cpp?R+'*':'struct '+R+'*',nil=cpp?'nullptr':'NULL';
  if(!correct&&!new RegExp((cpp?'class':'struct')+'\\s+Node\\s*\\{').test(source))prefix=nary?(cpp?'class Node{public:int val;std::vector<Node*>children;Node(int v=0):val(v){}};':'struct Node{int val;int numChildren;struct Node**children;};'):(cpp?'class Node{public:int val;Node*left,*right,*random;Node(int v=0):val(v),left(nullptr),right(nullptr),random(nullptr){}};':'struct Node{int val;struct Node*left,*right,*random;};');
  if(random&&!new RegExp((cpp?'class':'struct')+'\\s+NodeCopy\\s*\\{').test(source))prefix+=cpp?'class NodeCopy{public:int val;NodeCopy*left,*right,*random;NodeCopy(int v=0):val(v),left(nullptr),right(nullptr),random(nullptr){}};':'struct NodeCopy{int val;struct NodeCopy*left,*right,*random;};';
  prefix+='\n#include <stdint.h>\nstatic int _ppPtrCompare(const void*a,const void*b){uintptr_t x=*(const uintptr_t*)a,y=*(const uintptr_t*)b;return (x>y)-(x<y);}\n';
  const arrays={vals:f.values,...(nary?{starts:orig.starts,edges:orig.edges,ws:wanted.starts,we:wanted.edges,order:f.order??[]}:{left:f.left,right:f.right,el,er,rand:f.random??[],reach:reachable})};
  for(const [key,value] of Object.entries(arrays))prefix+=`static int _ppS_${key}[]={${lit(value)}};`;
  body=`${ct}nodes[${Math.max(n,1)}];for(int i=0;i<${n};i++){nodes[i]=${cpp?'new '+T+'(_ppS_vals[i])':'calloc(1,sizeof(struct '+T+'))'};nodes[i]->val=_ppS_vals[i];}`;
  if(nary)body+=`for(int i=0;i<${n};i++){${cpp?'':`nodes[i]->numChildren=_ppS_starts[i+1]-_ppS_starts[i];nodes[i]->children=calloc(nodes[i]->numChildren?nodes[i]->numChildren:1,sizeof(${ct}));`}for(int j=_ppS_starts[i];j<_ppS_starts[i+1];j++)${cpp?'nodes[i]->children.push_back(nodes[_ppS_edges[j]])':'nodes[i]->children[j-_ppS_starts[i]]=nodes[_ppS_edges[j]]'};}`;
  else body+=`for(int i=0;i<${n};i++){nodes[i]->left=_ppS_left[i]<0?${nil}:nodes[_ppS_left[i]];nodes[i]->right=_ppS_right[i]<0?${nil}:nodes[_ppS_right[i]];${random?`nodes[i]->random=_ppS_rand[i]<0?${nil}:nodes[_ppS_rand[i]];`:''}}`;
  if(correct)body+=`nodes[${f.selectors[0]}]->right=nodes[${f.selectors[1]}];`;
  if(kind==='nary-root')body+=cpp?`std::vector<Node*>collection;collection.reserve(${n});for(int i=0;i<${n};i++)collection.push_back(nodes[_ppS_order[i]]);`:`struct Node*collection[${n}];for(int i=0;i<${n};i++)collection[i]=nodes[_ppS_order[i]];`;
  const call=(cpp?'Solution().':'')+f.rule.methodName+'('+callFor(id=>`nodes[${id}]`,'collection').replaceAll('NULL',nil)+(kind==='nary-root'&&!cpp?','+n:'')+')';
  body+=`${rt}result=${call};`;
  if(kind==='nary-root'||move){body+=`if(result!=nodes[${root}])return false;for(int i=0;i<${n};i++){if(nodes[i]->val!=_ppS_vals[i]||${cpp?'(int)nodes[i]->children.size()':'nodes[i]->numChildren'}!=_ppS_ws[i+1]-_ppS_ws[i])return false;for(int j=_ppS_ws[i];j<_ppS_ws[i+1];j++)if(nodes[i]->children[j-_ppS_ws[i]]!=nodes[_ppS_we[j]])return false;}return true;`;}
  else if(!n){body+=`return result==${nil};`;}
  else{
   body+=`if(!result)return false;${rt}copies[${n}];for(int i=0;i<${n};i++)copies[i]=${nil};copies[0]=result;`;
   const traversal=nary?`for(int i=0;i<${n};i++){if(!copies[i]||copies[i]->val!=_ppS_vals[i]||${cpp?'(int)copies[i]->children.size()':'copies[i]->numChildren'}!=_ppS_starts[i+1]-_ppS_starts[i])return false;for(int j=_ppS_starts[i];j<_ppS_starts[i+1];j++)copies[_ppS_edges[j]]=copies[i]->children[j-_ppS_starts[i]];}`:`for(int q=0;q<${reachable.length};q++){int i=_ppS_reach[q];if(!copies[i]||copies[i]->val!=_ppS_vals[i])return false;if(_ppS_el[i]<0){if(copies[i]->left)return false;}else copies[_ppS_el[i]]=copies[i]->left;if(_ppS_er[i]<0){if(copies[i]->right)return false;}else copies[_ppS_er[i]]=copies[i]->right;}`;
   body+=traversal;
   const count=nary?n:reachable.length,at=nary?'q':'_ppS_reach[q]';
   body+=`uintptr_t seen[${Math.max(count,1)}];for(int q=0;q<${count};q++)seen[q]=(uintptr_t)copies[${at}];qsort(seen,${count},sizeof(uintptr_t),_ppPtrCompare);for(int i=1;i<${count};i++)if(seen[i]==seen[i-1])return false;`;
   if(clone){body+=`uintptr_t originals[${n}];for(int i=0;i<${n};i++)originals[i]=(uintptr_t)nodes[i];qsort(originals,${n},sizeof(uintptr_t),_ppPtrCompare);for(int i=0;i<${n};i++)if(bsearch(&seen[i],originals,${n},sizeof(uintptr_t),_ppPtrCompare))return false;`;
    if(nary)body+=`for(int i=0;i<${n};i++){if(nodes[i]->val!=_ppS_vals[i]||${cpp?'(int)nodes[i]->children.size()':'nodes[i]->numChildren'}!=_ppS_starts[i+1]-_ppS_starts[i])return false;for(int j=_ppS_starts[i];j<_ppS_starts[i+1];j++)if(nodes[i]->children[j-_ppS_starts[i]]!=nodes[_ppS_edges[j]])return false;}`;
    else body+=`for(int i=0;i<${n};i++){if(copies[i]->random!=(_ppS_rand[i]<0?${nil}:copies[_ppS_rand[i]]))return false;if(nodes[i]->val!=_ppS_vals[i]||nodes[i]->left!=(_ppS_left[i]<0?${nil}:nodes[_ppS_left[i]])||nodes[i]->right!=(_ppS_right[i]<0?${nil}:nodes[_ppS_right[i]])||nodes[i]->random!=(_ppS_rand[i]<0?${nil}:nodes[_ppS_rand[i]]))return false;}`;
   }body+='return true;';
  }
  wrapper=cpp?`class NextNodeStructuralCapture{public:bool captureNode(int seed){${body}}};`:`bool captureNode(int seed){${body}}`;
 }else if(language==='java'){
  if(!correct&&!/class\s+Node\s*\{/.test(source))prefix=nary?'class Node{public int val;public java.util.List<Node>children=new java.util.ArrayList<>();public Node(int v){val=v;}}':'class Node{public int val;public Node left,right,random;public Node(int v){val=v;}}';
  if(random&&!/class\s+NodeCopy\s*\{/.test(source))prefix+='class NodeCopy{public int val;public NodeCopy left,right,random;public NodeCopy(int v){val=v;}}';
  body=`int[]vals=${ja(f.values)};${T}[]nodes=new ${T}[${n}];for(int i=0;i<${n};i++)nodes[i]=new ${T}(vals[i]);`;
  if(nary)body+=`int[]starts=${ja(orig.starts)},edges=${ja(orig.edges)},ws=${ja(wanted.starts)},we=${ja(wanted.edges)};for(int i=0;i<${n};i++)for(int j=starts[i];j<starts[i+1];j++)nodes[i].children.add(nodes[edges[j]]);`;
  else body+=`int[]left=${ja(f.left)},right=${ja(f.right)},el=${ja(el)},er=${ja(er)},rand=${ja(f.random??[])};for(int i=0;i<${n};i++){nodes[i].left=left[i]<0?null:nodes[left[i]];nodes[i].right=right[i]<0?null:nodes[right[i]];${random?'nodes[i].random=rand[i]<0?null:nodes[rand[i]];':''}}`;
  if(correct)body+=`nodes[${f.selectors[0]}].right=nodes[${f.selectors[1]}];`;
  if(kind==='nary-root')body+=`int[]order=${ja(f.order)};java.util.List<Node>collection=new java.util.ArrayList<>();for(int i:order)collection.add(nodes[i]);`;
  body+=`${R} result=new Solution().${f.rule.methodName}(${callFor(id=>`nodes[${id}]`,'collection').replaceAll('NULL','null')});`;
  if(kind==='nary-root'||move)body+=`if(result!=nodes[${root}])return false;for(int i=0;i<${n};i++){if(nodes[i].val!=vals[i]||nodes[i].children.size()!=ws[i+1]-ws[i])return false;for(int j=ws[i];j<ws[i+1];j++)if(nodes[i].children.get(j-ws[i])!=nodes[we[j]])return false;}return true;`;
  else if(!n)body+='return result==null;';
  else{body+=`if(result==null)return false;${R}[]copies=new ${R}[${n}];copies[0]=result;java.util.Set<${R}>seen=java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<${R},Boolean>());`;
   if(nary)body+=`for(int i=0;i<${n};i++){${R} c=copies[i];if(c==null||!seen.add(c)||c.val!=vals[i]||c.children.size()!=starts[i+1]-starts[i])return false;for(int j=starts[i];j<starts[i+1];j++)copies[edges[j]]=c.children.get(j-starts[i]);}`;
   else body+=`int[]reach=${ja(reachable)};for(int i:reach){${R} c=copies[i];if(c==null||!seen.add(c)||c.val!=vals[i])return false;if(el[i]<0){if(c.left!=null)return false;}else copies[el[i]]=c.left;if(er[i]<0){if(c.right!=null)return false;}else copies[er[i]]=c.right;}`;
   if(clone){body+='java.util.Set<Object>originals=java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<Object,Boolean>());java.util.Collections.addAll(originals,nodes);for(Object c:seen)if(originals.contains(c))return false;';
    if(nary)body+=`for(int i=0;i<${n};i++){if(nodes[i].val!=vals[i]||nodes[i].children.size()!=starts[i+1]-starts[i])return false;for(int j=starts[i];j<starts[i+1];j++)if(nodes[i].children.get(j-starts[i])!=nodes[edges[j]])return false;}`;
    else body+=`for(int i=0;i<${n};i++)if(copies[i].random!=(rand[i]<0?null:copies[rand[i]])||nodes[i].val!=vals[i]||nodes[i].left!=(left[i]<0?null:nodes[left[i]])||nodes[i].right!=(right[i]<0?null:nodes[right[i]])||nodes[i].random!=(rand[i]<0?null:nodes[rand[i]]))return false;`;
   }body+='return true;';
  }
  wrapper=`class NextNodeStructuralCapture{public boolean captureNode(int seed){${body}}}`;
 }else if(language==='python'){
  if(!correct&&!/class\s+Node\s*[:(]/.test(source))prefix=nary?'class Node:\n    def __init__(self,val=0):\n        self.val=val\n        self.children=[]\n':'class Node:\n    def __init__(self,val=0):\n        self.val=val\n        self.left=self.right=self.random=None\n';
  if(random&&!/class\s+NodeCopy\s*[:(]/.test(source))prefix+='class NodeCopy:\n    def __init__(self,val=0):\n        self.val=val\n        self.left=self.right=self.random=None\n';
  const lines=[`vals=${JSON.stringify(f.values)}`,`nodes=[${T}(v) for v in vals]`];
  if(nary)lines.push(`children=${JSON.stringify(f.children)}`,`wanted=${JSON.stringify(f.expectedChildren??f.children)}`,'for i,row in enumerate(children):','    nodes[i].children=[nodes[j] for j in row]');
  else lines.push(`left=${JSON.stringify(f.left)}`,`right=${JSON.stringify(f.right)}`,`el=${JSON.stringify(el)}`,`er=${JSON.stringify(er)}`,`rand=${JSON.stringify(f.random??[])}`,'for i in range(len(nodes)):','    nodes[i].left=nodes[left[i]] if left[i]>=0 else None','    nodes[i].right=nodes[right[i]] if right[i]>=0 else None',...(random?['    nodes[i].random=nodes[rand[i]] if rand[i]>=0 else None']:[]));
  if(correct)lines.push(`nodes[${f.selectors[0]}].right=nodes[${f.selectors[1]}]`);
  if(kind==='nary-root')lines.push(`collection=[nodes[i] for i in ${JSON.stringify(f.order)}]`);
  lines.push(`result=Solution().${f.rule.methodName}(${callFor(id=>`nodes[${id}]`,'collection').replaceAll('NULL','None')})`);
  if(kind==='nary-root'||move)lines.push(`if result is not nodes[${root}]: return False`,'for i,row in enumerate(wanted):','    if nodes[i].val!=vals[i] or len(nodes[i].children)!=len(row): return False','    if any(nodes[i].children[j] is not nodes[k] for j,k in enumerate(row)): return False','return True');
  else if(!n)lines.push('return result is None');
  else{lines.push('if result is None: return False',`copies=[None]*${n}`,'copies[0]=result','seen=set()');
   if(nary)lines.push('for i,row in enumerate(children):','    c=copies[i]','    if c is None or id(c) in seen or c.val!=vals[i] or len(c.children)!=len(row): return False','    seen.add(id(c))','    for j,k in enumerate(row): copies[k]=c.children[j]');
   else lines.push(`for i in ${JSON.stringify(reachable)}:`,'    c=copies[i]','    if c is None or id(c) in seen or c.val!=vals[i]: return False','    seen.add(id(c))','    if el[i]<0:','        if c.left is not None: return False','    else: copies[el[i]]=c.left','    if er[i]<0:','        if c.right is not None: return False','    else: copies[er[i]]=c.right');
   if(clone){lines.push('if seen.intersection(id(x) for x in nodes): return False');
    if(nary)lines.push('for i,row in enumerate(children):','    if nodes[i].val!=vals[i] or len(nodes[i].children)!=len(row): return False','    if any(nodes[i].children[j] is not nodes[k] for j,k in enumerate(row)): return False');
    else lines.push('for i in range(len(nodes)):','    if copies[i].random is not (copies[rand[i]] if rand[i]>=0 else None): return False','    if nodes[i].val!=vals[i] or nodes[i].left is not (nodes[left[i]] if left[i]>=0 else None) or nodes[i].right is not (nodes[right[i]] if right[i]>=0 else None) or nodes[i].random is not (nodes[rand[i]] if rand[i]>=0 else None): return False');
   }lines.push('return True');
  }
  wrapper='class NextNodeStructuralCapture:\n    def captureNode(self,seed):\n'+lines.map(line=>'        '+line).join('\n')+'\n';
 }else if(language==='javascript'||ts){
  if(!correct&&!/class\s+_Node\s*\{/.test(source))prefix=nary?(ts?'class _Node{val:number;children:_Node[]=[];constructor(v=0){this.val=v;}}':'class _Node{constructor(v=0){this.val=v;this.children=[];}}'):(ts?'class _Node{val:number;left:_Node|null=null;right:_Node|null=null;random:_Node|null=null;constructor(v=0){this.val=v;}}':'class _Node{constructor(v=0){this.val=v;this.left=this.right=this.random=null;}}');
  if(random&&!/class\s+_NodeCopy\s*\{/.test(source))prefix+=ts?'class _NodeCopy{val:number;left:_NodeCopy|null=null;right:_NodeCopy|null=null;random:_NodeCopy|null=null;constructor(v=0){this.val=v;}}':'class _NodeCopy{constructor(v=0){this.val=v;this.left=this.right=this.random=null;}}';
  body=`const vals=${JSON.stringify(f.values)},nodes${ts?':'+T+'[]':''}=vals.map(v=>new ${T}(v));`;
  if(nary)body+=`const children=${JSON.stringify(f.children)},wanted=${JSON.stringify(f.expectedChildren??f.children)};for(let i=0;i<nodes.length;i++)nodes[i].children=children[i].map(j=>nodes[j]);`;
  else body+=`const left=${JSON.stringify(f.left)},right=${JSON.stringify(f.right)},el=${JSON.stringify(el)},er=${JSON.stringify(er)},rand=${JSON.stringify(f.random??[])};for(let i=0;i<nodes.length;i++){nodes[i].left=left[i]<0?null:nodes[left[i]];nodes[i].right=right[i]<0?null:nodes[right[i]];${random?'nodes[i].random=rand[i]<0?null:nodes[rand[i]];':''}}`;
  if(correct)body+=`nodes[${f.selectors[0]}].right=nodes[${f.selectors[1]}];`;
  if(kind==='nary-root')body+=`const collection=${JSON.stringify(f.order)}.map(i=>nodes[i]);`;
  const call=(/class\s+Solution\b/.test(source)?'new Solution().':'')+f.rule.methodName+'('+callFor(id=>`nodes[${id}]`,'collection').replaceAll('NULL','null')+')';
  body+=`const result=${call};`;
  if(kind==='nary-root'||move)body+=`if(result!==nodes[${root}])return false;for(let i=0;i<nodes.length;i++){if(nodes[i].val!==vals[i]||nodes[i].children.length!==wanted[i].length)return false;for(let j=0;j<wanted[i].length;j++)if(nodes[i].children[j]!==nodes[wanted[i][j]])return false;}return true;`;
  else if(!n)body+='return result===null;';
  else{body+=`if(result===null||result===undefined)return false;const copies${ts?':any[]':''}=Array(${n}).fill(null),seen=new Set${ts?'<any>':''}();copies[0]=result;`;
   if(nary)body+=`for(let i=0;i<nodes.length;i++){const c=copies[i];if(!c||seen.has(c)||c.val!==vals[i]||!Array.isArray(c.children)||c.children.length!==children[i].length)return false;seen.add(c);for(let j=0;j<children[i].length;j++)copies[children[i][j]]=c.children[j];}`;
   else body+=`for(const i of ${JSON.stringify(reachable)}){const c=copies[i];if(!c||seen.has(c)||c.val!==vals[i])return false;seen.add(c);if(el[i]<0){if(c.left!==null)return false;}else copies[el[i]]=c.left;if(er[i]<0){if(c.right!==null)return false;}else copies[er[i]]=c.right;}`;
   if(clone){body+='const originals=new Set(nodes);for(const c of seen)if(originals.has(c))return false;';
    if(nary)body+=`for(let i=0;i<nodes.length;i++){if(nodes[i].val!==vals[i]||nodes[i].children.length!==children[i].length)return false;for(let j=0;j<children[i].length;j++)if(nodes[i].children[j]!==nodes[children[i][j]])return false;}`;
    else body+=`for(let i=0;i<nodes.length;i++)if(copies[i].random!==(rand[i]<0?null:copies[rand[i]])||nodes[i].val!==vals[i]||nodes[i].left!==(left[i]<0?null:nodes[left[i]])||nodes[i].right!==(right[i]<0?null:nodes[right[i]])||nodes[i].random!==(rand[i]<0?null:nodes[rand[i]]))return false;`;
   }body+='return true;';
  }
  wrapper=`function captureNode(seed${ts?':number':''}){${body}}`;
 }else throw Error('Six-language structural provided-node adapter required.');
 let wrapped=wrapVerifiedNodeCapture(language,wrapper,'NextNodeStructuralCapture',f.expected);
 if(language==='c')wrapped=wrapped.replace('char* captureNode(int seed)','char* captureNode(int seed,struct TreeNode*unused)');
 if(cpp)wrapped=wrapped.replace('std::string captureNode(int seed)','std::string captureNode(int seed,TreeNode*unused)');
 if(language==='java')wrapped=wrapped.replace('public String captureNode(int seed)','public String captureNode(int seed,TreeNode unused)');
 if(language==='python')wrapped=wrapped.replace('def captureNode(self,seed):','def captureNode(self,seed,unused):');
 if(language==='javascript')wrapped=wrapped.replace('function captureNode(seed){','function captureNode(seed,unused){');
 if(ts)wrapped=wrapped.replace('function captureNode(seed:number){','function captureNode(seed:number,unused:any){');
 const joined=language==='java'?userCode+'\n'+prefix+'\n'+wrapped:prefix+'\n'+userCode+'\n'+wrapped;
 const contract={className:'NextNodeStructuralCapture',methodName:'captureNode',parameters:[{name:'seed',type:'integer'},{name:'privateRoot',type:'tree-node'}],returnType:'string',outputMode:'return',runnerLanguage:language};
 const template=generateFunctionRunnerTemplate(language,contract,joined);if(!template)throw Error('Structural provided-node runner generation failed.');return materializeFunctionInputPlaceholders(template,'seed=0,privateRoot=[]',contract).replace('{{USER_CODE}}',joined);
}
