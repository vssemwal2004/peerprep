export function judge0OutputFileSizeKb(problem){
  const contract=problem?.functionContract;
  const specialGrid=problem?.executionMode==='function'&&problem?.category==='DSA'
    &&problem?.title==='Fill a Special Grid'&&contract?.className==='Solution'
    &&contract?.kind!=='stateful'&&contract?.methodName==='specialGrid'
    &&contract?.returnType==='integer[][]'&&contract?.outputMode==='return'
    &&contract?.parameters?.length===1&&contract.parameters[0].name==='n'
    &&contract.parameters[0].type==='integer';
  const strobogrammatic=problem?.executionMode==='function'&&problem?.category==='DSA'
    &&problem?.title==='Strobogrammatic Number II'&&contract?.className==='Solution'
    &&contract?.methodName==='findStrobogrammatic'&&contract?.returnType==='string[]'
    &&contract?.outputMode==='return'&&contract?.parameters?.length===1
    &&contract.parameters[0].name==='n'&&contract.parameters[0].type==='integer';
  // Legal n=14 produces 62,500 fourteen-digit strings: compact JSON alone is
  // 1,062,501 bytes, before printer whitespace. Preserve the complete output.
  // Legal n=10 returns 1,048,576 cells: compact JSON is 7,279,547 bytes.
  // Preserve the entire result, including standard printer separators.
  return specialGrid?16384:strobogrammatic?4096:1024;
}
export function normalizeJudge0FileSizeKb(value){
  const number=Number(value);
  return Number.isFinite(number)?Math.trunc(Math.max(1024,Math.min(16384,number))):1024;
}
// This applies only to trusted persisted question oracles. User-provided run
// expectations keep their existing 64 KiB bound in the compiler workflow.
export function trustedExpectedOutputLimitBytes(problem){
  // Source polynomial1634: at most20000 exact signed integer terms.
  const polynomialContract=problem?.functionContract;
  if(String(problem?._id||problem?.id||'')==='6ac280a519051acf30c4b1d7'&&problem?.title==='Add Two Polynomials Represented as Linked Lists'&&problem.category==='DSA'&&problem.executionMode==='function'&&polynomialContract?.className==='Solution'&&polynomialContract.kind!=='stateful'&&polynomialContract.methodName==='addPoly'&&polynomialContract.returnType==='poly-node'&&polynomialContract.outputMode==='return'&&JSON.stringify(polynomialContract.parameters?.map(x=>[x.name,x.type]))===JSON.stringify([['poly1','poly-node'],['poly2','poly-node']]))return 1024*1024;

  // Complete source forest894: all4862 n19 shapes print668746 bytes.
  const forestContract=problem?.functionContract;
  if(String(problem?._id||problem?.id||'')==='6ac2807719051acf30c4a7ba'
    &&problem?.title==='All Possible Full Binary Trees'&&problem.category==='DSA'
    &&problem.executionMode==='function'&&forestContract?.className==='Solution'
    &&forestContract.kind!=='stateful'&&forestContract.methodName==='allPossibleFBT'
    &&forestContract.returnType==='tree-node[]'&&forestContract.outputMode==='return'
    &&forestContract.parameters?.length===1&&forestContract.parameters[0].name==='n'
    &&forestContract.parameters[0].type==='integer')return 1024*1024;

  const kb=judge0OutputFileSizeKb(problem);
  const contract=problem?.functionContract;
  const completeBinaryCycle=problem?.executionMode==='function'&&problem?.category==='DSA'
    &&contract?.kind!=='stateful'&&contract?.className==='Solution'
    &&contract?.returnType==='integer[]'&&contract?.outputMode==='return'
    &&((problem.title==='Gray Code'&&contract.methodName==='grayCode'
      &&contract.parameters?.length===1&&contract.parameters[0].name==='n'
      &&contract.parameters[0].type==='integer')
      ||(problem.title==='Circular Permutation in Binary Representation'
        &&contract.methodName==='circularPermutation'&&contract.parameters?.length===2
        &&contract.parameters[0].name==='n'&&contract.parameters[0].type==='integer'
        &&contract.parameters[1].name==='start'&&contract.parameters[1].type==='integer'));
  // Source n<=16 requires all 65,536 integers (382,107 compact JSON bytes).
  // The ordinary 1 MiB Judge output allowance already covers these results.
  // Only persisted oracles use this allowance; learner expectations stay 64 KiB.
  if(completeBinaryCycle)return 1024*1024;
  return kb>1024?kb*1024:64*1024;
}
export function stageOutputFileBudgetService(source){
  if(source.includes("from './outputFileBudgetService.js'"))return source;
  const importAnchor="import { HttpError } from '../utils/errors.js';";
  const sizeAnchor='      max_file_size: 1024,';
  const optionsAnchor='export function buildJudge0Options(problem) {\n  return {';
  for(const anchor of [importAnchor,sizeAnchor,optionsAnchor])if(source.split(anchor).length!==2)throw Error('Unknown output file budget adoption anchor');
  return source.replace(importAnchor,importAnchor+"\nimport { judge0OutputFileSizeKb, normalizeJudge0FileSizeKb } from './outputFileBudgetService.js';")
    .replace(sizeAnchor,'      max_file_size: normalizeJudge0FileSizeKb(options.maxFileSizeKb),')
    .replace(optionsAnchor,optionsAnchor+'\n    maxFileSizeKb: judge0OutputFileSizeKb(problem),');
}
