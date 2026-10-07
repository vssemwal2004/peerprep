import assert from 'node:assert/strict';
import test from 'node:test';
import Problem from '../src/models/Problem.js';
import { normalizeFunctionContract } from '../src/controllers/problemController.js';
import { analyzeExecutionCandidate, candidateFingerprint } from '../scripts/lib/hf-execution/candidateValidation.js';
import { prepareFunctionSourceForExecution } from '../src/services/functionProblemAdapterService.js';
import { generateFunctionRunnerTemplate } from '../src/services/functionRunnerTemplateService.js';

const contract={kind:'stateful',className:'Counter',constructorParameters:[{name:'initial',type:'integer'}],operations:[{methodName:'add',parameters:[{name:'amount',type:'integer'}],returnType:'void',cFunctionName:'counterAdd'},{methodName:'get',parameters:[],returnType:'integer',cFunctionName:'counterGet'}],cConstructorName:'counterCreate',cDestructorName:'counterFree'};
const references={python:'class Counter:\n    def __init__(self,initial): self.value=initial\n    def add(self,amount): self.value+=amount\n    def get(self): return self.value',cpp:'class Counter {int value;public:Counter(int initial):value(initial){}void add(int amount){value+=amount;}int get(){return value;}};',c:'typedef struct {int value;}Counter;Counter* counterCreate(int initial){Counter* obj=malloc(sizeof(Counter));obj->value=initial;return obj;}void counterAdd(Counter* obj,int amount){obj->value+=amount;}int counterGet(Counter* obj){return obj->value;}void counterFree(Counter* obj){free(obj);}',java:'class Counter {int value;Counter(int initial){value=initial;}void add(int amount){value+=amount;}int get(){return value;}}',javascript:'class Counter {constructor(initial){this.value=initial;}add(amount){this.value+=amount;}get(){return this.value;}}',typescript:'class Counter {value:number;constructor(initial:number){this.value=initial;}add(amount:number):void{this.value+=amount;}get():number{return this.value;}}'};
function candidate(){const cases=Array.from({length:13},(_,initial)=>({kind:initial<3?'sample':'hidden',position:initial+1,input:JSON.stringify([['Counter','get','add','get'],[[initial],[],[2],[]]]),output:JSON.stringify([null,initial,null,initial+2])}));return{title:'Counter integration',functionContract:contract,codeTemplates:references,referenceSolutions:references,sampleTestCases:cases.slice(0,3),hiddenTestCases:cases.slice(3)};}

test('controller normalization and model preserve explicit stateful bindings',()=>{
 const normalized=normalizeFunctionContract(contract);
 assert.equal(normalized.kind,'stateful');assert.equal(normalized.cConstructorName,'counterCreate');assert.equal(normalized.operations[0].returnType,'void');
 const problem=new Problem({title:'Counter',createdBy:'000000000000000000000001',functionContract:normalized});assert.equal(problem.validateSync(),undefined);assert.equal(problem.functionContract.operations[1].cFunctionName,'counterGet');
 assert.throws(()=>normalizeFunctionContract({...contract,cConstructorName:'bad-name'}),/identifier/);
 assert.throws(()=>normalizeFunctionContract({...contract,operations:[contract.operations[0],contract.operations[0]]}),/unique/);
});

test('stateful preflight validates fixtures and C bindings without requiring a single method runner',()=>{
 const input=candidate(),result=analyzeExecutionCandidate(input);assert.equal(result.valid,true,JSON.stringify(result.issues));assert.deepEqual(result.artifacts.executionHarnesses,{});
 const malformed={...input,sampleTestCases:[{...input.sampleTestCases[0],output:'[null,0,4,2]'},...input.sampleTestCases.slice(1)]};assert.ok(analyzeExecutionCandidate(malformed).issues.some((issue)=>issue.code==='STATEFUL_OUTPUT_SHAPE_INVALID'));
 const untested={...input,functionContract:{...contract,operations:[...contract.operations,{methodName:'missing',parameters:[],returnType:'integer',cFunctionName:'counterMissing'}]}};assert.ok(analyzeExecutionCandidate(untested).issues.some((issue)=>issue.code==='STATEFUL_OPERATION_UNTESTED'));
 const binding={...input,functionContract:{...contract,cConstructorName:''}};assert.ok(analyzeExecutionCandidate(binding).issues.some((issue)=>issue.code==='STATEFUL_C_BINDING_MISSING'));
 assert.notEqual(candidateFingerprint(input),candidateFingerprint({...input,functionContract:{...contract,cDestructorName:''}}));
});

test('function adapter dispatches stateful contracts and preserves ordinary function runners',()=>{
 const input=candidate();const source=prepareFunctionSourceForExecution({...input,executionMode:'function'},'python',references.python,input.sampleTestCases[0].input);assert.match(source,/__ppObject = Counter/);assert.match(source,/__ppObject\.add/);
 const ordinary={className:'Solution',methodName:'identity',parameters:[{name:'value',type:'integer'}],returnType:'integer'};
 const user='class Solution:\n    def identity(self,value): return value';
 const harness=generateFunctionRunnerTemplate('python',ordinary,user);
 const prepared=prepareFunctionSourceForExecution({executionMode:'function',functionContract:ordinary,executionHarnesses:{python:harness}},'python',user,'value = 5');assert.match(prepared,/getattr\(Solution\(\)/);assert.doesNotMatch(prepared,/private stateful/);
});

test('tolerance is finite, bounded and restricted to floating-point function values',()=>{
 const ordinary={className:'Solution',methodName:'solve',parameters:[],returnType:'double',absoluteTolerance:1e-5};assert.equal(normalizeFunctionContract(ordinary).absoluteTolerance,1e-5);
 const problem=new Problem({title:'Tolerance',createdBy:'000000000000000000000001',functionContract:ordinary});assert.equal(problem.validateSync(),undefined);
 for(const absoluteTolerance of [-1,0.02,Infinity,NaN,'0.00001'])assert.throws(()=>normalizeFunctionContract({...ordinary,absoluteTolerance}),/tolerance/i);
 for(const returnType of ['double[]','float[][]'])assert.equal(normalizeFunctionContract({...ordinary,returnType}).absoluteTolerance,1e-5);
 for(const returnType of ['integer','integer[]','string'])assert.throws(()=>normalizeFunctionContract({...ordinary,returnType}),/double or float/);
 assert.throws(()=>normalizeFunctionContract({...contract,absoluteTolerance:1e-5}),/double or float/);
 const invalid=new Problem({title:'Tolerance',functionContract:{...ordinary,returnType:'integer'}});assert.ok(invalid.validateSync().errors['functionContract.absoluteTolerance']);
});
