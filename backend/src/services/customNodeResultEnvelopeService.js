// Bind a private identity/shape check to its concrete result. A constant True
// printed by student code must never stand in for all different test outputs.
export function nodeResultEnvelope(value){return JSON.stringify({peerprepNodeResult:1,verified:true,value});}
export function parseNodeResultEnvelope(raw){try{const v=JSON.parse(String(raw).trim());if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='peerprepNodeResult,value,verified'||v.peerprepNodeResult!==1||v.verified!==true)return null;return{value:v.value};}catch{return null;}}
export function wrapVerifiedNodeCapture(language,wrapper,className,value){
 const success=nodeResultEnvelope(value),failure=JSON.stringify({peerprepNodeResult:1,verified:false,value:null}),ok=JSON.stringify(success),bad=JSON.stringify(failure);
 if(language==='c')return wrapper.replace('bool captureNode(int seed)','bool _ppVerifyNode(int seed)')+`\nchar* captureNode(int seed){return _ppVerifyNode(seed)?${ok}:${bad};}`;
 if(language==='cpp'){const source=wrapper.replace('bool captureNode(int seed)','bool _ppVerifyNode(int seed)'),tail=source.lastIndexOf('};');return source.slice(0,tail)+`std::string captureNode(int seed){return _ppVerifyNode(seed)?${ok}:${bad};}`+source.slice(tail);}
 if(language==='java'){const chunks=[];for(let i=0;i<success.length;i+=16000)chunks.push(JSON.stringify(success.slice(i,i+16000)));const source=wrapper.replace('boolean captureNode(int seed)','boolean _ppVerifyNode(int seed)'),tail=source.lastIndexOf('}');return source.slice(0,tail)+`public String captureNode(int seed){return _ppVerifyNode(seed)?String.join("",new String[]{${chunks.join(',')}}):${bad};}`+source.slice(tail);}
 if(language==='python')return wrapper.replace('def captureNode(self,seed):','def _ppVerifyNode(self,seed):')+`    def captureNode(self,seed):\n        return ${ok} if self._ppVerifyNode(seed) else ${bad}\n`;
 const ts=language==='typescript';return wrapper.replace(/function captureNode\(seed(?::number)?\)/,'function _ppVerifyNode(seed'+(ts?':number':'')+')')+`\nfunction captureNode(seed${ts?':number':''}){return _ppVerifyNode(seed)?${ok}:${bad};}`;
}
