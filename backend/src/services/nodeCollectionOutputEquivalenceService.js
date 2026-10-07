import{parseFunctionTestInput}from'./functionTestInputService.js';
import{validateNodeCollectionFixture,normalizeNodeCollectionContract}from'./nodeCollectionContractService.js';
const unorderedForests={delNodes:'Delete Nodes And Return Forest',generateTrees:'Unique Binary Search Trees II',allPossibleFBT:'All Possible Full Binary Trees',findDuplicateSubtrees:'Find Duplicate Subtrees'};
export function acceptsEquivalentNodeCollectionOutput(problem,testCase,actualOutput){
 const contract=normalizeNodeCollectionContract(problem?.functionContract)||{},outputType=contract.outputMode==='parameter'?contract.parameters?.[contract.outputParameterIndex]?.type:contract.returnType;
 if(!['tree-node[]','list-node[]'].includes(outputType))return null;
 try{
  validateNodeCollectionFixture(contract,testCase.input,testCase.output);validateNodeCollectionFixture(contract,testCase.input,actualOutput);
  const normalized=text=>parseFunctionTestInput(String(text)).positional[0].map(values=>{const result=values.slice();if(outputType==='tree-node[]')while(result.at(-1)===null)result.pop();return result;});
  let actual=normalized(actualOutput),expected=normalized(testCase.output);
  if(outputType==='tree-node[]'&&unorderedForests[contract.methodName]===problem.title){actual=actual.map(JSON.stringify).sort();expected=expected.map(JSON.stringify).sort();}
  return JSON.stringify(actual)===JSON.stringify(expected);
 }catch{return false;}
}
