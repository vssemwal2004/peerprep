import { renderNativeArgument } from './functionTestInputService.js';
import { prepareBundledCHeader } from './bundledCHeaderService.js';

export const STATEFUL_RUNNER_LANGUAGES = ['python', 'cpp', 'c', 'java', 'javascript', 'typescript'];
const identifier = (value, label) => {
  if (!/^[A-Za-z_]\w*$/.test(String(value || ''))) throw new Error(`Invalid stateful ${label}.`);
  return value;
};
function normalizeType(value) {
  const type = String(value || '').toLowerCase().replace(/^int(?=\[|$)/, 'integer').replace(/^bool(?=\[|$)/, 'boolean');
  if (!/^(?:integer|long|double|float|boolean|string|character|char)(?:\[\]){0,2}$/.test(type) && type !== 'void') throw new Error(`Unsupported stateful type: ${value || '(empty)'}.`);
  return type;
}
function validateValue(value, type, label) {
  if (type.endsWith('[]')) {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
    for (const entry of value) validateValue(entry, type.slice(0,-2), label);
  } else if (['integer','long'].includes(type)) {
    if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
    if (type === 'integer' && (value < -2147483648 || value > 2147483647)) throw new Error(`${label} exceeds the 32-bit integer range.`);
  } else if (['float','double'].includes(type)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  } else if (type === 'boolean') { if (typeof value !== 'boolean') throw new Error(`${label} must be boolean.`); }
  else if (['string','character','char'].includes(type)) {
    if (typeof value !== 'string' || (type !== 'string' && value.length !== 1)) throw new Error(`${label} must be ${type === 'string' ? 'a string' : 'one character'}.`);
  } else throw new Error(`${label} cannot have void type.`);
}
const parameters = (values=[]) => {
  const result=values.map((parameter,index) => ({ ...parameter, name:identifier(parameter.name || `arg${index}`,'parameter name'), type:normalizeType(parameter.type) }));
  if(new Set(result.map((value)=>value.name.toLowerCase())).size!==result.length)throw new Error('Duplicate stateful parameter name.');
  if(result.some((value)=>value.type==='void'))throw new Error('Stateful parameter cannot have void type.');
  return result;
};
function parseStatefulInput(input){
  if(typeof input!=='string')return input;
  const text=input.trim();
  try { return JSON.parse(text); } catch {}
  let depth=0,quoted=false,escaped=false,boundary=-1;
  for(let index=0;index<text.length;index++){
    const character=text[index];
    if(quoted){if(escaped)escaped=false;else if(character==='\\')escaped=true;else if(character==='"')quoted=false;continue;}
    if(character==='"'){quoted=true;continue;}
    if(character==='[')depth++;
    if(character===']'&&--depth===0){boundary=index+1;break;}
  }
  if(boundary<0)throw new Error('Stateful input requires two valid JSON arrays.');
  try{return [JSON.parse(text.slice(0,boundary)),JSON.parse(text.slice(boundary).replace(/^\s*,?\s*/,''))];}
  catch{throw new Error('Stateful input requires two valid JSON arrays.');}
}

export function validateStatefulFixture(contract, input) {
  const className=identifier(contract?.className,'class name');
  const constructorParameters=parameters(contract.constructorParameters);
  const operations=(contract.operations || []).map((operation)=>({ ...operation,methodName:identifier(operation.methodName,'method name'),parameters:parameters(operation.parameters),returnType:normalizeType(operation.returnType) }));
  const methods=new Map(operations.map((operation)=>[operation.methodName,operation]));
  if(methods.size!==operations.length||methods.has(className)) throw new Error('Duplicate or ambiguous stateful operation.');
  const parsed=parseStatefulInput(input);
  if(!Array.isArray(parsed)||parsed.length!==2||!Array.isArray(parsed[0])||!Array.isArray(parsed[1])) throw new Error('Stateful input requires operations and argument arrays.');
  const [names,args]=parsed;
  if(!names.length||names.length!==args.length||names[0]!==className) throw new Error('Stateful operation counts must match and begin with the constructor.');
  const calls=names.map((name,index)=>{
    const operation=name===className?{methodName:className,parameters:constructorParameters,returnType:'void',constructor:true}:methods.get(name);
    if(!operation) throw new Error(`Unknown stateful operation: ${String(name)}.`);
    if(!Array.isArray(args[index])||args[index].length!==operation.parameters.length) throw new Error(`Stateful argument count mismatch for ${name}.`);
    operation.parameters.forEach((parameter,argument)=>validateValue(args[index][argument],parameter.type,`${name}.${parameter.name}`));
    return {...operation,constructor:name===className,args:args[index]};
  });
  return {className,constructorParameters,operations,calls};
}

const nativeType = (language,type) => {
  if(type.endsWith('[]')) return language==='cpp'?`vector<${nativeType(language,type.slice(0,-2))}>`:`${nativeType(language,type.slice(0,-2))}[]`;
  return ({cpp:{integer:'int',long:'long long',double:'double',float:'double',boolean:'bool',string:'string',character:'char',char:'char'},java:{integer:'int',long:'long',double:'double',float:'double',boolean:'boolean',string:'String',character:'char',char:'char'},c:{integer:'int',long:'long long',double:'double',float:'double',boolean:'bool',string:'char*',character:'char',char:'char'}})[language][type];
};
const cString = (value) => '"'+[...Buffer.from(value,'utf8')].map((byte)=>byte===34?'\\"':byte===92?'\\\\':byte<32||byte>=127?`\\${byte.toString(8).padStart(3,'0')}`:String.fromCharCode(byte)).join('')+'"';
function javaLiteral(value,type){
  if(type.endsWith('[]'))return `new ${nativeType('java',type)}{${value.map((entry)=>javaLiteral(entry,type.slice(0,-2))).join(',')}}`;
  if(type==='long')return `${value}L`;
  if(['character','char'].includes(type))return `'${value.replaceAll('\\','\\\\').replaceAll("'","\\'").replaceAll('\n','\\n').replaceAll('\r','\\r').replaceAll('\t','\\t')}'`;
  return JSON.stringify(value);
}
function declarations(language,call,index){
  return call.parameters.map((parameter,argument)=>{
    const name=`__ppA${index}_${argument}`,value=call.args[argument],type=parameter.type;
    if(language==='cpp') return `auto ${name} = ${renderNativeArgument('cpp',type,value)};`;
    if(language==='java') return `${nativeType(language,type)} ${name} = ${javaLiteral(value,type)};`;
    const scalar=type.endsWith('[][]')?type.slice(0,-4):type.endsWith('[]')?type.slice(0,-2):type;
    if(type.endsWith('[][]')){
      const rows=value.map((row,r)=>`${nativeType('c',scalar)} ${name}Row${r}[${Math.max(1,row.length)}] = {${row.map((entry)=>scalar==='string'?cString(entry):['char','character'].includes(scalar)?javaLiteral(entry,scalar):JSON.stringify(entry)).join(',')||'0'}};`).join('\n');
      return `${rows}\n${nativeType('c',scalar)}* ${name}[${Math.max(1,value.length)}] = {${value.map((_,r)=>`${name}Row${r}`).join(',')||'NULL'}};\nint ${name}ColSizes[${Math.max(1,value.length)}] = {${value.map((row)=>row.length).join(',')||'0'}};`;
    }
    if(type.endsWith('[]'))return `${nativeType('c',scalar)} ${name}[${Math.max(1,value.length)}] = {${value.map((entry)=>scalar==='string'?cString(entry):['char','character'].includes(scalar)?javaLiteral(entry,scalar):JSON.stringify(entry)).join(',')||'0'}};`;
    return `${nativeType('c',type)} ${name} = ${type==='string'?cString(value):['char','character'].includes(type)?javaLiteral(value,type):JSON.stringify(value)};`;
  }).join('\n');
}

const cppPrinter=String.raw`
static void __ppEmit(const string& value) { cout << '"'; for (unsigned char ch : value) { if(ch=='"'||ch=='\\') cout << '\\' << ch; else if(ch<32) { const char* hex="0123456789abcdef"; cout<<"\\u00"<<hex[ch>>4]<<hex[ch&15]; } else cout<<ch; } cout << '"'; }
static void __ppEmit(const char* value) { if(value) __ppEmit(string(value)); else cout<<"null"; }
static void __ppEmit(bool value) { cout<<(value?"true":"false"); }
static void __ppEmit(char value) { __ppEmit(string(1,value)); }
template<class T> static void __ppEmit(const T& value) { cout<<setprecision(17)<<value; }
template<class T> static void __ppEmit(const vector<T>& values) { cout<<'['; for(size_t i=0;i<values.size();i++){ if(i) cout<<','; T value=values[i]; __ppEmit(value); } cout<<']'; }
`;
// PeerPrep reflected Java stateful binding.
const javaBinding="\n  static Object __ppArgument(Object value, java.lang.reflect.Type type) throws Exception {\n    if(type instanceof java.lang.reflect.WildcardType)type=((java.lang.reflect.WildcardType)type).getUpperBounds()[0];\n    Class<?> target=type instanceof java.lang.reflect.ParameterizedType?(Class<?>)((java.lang.reflect.ParameterizedType)type).getRawType():(Class<?>)type;\n    if(value==null){if(target.isPrimitive())throw new IllegalArgumentException(\"Null primitive argument\");return null;}\n    if(target.isArray()){\n      int size=value instanceof java.util.List?((java.util.List<?>)value).size():java.lang.reflect.Array.getLength(value);\n      Object result=java.lang.reflect.Array.newInstance(target.getComponentType(),size);\n      for(int i=0;i<size;i++)java.lang.reflect.Array.set(result,i,__ppArgument(value instanceof java.util.List?((java.util.List<?>)value).get(i):java.lang.reflect.Array.get(value,i),target.getComponentType()));\n      return result;\n    }\n    if(java.util.List.class.isAssignableFrom(target)){\n      java.lang.reflect.Type child=type instanceof java.lang.reflect.ParameterizedType?((java.lang.reflect.ParameterizedType)type).getActualTypeArguments()[0]:Object.class;\n      java.util.List<Object> result=new java.util.ArrayList<>();\n      int size=value instanceof java.util.List?((java.util.List<?>)value).size():java.lang.reflect.Array.getLength(value);\n      for(int i=0;i<size;i++)result.add(__ppArgument(value instanceof java.util.List?((java.util.List<?>)value).get(i):java.lang.reflect.Array.get(value,i),child));\n      if(!target.isInstance(result))throw new IllegalArgumentException(\"Unsupported concrete collection \"+target.getName());\n      return result;\n    }\n    if(target==int.class||target==Integer.class)return ((Number)value).intValue();\n    if(target==long.class||target==Long.class)return ((Number)value).longValue();\n    if(target==double.class||target==Double.class)return ((Number)value).doubleValue();\n    if(target==float.class||target==Float.class)return ((Number)value).floatValue();\n    if(target==boolean.class||target==Boolean.class)return (Boolean)value;\n    if(target==char.class||target==Character.class)return value instanceof Character?value:value.toString().charAt(0);\n    if(target.isInstance(value))return value;\n    throw new IllegalArgumentException(\"Unsupported stateful argument \"+target.getName());\n  }\n  static Object[] __ppArguments(Object[] values,java.lang.reflect.Type[] types) throws Exception {\n    Object[] result=new Object[values.length];for(int i=0;i<values.length;i++)result[i]=__ppArgument(values[i],types[i]);return result;\n  }\n  static Object __ppConstruct(Class<?> type,Object[] values) throws Exception {\n    for(java.lang.reflect.Constructor<?> constructor:type.getDeclaredConstructors())if(constructor.getParameterCount()==values.length){\n      Object[] converted;try{converted=__ppArguments(values,constructor.getGenericParameterTypes());}catch(IllegalArgumentException failure){continue;}\n      constructor.setAccessible(true);return constructor.newInstance(converted);\n    }throw new IllegalArgumentException(\"No compatible stateful constructor \"+type.getName());\n  }\n  static Object __ppCall(Object receiver,String name,Object[] values) throws Exception {\n    for(java.lang.reflect.Method method:receiver.getClass().getDeclaredMethods())if(method.getName().equals(name)&&method.getParameterCount()==values.length){\n      Object[] converted;try{converted=__ppArguments(values,method.getGenericParameterTypes());}catch(IllegalArgumentException failure){continue;}\n      method.setAccessible(true);return method.invoke(receiver,converted);\n    }throw new IllegalArgumentException(\"No compatible stateful operation \"+name);\n  }\n";
const javaPrinter=String.raw`
  static void __ppEmit(Object value) {
    if(value==null){System.out.print("null");return;}
    if(value instanceof String || value instanceof Character){String text=value.toString();System.out.print('"');for(int i=0;i<text.length();i++){char ch=text.charAt(i);if(ch=='"'||ch=='\\'){System.out.print('\\');System.out.print(ch);}else if(ch<32)System.out.printf("\\u%04x",(int)ch);else System.out.print(ch);}System.out.print('"');return;}
    if(value.getClass().isArray()){System.out.print('[');for(int i=0;i<java.lang.reflect.Array.getLength(value);i++){if(i>0)System.out.print(',');__ppEmit(java.lang.reflect.Array.get(value,i));}System.out.print(']');return;}
    if(value instanceof Iterable){System.out.print('[');boolean first=true;for(Object item:(Iterable<?>)value){if(!first)System.out.print(',');first=false;__ppEmit(item);}System.out.print(']');return;}
    System.out.print(value);
  }
`;
const cPrinter=String.raw`
static void __ppString(const char* value) { if(!value){printf("null");return;}putchar('"');for(const unsigned char* ch=(const unsigned char*)value;*ch;ch++){if(*ch=='"'||*ch=='\\'){putchar('\\');putchar(*ch);}else if(*ch<32)printf("\\u%04x",*ch);else putchar(*ch);}putchar('"'); }
`;
function cScalarOutput(type,value){
  if(type==='string')return `__ppString(${value});`;
  if(['char','character'].includes(type))return `{char __ppChar[2]={${value},0};__ppString(__ppChar);}`;
  if(type==='boolean')return `printf("%s",${value}?"true":"false");`;
  if(['double','float'].includes(type))return `printf("%.17g",(double)${value});`;
  return `printf("%lld",(long long)${value});`;
}
function cOutput(type,value){
  if(type.endsWith('[][]'))return `putchar('[');for(int __ppR=0;__ppR<__ppReturnSize;__ppR++){if(__ppR)putchar(',');putchar('[');for(int __ppK=0;__ppK<__ppReturnColumns[__ppR];__ppK++){if(__ppK)putchar(',');${cScalarOutput(type.slice(0,-4),`${value}[__ppR][__ppK]`)}}putchar(']');}putchar(']');`;
  if(type.endsWith('[]'))return `putchar('[');for(int __ppK=0;__ppK<__ppReturnSize;__ppK++){if(__ppK)putchar(',');${cScalarOutput(type.slice(0,-2),`${value}[__ppK]`)}}putchar(']');`;
  return cScalarOutput(type,value);
}
function cArguments(userCode,name,call,index,constructor){
  const escaped=identifier(name,'C binding');
  const signature=userCode.match(new RegExp(`\\b${escaped}\\s*\\(([^()]*)\\)\\s*\\{`));
  if(!signature)throw new Error(`C stateful binding signature missing: ${name}.`);
  const actual=signature[1].trim()==='void'||!signature[1].trim()?[]:signature[1].split(',').map((value)=>value.trim().match(/([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?$/)?.[1]);
  if(actual.some((value)=>!value))throw new Error(`Unsupported C signature for ${name}.`);
  if(!constructor&&call.returnType.endsWith('[]')&&!actual.some((value)=>['returnsize','retsize'].includes(value.toLowerCase())))throw new Error(`C array return requires returnSize or retSize: ${name}.`);
  if(!constructor&&call.returnType.endsWith('[][]')&&!actual.some((value)=>['returncolumnsizes','returncolsizes','retcolsize','retcolsizes'].includes(value.toLowerCase())))throw new Error(`C matrix return requires returnColumnSizes: ${name}.`);
  const byName=new Map(call.parameters.map((parameter,argument)=>[parameter.name.toLowerCase(),{argument,parameter}]));
  return actual.map((value,position)=>{
    if(!constructor&&position===0)return '__ppObject';
    const lower=value.toLowerCase();
    if(['returnsize','retsize'].includes(lower))return '&__ppReturnSize';
    if(['returncolumnsizes','returncolsizes','retcolsize','retcolsizes'].includes(lower))return '&__ppReturnColumns';
    if(byName.has(lower))return `__ppA${index}_${byName.get(lower).argument}`;
    const size=lower.match(/^(.*?)(size|length|colsize|columnsizes|colsizes)$/);
    const source=size&&byName.get(size[1]);
    if(source&&source.parameter.type.endsWith('[]'))return ['colsize','columnsizes','colsizes'].includes(size[2])?`__ppA${index}_${source.argument}ColSizes`:String(call.args[source.argument].length);
    throw new Error(`Unmapped C binding argument ${name}.${value}.`);
  }).join(', ');
}

export function prepareStatefulSource(language, contract, userCode, input) {
  userCode = prepareBundledCHeader(language, String(userCode || ''));
  if(!STATEFUL_RUNNER_LANGUAGES.includes(language))throw new Error(`Unsupported stateful language: ${language}.`);
  if(!String(userCode||'').trim())throw new Error('Stateful user code is missing.');
  const fixture=validateStatefulFixture(contract,input),{className,calls}=fixture;
  if(language==='python'){
    const lines=['__ppResults = []'];
    calls.forEach((call)=>{const args=call.args.map((value)=>`__ppJson.loads(${JSON.stringify(JSON.stringify(value))})`).join(', ');if(call.constructor)lines.push(`__ppObject = ${className}(${args})`,`__ppResults.append(None)`);else if(call.returnType==='void')lines.push(`__ppObject.${call.methodName}(${args})`,`__ppResults.append(None)`);else lines.push(`__ppResults.append(__ppJson.loads(__ppJson.dumps(__ppObject.${call.methodName}(${args}))))`);});
    return `from __future__ import annotations\nfrom typing import *\nfrom collections import *\nfrom heapq import *\nfrom bisect import *\nfrom math import *\nfrom builtins import pow\nfrom functools import *\nfrom itertools import *\nimport json as __ppJson\n\n# PeerPrep Python 3.8 compatible standard library aliases.\ntry:\n    cache\nexcept NameError:\n    cache = lru_cache(maxsize=None)\n\ntry:\n    pairwise\nexcept NameError:\n    def pairwise(values):\n        first, second = tee(values)\n        next(second, None)\n        return zip(first, second)\n\n${userCode}\n\n# PeerPrep private stateful runner.\n${lines.join('\n')}\nprint(__ppJson.dumps(__ppResults, separators=(',', ':')))\n`;
  }
  if(language==='javascript'||language==='typescript'){
    const lines=[`const __ppResults${language==='typescript'?': any[]':''} = [];`,`let __ppObject${language==='typescript'?': '+className:''};`];
    calls.forEach((call)=>{const args=call.args.map((value)=>JSON.stringify(value)).join(',');if(call.constructor)lines.push(`__ppObject = new ${className}(${args});`,`__ppResults.push(null);`);else if(call.returnType==='void')lines.push(`__ppObject.${call.methodName}(${args});`,`__ppResults.push(null);`);else lines.push(`__ppResults.push(JSON.parse(JSON.stringify(__ppObject.${call.methodName}(${args}))));`);});
    return `${userCode}\n\n// PeerPrep private stateful runner.\n${lines.join('\n')}\n${language==='typescript'?'(globalThis as any).console':'console'}.log(JSON.stringify(__ppResults));\n`;
  }
  const lines=[];
  calls.forEach((call,index)=>{
    // Keep fixture argument storage alive for the whole sequence. A lawful C
    // or C++ object may retain a pointer/reference supplied to its constructor.
    lines.push(declarations(language,call,index),'{');
    const args=call.parameters.map((_,argument)=>`__ppA${index}_${argument}`).join(', ');
    if(index)lines.push(language==='java'?"System.out.print(',');":language==='cpp'?"cout<<',';":"putchar(',');");
    if(language==='c'){
      const binding=call.constructor?contract.cConstructorName:call.cFunctionName;
      const callArgs=cArguments(userCode,binding,call,index,call.constructor);
      lines.push('int __ppReturnSize=0;int* __ppReturnColumns=NULL;');
      if(call.constructor){if(contract.cDestructorName)lines.push(`if(__ppObject) ${identifier(contract.cDestructorName,'C destructor')}(__ppObject);`);lines.push(`__ppObject=${binding}(${callArgs});printf("null");`);}
      else if(call.returnType==='void')lines.push(`${binding}(${callArgs});printf("null");`);
      else {const base=call.returnType.replace(/\[\]/g,'');const type=nativeType('c',base)+'*'.repeat((call.returnType.match(/\[\]/g)||[]).length);lines.push(`${type} __ppResult=${binding}(${callArgs});`,cOutput(call.returnType,'__ppResult'));}
    }else if(call.constructor)lines.push(language==='cpp'?`__ppObject.reset(new ${className}(${args}));cout<<"null";`:`__ppObject=(${className})__ppConstruct(${className}.class,new Object[]{${args}});System.out.print("null");`);
    else {const callText=language==='java'?`__ppCall(__ppObject,"${call.methodName}",new Object[]{${args}})`:`__ppObject->${call.methodName}(${args})`;lines.push(call.returnType==='void'?`${callText};${language==='cpp'?'cout<<"null";':'System.out.print("null");'}`:`__ppEmit(${callText});`);}
    lines.push('}');
  });
  if(language==='cpp')return `#include <bits/stdc++.h>\nusing namespace std;\n${userCode}\n${cppPrinter}\nint main(){unique_ptr<${className}> __ppObject;cout<<'[';${lines.join('\n')}cout<<']';__ppObject.reset();return 0;}\n`;
  if(language==='java'){
    const injectable=userCode.replace(new RegExp(`(^|\\n)\\s*public\\s+class\\s+${className}\\b`),`$1class ${className}`);
    return `import java.util.*;\nimport java.util.function.*;\n${injectable}\npublic class Main {${javaPrinter}\n${javaBinding}\npublic static void main(String[] args) throws Exception {${className} __ppObject=null;System.out.print('[');${lines.join('\n')}System.out.print(']');}}\n`;
  }
  return `#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n#include <string.h>\n#include <limits.h>\n${userCode}\n${cPrinter}\nint main(void){void* __ppObject=NULL;putchar('[');${lines.join('\n')}putchar(']');${contract.cDestructorName?`${identifier(contract.cDestructorName,'C destructor')}(__ppObject);`:''}return 0;}\n`;
}
