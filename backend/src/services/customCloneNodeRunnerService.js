import{parseFunctionTestInput,materializeFunctionInputPlaceholders}from'./functionTestInputService.js';
import{generateFunctionRunnerTemplate}from'./functionRunnerTemplateService.js';
import{parseNodeResultEnvelope,wrapVerifiedNodeCapture}from'./customNodeResultEnvelopeService.js';
export const CLONE_NODE_APIS=[
 {id:'6ac280359b62de7b23709593',sourceId:133,title:'Clone Graph',kind:'graph',methodName:'cloneGraph',parameter:'node',type:'graph-node'},
 {id:'6ac280359b62de7b237095a5',sourceId:138,title:'Copy List with Random Pointer',kind:'random',methodName:'copyRandomList',parameter:'head',type:'random-list-node'},
];
export const cloneNodeContract=r=>({className:'Solution',methodName:r.methodName,parameters:[{name:r.parameter,type:r.type}],returnType:r.type,outputMode:'return'});
export function cloneNodeRule(p){const c=p?.functionContract;return CLONE_NODE_APIS.find(r=>p.executionMode==='function'&&p.title===r.title&&c?.className==='Solution'&&c.kind!=='stateful'&&c.methodName===r.methodName&&c.returnType===r.type&&c.outputMode!=='parameter'&&c.parameters?.length===1&&c.parameters[0].name===r.parameter&&c.parameters[0].type===r.type)||null;}
export function validateCloneNodeFixture(p,input){
 const rule=cloneNodeRule(p);if(!rule)throw Error('Unsupported exact clone public contract.');const parsed=parseFunctionTestInput(input),key=rule.kind==='graph'?'adjList':'head';
 if(parsed.positional.length||Object.keys(parsed.named).length!==1||!Object.hasOwn(parsed.named,key)||!Array.isArray(parsed.named[key]))throw Error('Clone fixture requires exactly '+key+'.');
 const data=parsed.named[key],n=data.length;if(n>(rule.kind==='graph'?100:1000))throw Error('Clone input exceeds source node limit.');
 if(rule.kind==='graph'){
  for(let i=0;i<n;i++)if(!Array.isArray(data[i])||data[i].some(v=>!Number.isInteger(v)||v<1||v>n||v===i+1)||new Set(data[i]).size!==data[i].length)throw Error('Graph requires distinct in-bounds non-self edges.');
  for(let i=0;i<n;i++)for(const j of data[i])if(!data[j-1].includes(i+1))throw Error('Graph must be undirected.');
  const visited=new Set(n?[0]:[]),queue=n?[0]:[];for(let i=0;i<queue.length;i++)for(const j of data[queue[i]])if(!visited.has(j-1)){visited.add(j-1);queue.push(j-1);}if(visited.size!==n)throw Error('Graph must be connected.');
 }else for(const row of data)if(!Array.isArray(row)||row.length!==2||!Number.isInteger(row[0])||row[0]<-10000||row[0]>10000||(row[1]!==null&&(!Number.isInteger(row[1])||row[1]<0||row[1]>=n)))throw Error('Random list requires value/random-index pairs.');
 return{rule,data,n};
}
export function validateCloneNodeOracle(p,tc){try{const f=validateCloneNodeFixture(p,tc.input),out=JSON.parse(tc.output);if(f.rule.kind==='random')return JSON.stringify(out)===JSON.stringify(f.data);return Array.isArray(out)&&out.length===f.n&&out.every((row,i)=>Array.isArray(row)&&JSON.stringify([...row].sort((a,b)=>a-b))===JSON.stringify([...f.data[i]].sort((a,b)=>a-b)));}catch{return false;}}
export function acceptsCloneNodeOutput(p,tc,raw){if(!cloneNodeRule(p))return undefined;const result=parseNodeResultEnvelope(raw);return !!result&&validateCloneNodeOracle(p,tc)&&validateCloneNodeOracle(p,{...tc,output:JSON.stringify(result.value)});}
const uncom=v=>String(v).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\r\n]*/g,'');
const ar=a=>a.length?a.join(','):'0',ja=a=>a.length?`java.util.Arrays.stream(${JSON.stringify(a.join(','))}.split(",")).mapToInt(Integer::parseInt).toArray()`:'new int[0]';
function nativeBody(f,cpp){
 const{n,rule}=f,g=rule.kind==='graph',P=cpp?'Node*':'struct Node*',nil=cpp?'nullptr':'NULL',alloc=cpp?'new Node('+(g?'i+1':'_ppCloneVals[i]')+')':'calloc(1,sizeof(struct Node))',member=cpp?'neighbors.size()':'numNeighbors';
 let s=`${P}orig[${n||1}];${P}copies[${n||1}];for(int i=0;i<${n};i++){orig[i]=${alloc};orig[i]->val=${g?'i+1':'_ppCloneVals[i]'};copies[i]=${nil};}`;
 if(g)s+=`for(int i=0;i<${n};i++){${cpp?'':`orig[i]->numNeighbors=_ppCloneStarts[i+1]-_ppCloneStarts[i];orig[i]->neighbors=calloc(orig[i]->numNeighbors?orig[i]->numNeighbors:1,sizeof(${P}));`}for(int j=_ppCloneStarts[i];j<_ppCloneStarts[i+1];j++)${cpp?'orig[i]->neighbors.push_back(orig[_ppCloneEdges[j]])':'orig[i]->neighbors[j-_ppCloneStarts[i]]=orig[_ppCloneEdges[j]]'};}`;
 else s+=`for(int i=0;i<${n};i++){orig[i]->next=i+1<${n}?orig[i+1]:${nil};orig[i]->random=_ppCloneRandom[i]<0?${nil}:orig[_ppCloneRandom[i]];}`;
 s+=`${P}root=${n?'orig[0]':nil};${P}result=${cpp?'Solution().':''}${rule.methodName}(root);`;
 if(!n)return s+`return result==${nil};`;
 if(g){
  s+=`if(!result||result->val!=1)return false;${P}queue[${n}];int head=0,tail=1;queue[0]=result;copies[0]=result;while(head<tail){${P}cur=queue[head++];int id=cur->val-1;if(id<0||id>=${n}||copies[id]!=cur||(int)cur->${member}!=_ppCloneStarts[id+1]-_ppCloneStarts[id])return false;for(int j=0;j<${n};j++)if(cur==orig[j])return false;bool seen[${n}]={false};for(int j=0;j<(int)cur->${member};j++){${P}q=cur->neighbors[j];if(!q||q->val<1||q->val>${n})return false;int k=q->val-1;if(seen[k]||!_ppCloneExpected[id*${n}+k])return false;seen[k]=true;if(copies[k]&&copies[k]!=q)return false;if(!copies[k]){if(tail>=${n})return false;copies[k]=q;queue[tail++]=q;}}}if(tail!=${n})return false;`;
  s+=`for(int i=0;i<${n};i++){if(orig[i]->val!=i+1||(int)orig[i]->${member}!=_ppCloneStarts[i+1]-_ppCloneStarts[i])return false;bool seen[${n}]={false};for(int j=0;j<(int)orig[i]->${member};j++){${P}q=orig[i]->neighbors[j];int k=-1;for(int t=0;t<${n};t++)if(q==orig[t])k=t;if(k<0||seen[k]||!_ppCloneExpected[i*${n}+k])return false;seen[k]=true;}}`;
 }else{
  s+=`${P}cur=result;for(int i=0;i<${n};i++){if(!cur||cur->val!=_ppCloneVals[i])return false;for(int j=0;j<${n};j++)if(cur==orig[j])return false;for(int j=0;j<i;j++)if(cur==copies[j])return false;copies[i]=cur;cur=cur->next;}if(cur)return false;for(int i=0;i<${n};i++)if(copies[i]->random!=(_ppCloneRandom[i]<0?${nil}:copies[_ppCloneRandom[i]])||orig[i]->val!=_ppCloneVals[i]||orig[i]->next!=(i+1<${n}?orig[i+1]:${nil})||orig[i]->random!=(_ppCloneRandom[i]<0?${nil}:orig[_ppCloneRandom[i]]))return false;`;
 }
 return s+'return true;';
}
function javaBody(f){
 const{n,rule,data}=f,g=rule.kind==='graph';let s=g?`int[]starts=${ja(f.starts)},edges=${ja(f.edges)},expected=${ja(f.expected)};`:`int[]values=${ja(data.map(v=>v[0]))},random=${ja(data.map(v=>v[1]??-1))};`;
 s+=`Node[]orig=new Node[${n}],copies=new Node[${n}];for(int i=0;i<${n};i++)orig[i]=new Node(${g?'i+1':'values[i]'});`;
 s+=g?`for(int i=0;i<${n};i++)for(int j=starts[i];j<starts[i+1];j++)orig[i].neighbors.add(orig[edges[j]]);`:`for(int i=0;i<${n};i++){orig[i].next=i+1<${n}?orig[i+1]:null;orig[i].random=random[i]<0?null:orig[random[i]];}`;
 s+=`Node root=${n?'orig[0]':'null'},result=new Solution().${rule.methodName}(root);`;if(!n)return s+'return result==null;';
 if(g){s+=`if(result==null||result.val!=1)return false;java.util.ArrayList<Node>queue=new java.util.ArrayList<>();queue.add(result);copies[0]=result;for(int h=0;h<queue.size();h++){Node cur=queue.get(h);int id=cur.val-1;if(id<0||id>=${n}||copies[id]!=cur||cur.neighbors==null||cur.neighbors.size()!=starts[id+1]-starts[id])return false;for(Node old:orig)if(cur==old)return false;boolean[]seen=new boolean[${n}];for(Node q:cur.neighbors){if(q==null||q.val<1||q.val>${n})return false;int k=q.val-1;if(seen[k]||expected[id*${n}+k]==0)return false;seen[k]=true;if(copies[k]!=null&&copies[k]!=q)return false;if(copies[k]==null){if(queue.size()>=${n})return false;copies[k]=q;queue.add(q);}}}if(queue.size()!=${n})return false;for(int i=0;i<${n};i++){if(orig[i].val!=i+1||orig[i].neighbors==null||orig[i].neighbors.size()!=starts[i+1]-starts[i])return false;boolean[]seen=new boolean[${n}];for(Node q:orig[i].neighbors){int k=-1;for(int t=0;t<${n};t++)if(q==orig[t])k=t;if(k<0||seen[k]||expected[i*${n}+k]==0)return false;seen[k]=true;}}`;
 }else s+=`Node cur=result;for(int i=0;i<${n};i++){if(cur==null||cur.val!=values[i])return false;for(Node old:orig)if(cur==old)return false;for(int j=0;j<i;j++)if(copies[j]==cur)return false;copies[i]=cur;cur=cur.next;}if(cur!=null)return false;for(int i=0;i<${n};i++)if(copies[i].random!=(random[i]<0?null:copies[random[i]])||orig[i].val!=values[i]||orig[i].next!=(i+1<${n}?orig[i+1]:null)||orig[i].random!=(random[i]<0?null:orig[random[i]]))return false;`;
 return s+'return true;';
}
function pythonBody(f){
 const{n,rule,data}=f,g=rule.kind==='graph';let s=`        data=${JSON.stringify(data).replace(/\bnull\b/g,'None')}\n        orig=[Node(i+1) for i in range(${n})]\n`;
 if(!g)s=`        data=${JSON.stringify(data).replace(/\bnull\b/g,'None')}\n        orig=[Node(v[0]) for v in data]\n`;
 s+=g?'        for i,row in enumerate(data): orig[i].neighbors=[orig[j-1] for j in row]\n':`        for i,old in enumerate(orig):\n            old.next=orig[i+1] if i+1<${n} else None\n            old.random=orig[data[i][1]] if data[i][1] is not None else None\n`;
 s+=`        result=Solution().${rule.methodName}(orig[0] if orig else None)\n`;if(!n)return s+'        return result is None\n';
 if(g)s+=`        if result is None or result.val!=1: return False\n        copies={1:result}; queue=[result]; originals={id(v) for v in orig}\n        for cur in queue:\n            value=cur.val\n            if type(value) is not int or not 1<=value<=${n} or copies.get(value) is not cur or id(cur) in originals or len(cur.neighbors)!=len(data[value-1]): return False\n            seen=set()\n            for q in cur.neighbors:\n                if q is None or type(q.val) is not int or q.val not in data[value-1] or q.val in seen: return False\n                seen.add(q.val)\n                if q.val in copies and copies[q.val] is not q: return False\n                if q.val not in copies:\n                    if len(queue)>=${n}: return False\n                    copies[q.val]=q; queue.append(q)\n        if len(queue)!=${n}: return False\n        for i,old in enumerate(orig):\n            if old.val!=i+1 or len(old.neighbors)!=len(data[i]) or sorted(id(v) for v in old.neighbors)!=sorted(id(orig[j-1]) for j in data[i]): return False\n`;
 else s+=`        copies=[]; cur=result; originals={id(v) for v in orig}; seen=set()\n        for i in range(${n}):\n            if cur is None or cur.val!=data[i][0] or id(cur) in originals or id(cur) in seen: return False\n            seen.add(id(cur)); copies.append(cur); cur=cur.next\n        if cur is not None: return False\n        for i,old in enumerate(orig):\n            wanted=data[i][1]\n            if copies[i].random is not (copies[wanted] if wanted is not None else None) or old.val!=data[i][0] or old.next is not (orig[i+1] if i+1<${n} else None) or old.random is not (orig[wanted] if wanted is not None else None): return False\n`;
 return s+'        return True\n';
}
function jsBody(f,call){
 const{n,rule,data}=f,g=rule.kind==='graph';let s=`const data=${JSON.stringify(data)},orig=data.map((v,i)=>new _Node(${g?'i+1':'v[0]'}));`;
 s+=g?'for(let i=0;i<orig.length;i++)orig[i].neighbors=data[i].map(j=>orig[j-1]);':`for(let i=0;i<orig.length;i++){orig[i].next=i+1<orig.length?orig[i+1]:null;orig[i].random=data[i][1]===null?null:orig[data[i][1]];}`;
 s+=`const result=${call}${rule.methodName}(orig.length?orig[0]:null);`;if(!n)return s+'return result===null;';
 if(g)s+=`if(!result||result.val!==1)return false;const copies=new Map([[1,result]]),queue=[result],originals=new Set(orig);for(const cur of queue){const v=cur.val;if(!Number.isInteger(v)||v<1||v>${n}||copies.get(v)!==cur||originals.has(cur)||!Array.isArray(cur.neighbors)||cur.neighbors.length!==data[v-1].length)return false;const seen=new Set();for(const q of cur.neighbors){if(!q||!Number.isInteger(q.val)||!data[v-1].includes(q.val)||seen.has(q.val))return false;seen.add(q.val);if(copies.has(q.val)&&copies.get(q.val)!==q)return false;if(!copies.has(q.val)){if(queue.length>=${n})return false;copies.set(q.val,q);queue.push(q);}}}if(queue.length!==${n})return false;for(let i=0;i<orig.length;i++){const row=orig[i].neighbors;if(orig[i].val!==i+1||!Array.isArray(row)||row.length!==data[i].length||new Set(row).size!==row.length||row.some(q=>!data[i].some(j=>q===orig[j-1])))return false;}`;
 else s+=`const copies=[],originals=new Set(orig),seen=new Set();let cur=result;for(let i=0;i<${n};i++){if(!cur||cur.val!==data[i][0]||originals.has(cur)||seen.has(cur))return false;seen.add(cur);copies.push(cur);cur=cur.next;}if(cur!==null)return false;for(let i=0;i<${n};i++){const r=data[i][1];if(copies[i].random!==(r===null?null:copies[r])||orig[i].val!==data[i][0]||orig[i].next!==(i+1<${n}?orig[i+1]:null)||orig[i].random!==(r===null?null:orig[r]))return false;}`;
 return s+'return true;';
}
export function prepareCloneNodeSource(language,p,code,input){
 const f=validateCloneNodeFixture(p,input),g=f.rule.kind==='graph',active=uncom(code);let prefix='',wrapper='';f.starts=[0];f.edges=[];f.expected=Array(f.n*f.n).fill(0);
 if(g)for(let i=0;i<f.n;i++){for(const j of f.data[i]){f.edges.push(j-1);f.expected[i*f.n+j-1]=1;}f.starts.push(f.edges.length);}
 if(['c','cpp'].includes(language)){
  const cpp=language==='cpp';prefix=cpp?(/class\s+Node\s*\{/.test(active)?'':g?'class Node{public:int val;std::vector<Node*>neighbors;Node(int v=0,std::vector<Node*>a={}):val(v),neighbors(a){}};':'class Node{public:int val;Node*next,*random;Node(int v):val(v),next(nullptr),random(nullptr){}};'):(/struct\s+Node\s*\{/.test(active)?'':g?'struct Node{int val;int numNeighbors;struct Node**neighbors;};':'struct Node{int val;struct Node*next,*random;};');
  prefix+=g?`\nstatic int _ppCloneStarts[]={${ar(f.starts)}},_ppCloneEdges[]={${ar(f.edges)}},_ppCloneExpected[]={${ar(f.expected)}};`:`\nstatic int _ppCloneVals[]={${ar(f.data.map(v=>v[0]))}},_ppCloneRandom[]={${ar(f.data.map(v=>v[1]??-1))}};`;
  wrapper=cpp?`class CloneNodeCapture{public:bool captureNode(int seed){${nativeBody(f,true)}}};`:`bool captureNode(int seed){${nativeBody(f,false)}}`;
 }else if(language==='java'){
  prefix=/class\s+Node\s*\{/.test(active)?'':g?'class Node{public int val;public java.util.List<Node>neighbors;public Node(){this(0);}public Node(int v){val=v;neighbors=new java.util.ArrayList<>();}public Node(int v,java.util.ArrayList<Node>a){val=v;neighbors=a;}}':'class Node{int val;Node next,random;public Node(int v){val=v;}}';wrapper=`class CloneNodeCapture{public boolean captureNode(int seed){${javaBody(f)}}}`;
 }else if(language==='python'){
  prefix=/^class\s+Node\b/m.test(code)?'':g?'class Node:\n    def __init__(self,val=0,neighbors=None): self.val,self.neighbors=val,[] if neighbors is None else neighbors\n':'class Node:\n    def __init__(self,val=0,next=None,random=None): self.val,self.next,self.random=val,next,random\n';wrapper='class CloneNodeCapture:\n    def captureNode(self,seed):\n'+pythonBody(f);
 }else if(['javascript','typescript'].includes(language)){
  const ts=language==='typescript';prefix=/class\s+_Node\s*\{/.test(active)?'':g?(ts?'class _Node{val:number;neighbors:_Node[];constructor(v=0,a:_Node[]=[]){this.val=v;this.neighbors=a;}}':'class _Node{constructor(v=0,a=[]){this.val=v;this.neighbors=a;}}'):(ts?'class _Node{val:number;next:_Node|null;random:_Node|null;constructor(v=0,n:_Node|null=null,r:_Node|null=null){this.val=v;this.next=n;this.random=r;}}':'class _Node{constructor(v=0,n=null,r=null){this.val=v;this.next=n;this.random=r;}}');
  if(!ts&&!/\b(?:class|function)\s+Node\b/.test(active))prefix+='\nconst Node=_Node;';
  wrapper=`function captureNode(seed${ts?':number':''}){${jsBody(f,/class\s+Solution\b/.test(active)?'new Solution().':'')}}`;
 }else throw Error('Unsupported clone language.');
 wrapper=wrapVerifiedNodeCapture(language,wrapper,'CloneNodeCapture',g?f.data.map(row=>[...row].sort((a,b)=>a-b)):f.data);
 const joined=language==='java'?code+'\n'+prefix+'\n'+wrapper:prefix+'\n'+code+'\n'+wrapper,contract={className:'CloneNodeCapture',methodName:'captureNode',parameters:[{name:'seed',type:'integer'}],returnType:'string',outputMode:'return',runnerLanguage:language};
 return materializeFunctionInputPlaceholders(generateFunctionRunnerTemplate(language,contract,joined).replace('{{USER_CODE}}',joined),'seed = 0',contract);
}
