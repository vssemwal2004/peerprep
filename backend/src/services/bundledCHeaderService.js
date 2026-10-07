import{readFileSync}from'node:fs';
export const UTHASH_VERSION='2.3.0';
export const UTHASH_SOURCE_URL='https://raw.githubusercontent.com/troydhanson/uthash/v2.3.0/src/uthash.h';
export const UTHASH_SHA256='344175d0ae3d0d7651887f932fc224f6d133559f0fc83ee73fe641697d77211a';
const header=readFileSync(new URL('../vendor/uthash-2.3.0/uthash.h',import.meta.url),'utf8');
const marker='/* PeerPrep bundled uthash 2.3.0; original license retained below. */';
export function prepareBundledCHeader(language,source){
 if(String(language).toLowerCase()!=='c')return source;
 let block=false,quote='',escaped=false,offset=0;const ranges=[];
 for(const line of source.split(/(?<=\n)/)){
  if(!block&&!quote){const match=line.match(/^[\t ]*#[\t ]*include[\t ]*[<"]uthash\.h[>"]/);if(match)ranges.push({start:offset+match[0].indexOf('#'),end:offset+match[0].length});}
  for(let i=0;i<line.length;i++){
   const ch=line[i],next=line[i+1];
   if(block){if(ch==='*'&&next==='/'){block=false;i++;}continue;}
   if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}
   if(ch==='/'&&next==='*'){block=true;i++;}else if(ch==='/'&&next==='/')break;else if(ch==='"'||ch==="'")quote=ch;
  }
  offset+=line.length;
 }
 if(!ranges.length)return source;
 let prepared=source;for(const range of ranges.reverse())prepared=prepared.slice(0,range.start)+marker+'\n'+header+'\n'+prepared.slice(range.end);
 if(Buffer.byteLength(prepared,'utf8')>256*1024)throw new Error('Prepared C runner with bundled uthash exceeds 256 KB');
 return prepared;
}
