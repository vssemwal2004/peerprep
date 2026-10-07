import{buildFunctionInputPayload,parseFunctionTestInput}from'./functionTestInputService.js';
const nodeTypes=new Set(['tree-node[]','list-node[]']);
function normalizeType(type){const text=String(type||'').trim().replace(/^(['"])(.*)\1$/,'$2').replace(/\s+/g,'');const list=text.match(/^(?:List|list|Array|Sequence)\[(.*)]$/);if(list)return normalizeType(list[1])+'[]';if(text.endsWith('[]'))return normalizeType(text.slice(0,-2))+'[]';if(/^Optional\[.*]$/.test(text))return normalizeType(text.slice(9,-1));return({treenode:'tree-node','tree-node':'tree-node',listnode:'list-node','list-node':'list-node'})[text.toLowerCase()]||text;}
export function normalizeNodeCollectionContract(contract){if(!contract||contract.kind==='stateful')return contract;const parameters=(contract.parameters||[]).map(parameter=>({...parameter,type:nodeTypes.has(normalizeType(parameter.type))?normalizeType(parameter.type):parameter.type})),normalized=normalizeType(contract.returnType),returnType=nodeTypes.has(normalized)?normalized:contract.returnType;return parameters.every((parameter,index)=>parameter.type===contract.parameters[index].type)&&returnType===contract.returnType?contract:{...contract,parameters,returnType};}
export function hasNodeCollectionContract(contract){return nodeTypes.has(contract?.returnType)||(contract?.parameters||[]).some(parameter=>nodeTypes.has(parameter.type));}
function validateNodeValues(values,type){
 if(!Array.isArray(values))throw new Error('Each node collection entry requires its serialized value array; empty nodes use []');
 const tree=type==='tree-node[]',integer=value=>Number.isSafeInteger(value)&&value>=-2147483648&&value<=2147483647;
 if(values.some(value=>!(tree&&value===null)&&(!integer(value)||(tree&&value===-2147483648))))throw new Error('Invalid integer node value or unsupported C tree null-sentinel value');
 if(!tree||!values.length)return;
 if(values[0]===null)throw new Error('Empty trees use [], rather than a null root with descendants');
 let available=1,cursor=1;while(available&&cursor<values.length){available--;for(let child=0;child<2&&cursor<values.length;child++)if(values[cursor++]!==null)available++;}
 if(values.slice(cursor).some(value=>value!==null))throw new Error('Unreachable serialized tree nodes');
}
export function validateNodeCollectionFixture(contract,input,expectedOutput){
 if(!hasNodeCollectionContract(contract))return;
 const{args}=buildFunctionInputPayload(input,contract);
 for(const[index,parameter]of(contract.parameters||[]).entries())if(nodeTypes.has(parameter.type)){
  if(!Array.isArray(args[index]))throw new Error('Node collection arguments require arrays');
  for(const value of args[index])validateNodeValues(value,parameter.type);
 }
 const outputType=contract.outputMode==='parameter'?contract.parameters[contract.outputParameterIndex]?.type:contract.returnType;
 if(expectedOutput!==undefined&&nodeTypes.has(outputType)){
  const parsed=parseFunctionTestInput(String(expectedOutput));if(parsed.named.size||parsed.positional.length!==1||!Array.isArray(parsed.positional[0]))throw new Error('Node collection output requires one array of serialized nodes');
  for(const value of parsed.positional[0])validateNodeValues(value,outputType);
 }
}
