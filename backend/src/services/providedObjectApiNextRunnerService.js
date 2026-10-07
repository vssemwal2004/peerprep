import {providedObjectRule as baseRule,validateProvidedObjectFixture as baseFixture,acceptsProvidedObjectOutput as baseOutput,prepareProvidedObjectSource as baseSource} from './providedObjectApiRunnerService.js';
import {parseFunctionTestInput,materializeFunctionInputPlaceholders} from './functionTestInputService.js';
import {generateFunctionRunnerTemplate} from './functionRunnerTemplateService.js';
import {fontRule,validateFontFixture,acceptsFontOutput,prepareFontSource} from './providedFontApiRunnerService.js';
const param=(name,type)=>({name,type});
export const NEXT_PROVIDED_OBJECT_APIS=[
 {id:'6ac2809b19051acf30c4b003',title:'Guess the Majority in a Hidden Array',kind:'majority',sourceId:1538,methodName:'guessMajority',parameters:[param('reader','ArrayReader')]},
 {id:'6ac280ce19051acf30c4bcdc',title:'Count Houses in a Circular Street',kind:'street',sourceId:2728,methodName:'houseCount',parameters:[param('street','Street'),param('k','integer')]},
 {id:'6ac280cf19051acf30c4bd1e',title:'Count Houses in a Circular Street II',kind:'streetTwo',sourceId:2753,methodName:'houseCount',parameters:[param('street','Street'),param('k','integer')]},
 {id:'6ac280d019051acf30c4bd77',title:'Number of Unique Categories',kind:'categories',sourceId:2782,methodName:'numberOfCategories',parameters:[param('n','integer'),param('categoryHandler','CategoryHandler')]},
 {id:'6ac280d319051acf30c4be65',title:'Number of Equal Numbers Blocks',kind:'blocks',sourceId:2936,methodName:'countBlocks',parameters:[param('nums','BigArray')]},
 {id:'6ac280a219051acf30c4b160',title:'Maximum Font to Fit a Sentence in a Screen',kind:'font',sourceId:1618,methodName:'maxFont',parameters:[param('text','string'),param('w','integer'),param('h','integer'),param('fonts','integer[]'),param('fontInfo','FontInfo')]},
];
export function providedObjectContract(rule){return{className:'Solution',methodName:rule.methodName,parameters:rule.parameters.map(p=>({...p})),returnType:'integer',outputMode:'return'};}
export function providedObjectRule(p){return baseRule(p)||NEXT_PROVIDED_OBJECT_APIS.find(r=>p?.executionMode==='function'&&p.title===r.title&&p.functionContract?.kind!=='stateful'&&p.functionContract.className==='Solution'&&p.functionContract.methodName===r.methodName&&p.functionContract.returnType==='integer'&&p.functionContract.outputMode!=='parameter'&&p.functionContract.parameters?.length===r.parameters.length&&p.functionContract.parameters.every((v,i)=>v.name===r.parameters[i].name&&v.type===r.parameters[i].type))||null;}
const int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export function validateProvidedObjectFixture(p,input){
 if(baseRule(p))return baseFixture(p,input);if(fontRule(p))return validateFontFixture(p,input);const rule=providedObjectRule(p);if(!rule)throw Error('Unsupported provided object API contract.');
 const x=parseFunctionTestInput(input),v=x.named,keys=Object.keys(v),only=names=>!x.positional.length&&keys.length===names.length&&names.every(k=>Object.hasOwn(v,k));
 if(rule.kind==='majority'){
  const a=v.nums;if(!only(['nums'])||!Array.isArray(a)||!int(a.length,5,100000)||a.some(x=>x!==0&&x!==1))throw Error('Hidden majority requires5..100000 private binary values.');
  const ones=a.reduce((s,v)=>s+v,0);return{rule,data:a,n:a.length,majority:ones*2===a.length?null:ones*2>a.length?1:0,budget:2*a.length};
 }
 if(['street','streetTwo'].includes(rule.kind)){
  const a=v.street,max=rule.kind==='street'?1000:100000;if(!only(['street','k'])||!Array.isArray(a)||!int(a.length,1,max)||!int(v.k,a.length,max)||a.some(x=>x!==0&&x!==1)||(rule.kind==='streetTwo'&&!a.includes(1)))throw Error('Street requires legal binary doors, length<=k and StreetII at least one open door.');
  return{rule,data:a,n:a.length,k:v.k,expected:a.length};
 }
 if(rule.kind==='categories'){
  const a=v.categoryHandler;if(!only(['n','categoryHandler'])||!int(v.n,1,100)||!Array.isArray(a)||a.length!==v.n||a.some(x=>!int(x,-2147483648,2147483647)))throw Error('CategoryHandler requires n1..100 matching private category labels.');
  return{rule,data:a,n:v.n,expected:new Set(a).size};
 }
 const a=v.nums,runs=[];if(!only(['nums']))throw Error('BigArray requires exactly a private nums environment.');
 if(Array.isArray(a)){for(const value of a){if(!int(value,1,1000000000))throw Error('Invalid BigArray value.');if(runs.length&&runs.at(-1)[0]===value)runs.at(-1)[1]++;else runs.push([value,1]);}}
 else{if(!a||typeof a!=='object'||Object.keys(a).length!==1||!Array.isArray(a.runs))throw Error('Compact BigArray requires exact {runs:[[value,length],...]}.');for(const r of a.runs){if(!Array.isArray(r)||r.length!==2||!int(r[0],1,1000000000)||!int(r[1],1,1000000000000000))throw Error('Invalid BigArray run.');runs.push([...r]);}}
 if(!runs.length||new Set(runs.map(r=>r[0])).size!==runs.length)throw Error('Every distinct BigArray value must occur in exactly one maximal run.');
 const size=runs.reduce((s,r)=>s+BigInt(r[1]),0n),sum=runs.reduce((s,r)=>s+BigInt(r[0])*BigInt(r[1]),0n);if(size>1000000000000000n||sum>1000000000000000n)throw Error('BigArray length and element sum must not exceed1e15.');
 let total=0;const ends=runs.map(r=>total+=r[1]);return{rule,data:runs.map(r=>r[0]),ends,n:Number(size),expected:runs.length};
}
export function acceptsProvidedObjectOutput(p,testCase,raw){if(baseRule(p))return baseOutput(p,testCase,raw);if(fontRule(p))return acceptsFontOutput(p,testCase,raw);if(!providedObjectRule(p))return undefined;try{const f=validateProvidedObjectFixture(p,testCase.input),v=JSON.parse(String(raw).trim());return Number.isInteger(v)&&(f.rule.kind==='majority'?(f.majority===null?v===-1:int(v,0,f.n-1)&&f.data[v]===f.majority):v===f.expected);}catch{return false;}}
const javaInts=a=>{const csv=a.join(','),chunks=[];for(let i=0;i<csv.length;i+=16000)chunks.push(JSON.stringify(csv.slice(i,i+16000)));return a.length?`java.util.Arrays.stream(String.join("",new String[]{${chunks.join(',')}}).split(",")).mapToInt(Integer::parseInt).toArray()`:'new int[0]';};
function nativePrefix(language,f){
 const cpp=language==='cpp',k=f.rule.kind,n=f.n,base=`static int _ppNextData[]={${f.data.join(',')}};static int _ppNextPos=0,_ppNextCalls=0;static void _ppNextBad(){printf("PeerPrep invalid provided API call");exit(0);}\n`;
 if(k==='majority'){const body=`if(a<0||a>=b||b>=c||c>=d||d>=${n}||++_ppNextCalls>${2*n})_ppNextBad();int s=_ppNextData[a]+_ppNextData[b]+_ppNextData[c]+_ppNextData[d];return s==0||s==4?4:s==2?0:2;`;return base+(cpp?`class ArrayReader{public:int length(){return ${n};}int query(int a,int b,int c,int d){${body}}};`:`typedef struct ArrayReader{int opaque;}ArrayReader;int length(ArrayReader*r){return ${n};}int query(ArrayReader*r,int a,int b,int c,int d){${body}}`);}
 if(k==='categories'){const body=`return a>=0&&b>=0&&a<${n}&&b<${n}&&_ppNextData[a]==_ppNextData[b];`;return base+(cpp?`class CategoryHandler{public:bool haveSameCategory(int a,int b){${body}}};`:`struct CategoryHandler{bool(*haveSameCategory)(struct CategoryHandler*,int,int);};bool _ppNextSame(struct CategoryHandler*o,int a,int b){${body}}`);}
 if(k==='blocks'){const ends=`static long long _ppNextEnds[]={${f.ends.map(x=>x+'LL').join(',')}};`,body=`if(index<0||index>=${n}LL)_ppNextBad();int l=0,h=${f.ends.length-1};while(l<h){int m=l+(h-l)/2;if(index<_ppNextEnds[m])h=m;else l=m+1;}return _ppNextData[l];`;return base+ends+(cpp?`class BigArray{public:int at(long long index){${body}}long long size(){return ${n}LL;}};`:`struct BigArray{int(*at)(struct BigArray*,long long);long long(*size)(struct BigArray*);};int _ppNextAt(struct BigArray*o,long long index){${body}}long long _ppNextSize(struct BigArray*o){return ${n}LL;}`);}
 const full=k==='street',open=full?'void openDoor(){_ppNextData[_ppNextPos]=1;}void moveLeft(){_ppNextPos=(_ppNextPos+'+(n-1)+')%'+n+';}':'';
 if(cpp)return base+`class Street{public:${open}void closeDoor(){_ppNextData[_ppNextPos]=0;}bool isDoorOpen(){return _ppNextData[_ppNextPos]!=0;}void moveRight(){_ppNextPos=(_ppNextPos+1)%${n};}};`;
 const extra=full?'void(*openDoor)(struct Street*);void(*moveLeft)(struct Street*);':'';
 return base+`struct Street{void(*closeDoor)(struct Street*);bool(*isDoorOpen)(struct Street*);void(*moveRight)(struct Street*);${extra}};void _ppNextClose(struct Street*o){_ppNextData[_ppNextPos]=0;}bool _ppNextOpen(struct Street*o){return _ppNextData[_ppNextPos]!=0;}void _ppNextRight(struct Street*o){_ppNextPos=(_ppNextPos+1)%${n};}`+(full?`void _ppNextSetOpen(struct Street*o){_ppNextData[_ppNextPos]=1;}void _ppNextLeft(struct Street*o){_ppNextPos=(_ppNextPos+${n-1})%${n};}`:'');
}
function javaPrefix(f){
 const k=f.rule.kind,n=f.n,base=`class PPNextEnv{static int[]data=${javaInts(f.data)};static int pos=0,calls=0;static void bad(){System.out.print("PeerPrep invalid provided API call");System.exit(0);}}\n`;
 if(k==='majority')return base+`class ArrayReader{public int length(){return ${n};}public int query(int a,int b,int c,int d){if(a<0||a>=b||b>=c||c>=d||d>=${n}||++PPNextEnv.calls>${2*n})PPNextEnv.bad();int s=PPNextEnv.data[a]+PPNextEnv.data[b]+PPNextEnv.data[c]+PPNextEnv.data[d];return s==0||s==4?4:s==2?0:2;}}`;
 if(k==='categories')return base+`class CategoryHandler{public boolean haveSameCategory(int a,int b){return a>=0&&b>=0&&a<${n}&&b<${n}&&PPNextEnv.data[a]==PPNextEnv.data[b];}}`;
 if(k==='blocks')return base+`class BigArray{private long[]ends={${f.ends.map(x=>x+'L').join(',')}};public long size(){return ${n}L;}public int at(long index){if(index<0||index>=${n}L)PPNextEnv.bad();int l=0,h=ends.length-1;while(l<h){int m=l+(h-l)/2;if(index<ends[m])h=m;else l=m+1;}return PPNextEnv.data[l];}}`;
 return base+`class Street{${k==='street'?`public void openDoor(){PPNextEnv.data[PPNextEnv.pos]=1;}public void moveLeft(){PPNextEnv.pos=(PPNextEnv.pos+${n-1})%${n};}`:''}public void closeDoor(){PPNextEnv.data[PPNextEnv.pos]=0;}public boolean isDoorOpen(){return PPNextEnv.data[PPNextEnv.pos]!=0;}public void moveRight(){PPNextEnv.pos=(PPNextEnv.pos+1)%${n};}}`;
}
function pythonPrefix(f){
 const n=f.n,k=f.rule.kind,base=`_pp_next_data=${JSON.stringify(f.data)}\n${k==='blocks'?`_pp_next_ends=${JSON.stringify(f.ends)}\n`:''}_pp_next_calls=0\ndef _pp_next_bad():\n    print('PeerPrep invalid provided API call')\n    raise SystemExit(0)\n`;
 if(k==='majority')return base+`class ArrayReader:\n    def length(self): return ${n}\n    def query(self,a,b,c,d):\n        global _pp_next_calls\n        _pp_next_calls+=1\n        if any(type(v) is not int for v in (a,b,c,d)) or not(0<=a<b<c<d<${n}) or _pp_next_calls>${2*n}: _pp_next_bad()\n        s=sum(_pp_next_data[i] for i in (a,b,c,d))\n        return 4 if s in (0,4) else 0 if s==2 else 2\n`;
 if(k==='categories')return base+`class CategoryHandler:\n    def haveSameCategory(self,a,b):\n        return type(a) is int and type(b) is int and 0<=a<${n} and 0<=b<${n} and _pp_next_data[a]==_pp_next_data[b]\n`;
 if(k==='blocks')return base+`class BigArray:\n    def size(self): return ${n}\n    def at(self,index):\n        if type(index) is not int or not(0<=index<${n}): _pp_next_bad()\n        l,h=0,len(_pp_next_ends)-1\n        while l<h:\n            m=(l+h)//2\n            if index<_pp_next_ends[m]: h=m\n            else: l=m+1\n        return _pp_next_data[l]\n`;
 return base+`class Street:\n    def __init__(self): self.pos=0\n${k==='street'?`    def openDoor(self): _pp_next_data[self.pos]=1\n    def moveLeft(self): self.pos=(self.pos+${n-1})%${n}\n`:''}    def closeDoor(self): _pp_next_data[self.pos]=0\n    def isDoorOpen(self): return _pp_next_data[self.pos]!=0\n    def moveRight(self): self.pos=(self.pos+1)%${n}\n`;
}
function jsPrefix(f,ts){
 const n=f.n,k=f.rule.kind,base=`${ts?'declare const process:any;\n':''}const _ppNextData=${JSON.stringify(f.data)};${k==='blocks'?`const _ppNextEnds=${JSON.stringify(f.ends)};`:''}let _ppNextCalls=0;function _ppNextBad(){console.log('PeerPrep invalid provided API call');process.exit(0);}\n`;
 if(k==='majority')return base+`class ArrayReader{length(){return ${n};}query(a,b,c,d){if(![a,b,c,d].every(Number.isInteger)||!(0<=a&&a<b&&b<c&&c<d&&d<${n})||++_ppNextCalls>${2*n})_ppNextBad();const s=_ppNextData[a]+_ppNextData[b]+_ppNextData[c]+_ppNextData[d];return s===0||s===4?4:s===2?0:2;}}`;
 if(k==='categories')return base+`class CategoryHandler{haveSameCategory(a,b){return Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&a<${n}&&b<${n}&&_ppNextData[a]===_ppNextData[b];}}`;
 if(k==='blocks')return base+`class BigArray{size(){return ${n};}at(index){if(!Number.isSafeInteger(index)||index<0||index>=${n})_ppNextBad();let l=0,h=_ppNextEnds.length-1;while(l<h){const m=Math.floor((l+h)/2);if(index<_ppNextEnds[m])h=m;else l=m+1;}return _ppNextData[l];}}`;
 return base+`class Street{pos=0;${k==='street'?`openDoor(){_ppNextData[this.pos]=1;}moveLeft(){this.pos=(this.pos+${n-1})%${n};}`:''}closeDoor(){_ppNextData[this.pos]=0;}isDoorOpen(){return !!_ppNextData[this.pos];}moveRight(){this.pos=(this.pos+1)%${n};}}`;
}
export function prepareProvidedObjectSource(language,p,userCode,input){
 if(baseRule(p))return baseSource(language,p,userCode,input);if(fontRule(p))return prepareFontSource(language,p,userCode,input);const f=validateProvidedObjectFixture(p,input),k=f.rule.kind,method=f.rule.methodName,cls=k==='majority'?'ArrayReader':k==='categories'?'CategoryHandler':k==='blocks'?'BigArray':'Street';
 let args=k==='categories'?`${f.n},reader`:['street','streetTwo'].includes(k)?`reader,${f.k}`:'reader',prefix,wrapper;
 if(language==='c'){prefix=nativePrefix(language,f);const setup=k==='majority'?'ArrayReader reader={0};':k==='categories'?'struct CategoryHandler reader={_ppNextSame};':k==='blocks'?'struct BigArray reader={_ppNextAt,_ppNextSize};':`struct Street reader={_ppNextClose,_ppNextOpen,_ppNextRight${k==='street'?',_ppNextSetOpen,_ppNextLeft':''}};`;wrapper=`int captureApi(int seed){${setup}return ${method}(${args.replace('reader','&reader')});}`;}
 else if(language==='cpp'){prefix=nativePrefix(language,f);if(k!=='majority')args=args.replace('reader','&reader');wrapper=`class ProvidedApiCapture{public:int captureApi(int seed){${cls} reader;return Solution().${method}(${args});}};`;}
 else if(language==='java'){prefix=javaPrefix(f);wrapper=`class ProvidedApiCapture{public int captureApi(int seed){${cls} reader=new ${cls}();return new Solution().${method}(${args});}}`;}
 else if(language==='python'){prefix=pythonPrefix(f);wrapper=`class ProvidedApiCapture:\n    def captureApi(self,seed):\n        reader=${cls}()\n        return Solution().${method}(${args})\n`;}
 else if(['javascript','typescript'].includes(language)){prefix=jsPrefix(f,language==='typescript');wrapper=`function captureApi(seed${language==='typescript'?':number':''}){const reader=new ${cls}();return ${/\bclass\s+Solution\b/.test(userCode)?'new Solution().':''}${method}(${args});}`;}
 else throw Error('Unsupported provided API language.');
 const code=language==='java'?String(userCode).replace(/(^|\n)\s*public\s+class\s+Solution\b/,'$1class Solution'):String(userCode),joined=prefix+'\n'+code+'\n'+wrapper,c={className:'ProvidedApiCapture',methodName:'captureApi',parameters:[param('seed','integer')],returnType:'integer',outputMode:'return',runnerLanguage:language};
 return materializeFunctionInputPlaceholders(generateFunctionRunnerTemplate(language,c,joined),'seed=1',c).replace('{{USER_CODE}}',joined);
}
