// Preserve raw scalar strings. Escaping is needed only within nested literals.
export function normalizeJavaScalarStringFormatter(source){
 const before='return nested ? "\'" + text + "\'" : text;';
 return source.replaceAll(before,'return nested ? "\'" + text + "\'" : String.valueOf(value);');
}
export function stageJavaScalarStringFormatter(source){
 const before='return nested ? "\'" + text + "\'" : text;';
 const after='return nested ? "\'" + text + "\'" : String.valueOf(value);';
 if(source.includes(after))return source;
 if(source.split(before).length!==2)throw Error('Unknown Java scalar formatter anchor.');
 return source.replace(before,after);
}
export function stageJavaScalarStringAdapter(source){
 if(source.includes("from './javaScalarStringFormatterService.js'"))return source;
 const anchor="  const configuredHarness = String(harnesses[normalizedLanguage] || '');";
 if(source.split(anchor).length!==2)throw Error('Unknown Java private harness formatter integration anchor.');
 return "import {normalizeJavaScalarStringFormatter} from './javaScalarStringFormatterService.js';\n"+source.replace(anchor,"  const originalConfiguredHarness = String(harnesses[normalizedLanguage] || '');\n  const configuredHarness = normalizedLanguage === 'java' ? normalizeJavaScalarStringFormatter(originalConfiguredHarness) : originalConfiguredHarness;");
}
