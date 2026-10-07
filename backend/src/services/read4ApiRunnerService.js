import {parseFunctionTestInput,materializeFunctionInputPlaceholders} from './functionTestInputService.js';
import {generateFunctionRunnerTemplate} from './functionRunnerTemplateService.js';

export const READ4_TITLES=['Read N Characters Given Read4','Read N Characters Given read4 II - Call Multiple Times'];
export const READ4_CONTRACT={className:'Solution',methodName:'read',parameters:[{name:'buf',type:'character[]'},{name:'n',type:'integer'}],returnType:'integer',outputMode:'return'};
export function isRead4Problem(problem){
 const c=problem?.functionContract;
 return READ4_TITLES.includes(problem?.title)&&problem.executionMode==='function'&&c?.kind!=='stateful'&&c.className==='Solution'&&c.methodName==='read'&&c.returnType==='integer'&&c.outputMode!=='parameter'&&c.parameters?.length===2&&c.parameters[0].name==='buf'&&c.parameters[0].type==='character[]'&&c.parameters[1].name==='n'&&c.parameters[1].type==='integer';
}
export function validateRead4Fixture(problem,input){
 if(!isRead4Problem(problem))throw Error('Unsupported read4 provided-API contract.');
 const multi=problem.title===READ4_TITLES[1],key=multi?'queries':'n',parsed=parseFunctionTestInput(input);let file,value;
 if(Object.keys(parsed.named).length){if(Object.keys(parsed.named).length!==2||!Object.hasOwn(parsed.named,'file')||!Object.hasOwn(parsed.named,key))throw Error('read4 input requires exactly file and '+key);file=parsed.named.file;value=parsed.named[key];}
 else{if(parsed.positional.length!==2)throw Error('read4 input requires exactly two environment fields.');[file,value]=parsed.positional;}
 if(typeof file!=='string'||!/^[A-Za-z0-9]{1,500}$/.test(file))throw Error('read4 file must contain 1..500 English letters/digits.');
 const queries=multi?value:[value];if(!Array.isArray(queries)||queries.length<1||queries.length>(multi?10:1)||queries.some(n=>!Number.isInteger(n)||n<1||n>(multi?500:1000)))throw Error('Invalid read4 query limits.');
 let offset=0;const chunks=queries.map(n=>{const part=file.slice(offset,offset+n);offset+=part.length;return part;});
 return{file,queries,multi,chunks,expected:multi?chunks.map(v=>v.length):chunks[0].length};
}
export function acceptsRead4Output(problem,testCase,raw){
 if(!isRead4Problem(problem))return undefined;
 try{const f=validateRead4Fixture(problem,testCase.input);let value;try{value=JSON.parse(String(raw).trim());}catch{return false;}
  return f.multi?Array.isArray(value)&&value.length===f.expected.length&&value.every((n,i)=>Number.isInteger(n)&&n===f.expected[i]):Number.isInteger(value)&&value===f.expected;
 }catch{return false;}
}

export function prepareRead4Source(language,problem,userCode,input){
 const f=validateRead4Fixture(problem,input),file=JSON.stringify(f.file),multi=f.multi;
 const cPrefix=`#include <string.h>\nstatic const char _ppRead4File[]=${file};static int _ppRead4Pointer=0;\nint read4(char* buf4){int k=0;while(k<4&&_ppRead4File[_ppRead4Pointer])buf4[k++]=_ppRead4File[_ppRead4Pointer++];return k;}\n`;
 const cppPrefix=cPrefix+'class Reader4{protected:int read4(char* buf){return ::read4(buf);}};\n';
 const javaPrefix=`class Reader4{private static final String file=${file};private static int pointer=0;protected int read4(char[] buf){int k=0;while(k<4&&pointer<file.length())buf[k++]=file.charAt(pointer++);return k;}}\n`;
 const pyPrefix=`_pp_read4_file=${file}\n_pp_read4_pointer=0\ndef read4(buf4):\n    global _pp_read4_pointer\n    k=0\n    while k<4 and _pp_read4_pointer<len(_pp_read4_file):\n        buf4[k]=_pp_read4_file[_pp_read4_pointer]\n        _pp_read4_pointer+=1\n        k+=1\n    return k\n`;
 const jsPrefix=`const _ppRead4File=${file};let _ppRead4Pointer=0;function read4(buf4${language==='typescript'?': string[]':''})${language==='typescript'?': number':''}{let k=0;while(k<4&&_ppRead4Pointer<_ppRead4File.length)buf4[k++]=_ppRead4File[_ppRead4Pointer++];return k;}\n`;
 const n=multi?'queries[i]':'n',cCall=multi?'_read(reader,buf,queries[i])':'_read(buf,n)';
 const cCheck=`int expected=(int)strlen(_ppRead4File)-offset;if(expected>${n})expected=${n};if(count!=expected||memcmp(buf,_ppRead4File+offset,expected)!=0){fprintf(stderr,"read4 destination buffer/count mismatch");exit(1);}offset+=expected;`;
 const cppCheck=`int expected=std::min(${n},(int)strlen(_ppRead4File)-offset);if(count!=expected||memcmp(buf,_ppRead4File+offset,expected)!=0)throw std::runtime_error("read4 destination buffer/count mismatch");offset+=expected;`;
 const javaCheck=`int expected=Math.min(${n},${file}.length()-offset);if(count!=expected)throw new IllegalStateException("read4 count mismatch");for(int j=0;j<expected;j++)if(buf[j]!=${file}.charAt(offset+j))throw new IllegalStateException("read4 buffer mismatch");offset+=expected;`;
 const pyCheck=`            expected=_pp_read4_file[offset:offset+n]\n            if type(count) is not int or count!=len(expected) or ''.join(buf[:count])!=expected: raise ValueError('read4 destination buffer/count mismatch')\n            offset+=count\n            result.append(count)`;
 const jsCheck=`const expected=_ppRead4File.slice(offset,offset+${n});if(!Number.isInteger(count)||count!==expected.length||buf.slice(0,count).join('')!==expected)throw Error('read4 destination buffer/count mismatch');offset+=count;`;
 let prefix,wrapper;
 if(language==='c'){prefix=cPrefix;wrapper=multi?`int* captureRead4(int* queries,int queriesSize,int* returnSize){Solution* reader=solutionCreate();char buf[1004]={0};int offset=0;int* result=malloc(sizeof(int)*queriesSize);for(int i=0;i<queriesSize;i++){int count=${cCall};${cCheck}result[i]=count;}*returnSize=queriesSize;return result;}`:`int captureRead4(int n){char buf[1004]={0};int offset=0;int count=${cCall};${cCheck}return count;}`;}
 else if(language==='cpp'){prefix=cppPrefix;wrapper=`class Read4Capture{public:${multi?'std::vector<int>':'int'} captureRead4(${multi?'std::vector<int> queries':'int n'}){Solution reader;char buf[1004]={0};int offset=0;${multi?'std::vector<int> result;for(int i=0;i<(int)queries.size();i++){':''}int count=reader.read(buf,${n});${cppCheck}${multi?'result.push_back(count);}return result;':'return count;'}}};`;}
 else if(language==='java'){prefix=javaPrefix;wrapper=`class Read4Capture{public ${multi?'int[]':'int'} captureRead4(${multi?'int[] queries':'int n'}){Solution reader=new Solution();char[] buf=new char[1004];int offset=0;${multi?'int[] result=new int[queries.length];for(int i=0;i<queries.length;i++){':''}int count=reader.read(buf,${n});${javaCheck}${multi?'result[i]=count;}return result;':'return count;'}}}`;}
 else if(language==='python'){prefix=pyPrefix;wrapper=`class Read4Capture:\n    def captureRead4(self, ${multi?'queries':'n'}):\n        reader=Solution()\n        buf=['']*1004\n        offset=0\n        result=[]\n        for n in ${multi?'queries':'[n]'}:\n            count=reader.read(buf,n)\n${pyCheck}\n        return ${multi?'result':'result[0]'}\n`;}
 else if(language==='javascript'||language==='typescript'){prefix=jsPrefix;wrapper=`function captureRead4(${multi?'queries':'n'}${language==='typescript'?(multi?': number[]':': number'):''}){const read=solution(read4);const buf${language==='typescript'?': string[]':''}=Array(1004).fill('');let offset=0;${multi?'const result=[];for(let i=0;i<queries.length;i++){':''}const count=read(buf,${n});${jsCheck}${multi?'result.push(count);}return result;':'return count;'}}`;}
 else throw Error('Unsupported read4 language.');
 const code=language==='java'?String(userCode).replace(/(^|\n)\s*public\s+class\s+Solution\b/,'$1class Solution'):String(userCode);
 const joined=prefix+code+'\n'+wrapper;
 const contract={className:'Read4Capture',methodName:'captureRead4',parameters:[{name:multi?'queries':'n',type:multi?'integer[]':'integer'}],returnType:multi?'integer[]':'integer',outputMode:'return',runnerLanguage:language};
 const template=generateFunctionRunnerTemplate(language,contract,joined);
 return materializeFunctionInputPlaceholders(template,(multi?'queries=':'n=')+JSON.stringify(multi?f.queries:f.queries[0]),contract).replace('{{USER_CODE}}',joined);
}
