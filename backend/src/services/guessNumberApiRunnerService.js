import { parseFunctionTestInput, materializeFunctionInputPlaceholders } from './functionTestInputService.js';
import { generateFunctionRunnerTemplate } from './functionRunnerTemplateService.js';

export function isGuessNumberProblem(problem) {
  const contract=problem?.functionContract;
  return problem?.title==='Guess Number Higher or Lower' && problem.executionMode==='function'
    && contract?.kind!=='stateful' && contract?.className==='Solution'
    && contract.methodName==='guessNumber' && contract.returnType==='integer'
    && contract.outputMode!=='parameter' && contract.parameters?.length===1
    && contract.parameters[0].name==='n' && contract.parameters[0].type==='integer';
}
export function validateGuessNumberFixture(problem,input) {
  if(!isGuessNumberProblem(problem))throw Error('Unsupported Guess Number contract.');
  const parsed=parseFunctionTestInput(input);
  let n,pick;
  if(Object.keys(parsed.named).length){
    if(Object.keys(parsed.named).length!==2||!Object.hasOwn(parsed.named,'n')||!Object.hasOwn(parsed.named,'pick'))throw Error('Guess Number input requires exactly n and pick.');
    ({n,pick}=parsed.named);
  }else{
    if(parsed.positional.length!==2)throw Error('Guess Number input requires exactly n and pick.');
    [n,pick]=parsed.positional;
  }
  if(!Number.isInteger(n)||n<1||n>2147483647||!Number.isInteger(pick)||pick<1||pick>n)throw Error('Guess Number bounds require 1 <= pick <= n <= 2147483647.');
  return{n,pick};
}
export function prepareGuessNumberSource(language,problem,userCode,input) {
  const {n,pick}=validateGuessNumberFixture(problem,input);
  const prefix={
    c:`int guess(int num){return num>${pick}?-1:num<${pick}?1:0;}\n`,
    cpp:`int guess(int num){return num>${pick}?-1:num<${pick}?1:0;}\n`,
    java:`class GuessGame{protected int guess(int num){return num>${pick}?-1:num<${pick}?1:0;}}\n`,
    python:`def guess(num):\n    return -1 if num > ${pick} else 1 if num < ${pick} else 0\n`,
    javascript:`function guess(num){return num>${pick}?-1:num<${pick}?1:0;}\n`,
    typescript:`function guess(num:number):number{return num>${pick}?-1:num<${pick}?1:0;}\n`,
  }[language];
  if(!prefix)throw Error('Unsupported Guess Number language.');
  const contract={...problem.functionContract,runnerLanguage:language};
  const code=language==='java'?String(userCode).replace(/(^|\n)\s*public\s+class\s+Solution\b/,'$1class Solution'):String(userCode);
  const template=generateFunctionRunnerTemplate(language,contract,code);
  return materializeFunctionInputPlaceholders(template,'n='+n,contract).replace('{{USER_CODE}}',prefix+code);
}
