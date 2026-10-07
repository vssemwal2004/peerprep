import { validateStatefulFixture } from './statefulRunnerService.js';

const profiles = {
  Cashier:{title:'Apply Discount Every n Orders',method:'getBill',count:1},
  UndergroundSystem:{title:'Design Underground System',method:'getAverageTime',count:3},
};
// Pinned source statements for 1357 and 1396 explicitly allow absolute 1e-5.
export function isSourceSupportedStatefulTolerance(contract) {
  const profile=profiles[contract?.className];
  if(!profile||contract.kind!=='stateful'||contract.absoluteTolerance!==1e-5
    ||contract.operations?.length!==profile.count)return false;
  const floating=contract.operations.filter(op=>['double','float'].includes(op.returnType));
  return floating.length===1&&floating[0].methodName===profile.method
    &&contract.operations.every(op=>op.methodName===profile.method||op.returnType==='void');
}
function equal(left,right,type,tolerance=0) {
  if(type.endsWith('[]'))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((value,index)=>equal(value,right[index],type.slice(0,-2),tolerance));
  if(type==='void')return left===null&&right===null;
  if(['float','double'].includes(type))return typeof left==='number'&&typeof right==='number'&&Number.isFinite(left)&&Number.isFinite(right)&&Math.abs(left-right)<=tolerance;
  if(['integer','long'].includes(type))return Number.isSafeInteger(left)&&Number.isSafeInteger(right)&&left===right&&(type==='long'||left>=-2147483648&&left<=2147483647);
  if(type==='boolean')return typeof left==='boolean'&&left===right;
  if(['string','character','char'].includes(type))return typeof left==='string'&&left===right&&(type==='string'||left.length===1);
  return false;
}
export function acceptsSourceSupportedStatefulFloat(problem,testCase,output) {
  const contract=problem?.functionContract,profile=profiles[contract?.className];
  if(problem?.executionMode!=='function'||contract?.kind!=='stateful')return null;
  if(profile&&problem.title===profile.title&&isSourceSupportedStatefulTolerance(contract)) {
    try{
      const fixture=validateStatefulFixture(contract,testCase.input),actual=JSON.parse(String(output)),expected=JSON.parse(String(testCase.output));
      return Array.isArray(actual)&&Array.isArray(expected)&&actual.length===fixture.calls.length&&expected.length===fixture.calls.length
        &&fixture.calls.every((call,index)=>equal(actual[index],expected[index],call.constructor?'void':call.returnType,call.methodName===profile.method?contract.absoluteTolerance:0));
    }catch{return false;}
  }
  // 346's authoritative example writes 14/3 as 4.66667 without specifying a
  // general epsilon. Preserve that five-place decimal representation, derive
  // the true window sum independently, and keep every nonnumeric value strict.
  if(problem.title!=='Moving Average from Data Stream'||contract.className!=='MovingAverage'
    ||contract.constructorParameters?.length!==1||contract.constructorParameters[0].type!=='integer'
    ||contract.operations?.length!==1||contract.operations[0].methodName!=='next'
    ||contract.operations[0].returnType!=='double'||contract.operations[0].parameters?.length!==1
    ||contract.operations[0].parameters[0].type!=='integer'||contract.absoluteTolerance)return null;
  try{
    const fixture=validateStatefulFixture(contract,testCase.input),actual=JSON.parse(String(output));
    if(!Array.isArray(actual)||actual.length!==fixture.calls.length)return false;
    let size,values=[],sum=0;
    return fixture.calls.every((call,index)=>{
      if(call.constructor){size=call.args[0];values=[];sum=0;return size>=1&&size<=1000&&actual[index]===null;}
      const value=call.args[0];if(value<-100000||value>100000)return false;
      values.push(value);sum+=value;if(values.length>size)sum-=values.shift();
      return typeof actual[index]==='number'&&Number.isFinite(actual[index])
        &&Math.round(actual[index]*1e5)===Math.round((sum/values.length)*1e5);
    });
  }catch{return false;}
}
