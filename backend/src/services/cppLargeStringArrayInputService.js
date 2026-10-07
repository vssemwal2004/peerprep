// Encode one constant byte buffer instead of thousands of std::string AST nodes.
// Length prefixes preserve arbitrary UTF-8, embedded NULs, and empty strings.
export function renderLargeCppStringArray(value,type){
 if(type!=='string[]'||!Array.isArray(value)||value.length<1024||value.some(v=>typeof v!=='string'))return null;
 const parts=[];
 for(const entry of value){const bytes=Buffer.from(entry,'utf8');let n=bytes.length;const prefix=[];do{prefix.push((n&127)|(n>=128?128:0));n=Math.floor(n/128);}while(n);parts.push(Buffer.from(prefix),bytes);}
 const bytes=Buffer.concat(parts),chunks=[];
 for(let i=0;i<bytes.length;i+=2048){let escaped='';for(const b of bytes.subarray(i,i+2048))escaped+='\\'+b.toString(8).padStart(3,'0');chunks.push('"'+escaped+'"');}
 return `([](){const unsigned char __ppStrings[]=${chunks.join('\n')};vector<string> __ppResult;__ppResult.reserve(${value.length});size_t __ppAt=0;for(size_t __ppIndex=0;__ppIndex<${value.length};++__ppIndex){size_t __ppLength=0;unsigned __ppShift=0;unsigned char __ppByte;do{__ppByte=__ppStrings[__ppAt++];__ppLength|=size_t(__ppByte&127)<<__ppShift;__ppShift+=7;}while(__ppByte&128);__ppResult.emplace_back(reinterpret_cast<const char*>(__ppStrings+__ppAt),__ppLength);__ppAt+=__ppLength;}return __ppResult;})()`;
}
export function stageLargeCppStringArrayInput(source){
 source=source.replace(/\r\n/g,'\n');if(source.includes("from './cppLargeStringArrayInputService.js'"))return source;
 const anchor="function renderCpp(value, type) {\n  const normalized = String(type || 'any').toLowerCase();";
 if(source.split(anchor).length!==2)throw Error('Unknown CPP string-array rendering anchor');
 return "import {renderLargeCppStringArray} from './cppLargeStringArrayInputService.js';\n"+source.replace(anchor,anchor+'\n  const largeStrings=renderLargeCppStringArray(value,normalized);\n  if(largeStrings!==null)return largeStrings;');
}
