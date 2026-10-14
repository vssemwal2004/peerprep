import { validateStatefulFixture } from './statefulRunnerService.js';

const randomProfiles = new Map([
  ['Insert Delete GetRandom O(1)', 'RandomizedSet'],
  ['Insert Delete GetRandom O(1) - Duplicates allowed', 'RandomizedCollection'],
]);

// A single random draw has no fixed expected value. Membership is necessary;
// distribution and complexity remain separate algorithm/reference checks.
export function acceptsRandomizedStatefulOutput(problem, testCase, output) {
  const contract = problem?.functionContract;
  if(problem?.title==='Random Pick with Weight'&&problem.executionMode==='function'&&contract?.kind==='stateful'&&contract.className==='Solution'){
    try{
      const pick=contract.operations?.find(x=>x.methodName==='pickIndex');
      if(contract.constructorParameters?.length!==1||contract.constructorParameters[0].type!=='integer[]'||!pick||pick.returnType!=='integer'||pick.parameters?.length)return false;
      const fixture=validateStatefulFixture(contract,testCase.input),actual=JSON.parse(String(output).trim());
      if(!Array.isArray(actual)||actual.length!==fixture.calls.length)return false;
      const weights=fixture.calls[0]?.args?.[0];
      if(!Array.isArray(weights)||!weights.length||weights.some(x=>!Number.isInteger(x)||x<=0)||actual[0]!==null)return false;
      const counts=Array(weights.length).fill(0);let draws=0;
      for(let i=1;i<fixture.calls.length;i++){
        if(fixture.calls[i].methodName!=='pickIndex'||!Number.isInteger(actual[i])||actual[i]<0||actual[i]>=weights.length)return false;
        counts[actual[i]]++;draws++;
      }
      if(draws>=Math.max(400,weights.length*50)){
        const total=weights.reduce((a,b)=>a+b,0);
        for(let i=0;i<weights.length;i++){
          const expected=draws*weights[i]/total,sigma=Math.sqrt(expected*(1-weights[i]/total));
          if(Math.abs(counts[i]-expected)>8*Math.max(1,sigma)+2)return false;
        }
      }
      return true;
    }catch{return false;}
  }
  if(problem?.title==='Random Pick with Blacklist'&&problem.executionMode==='function'&&contract?.kind==='stateful'&&contract.className==='Solution'){
    try{
      const pick=contract.operations?.find(x=>x.methodName==='pick');
      if(contract.constructorParameters?.length!==2||contract.constructorParameters[0].type!=='integer'||contract.constructorParameters[1].type!=='integer[]'||!pick||pick.returnType!=='integer'||pick.parameters?.length)return false;
      const fixture=validateStatefulFixture(contract,testCase.input),actual=JSON.parse(String(output).trim());
      if(!Array.isArray(actual)||actual.length!==fixture.calls.length||actual[0]!==null)return false;
      const [n,blacklist]=fixture.calls[0]?.args||[],blocked=new Set(blacklist);
      if(!Number.isInteger(n)||n<=0||!Array.isArray(blacklist)||blocked.size!==blacklist.length||[...blocked].some(x=>!Number.isInteger(x)||x<0||x>=n))return false;
      const allowedCount=n-blocked.size,counts=new Map();let draws=0;
      for(let i=1;i<fixture.calls.length;i++){
        const value=actual[i];if(fixture.calls[i].methodName!=='pick'||!Number.isInteger(value)||value<0||value>=n||blocked.has(value))return false;
        counts.set(value,(counts.get(value)||0)+1);draws++;
      }
      if(allowedCount<=10000&&draws>=Math.max(400,allowedCount*50)){
        const expected=draws/allowedCount,sigma=Math.sqrt(expected*(1-1/allowedCount));
        for(let value=0;value<n;value++)if(!blocked.has(value)&&Math.abs((counts.get(value)||0)-expected)>8*Math.max(1,sigma)+2)return false;
      }
      return true;
    }catch{return false;}
  }
  if(problem?.title==='All O`one Data Structure'&&problem.executionMode==='function'&&contract?.kind==='stateful'&&contract.className==='AllOne'){
    try{
      const required=[['inc','void',1],['dec','void',1],['getMaxKey','string',0],['getMinKey','string',0]];
      if((contract.constructorParameters||[]).length||required.some(([name,type,n])=>{const m=contract.operations?.find(x=>x.methodName===name);return!m||m.returnType!==type||m.parameters?.length!==n||(n&&m.parameters[0].type!=='string');}))return false;
      const fixture=validateStatefulFixture(contract,testCase.input),actual=JSON.parse(String(output).trim());if(!Array.isArray(actual)||actual.length!==fixture.calls.length)return false;let counts=new Map();
      return fixture.calls.every((call,index)=>{if(call.constructor){counts=new Map();return actual[index]===null;}const key=call.args[0];if(call.methodName==='inc'){counts.set(key,(counts.get(key)||0)+1);return actual[index]===null;}if(call.methodName==='dec'){const n=(counts.get(key)||0)-1;if(n)counts.set(key,n);else counts.delete(key);return actual[index]===null;}if(!counts.size)return actual[index]==='';const extreme=(call.methodName==='getMaxKey'?Math.max:Math.min)(...counts.values());return typeof actual[index]==='string'&&counts.get(actual[index])===extreme;});
    }catch{return false;}
  }
  const className = randomProfiles.get(problem?.title);
  if (!className || contract?.kind !== 'stateful' || contract.className !== className
    || problem.executionMode !== 'function') return null;
  try {
    if ((contract.constructorParameters || []).length) return false;
    const methods = contract.operations;
    if (!Array.isArray(methods) || methods.length !== 3) return false;
    for (const [name, type, args] of [['insert','boolean',1],['remove','boolean',1],['getRandom','integer',0]]) {
      const method = methods.find(value => value.methodName === name);
      if (!method || method.returnType !== type || method.parameters?.length !== args
        || (args && method.parameters[0].type !== 'integer')) return false;
    }
    const fixture = validateStatefulFixture(contract, testCase.input);
    const actual = JSON.parse(String(output).trim());
    if (!Array.isArray(actual) || actual.length !== fixture.calls.length) return false;
    let counts = new Map();
    return fixture.calls.every((call, index) => {
      if (call.constructor) { counts = new Map(); return actual[index] === null; }
      const value = call.args[0], count = counts.get(value) || 0;
      if (call.methodName === 'insert') {
        if (className === 'RandomizedCollection' || !count) counts.set(value, count + 1);
        return actual[index] === (count === 0);
      }
      if (call.methodName === 'remove') {
        if (count === 1) counts.delete(value);
        else if (count > 1) counts.set(value, count - 1);
        return actual[index] === (count > 0);
      }
      return Number.isInteger(actual[index]) && actual[index] >= -2147483648
        && actual[index] <= 2147483647 && counts.has(actual[index]);
    });
  } catch { return false; }
}
