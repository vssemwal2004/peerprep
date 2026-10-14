import { parseFunctionTestInput, materializeFunctionInputPlaceholders } from './functionTestInputService.js';
import { generateFunctionRunnerTemplate } from './functionRunnerTemplateService.js';

export function isFirstBadVersionProblem(problem) {
  const c=problem?.functionContract;
  return problem?.title==='First Bad Version' && problem.executionMode==='function' && c?.kind!=='stateful'
    && c.className==='Solution' && c.methodName==='firstBadVersion' && c.returnType==='integer'
    && c.outputMode!=='parameter' && c.parameters?.length===1 && c.parameters[0].name==='n' && c.parameters[0].type==='integer';
}

export function validateFirstBadVersionFixture(problem,input) {
  if(!isFirstBadVersionProblem(problem))throw Error('Unsupported First Bad Version contract.');
  const {named,positional}=parseFunctionTestInput(input);let n,bad;
  if(Object.keys(named).length){if(Object.keys(named).length!==2||!Object.hasOwn(named,'n')||!Object.hasOwn(named,'bad'))throw Error('First Bad Version input requires exactly n and bad.');({n,bad}=named);}
  else {if(positional.length!==2)throw Error('First Bad Version input requires exactly n and bad.');[n,bad]=positional;}
  if(!Number.isInteger(n)||n<1||n>2147483647||!Number.isInteger(bad)||bad<1||bad>n)throw Error('First Bad Version requires 1 <= bad <= n <= 2^31 - 1.');
  return {n,bad};
}

export function prepareFirstBadVersionSource(language,problem,userCode,input) {
  const {n,bad}=validateFirstBadVersionFixture(problem,input);
  const prefix={
    c:`#include <stdbool.h>\nbool isBadVersion(int version){return version>=${bad};}\n`,
    cpp:`bool isBadVersion(int version){return version>=${bad};}\n`,
    java:`class VersionControl{protected boolean isBadVersion(int version){return version>=${bad};}}\n`,
    python:`def isBadVersion(version):\n    return version >= ${bad}\n`,
    javascript:`function isBadVersion(version){return version>=${bad};}\n`,
    typescript:`function isBadVersion(version:number):boolean{return version>=${bad};}\n`,
  }[language];
  if(!prefix)throw Error('Unsupported First Bad Version language.');
  const contract={...problem.functionContract,runnerLanguage:language};
  const code=language==='java'?String(userCode).replace(/(^|\n)\s*public\s+class\s+Solution\b/,'$1class Solution'):String(userCode);
  const template=generateFunctionRunnerTemplate(language,contract,code);
  return materializeFunctionInputPlaceholders(template,'n='+n,contract).replace('{{USER_CODE}}',prefix+code);
}
