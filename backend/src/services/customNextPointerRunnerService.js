import {parseFunctionTestInput,materializeFunctionInputPlaceholders} from './functionTestInputService.js';
import {generateFunctionRunnerTemplate} from './functionRunnerTemplateService.js';
import {parseNodeResultEnvelope,wrapVerifiedNodeCapture} from './customNodeResultEnvelopeService.js';
export const NEXT_POINTER_APIS=[
 {id:'6ac280349b62de7b23709571',sourceId:116,title:'Populating Next Right Pointers in Each Node',perfect:true},
 {id:'6ac280349b62de7b23709582',sourceId:117,title:'Populating Next Right Pointers in Each Node II',perfect:false},
];
export const nextPointerContract=()=>({className:'Solution',methodName:'connect',parameters:[{name:'root',type:'next-node'}],returnType:'next-node',outputMode:'return'});
export function nextPointerRule(p){const c=p?.functionContract;return NEXT_POINTER_APIS.find(r=>p.executionMode==='function'&&p.title===r.title&&c?.className==='Solution'&&c.kind!=='stateful'&&c.methodName==='connect'&&c.returnType==='next-node'&&c.outputMode!=='parameter'&&c.parameters?.length===1&&c.parameters[0].name==='root'&&c.parameters[0].type==='next-node')||null;}
export function validateNextPointerFixture(p,input){
 const rule=nextPointerRule(p);if(!rule)throw Error('Unsupported exact Next Node public contract.');const parsed=parseFunctionTestInput(input);
 if(parsed.positional.length||Object.keys(parsed.named).length!==1||!Object.hasOwn(parsed.named,'root')||!Array.isArray(parsed.named.root))throw Error('Next Node fixture requires exactly serialized root.');
 const a=parsed.named.root,values=[],left=[],right=[],next=[],depth=[],bound=rule.perfect?1000:100,max=rule.perfect?4095:6000;
 if(a.length>2*max+1)throw Error('Next Node serialization is too large.');
 if(!a.length||a.length===1&&a[0]===null)return{rule,values,left,right,next,expected:[]};
 if(a[0]===null)throw Error('Null root cannot have descendants.');
 const node=value=>{if(!Number.isInteger(value)||value< -bound||value>bound)throw Error('Node value out of source bounds.');if(values.length===max)throw Error('Too many Next Nodes.');values.push(value);left.push(-1);right.push(-1);next.push(-1);return values.length-1;};
 node(a[0]);depth.push(0);let i=1,parent=0;
 while(i<a.length){if(parent>=values.length)throw Error('Unattached next-pointer node.');for(const side of [left,right]){if(i<a.length){const v=a[i++];if(v!==null){side[parent]=node(v);depth.push(depth[parent]+1);}}}parent++;}
 const expected=[];for(let j=0;j<values.length;j++){if(j&&depth[j]!==depth[j-1])expected.push('#');expected.push(values[j]);if(j+1<values.length&&depth[j+1]===depth[j])next[j]=j+1;}
 expected.push('#');
 if(rule.perfect){const leaves=depth.filter((_,j)=>left[j]<0&&right[j]<0);if(leaves.some(d=>d!==leaves[0])||left.some((l,j)=>(l<0)!==(right[j]<0)))throw Error('116 requires a perfect binary tree.');}
 return {rule,values,left,right,next,expected};
}
export function parseNextPointerPublicOutput(raw){const s=String(raw).trim();return JSON.parse(s.replace(/(^|[\[,])\s*#\s*(?=,|\])/g,'$1"#"'));}
export function validateNextPointerOracle(p,testCase){return JSON.stringify(parseNextPointerPublicOutput(testCase.output))===JSON.stringify(validateNextPointerFixture(p,testCase.input).expected);}
export function acceptsNextPointerOutput(p,testCase,raw){if(!nextPointerRule(p))return undefined;try{const result=parseNodeResultEnvelope(raw);return !!result&&validateNextPointerOracle(p,testCase)&&validateNextPointerOracle(p,{...testCase,output:JSON.stringify(result.value)});}catch{return false;}}
const uncomment=v=>String(v).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\r\n]*/g,'');
const array=a=>a.length?a.join(','):'0';
const jarray=a=>a.length?`java.util.Arrays.stream(${JSON.stringify(a.join(','))}.split(",")).mapToInt(Integer::parseInt).toArray()`:'new int[0]';
export function prepareNextPointerSource(language,p,code,input){
 const f=validateNextPointerFixture(p,input),n=f.values.length,active=uncomment(code);let prefix='',wrapper='';
 if(['c','cpp'].includes(language)){
  const cpp=language==='cpp',ptr=cpp?'Node*':'struct Node*',nullv=cpp?'nullptr':'NULL';
  prefix=(cpp?(/class\s+Node\s*\{/.test(active)?'':'class Node{public:int val;Node*left;Node*right;Node*next;Node(int v=0,Node*l=nullptr,Node*r=nullptr,Node*n=nullptr):val(v),left(l),right(r),next(n){}};'):(/struct\s+Node\s*\{/.test(active)?'':'struct Node{int val;struct Node*left,*right,*next;};'))+`\nstatic int _ppNextVals[]={${array(f.values)}},_ppNextLeft[]={${array(f.left)}},_ppNextRight[]={${array(f.right)}},_ppNextLinks[]={${array(f.next)}};`;
  const body=`${ptr}nodes[${n||1}];for(int i=0;i<${n};i++){nodes[i]=${cpp?'new Node(_ppNextVals[i])':'calloc(1,sizeof(struct Node))'};nodes[i]->val=_ppNextVals[i];}for(int i=0;i<${n};i++){nodes[i]->left=_ppNextLeft[i]<0?${nullv}:nodes[_ppNextLeft[i]];nodes[i]->right=_ppNextRight[i]<0?${nullv}:nodes[_ppNextRight[i]];nodes[i]->next=${nullv};}${ptr}root=${n?'nodes[0]':nullv};if(${cpp?'Solution().connect(root)':'connect(root)'}!=root)return false;for(int i=0;i<${n};i++)if(nodes[i]->val!=_ppNextVals[i]||nodes[i]->left!=(_ppNextLeft[i]<0?${nullv}:nodes[_ppNextLeft[i]])||nodes[i]->right!=(_ppNextRight[i]<0?${nullv}:nodes[_ppNextRight[i]])||nodes[i]->next!=(_ppNextLinks[i]<0?${nullv}:nodes[_ppNextLinks[i]]))return false;return true;`;
  wrapper=cpp?`class NextNodeCapture{public:bool captureNode(int seed){${body}}};`:`bool captureNode(int seed){${body}}`;
 }else if(language==='java'){
  prefix=/class\s+Node\s*\{/.test(active)?'':'class Node{public int val;public Node left,right,next;public Node(){}public Node(int v){val=v;}public Node(int v,Node l,Node r,Node n){val=v;left=l;right=r;next=n;}}';
  wrapper=`class NextNodeCapture{public boolean captureNode(int seed){int[]v=${jarray(f.values)},l=${jarray(f.left)},r=${jarray(f.right)},x=${jarray(f.next)};Node[]nodes=new Node[${n}];for(int i=0;i<${n};i++)nodes[i]=new Node(v[i]);for(int i=0;i<${n};i++){nodes[i].left=l[i]<0?null:nodes[l[i]];nodes[i].right=r[i]<0?null:nodes[r[i]];}Node root=${n?'nodes[0]':'null'};if(new Solution().connect(root)!=root)return false;for(int i=0;i<${n};i++)if(nodes[i].val!=v[i]||nodes[i].left!=(l[i]<0?null:nodes[l[i]])||nodes[i].right!=(r[i]<0?null:nodes[r[i]])||nodes[i].next!=(x[i]<0?null:nodes[x[i]]))return false;return true;}}`;
 }else if(language==='python'){
  prefix=/^class\s+Node\b/m.test(code)?'':'class Node:\n    def __init__(self,val=0,left=None,right=None,next=None): self.val,self.left,self.right,self.next=val,left,right,next\n';
  wrapper=`class NextNodeCapture:\n    def captureNode(self,seed):\n        values=${JSON.stringify(f.values)}; left=${JSON.stringify(f.left)}; right=${JSON.stringify(f.right)}; links=${JSON.stringify(f.next)}\n        nodes=[Node(v) for v in values]\n        for i,node in enumerate(nodes):\n            node.left=nodes[left[i]] if left[i]>=0 else None\n            node.right=nodes[right[i]] if right[i]>=0 else None\n            node.next=None\n        root=nodes[0] if nodes else None\n        if Solution().connect(root) is not root: return False\n        for i,node in enumerate(nodes):\n            if node.val!=values[i] or node.left is not (nodes[left[i]] if left[i]>=0 else None) or node.right is not (nodes[right[i]] if right[i]>=0 else None) or node.next is not (nodes[links[i]] if links[i]>=0 else None): return False\n        return True\n`;
 }else if(['javascript','typescript'].includes(language)){
  const ts=language==='typescript';prefix=/class\s+_Node\s*\{/.test(active)?'':ts?'class _Node{val:number;left:_Node|null;right:_Node|null;next:_Node|null;constructor(v=0,l:_Node|null=null,r:_Node|null=null,n:_Node|null=null){this.val=v;this.left=l;this.right=r;this.next=n;}}':'class _Node{constructor(v=0,l=null,r=null,n=null){this.val=v;this.left=l;this.right=r;this.next=n;}}';
  wrapper=`function captureNode(seed${ts?':number':''}){const v=${JSON.stringify(f.values)},l=${JSON.stringify(f.left)},r=${JSON.stringify(f.right)},x=${JSON.stringify(f.next)},nodes=v.map(value=>new _Node(value));for(let i=0;i<nodes.length;i++){nodes[i].left=l[i]<0?null:nodes[l[i]];nodes[i].right=r[i]<0?null:nodes[r[i]];}const root=nodes.length?nodes[0]:null;if(${/class\s+Solution\b/.test(active)?'new Solution().':''}connect(root)!==root)return false;return nodes.every((node,i)=>node.val===v[i]&&node.left===(l[i]<0?null:nodes[l[i]])&&node.right===(r[i]<0?null:nodes[r[i]])&&node.next===(x[i]<0?null:nodes[x[i]]));}`;
 }else throw Error('Unsupported next-pointer language.');
 wrapper=wrapVerifiedNodeCapture(language,wrapper,'NextNodeCapture',f.expected);
 const joined=language==='java'?code+'\n'+prefix+'\n'+wrapper:prefix+'\n'+code+'\n'+wrapper,contract={className:'NextNodeCapture',methodName:'captureNode',parameters:[{name:'seed',type:'integer'}],returnType:'string',outputMode:'return',runnerLanguage:language};
 return materializeFunctionInputPlaceholders(generateFunctionRunnerTemplate(language,contract,joined).replace('{{USER_CODE}}',joined),'seed = 0',contract);
}
