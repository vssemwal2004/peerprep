import { generateFunctionRunnerTemplate } from './functionRunnerTemplateService.js';

export const INT64_MIN=-BigInt('9223372036854775808'),INT64_MAX=BigInt('9223372036854775807');
// Parse decimal digits before any floating-point conversion. Decimal/exponent
// notation is accepted only when it denotes an exact signed 64-bit integer.
export function parseExactDecimalInt64(raw) {
 if(typeof raw!=='string')throw Error('Exact integers require original decimal text.');
 const match=raw.trim().match(/^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
 if(!match)throw Error('Expected an exact decimal integer.');
 const digits=(match[2]+(match[3]||'')).replace(/^0+/,'');if(!digits)return BigInt(0);
 const exponent=BigInt(match[4]||'0');if(exponent>BigInt(64)||exponent<-BigInt(64))throw Error('Integer exponent is outside the supported range.');
 const scale=Number(exponent)-(match[3]?.length||0);let integerDigits;
 if(scale>=0){if(digits.length+scale>19)throw Error('Integer exceeds signed64-bit range.');integerDigits=digits+'0'.repeat(scale);}
 else{const suffix=-scale;if(suffix>=digits.length||!digits.endsWith('0'.repeat(suffix)))throw Error('Value has a noninteger fractional part.');integerDigits=digits.slice(0,-suffix);}
 if(integerDigits.length>19)throw Error('Integer exceeds signed64-bit range.');
 const result=BigInt((match[1]==='-'?'-':'')+integerDigits);if(result<INT64_MIN||result>INT64_MAX)throw Error('Integer exceeds signed64-bit range.');return result;
}
export function isExactScalarLongProblem(problem){const c=problem?.functionContract;return problem?.title==='Smallest Number With Given Digit Product'&&problem.executionMode==='function'&&c?.kind!=='stateful'&&c.className==='Solution'&&c.methodName==='smallestNumber'&&c.returnType==='string'&&c.outputMode!=='parameter'&&c.parameters?.length===1&&c.parameters[0].name==='n'&&c.parameters[0].type==='long';}
export function validateExactScalarLongFixture(problem,input){
 if(!isExactScalarLongProblem(problem))throw Error('Unsupported exact scalar-long profile.');
 if(typeof input!=='string')throw Error('Exact scalar-long fixtures require original input text.');
 const source=input.trim(),match=source.match(/^(?:n\s*=\s*)?([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/);
 if(!match)throw Error('Exact scalar-long input requires only the numeric n argument.');
 const value=parseExactDecimalInt64(match[1]);if(value<BigInt(1)||value>BigInt('1000000000000000000'))throw Error('Digit-product input must lie between1 and1e18.');return{value,decimal:String(value),safe:value<=BigInt(Number.MAX_SAFE_INTEGER)};
}
export function prepareExactScalarLongSource(language,problem,userCode,input){
 const {value,decimal,safe}=validateExactScalarLongFixture(problem,input),contract={...problem.functionContract,runnerLanguage:language};
 let code=language==='java'?String(userCode).replace(/(^|\n)\s*public\s+class\s+Solution\b/,'$1class Solution'):String(userCode);
 // Preserve the same imported legacy-adapter separation as the ordinary
 // function adapter: its old stdin main must not run inside a private wrapper.
 if(language==='python'){
  const marker='# PeerPrep generated function adapter. Keep this section unchanged.',index=code.indexOf(marker);
  if(index>=0&&/^class\s+Solution\s*:/m.test(code.slice(0,index)))code=code.slice(0,index).trimEnd();
 }
 let template=generateFunctionRunnerTemplate(language,contract,code);
 if(!template)throw Error('The exact scalar-long source requires a supported function signature.');
 if(!['python','c','cpp','java','javascript','typescript'].includes(language))throw Error('Unsupported exact scalar-long language.');
 const integerLiteral=value===INT64_MIN?'(-9223372036854775807LL-1LL)':decimal+'LL';
 if(['javascript','typescript'].includes(language)){
  const anchor='JSON.parse({{ARGUMENTS_JSON_STRING}})';if(template.split(anchor).length!==2)throw Error('Unrecognized private JavaScript argument parser.');
  template=template.replace(anchor,safe?'['+decimal+']':'[BigInt('+JSON.stringify(decimal)+')]');
 }
 template=template.replaceAll('{{ARGUMENTS_JSON_STRING}}',JSON.stringify('['+decimal+']')).replaceAll('{{ARGUMENTS_JSON}}','['+decimal+']')
  .replaceAll('{{ARG_0}}',language==='java'?'Long.valueOf('+JSON.stringify(decimal)+')':integerLiteral);
 if(/\{\{(?:ARG_|ARGUMENTS_JSON|TEST_INPUT_)/.test(template))throw Error('Unexpected exact scalar-long input placeholder.');
 return template.replace('{{USER_CODE}}',code);
}
function exactScalarString(raw){const text=String(raw??'').trim();if(text.startsWith('"')){const parsed=JSON.parse(text);if(typeof parsed!=='string')throw Error('Not a scalar string.');return parsed;}return text;}
export function acceptsExactScalarLongOutput(problem,testCase,output){
 if(problem?.executionMode!=='function'||problem.functionContract?.kind==='stateful')return null;
 if(isExactScalarLongProblem(problem)){try{return exactScalarString(output)===exactScalarString(testCase.output);}catch{return false;}}
 const type=problem?.functionContract?.returnType;if(!['integer','long'].includes(type)||problem.functionContract.outputMode==='parameter')return null;
 let expected,actual;
 try{expected=parseExactDecimalInt64(testCase.output);}catch{return typeof testCase.output==='string'&&/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(testCase.output.trim())?false:null;}
 try{actual=parseExactDecimalInt64(output);}catch{return expected>BigInt(Number.MAX_SAFE_INTEGER)||expected<-BigInt(Number.MAX_SAFE_INTEGER)?false:null;}
 if(expected<=BigInt(Number.MAX_SAFE_INTEGER)&&expected>=-BigInt(Number.MAX_SAFE_INTEGER)&&actual<=BigInt(Number.MAX_SAFE_INTEGER)&&actual>=-BigInt(Number.MAX_SAFE_INTEGER))return null;
 if(type==='integer')return false;
 return actual===expected;
}
