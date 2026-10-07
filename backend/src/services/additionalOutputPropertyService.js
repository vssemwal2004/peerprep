// Staged validators: expected answers follow the input contract, never a
// stored reference's choice of one valid answer. Root adopts at a pass boundary.
import { parseFunctionTestInput } from './functionTestInputService.js';

const integers=values=>Array.isArray(values)&&values.every(Number.isSafeInteger);
const nonnegative=value=>Number.isSafeInteger(value)&&value>=0;
function parseOutput(text){try{const parsed=parseFunctionTestInput(String(text).trim());return parsed.positional.length===1?parsed.positional[0]:undefined;}catch{return undefined;}}
function counts(values){const result=new Map();for(const value of values)result.set(value,(result.get(value)||0)+1);return result;}
function sameMultiset(left,right){if(left.length!==right.length)return false;const frequencies=counts(left);for(const value of right){const count=frequencies.get(value)||0;if(!count)return false;frequencies.set(value,count-1);}return true;}
function outputString(text){const raw=String(text).trim();if(/^['"]/.test(raw)){const parsed=parseOutput(raw);return typeof parsed==='string'?parsed:undefined;}return raw;}

export function validGroupThePeople(args,output){
 const [sizes]=args,groups=parseOutput(output);if(!integers(sizes)||!sizes.every(size=>size>0)||!Array.isArray(groups))return false;
 const seen=new Set();
 for(const group of groups){if(!integers(group)||!group.length)return false;for(const index of group){if(index<0||index>=sizes.length||seen.has(index)||sizes[index]!==group.length)return false;seen.add(index);}}
 return seen.size===sizes.length;
}
export function validRearrangeBarcodes(args,output){
 const [input]=args,actual=parseOutput(output);return integers(input)&&integers(actual)&&sameMultiset(input,actual)&&actual.every((value,index)=>index===0||value!==actual[index-1]);
}
export function validPancakeSort(args,output){
 const [input]=args,flips=parseOutput(output);if(!integers(input)||!integers(flips)||flips.length>10*input.length||flips.some(length=>length<1||length>input.length))return false;
 const values=input.slice();for(const length of flips)for(let left=0,right=length-1;left<right;left++,right--)[values[left],values[right]]=[values[right],values[left]];
 return values.every((value,index)=>index===0||value>=values[index-1]);
}
export function validRestoreArray(args,output){
 const [pairs]=args,actual=parseOutput(output);if(!Array.isArray(pairs)||!pairs.length||pairs.some(pair=>!integers(pair)||pair.length!==2||pair[0]===pair[1])||!integers(actual))return false;
 const key=(a,b)=>a<b?`${a},${b}`:`${b},${a}`,edges=new Set(pairs.map(([a,b])=>key(a,b))),vertices=new Set(pairs.flat());
 if(edges.size!==pairs.length||actual.length!==vertices.size||actual.length!==pairs.length+1||new Set(actual).size!==actual.length||actual.some(value=>!vertices.has(value)))return false;
 return actual.slice(1).every((value,index)=>edges.delete(key(actual[index],value)))&&edges.size===0;
}
export function validReconstructMatrix(args,output){
 const [upper,lower,columns]=args,actual=parseOutput(output);if(!nonnegative(upper)||!nonnegative(lower)||!integers(columns)||columns.some(value=>value<0||value>2)||!Array.isArray(actual))return false;
 const twos=columns.filter(value=>value===2).length,ones=columns.filter(value=>value===1).length;
 const possible=upper>=twos&&lower>=twos&&upper+lower===2*twos+ones&&upper-twos<=ones&&lower-twos<=ones;
 if(actual.length===0)return !possible;
 return possible&&actual.length===2&&actual.every(row=>integers(row)&&row.length===columns.length&&row.every(value=>value===0||value===1))
  &&actual[0].reduce((sum,value)=>sum+value,0)===upper&&actual[1].reduce((sum,value)=>sum+value,0)===lower
  &&columns.every((sum,index)=>actual[0][index]+actual[1][index]===sum);
}
export function validMissingRolls(args,output){
 const [rolls,mean,n]=args,actual=parseOutput(output);if(!integers(rolls)||rolls.some(value=>value<1||value>6)||!Number.isSafeInteger(mean)||mean<1||mean>6||!Number.isSafeInteger(n)||n<1||!integers(actual))return false;
 const required=BigInt(mean)*(BigInt(rolls.length)+BigInt(n))-rolls.reduce((sum,value)=>sum+BigInt(value),0n),possible=required>=BigInt(n)&&required<=6n*BigInt(n);
 if(!actual.length)return !possible;
 return possible&&actual.length===n&&actual.every(value=>value>=1&&value<=6)&&actual.reduce((sum,value)=>sum+BigInt(value),0n)===required;
}
export function validFindMatrix(args,output){
 const [input]=args,rows=parseOutput(output);if(!integers(input)||!Array.isArray(rows)||rows.some(row=>!integers(row)||!row.length||new Set(row).size!==row.length))return false;
 const optimum=input.length?Math.max(...counts(input).values()):0;
 return rows.length===optimum&&sameMultiset(input,rows.flat());
}
export function validMinRemoveToMakeValid(args,output){
 const [input]=args,actual=outputString(output);if(typeof input!=='string'||typeof actual!=='string')return false;
 let depth=0,removed=0;for(const char of input){if(char==='(')depth++;else if(char===')'){if(depth)depth--;else removed++;}}
 const minimumRemoved=removed+depth;if(actual.length!==input.length-minimumRemoved)return false;
 if(actual.replace(/[()]/g,'')!==input.replace(/[()]/g,''))return false;
 let cursor=0;depth=0;
 for(const char of actual){while(cursor<input.length&&input[cursor]!==char)cursor++;if(cursor===input.length)return false;cursor++;if(char==='(')depth++;else if(char===')'&&--depth<0)return false;}
 return depth===0;
}
export function validMaxDepthAfterSplit(args,output){
 const [sequence]=args,groups=parseOutput(output);if(typeof sequence!=='string'||!integers(groups)||groups.length!==sequence.length||groups.some(group=>group!==0&&group!==1))return false;
 const depths=[0,0],maxima=[0,0];let depth=0,maximum=0;
 for(let index=0;index<sequence.length;index++){const char=sequence[index],group=groups[index];if(char==='('){depth++;depths[group]++;maximum=Math.max(maximum,depth);maxima[group]=Math.max(maxima[group],depths[group]);}else if(char===')'){if(--depth<0||--depths[group]<0)return false;}else return false;}
 return depth===0&&depths.every(value=>value===0)&&Math.max(...maxima)<=Math.ceil(maximum/2);
}
export function validLargestDivisibleSubset(args,output){
 const [input]=args,actual=parseOutput(output);if(!integers(input)||input.some(value=>value<=0)||new Set(input).size!==input.length||!integers(actual)||new Set(actual).size!==actual.length)return false;
 const available=new Set(input);if(actual.some(value=>!available.has(value)))return false;
 const chosen=actual.slice().sort((a,b)=>a-b);if(chosen.some((value,index)=>index>0&&value%chosen[index-1]!==0))return false;
 const sorted=input.slice().sort((a,b)=>a-b),lengths=Array(input.length).fill(1);let optimum=0;
 for(let right=0;right<sorted.length;right++){for(let left=0;left<right;left++)if(sorted[right]%sorted[left]===0)lengths[right]=Math.max(lengths[right],lengths[left]+1);optimum=Math.max(optimum,lengths[right]);}
 return actual.length===optimum;
}

export const additionalOutputPropertyValidators={groupThePeople:validGroupThePeople,rearrangeBarcodes:validRearrangeBarcodes,pancakeSort:validPancakeSort,restoreArray:validRestoreArray,reconstructMatrix:validReconstructMatrix,missingRolls:validMissingRolls,findMatrix:validFindMatrix,minRemoveToMakeValid:validMinRemoveToMakeValid,maxDepthAfterSplit:validMaxDepthAfterSplit,largestDivisibleSubset:validLargestDivisibleSubset};
export function acceptsAdditionalOutputProperty(methodName,args,output){const validator=additionalOutputPropertyValidators[methodName];if(!validator)return null;try{return validator(args,output);}catch{return false;}}
