import {generateFunctionRunnerTemplate} from './functionRunnerTemplateService.js';
import {materializeFunctionInputPlaceholders} from './functionTestInputService.js';
import {wrapVerifiedNodeCapture} from './customNodeResultEnvelopeService.js';
export const compactJavaInts=a=>{if(!a.length)return 'new int[0]';const csv=a.join(','),chunks=[];for(let i=0;i<csv.length;i+=16000)chunks.push(JSON.stringify(csv.slice(i,i+16000)));return `java.util.Arrays.stream(String.join("",new String[]{${chunks.join(',')}}).split(",")).mapToInt(Integer::parseInt).toArray()`;};
export const withoutDefinitionComments=s=>String(s).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\r\n]*/g,'').replace(/^\s*#[^\r\n]*/gm,'');
export function finishProvidedCapture(language,userCode,prefix,wrapper,className,value) {
 let wrapped=wrapVerifiedNodeCapture(language,wrapper,className,value);
 const replacements={c:['char* captureNode(int seed)','char* captureNode(int seed,struct TreeNode*unused)'],cpp:['std::string captureNode(int seed)','std::string captureNode(int seed,TreeNode*unused)'],java:['public String captureNode(int seed)','public String captureNode(int seed,TreeNode unused)'],python:['def captureNode(self,seed):','def captureNode(self,seed,unused):'],javascript:['function captureNode(seed){','function captureNode(seed,unused){'],typescript:['function captureNode(seed:number){','function captureNode(seed:number,unused:any){']};
 wrapped=wrapped.replace(...replacements[language]);
 const joined=language==='java'?userCode+'\n'+prefix+'\n'+wrapped:prefix+'\n'+userCode+'\n'+wrapped;
 const contract={className,methodName:'captureNode',parameters:[{name:'seed',type:'integer'},{name:'privateRoot',type:'tree-node'}],returnType:'string',outputMode:'return',runnerLanguage:language};
 const template=generateFunctionRunnerTemplate(language,contract,joined);if(!template)throw Error('Private provided-object runner generation failed.');
 return materializeFunctionInputPlaceholders(template,'seed=0,privateRoot=[]',contract).replace('{{USER_CODE}}',joined);
}
