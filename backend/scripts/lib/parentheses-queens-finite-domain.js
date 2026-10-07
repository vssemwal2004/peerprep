import {buildFunctionInputPayload,parseFunctionTestInput} from '../../src/services/functionTestInputService.js';
const specs={generateParenthesis:{title:'Generate Parentheses',type:'string[]',upper:8},solveNQueens:{title:'N-Queens',type:'string[][]',upper:9}};
export function hasExhaustiveParenthesesQueensDomain(problem){
 const c=problem?.functionContract,s=specs[c?.methodName];
 if(!s||problem.executionMode!=='function'||problem.title!==s.title||c.kind==='stateful'||c.className!=='Solution'||c.returnType!==s.type||c.outputMode==='parameter'||c.parameters?.length!==1||c.parameters[0].name!=='n'||c.parameters[0].type!=='integer')return false;
 const seen=new Set();
 try{for(const tc of[...(problem.sampleTestCases||[]),...(problem.hiddenTestCases||[])]){const parsed=parseFunctionTestInput(tc.input),keys=Object.keys(parsed.named);if(keys.length?keys.length!==1||keys[0]!=='n':parsed.positional.length!==1)return false;const[n]=buildFunctionInputPayload(tc.input,c).args;if(!Number.isInteger(n)||n<1||n>s.upper||seen.has(n))return false;seen.add(n);}}catch{return false;}
 return seen.size===s.upper;
}
export function stageParenthesesQueensFiniteDomain(source){
 if(source.includes("from '../parentheses-queens-finite-domain.js'"))return source;
 const anchor='export function hasExhaustiveFiniteDomain(candidate) {';
 if(source.split(anchor).length!==2)throw Error('Unknown finite-domain preflight anchor');
 return "import {hasExhaustiveParenthesesQueensDomain} from '../parentheses-queens-finite-domain.js';\n"+source.replace(anchor,anchor+'\n  if (hasExhaustiveParenthesesQueensDomain(candidate)) return true;');
}
