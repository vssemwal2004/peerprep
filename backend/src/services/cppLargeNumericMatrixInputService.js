// Build independent mutable rows with bounded initializer-expression depth.
export function renderLargeCppNumericMatrix(value,type,renderScalar){
  const base={ 'integer[][]':'int','int[][]':'int','long[][]':'long long','double[][]':'double','float[][]':'double'}[type];
  if(!base||!Array.isArray(value)||value.length<256||!value.every(row=>Array.isArray(row)&&row.every(v=>typeof v==='number'&&Number.isFinite(v))))return null;
  const scalar=type.slice(0,-4),flat=value.flat(),data=flat.length?flat.map(v=>renderScalar(v,scalar)).join(','):'0',widths=value.map(row=>row.length).join(',');
  return `([](){const ${base} __ppData[]={${data}};const size_t __ppWidths[]={${widths}};vector<vector<${base}>> __ppRows;__ppRows.reserve(${value.length});size_t __ppOffset=0;for(size_t __ppWidth:__ppWidths){__ppRows.emplace_back(__ppData+__ppOffset,__ppData+__ppOffset+__ppWidth);__ppOffset+=__ppWidth;}return __ppRows;})()`;
}
