import {validateRemainingProvidedNodeFixture,remainingProvidedNodeRule,circularInsertionWitness} from './remainingProvidedNodeFixtureService.js';
import {parseNodeResultEnvelope} from './customNodeResultEnvelopeService.js';
import {finishProvidedCapture,compactJavaInts,withoutDefinitionComments} from './remainingProvidedCaptureService.js';
const kinds=new Set(['dll-array-head','dll-array-selected','multilevel-flatten','bst-circular-dll','circular-insert']);
export function acceptsRemainingLinkedOutput(p,tc,raw){const rule=remainingProvidedNodeRule(p);if(!rule||!kinds.has(rule.kind))return undefined;try{const f=validateRemainingProvidedNodeFixture(p,tc.input),v=parseNodeResultEnvelope(raw);return !!v&&(rule.kind==='circular-insert'?circularInsertionWitness(f.values,f.insertVal,v.value):JSON.stringify(v.value)===JSON.stringify(f.expected));}catch{return false;}}
// Checks observe real student-returned pointers, including every original node
// and required next/prev/child relationships. Circular insertion's permitted
// equivalent positions are normalized only after this physical check succeeds.
export function prepareRemainingLinkedSource(language,p,userCode,input) {
 const f=validateRemainingProvidedNodeFixture(p,input),kind=f.rule.kind;if(!kinds.has(kind))throw Error('Not a linked provided-object API.');
 const n=f.values.length,dll=kind.startsWith('dll-array'),bst=kind==='bst-circular-dll',flat=kind==='multilevel-flatten',circle=kind==='circular-insert',ts=language==='typescript',cpp=language==='cpp';
 const T=ts||language==='javascript'?'_Node':'Node',fields=bst?['left','right']:flat?['prev','next','child']:circle?['next']:['prev','next'];
 const links={};for(const key of fields)links[key]=bst?f[key]:flat?f[key]:key==='next'?f.values.map((_,i)=>circle?(i+1)%n:i+1<n?i+1:-1):f.values.map((_,i)=>i-1);
 const arrays={vals:f.values,...links,order:f.order??f.values.map((_,i)=>i)},source=withoutDefinitionComments(userCode);let prefix='',body='',wrapper='';
 const inputId=dll?f.selected:bst?f.root:n?0:-1;
 if(language==='c'||cpp) {
  const ct=cpp?'Node*':'struct Node*',nil=cpp?'nullptr':'NULL';
  if(!new RegExp((cpp?'class':'struct')+'\\s+Node\\s*\\{').test(source))prefix=cpp?`class Node{public:int val;${fields.map(k=>'Node*'+k+';').join('')}Node(int v=0):val(v)${fields.map(k=>','+k+'(nullptr)').join('')} {}};`:`struct Node{int val;${fields.map(k=>'struct Node*'+k+';').join('')}};`;
  for(const[k,a]of Object.entries(arrays))prefix+=`static int _ppL_${k}[]={${a.length?a.join(','):'0'}};`;
  body=`${ct}nodes[${Math.max(n,1)}];for(int i=0;i<${n};i++){nodes[i]=${cpp?'new Node(_ppL_vals[i])':'calloc(1,sizeof(struct Node))'};nodes[i]->val=_ppL_vals[i];}for(int i=0;i<${n};i++){${fields.map(k=>`nodes[i]->${k}=_ppL_${k}[i]<0?${nil}:nodes[_ppL_${k}[i]];`).join('')}}`;
  const arg=inputId<0?nil:`nodes[${inputId}]`,call=(cpp?'Solution().':'')+f.rule.methodName+'('+arg+(circle?','+f.insertVal:'')+(dll&&!cpp?',&size':'')+')';
  if(dll){body+=(cpp?'auto result=':'int size=-1;int*result=')+call+';';body+=`if(${cpp?'(int)result.size()':'size'}!=${n}${cpp?'':n?'||!result':''})return false;for(int i=0;i<${n};i++)if(result[i]!=_ppL_vals[i])return false;return true;`;}
  else {
   body+=`${ct}result=${call};`;
   if(!n&&!circle)body+=`return result==${nil};`;
   else if(!circle){const order=f.order??[];body+=`if(result!=nodes[_ppL_order[0]])return false;for(int i=0;i<${n};i++){${ct}a=nodes[_ppL_order[i]];if(a->val!=_ppL_vals[_ppL_order[i]]||a->${bst?'left':'prev'}!=${bst?`nodes[_ppL_order[(i+${n}-1)%${n}]]`:`(i?nodes[_ppL_order[i-1]]:${nil})`}||a->${bst?'right':'next'}!=${bst?`nodes[_ppL_order[(i+1)%${n}]]`:`(i+1<${n}?nodes[_ppL_order[i+1]]:${nil})`}${flat?'||a->child':''})return false;}return true;`;
   }else if(!n)body+=`return result&&result->val==${f.insertVal}&&result->next==result;`;
   else body+=`if(result!=nodes[0])return false;for(int i=0;i<${n};i++)if(nodes[i]->val!=_ppL_vals[i])return false;int inserted=0,descents=0;${ct}cur=result;for(int i=0;i<${n};i++){if(cur!=nodes[i])return false;${ct}a=cur->next;${ct}expected=nodes[(i+1)%${n}];if(!a)return false;if(cur->val>a->val)descents++;if(a!=expected){if(inserted||a->val!=${f.insertVal}||a->next!=expected)return false;for(int j=0;j<${n};j++)if(a==nodes[j])return false;inserted=1;if(a->val>expected->val)descents++;a=a->next;}cur=a;}return inserted==1&&descents<=1&&cur==result;`;
  }
  wrapper=cpp?`class RemainingLinkedCapture{public:bool captureNode(int seed){${body}}};`:`bool captureNode(int seed){${body}}`;
 }else if(language==='java') {
  if(!/class\s+Node\s*\{/.test(source))prefix=`class Node{public int val;${fields.map(k=>'public Node '+k+';').join('')}public Node(int v){val=v;}}`;
  for(const[k,a]of Object.entries(arrays))body+=`int[]${k}=${compactJavaInts(a)};`;
  body+=`Node[]nodes=new Node[${n}];for(int i=0;i<${n};i++)nodes[i]=new Node(vals[i]);for(int i=0;i<${n};i++){${fields.map(k=>`nodes[i].${k}=${k}[i]<0?null:nodes[${k}[i]];`).join('')}}`;
  const call=`new Solution().${f.rule.methodName}(${inputId<0?'null':`nodes[${inputId}]`}${circle?','+f.insertVal:''})`;
  if(dll)body+=`int[]result=${call};if(result==null||result.length!=${n})return false;for(int i=0;i<${n};i++)if(result[i]!=vals[i])return false;return true;`;
  else{body+=`Node result=${call};`;
   if(!n&&!circle)body+='return result==null;';
   else if(!circle)body+=`if(result!=nodes[order[0]])return false;for(int i=0;i<${n};i++){Node a=nodes[order[i]];if(a.val!=vals[order[i]]||a.${bst?'left':'prev'}!=${bst?`nodes[order[(i+${n}-1)%${n}]]`:`(i>0?nodes[order[i-1]]:null)`}||a.${bst?'right':'next'}!=${bst?`nodes[order[(i+1)%${n}]]`:`(i+1<${n}?nodes[order[i+1]]:null)`}${flat?'||a.child!=null':''})return false;}return true;`;
   else if(!n)body+=`return result!=null&&result.val==${f.insertVal}&&result.next==result;`;
   else body+=`if(result!=nodes[0])return false;java.util.Set<Node>originals=java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<Node,Boolean>());java.util.Collections.addAll(originals,nodes);for(int i=0;i<${n};i++)if(nodes[i].val!=vals[i])return false;int inserted=0,descents=0;Node cur=result;for(int i=0;i<${n};i++){if(cur!=nodes[i])return false;Node a=cur.next,expected=nodes[(i+1)%${n}];if(a==null)return false;if(cur.val>a.val)descents++;if(a!=expected){if(inserted!=0||originals.contains(a)||a.val!=${f.insertVal}||a.next!=expected)return false;inserted++;if(a.val>expected.val)descents++;a=a.next;}cur=a;}return inserted==1&&descents<=1&&cur==result;`;
  }
  wrapper=`class RemainingLinkedCapture{public boolean captureNode(int seed){${body}}}`;
 }else if(language==='python') {
  if(!/class\s+Node\s*[:(]/.test(source))prefix=`class Node:\n    def __init__(self,val=0,prev=None,next=None,child=None):\n        self.val=val\n${fields.map(k=>'        self.'+k+'=None').join('\n')}\n`;
  const lines=[];for(const[k,a]of Object.entries(arrays))lines.push(`${k}=${JSON.stringify(a)}`);
  lines.push(`nodes=[Node(v${flat?',None,None,None':''}) for v in vals]`,'for i in range(len(nodes)):',...fields.map(k=>`    nodes[i].${k}=nodes[${k}[i]] if ${k}[i]>=0 else None`),`result=Solution().${f.rule.methodName}(${inputId<0?'None':`nodes[${inputId}]`}${circle?','+f.insertVal:''})`);
  if(dll)lines.push('return result==vals');
  else if(!n&&!circle)lines.push('return result is None');
  else if(!circle)lines.push('if result is not nodes[order[0]]: return False','for i,j in enumerate(order):','    a=nodes[j]',`    if a.val!=vals[j] or a.${bst?'left':'prev'} is not ${bst?'nodes[order[(i-1)%len(nodes)]]':'(nodes[order[i-1]] if i else None)'} or a.${bst?'right':'next'} is not ${bst?'nodes[order[(i+1)%len(nodes)]]':'(nodes[order[i+1]] if i+1<len(nodes) else None)'}${flat?' or a.child is not None':''}: return False`,'return True');
  else if(!n)lines.push(`return result is not None and result.val==${f.insertVal} and result.next is result`);
  else lines.push('if result is not nodes[0]: return False','originals={id(x) for x in nodes}','if any(a.val!=vals[i] for i,a in enumerate(nodes)): return False','inserted=descents=0','cur=result','for i,node in enumerate(nodes):','    if cur is not node: return False','    a=cur.next; expected=nodes[(i+1)%len(nodes)]','    if a is None: return False','    descents+=cur.val>a.val','    if a is not expected:',`        if inserted or id(a) in originals or a.val!=${f.insertVal} or a.next is not expected: return False`,'        inserted+=1; descents+=a.val>expected.val; a=a.next','    cur=a','return inserted==1 and descents<=1 and cur is result');
  wrapper='class RemainingLinkedCapture:\n    def captureNode(self,seed):\n'+lines.map(x=>'        '+x).join('\n')+'\n';
 }else if(language==='javascript'||ts) {
  if(!/class\s+_Node\s*\{/.test(source)&&!/function\s+_Node\s*\(/.test(source))prefix=ts?`class _Node{val:number;${fields.map(k=>k+':_Node|null=null;').join('')}constructor(v=0,prev:_Node|null=null,next:_Node|null=null,child:_Node|null=null){this.val=v;${fields.map(k=>`this.${k}=${['prev','next','child'].includes(k)?k:'null'};`).join('')}}}`:`class _Node{constructor(v=0,prev=null,next=null,child=null){this.val=v;${fields.map(k=>`this.${k}=${['prev','next','child'].includes(k)?k:'null'};`).join('')}}}`;
  for(const[k,a]of Object.entries(arrays))body+=`const ${k}=${JSON.stringify(a)};`;
  body+=`const nodes${ts?':_Node[]':''}=vals.map(v=>new _Node(v));for(let i=0;i<nodes.length;i++){${fields.map(k=>`nodes[i].${k}=${k}[i]<0?null:nodes[${k}[i]];`).join('')}}`;
  const call=(/class\s+Solution\b/.test(source)?'new Solution().':'')+f.rule.methodName+'('+(inputId<0?'null':`nodes[${inputId}]`)+(circle?','+f.insertVal:'')+')';
  body+=`const result=${call};`;
  if(dll)body+=`return Array.isArray(result)&&result.length===vals.length&&result.every((v${ts?':number':''},i${ts?':number':''})=>v===vals[i]);`;
  else if(!n&&!circle)body+='return result===null;';
  else if(!circle)body+=`if(result!==nodes[order[0]])return false;for(let i=0;i<nodes.length;i++){const a=nodes[order[i]];if(a.val!==vals[order[i]]||a.${bst?'left':'prev'}!==${bst?'nodes[order[(i+nodes.length-1)%nodes.length]]':'(i?nodes[order[i-1]]:null)'}||a.${bst?'right':'next'}!==${bst?'nodes[order[(i+1)%nodes.length]]':'(i+1<nodes.length?nodes[order[i+1]]:null)'}${flat?'||a.child!==null':''})return false;}return true;`;
  else if(!n)body+=`return !!result&&result.val===${f.insertVal}&&result.next===result;`;
  else body+=`if(result!==nodes[0])return false;const originals=new Set(nodes);for(let i=0;i<nodes.length;i++)if(nodes[i].val!==vals[i])return false;let inserted=0,descents=0,cur=result;for(let i=0;i<nodes.length;i++){if(cur!==nodes[i])return false;let a=cur.next;const expected=nodes[(i+1)%nodes.length];if(!a)return false;if(cur.val>a.val)descents++;if(a!==expected){if(inserted||originals.has(a)||a.val!==${f.insertVal}||a.next!==expected)return false;inserted++;if(a.val>expected.val)descents++;a=a.next;}cur=a;}return inserted===1&&descents<=1&&cur===result;`;
  wrapper=`function captureNode(seed${ts?':number':''}){${body}}`;
 }else throw Error('Six requested languages are required.');
 return finishProvidedCapture(language,userCode,prefix,wrapper,'RemainingLinkedCapture',f.expected);
}
