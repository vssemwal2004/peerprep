const scalarTypes={integer:'int',int:'int',long:'long long',double:'double',float:'double',boolean:'bool',bool:'bool',character:'char',char:'char'};
const literal=(value,type)=>type==='boolean'||type==='bool'?value?'true':'false':type==='character'||type==='char'?"'"+String(value||'\0').slice(0,1).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'":String(value);
export function flattenLargeCMatrixDeclarations(source,payload,parameters,language){
 if(language!=='c')return source;
 for(let index=0;index<parameters.length;index++){
  const type=String(parameters[index]?.type||'').toLowerCase(),scalar=type.endsWith('[][]')?type.slice(0,-4):'',base=scalarTypes[scalar],rows=payload.args[index];
  if(!base||!Array.isArray(rows)||rows.length<256||rows.some(row=>!Array.isArray(row)))continue;
  const declaration=`${base}* __ppArg${index}[] = {{ARG_${index}}};\n  int __ppArg${index}ColSizes[] = {{ARG_${index}_COL_SIZES}};`;
  // Only canonical owned declarations are rewritten. Custom harnesses retain
  // their original binding until they explicitly support the compact layout.
  if(source.split(declaration).length!==2)continue;
  const flat=rows.flat(),data=flat.length?flat.map(v=>literal(v,scalar)).join(','):'0',name=`__ppArg${index}`,replacement=`${base} ${name}Flat[] = {${data}};\n  ${base}* ${name}[${rows.length}];\n  int ${name}ColSizes[] = {${rows.map(row=>row.length).join(',')}};\n  for (size_t ${name}Row=0,${name}Offset=0;${name}Row<${rows.length};${name}Row++) { ${name}[${name}Row]=${name}Flat+${name}Offset; ${name}Offset+=${name}ColSizes[${name}Row]; }`;
  source=source.replace(declaration,replacement);
 }
 return source;
}
