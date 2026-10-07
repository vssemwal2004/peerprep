import {parseFunctionTestInput} from './functionTestInputService.js';
// Exact original contracts: these methods return a collection with no element order.
// Concatenated Words specifies all qualifying words without an ordering rule;
// authoritative local sources enumerate input order and length order respectively.
const profiles=new Map([
 ['Concatenated Words',['findAllConcatenatedWordsInADict','string[]']],
 ['Find All Possible Recipes from Given Supplies',['findAllRecipes','string[]']],
 ['Find All People With Secret',['findAllPeople','integer[]']],
 ['Substring with Concatenation of All Words',['findSubstring','integer[]']],
 ['Top K Frequent Elements',['topKFrequent','integer[]']],
]);
const parse=raw=>{try{const values=parseFunctionTestInput(String(raw).trim()).positional;return values.length===1&&Array.isArray(values[0])?values[0]:null;}catch{return null;}};
export function acceptsSourceScopedUnorderedOutput(problem,actualText,expectedText){
 const contract=problem?.functionContract;if(contract?.kind==='stateful')return null;
 const profile=profiles.get(problem?.title);
 if(problem?.title==='Top K Frequent Words'&&contract?.methodName==='topKFrequent'&&contract?.returnType==='string[]'){
  const actual=parse(actualText),expected=parse(expectedText);return Array.isArray(actual)&&Array.isArray(expected)&&actual.every(value=>typeof value==='string')&&expected.every(value=>typeof value==='string')&&JSON.stringify(actual)===JSON.stringify(expected);
 }
 if(!profile||contract?.methodName!==profile[0]||contract?.returnType!==profile[1])return null;
 const actual=parse(actualText),expected=parse(expectedText),valid=profile[1]==='string[]'?value=>typeof value==='string':Number.isSafeInteger;
 if(!Array.isArray(actual)||!Array.isArray(expected)||!actual.every(valid)||!expected.every(valid)||actual.length!==expected.length)return false;
 const counts=new Map();for(const value of expected)counts.set(value,(counts.get(value)||0)+1);
 for(const value of actual){const left=counts.get(value)||0;if(!left)return false;counts.set(value,left-1);}return true;
}
