import {validateStatefulFixture} from './statefulRunnerService.js';
import {finishProvidedCapture,withoutDefinitionComments} from './remainingProvidedCaptureService.js';
import {parseNodeResultEnvelope} from './customNodeResultEnvelopeService.js';

const ID='6ace186e6ca3216598beea0a';
const TITLE='Dot Product of Two Sparse Vectors';

export function sparseVectorRule(problem){
 const c=problem?.functionContract,op=c?.operations?.[0];
 return String(problem?._id||'')===ID&&problem?.title===TITLE&&problem?.executionMode==='function'&&c?.kind==='stateful'&&c?.className==='SparseVector'&&c?.constructorParameters?.length===1&&c.constructorParameters[0]?.name==='nums'&&c.constructorParameters[0]?.type==='integer[]'&&c.operations?.length===1&&op?.methodName==='dotProduct'&&op?.parameters?.length===1&&op.parameters[0]?.name==='vec'&&op.parameters[0]?.type==='integer[]'&&op?.returnType==='integer';
}

function dot(a,b){let result=0;for(let i=0;i<a.length;i++)result+=a[i]*b[i];return result;}
export function validateSparseVectorFixture(problem,input){
 if(!sparseVectorRule(problem))throw Error('Unsupported SparseVector contract.');
 const state=validateStatefulFixture(problem.functionContract,input),first=state.calls[0];
 if(!first?.constructor||state.calls.slice(1).some(call=>call.constructor||call.methodName!=='dotProduct'))throw Error('Expected one SparseVector constructor followed only by dotProduct operations.');
 if(state.calls.length<2||state.calls.length>101)throw Error('Expected 1..100 dotProduct calls.');
 const nums=first.args[0];
 if(nums.length<1||nums.length>100000)throw Error('Vector length must be in [1, 100000].');
 if(nums.some(value=>value<0||value>100))throw Error('Vector values must be in [0, 100].');
 const vectors=state.calls.slice(1).map(call=>call.args[0]);
 if(vectors.some(vec=>vec.length!==nums.length))throw Error('Both vectors must have equal length.');
 if(vectors.some(vec=>vec.some(value=>value<0||value>100)))throw Error('Vector values must be in [0, 100].');
 return{nums,vectors,expected:[null,...vectors.map(vec=>dot(nums,vec))]};
}

export function validateSparseVectorOracle(problem,testCase){try{return JSON.stringify(JSON.parse(String(testCase.output).trim()))===JSON.stringify(validateSparseVectorFixture(problem,testCase.input).expected);}catch{return false;}}
export function acceptsSparseVectorOutput(problem,testCase,raw){if(!sparseVectorRule(problem))return undefined;try{const envelope=parseNodeResultEnvelope(raw);return!!envelope&&JSON.stringify(envelope.value)===JSON.stringify(validateSparseVectorFixture(problem,testCase.input).expected);}catch{return false;}}

const json=value=>JSON.stringify(value);
function native(language,f){
 const cpp=language==='cpp',A=f.nums,E=f.expected.slice(1),arrays=f.vectors.map((v,i)=>`${cpp?'vector<int>':`int`} b${i}${cpp?'':`[${v.length}]`}=${cpp?`{${v}}`:`{${v}}`};`).join('');
 if(cpp){
  const checks=f.vectors.map((_,i)=>`{SparseVector other(b${i});for(int&x:b${i})x=101;if(base.dotProduct(other)!=${E[i]}||base.dotProduct(other)!=${E[i]}||other.dotProduct(base)!=${E[i]})return false;}`).join('');
  return{prefix:'',wrapper:`class SparseVectorCapture{public:bool captureNode(int seed){vector<int>a={${A}};SparseVector base(a);for(int&x:a)x=101;${arrays}${checks}return true;}};`};
 }
 const checks=f.vectors.map((v,i)=>`{SparseVector*other=sparseVectorCreate(b${i},${v.length});for(int j=0;j<${v.length};j++)b${i}[j]=101;if(sparseVectordotProduct(base,other)!=${E[i]}||sparseVectordotProduct(base,other)!=${E[i]}||sparseVectordotProduct(other,base)!=${E[i]})return false;}`).join('');
 return{prefix:'',wrapper:`bool captureNode(int seed){int a[${A.length}]={${A}};SparseVector*base=sparseVectorCreate(a,${A.length});if(!base)return false;for(int i=0;i<${A.length};i++)a[i]=101;${arrays}${checks}return true;}`};
}
function managed(language,f){
 const A=json(f.nums),B=f.vectors.map(json),E=f.expected.slice(1);
 if(language==='python')return{prefix:'',wrapper:`class SparseVectorCapture:\n    def captureNode(self,seed):\n        a=${A};base=SparseVector(a);a[:]=[101]*len(a)\n        vectors=${json(f.vectors)};expected=${json(E)}\n        for values,want in zip(vectors,expected):\n            b=list(values);other=SparseVector(b);b[:]=[101]*len(b)\n            if base.dotProduct(other)!=want or base.dotProduct(other)!=want or other.dotProduct(base)!=want:return False\n        return True\n`};
 if(language==='java'){const checks=B.map((b,i)=>`{int[]v=${javaArray(f.vectors[i])};SparseVector other=new SparseVector(v);java.util.Arrays.fill(v,101);if(base.dotProduct(other)!=${E[i]}||base.dotProduct(other)!=${E[i]}||other.dotProduct(base)!=${E[i]})return false;}`).join('');return{prefix:'',wrapper:`class SparseVectorCapture{public boolean captureNode(int seed){int[]a=${javaArray(f.nums)};SparseVector base=new SparseVector(a);java.util.Arrays.fill(a,101);${checks}return true;}}`};}
 const ts=language==='typescript',checks=B.map((b,i)=>`{const v${ts?':number[]':''}=${b};const other=new SparseVector(v);v.fill(101);if(base.dotProduct(other)!==${E[i]}||base.dotProduct(other)!==${E[i]}||other.dotProduct(base)!==${E[i]})return false;}`).join('');
 return{prefix:'',wrapper:`function captureNode(seed${ts?':number':''})${ts?':boolean':''}{const a${ts?':number[]':''}=${A};const base=new SparseVector(a);a.fill(101);${checks}return true;}`};
}
const javaArray=values=>`new int[]{${values.join(',')}}`;
export function prepareSparseVectorSource(language,problem,userCode,input){
 const fixture=validateSparseVectorFixture(problem,input),source=withoutDefinitionComments(userCode),parts=language==='c'||language==='cpp'?native(language,fixture):managed(language,fixture);
 return finishProvidedCapture(language,source,parts.prefix,parts.wrapper,'SparseVectorCapture',fixture.expected);
}
