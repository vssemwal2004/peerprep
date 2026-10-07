import {parseFunctionTestInput,materializeFunctionInputPlaceholders} from './functionTestInputService.js';
import {generateFunctionRunnerTemplate} from './functionRunnerTemplateService.js';
const parameter=(name,type)=>({name,type});
export const PROVIDED_OBJECT_APIS=[
 {id:'6ac27fda50fef4f698aa1e5c',title:'Find the Celebrity',kind:'celebrity',sourceId:277,methodName:'findCelebrity',parameters:[parameter('n','integer')]},
 {id:'6ac27ff550fef4f698aa24ba',title:'Search in a Sorted Array of Unknown Size',kind:'unknown',sourceId:702,methodName:'search',parameters:[parameter('reader','ArrayReader'),parameter('target','integer')]},
 {id:'6ac2809419051acf30c4ae95',title:'Leftmost Column with at Least a One',kind:'matrix',sourceId:1428,methodName:'leftMostColumnWithOne',parameters:[parameter('binaryMatrix','BinaryMatrix')]},
 {id:'6ac2809b19051acf30c4afe7',title:'Find the Index of the Large Integer',kind:'large',sourceId:1533,methodName:'getIndex',parameters:[parameter('reader','ArrayReader')]},
];
export function providedObjectContract(rule){return{className:'Solution',methodName:rule.methodName,parameters:rule.parameters.map(p=>({...p})),returnType:'integer',outputMode:'return'};}
export function providedObjectRule(problem){const c=problem?.functionContract;return PROVIDED_OBJECT_APIS.find(r=>problem?.title===r.title&&problem.executionMode==='function'&&c?.kind!=='stateful'&&c.className==='Solution'&&c.methodName===r.methodName&&c.returnType==='integer'&&c.outputMode!=='parameter'&&c.parameters?.length===r.parameters.length&&c.parameters.every((p,i)=>p.name===r.parameters[i].name&&p.type===r.parameters[i].type))||null;}
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
export function validateProvidedObjectFixture(problem,input){
 const rule=providedObjectRule(problem);if(!rule)throw Error('Unsupported provided object API contract.');
 const parsed=parseFunctionTestInput(input);if(parsed.positional.length||!Object.keys(parsed.named).length)throw Error('Provided APIs require explicit named environment fields.');
 const keys=Object.keys(parsed.named),v=parsed.named,only=names=>keys.length===names.length&&names.every(k=>Object.hasOwn(v,k));
 if(rule.kind==='celebrity'){
  const a=v.graph,n=a?.length;if(!only(['graph'])||!Array.isArray(a)||!integer(n,2,100)||a.some((r,i)=>!Array.isArray(r)||r.length!==n||r[i]!==1||r.some(x=>x!==0&&x!==1)))throw Error('Celebrity environment requires a square binary knows graph, diagonal1, n2..100.');
  const expected=a.findIndex((r,c)=>r.every((x,i)=>i===c||x===0)&&a.every((row,i)=>i===c||row[c]===1));return{rule,data:a.flat(),n,columns:n,expected};
 }
 if(rule.kind==='unknown'){
  const a=v.secret;if(!only(['secret','target'])||!Array.isArray(a)||!integer(a.length,1,10000)||!integer(v.target,-10000,10000)||a.some((x,i)=>!integer(x,-10000,10000)||(i&&x<=a[i-1])))throw Error('Unknown-reader environment requires strictly increasing secret and bounded target.');
  return{rule,data:a,n:a.length,target:v.target,expected:a.indexOf(v.target)};
 }
 if(rule.kind==='matrix'){
  const a=v.mat,n=a?.length,m=a?.[0]?.length;if(!only(['mat'])||!Array.isArray(a)||!integer(n,1,100)||!integer(m,1,100)||a.some(r=>!Array.isArray(r)||r.length!==m||r.some((x,i)=>(x!==0&&x!==1)||(i&&x<r[i-1]))))throw Error('BinaryMatrix requires a1..100 rectangular row-sorted binary matrix.');
  let expected=-1;for(let c=0;c<m;c++)if(a.some(r=>r[c]===1)){expected=c;break;}return{rule,data:a.flat(),n,columns:m,expected,budget:1000};
 }
 const key=only(['arr'])?'arr':only(['nums'])?'nums':null,a=key?v[key]:undefined;let n,ordinaryValue,largeValue,largeIndex;
 if(Array.isArray(a)){
  n=a.length;if(!integer(n,2,500000)||a.some(x=>!integer(x,1,100)))throw Error('Large-reader values require2..500000 entries in1..100.');
  largeValue=Math.max(...a.slice(0,50000));for(let i=50000;i<n;i++)largeValue=Math.max(largeValue,a[i]);largeIndex=a.indexOf(largeValue);ordinaryValue=a[largeIndex===0?1:0];if(largeValue<=ordinaryValue||a.some((x,i)=>x!==(i===largeIndex?largeValue:ordinaryValue)))throw Error('Exactly one value must be larger than all equal other values.');
 }else{
  if(!a||typeof a!=='object'||Object.keys(a).length!==4||!['length','ordinaryValue','largeValue','largeIndex'].every(k=>Object.hasOwn(a,k)))throw Error('Compact reader environment requires exact length/base/large/index fields.');
  ({length:n,ordinaryValue,largeValue,largeIndex}=a);if(!integer(n,2,500000)||!integer(ordinaryValue,1,99)||!integer(largeValue,ordinaryValue+1,100)||!integer(largeIndex,0,n-1))throw Error('Invalid compact large-reader bounds.');
 }
 return{rule,data:[],n,ordinaryValue,largeValue,largeIndex,expected:largeIndex,budget:20};
}
export function acceptsProvidedObjectOutput(problem,testCase,raw){if(!providedObjectRule(problem))return undefined;try{const f=validateProvidedObjectFixture(problem,testCase.input),n=JSON.parse(String(raw).trim());return Number.isInteger(n)&&n===f.expected;}catch{return false;}}

const javaNumbers=values=>{if(!values.length)return'new int[0]';const csv=values.join(','),chunks=[];for(let i=0;i<csv.length;i+=16000)chunks.push(JSON.stringify(csv.slice(i,i+16000)));return`java.util.Arrays.stream(String.join("",new String[]{${chunks.join(',')}}).split(",")).mapToInt(Integer::parseInt).toArray()`;};
function nativeApiPrefix(language,f){
 const cpp=language==='cpp',matrix=f.rule.kind==='matrix',celeb=f.rule.kind==='celebrity',unknown=f.rule.kind==='unknown',n=f.n,m=f.columns||0;
 const prefix=`#include <string.h>\nstatic int _ppApiData[]={${f.data.length?f.data.join(','):'0'}};static int _ppApiCalls=0;\nstatic void _ppApiBad(){printf("PeerPrep invalid provided API call");exit(0);}\n`;
 if(celeb){const fn=`bool knows(int a,int b){if(a<0||a>=${n}||b<0||b>=${n})_ppApiBad();return _ppApiData[a*${n}+b]!=0;}\n`;return prefix+fn+(cpp?'class Relation{protected:bool knows(int a,int b){return ::knows(a,b);}};\n':'');}
 if(matrix){if(cpp)return prefix+`class BinaryMatrix{public:int get(int row,int col){if(row<0||row>=${n}||col<0||col>=${m}||++_ppApiCalls>1000)_ppApiBad();return _ppApiData[row*${m}+col];}std::vector<int> dimensions(){return{${n},${m}};}};\n`;
  return prefix+`struct BinaryMatrix{int(*get)(struct BinaryMatrix*,int,int);int*(*dimensions)(struct BinaryMatrix*);};int _ppMatrixGet(struct BinaryMatrix*o,int row,int col){if(row<0||row>=${n}||col<0||col>=${m}||++_ppApiCalls>1000)_ppApiBad();return _ppApiData[row*${m}+col];}int* _ppMatrixDimensions(struct BinaryMatrix*o){static int size[]={${n},${m}};return size;}\n`;
 }
 if(unknown)return prefix+(cpp?`class ArrayReader{public:int get(int index)const{return index<0||index>=${n}?2147483647:_ppApiData[index];}};\n`:`typedef struct ArrayReader{int opaque;}ArrayReader;int getElement(ArrayReader*o,int index){return index<0||index>=${n}?2147483647:_ppApiData[index];}\n`);
 const compare=`if(l<0||l>r||r>=${n}||x<0||x>y||y>=${n}||++_ppApiCalls>20)_ppApiBad();long long a=(long long)(r-l+1)*${f.ordinaryValue}+((l<=${f.largeIndex}&&${f.largeIndex}<=r)?${f.largeValue-f.ordinaryValue}:0),b=(long long)(y-x+1)*${f.ordinaryValue}+((x<=${f.largeIndex}&&${f.largeIndex}<=y)?${f.largeValue-f.ordinaryValue}:0);return(a>b)-(a<b);`;
 return prefix+(cpp?`class ArrayReader{public:int length(){return ${n};}int compareSub(int l,int r,int x,int y){${compare}}};\n`:`typedef struct ArrayReader{int opaque;}ArrayReader;int length(ArrayReader*o){return ${n};}int compareSub(ArrayReader*o,int l,int r,int x,int y){${compare}}\n`);
}
function javaApiPrefix(f){
 const n=f.n,m=f.columns||0,base=`class PPProvidedEnv{static int[]data=${javaNumbers(f.data)};static int calls=0;static void bad(){System.out.print("PeerPrep invalid provided API call");System.exit(0);}}\n`;
 if(f.rule.kind==='celebrity')return base+`class Relation{protected boolean knows(int a,int b){if(a<0||a>=${n}||b<0||b>=${n})PPProvidedEnv.bad();return PPProvidedEnv.data[a*${n}+b]!=0;}}\n`;
 if(f.rule.kind==='matrix')return base+`class BinaryMatrix{public int get(int row,int col){if(row<0||row>=${n}||col<0||col>=${m}||++PPProvidedEnv.calls>1000)PPProvidedEnv.bad();return PPProvidedEnv.data[row*${m}+col];}public java.util.List<Integer> dimensions(){return java.util.Arrays.asList(${n},${m});}}\n`;
 if(f.rule.kind==='unknown')return base+`class ArrayReader{public int get(int index){return index<0||index>=${n}?2147483647:PPProvidedEnv.data[index];}}\n`;
 return base+`class ArrayReader{public int length(){return ${n};}public int compareSub(int l,int r,int x,int y){if(l<0||l>r||r>=${n}||x<0||x>y||y>=${n}||++PPProvidedEnv.calls>20)PPProvidedEnv.bad();long a=(long)(r-l+1)*${f.ordinaryValue}+((l<=${f.largeIndex}&&${f.largeIndex}<=r)?${f.largeValue-f.ordinaryValue}:0),b=(long)(y-x+1)*${f.ordinaryValue}+((x<=${f.largeIndex}&&${f.largeIndex}<=y)?${f.largeValue-f.ordinaryValue}:0);return Long.compare(a,b);}}\n`;
}
function pythonApiPrefix(f){
 const n=f.n,m=f.columns||0,base=`_pp_api_data=${JSON.stringify(f.data)}\n_pp_api_calls=0\ndef _pp_api_bad():\n    print('PeerPrep invalid provided API call')\n    raise SystemExit(0)\n`;
 if(f.rule.kind==='celebrity')return base+`def knows(a,b):\n    if type(a) is not int or type(b) is not int or not(0<=a<${n} and 0<=b<${n}): _pp_api_bad()\n    return _pp_api_data[a*${n}+b]!=0\n`;
 if(f.rule.kind==='matrix')return base+`class BinaryMatrix:\n    def get(self,row,col):\n        global _pp_api_calls\n        _pp_api_calls+=1\n        if type(row) is not int or type(col) is not int or not(0<=row<${n} and 0<=col<${m}) or _pp_api_calls>1000: _pp_api_bad()\n        return _pp_api_data[row*${m}+col]\n    def dimensions(self): return [${n},${m}]\n`;
 if(f.rule.kind==='unknown')return base+`class ArrayReader:\n    def get(self,index):\n        if type(index) is not int: _pp_api_bad()\n        return 2147483647 if index<0 or index>=${n} else _pp_api_data[index]\n`;
 return base+`class ArrayReader:\n    def length(self): return ${n}\n    def compareSub(self,l,r,x,y):\n        global _pp_api_calls\n        _pp_api_calls+=1\n        if any(type(v) is not int for v in (l,r,x,y)) or not(0<=l<=r<${n} and 0<=x<=y<${n}) or _pp_api_calls>20: _pp_api_bad()\n        a=(r-l+1)*${f.ordinaryValue}+(${f.largeValue-f.ordinaryValue} if l<=${f.largeIndex}<=r else 0)\n        b=(y-x+1)*${f.ordinaryValue}+(${f.largeValue-f.ordinaryValue} if x<=${f.largeIndex}<=y else 0)\n        return (a>b)-(a<b)\n`;
}
function jsApiPrefix(f,typescript){
 const n=f.n,m=f.columns||0,base=`${typescript?'declare const process:any;\n':''}const _ppApiData=${JSON.stringify(f.data)};let _ppApiCalls=0;function _ppApiBad(){console.log('PeerPrep invalid provided API call');process.exit(0);}\n`;
 if(f.rule.kind==='celebrity')return base+`function knows(a,b){if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||a>=${n}||b<0||b>=${n})_ppApiBad();return !!_ppApiData[a*${n}+b];}\n`;
 if(f.rule.kind==='matrix')return base+`class BinaryMatrix{get(row,col){if(!Number.isInteger(row)||!Number.isInteger(col)||row<0||row>=${n}||col<0||col>=${m}||++_ppApiCalls>1000)_ppApiBad();return _ppApiData[row*${m}+col];}dimensions(){return[${n},${m}];}}\n`;
 if(f.rule.kind==='unknown')return base+`class ArrayReader{get(index){if(!Number.isInteger(index))_ppApiBad();return index<0||index>=${n}?2147483647:_ppApiData[index];}}\n`;
 return base+`class ArrayReader{length(){return ${n};}compareSub(l,r,x,y){if(![l,r,x,y].every(Number.isInteger)||l<0||l>r||r>=${n}||x<0||x>y||y>=${n}||++_ppApiCalls>20)_ppApiBad();const a=(r-l+1)*${f.ordinaryValue}+((l<=${f.largeIndex}&&${f.largeIndex}<=r)?${f.largeValue-f.ordinaryValue}:0),b=(y-x+1)*${f.ordinaryValue}+((x<=${f.largeIndex}&&${f.largeIndex}<=y)?${f.largeValue-f.ordinaryValue}:0);return(a>b?1:0)-(a<b?1:0);}}\n`;
}
export function prepareProvidedObjectSource(language,problem,userCode,input){
 const f=validateProvidedObjectFixture(problem,input),kind=f.rule.kind,method=f.rule.methodName;
 const cls=kind==='matrix'?'BinaryMatrix':'ArrayReader',args=kind==='celebrity'?String(f.n):kind==='unknown'?`reader,${f.target}`:'reader';
 let prefix,wrapper;
 if(language==='c'){prefix=nativeApiPrefix(language,f);const setup=kind==='celebrity'?'':kind==='matrix'?'struct BinaryMatrix reader={_ppMatrixGet,_ppMatrixDimensions};':'ArrayReader reader={0};';const cArgs=kind==='celebrity'?args:args.replace('reader','&reader');wrapper=`int captureApi(int seed){${setup}return ${method}(${cArgs});}`;}
 else if(language==='cpp'){prefix=nativeApiPrefix(language,f);wrapper=`class ProvidedApiCapture{public:int captureApi(int seed){${kind==='celebrity'?'':`${cls} reader;`}return Solution().${method}(${args});}};`;}
 else if(language==='java'){prefix=javaApiPrefix(f);wrapper=`class ProvidedApiCapture{public int captureApi(int seed){${kind==='celebrity'?'':`${cls} reader=new ${cls}();`}return new Solution().${method}(${args});}}`;}
 else if(language==='python'){prefix=pythonApiPrefix(f);wrapper=`class ProvidedApiCapture:\n    def captureApi(self,seed):\n${kind==='celebrity'?'':`        reader=${cls}()\n`}        return Solution().${method}(${args})\n`;}
 else if(['javascript','typescript'].includes(language)){prefix=jsApiPrefix(f,language==='typescript');const receiver=/\bclass\s+Solution\b/.test(String(userCode))?'new Solution().':'';wrapper=`function captureApi(seed${language==='typescript'?': number':''}){${kind==='celebrity'?'':`const reader=new ${cls}();`}return ${receiver}${method}(${args});}`;}
 else throw Error('Unsupported provided-object API language.');
 const code=language==='java'?String(userCode).replace(/(^|\n)\s*public\s+class\s+Solution\b/,'$1class Solution'):String(userCode),joined=prefix+code+'\n'+wrapper;
 const contract={className:'ProvidedApiCapture',methodName:'captureApi',parameters:[parameter('seed','integer')],returnType:'integer',outputMode:'return',runnerLanguage:language};
 return materializeFunctionInputPlaceholders(generateFunctionRunnerTemplate(language,contract,joined),'seed=1',contract).replace('{{USER_CODE}}',joined);
}
