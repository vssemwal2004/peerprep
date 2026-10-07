import{parseFunctionTestInput}from'./functionTestInputService.js';
export function decodeTypedCharacter(raw){
 const source=String(raw??''),trimmed=source.trim();
 if(source.length===1)return{value:source};
 const record=source.endsWith('\r\n')?source.slice(0,-2):source.endsWith('\n')?source.slice(0,-1):source;
 if(record.length===1)return{value:record};
 if(source.length===2&&source.endsWith('\n'))return{value:source[0]};
 if(/^['"]/.test(trimmed)){try{const parsed=parseFunctionTestInput(trimmed);if(Object.keys(parsed.named).length||parsed.positional.length!==1||typeof parsed.positional[0]!=='string'||parsed.positional[0].length!==1)return null;return{value:parsed.positional[0]};}catch{return null;}}
 return null;
}
export function acceptsTypedCharacterOutput(problem,testCase,raw){
 const c=problem?.functionContract;if(problem?.executionMode!=='function'||c?.kind==='stateful'||c?.outputMode==='parameter'||!['character','char'].includes(c?.returnType))return undefined;
 const actual=decodeTypedCharacter(raw),expected=decodeTypedCharacter(testCase?.output);return !!actual&&!!expected&&actual.value===expected.value;
}
