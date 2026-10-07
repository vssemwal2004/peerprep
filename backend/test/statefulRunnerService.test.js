import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareStatefulSource,validateStatefulFixture,STATEFUL_RUNNER_LANGUAGES } from '../src/services/statefulRunnerService.js';

const parkingContract={className:'ParkingSystem',constructorParameters:[{name:'big',type:'integer'},{name:'medium',type:'integer'},{name:'small',type:'integer'}],operations:[{methodName:'addCar',parameters:[{name:'carType',type:'integer'}],returnType:'boolean',cFunctionName:'parkingSystemAddCar'}],cConstructorName:'parkingSystemCreate',cDestructorName:'parkingSystemFree'};
const parkingCode={
 python:'class ParkingSystem:\n    def __init__(self,big,medium,small): self.space=[big,medium,small]\n    def addCar(self,carType):\n        if self.space[carType-1]==0: return False\n        self.space[carType-1]-=1\n        return True',
 javascript:'class ParkingSystem { constructor(big,medium,small){this.space=[big,medium,small];} addCar(carType){if(!this.space[carType-1])return false;this.space[carType-1]--;return true;} }',
 typescript:'class ParkingSystem { space:number[]; constructor(big:number,medium:number,small:number){this.space=[big,medium,small];} addCar(carType:number):boolean{if(!this.space[carType-1])return false;this.space[carType-1]--;return true;} }',
 cpp:'class ParkingSystem { vector<int> space; public: ParkingSystem(int big,int medium,int small):space{big,medium,small}{} bool addCar(int carType){if(!space[carType-1])return false;space[carType-1]--;return true;} };',
 java:'public class ParkingSystem { int[] space; public ParkingSystem(int big,int medium,int small){space=new int[]{big,medium,small};} public boolean addCar(int carType){if(space[carType-1]==0)return false;space[carType-1]--;return true;} }',
 c:'typedef struct { int space[3]; } ParkingSystem; ParkingSystem* parkingSystemCreate(int big,int medium,int small){ParkingSystem* obj=malloc(sizeof(ParkingSystem));obj->space[0]=big;obj->space[1]=medium;obj->space[2]=small;return obj;} bool parkingSystemAddCar(ParkingSystem* obj,int carType){if(obj->space[carType-1]==0)return false;obj->space[carType-1]--;return true;} void parkingSystemFree(ParkingSystem* obj){free(obj);}',
};
function invoke(command,args,cwd){const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(result.status,0,`${command}: ${result.stderr}\n${result.stdout}`);return result.stdout.trim();}
async function execute(language,source){
 const directory=await mkdtemp(resolve(tmpdir(),'peerprep-stateful-'));
 try{
  const extension={python:'py',javascript:'js',typescript:'ts',cpp:'cpp',c:'c',java:'java'}[language];
  const file=resolve(directory,language==='java'?'Main.java':`Main.${extension}`);await writeFile(file,source);
  if(language==='python')return invoke('python',[file],directory);
  if(language==='javascript')return invoke('node',[file],directory);
  if(language==='typescript'){invoke('node',[resolve('node_modules/typescript/bin/tsc'),file,'--target','ES2019','--lib','ESNext,DOM','--skipLibCheck'],directory);return invoke('node',[resolve(directory,'Main.js')],directory);}
  if(language==='java'){invoke(process.env.STATEFUL_JAVA_BIN?resolve(process.env.STATEFUL_JAVA_BIN,'javac.exe'):'javac',['-encoding','UTF-8',file],directory);return invoke(process.env.STATEFUL_JAVA_BIN?resolve(process.env.STATEFUL_JAVA_BIN,'java.exe'):'java',['-Dfile.encoding=UTF-8','-cp',directory,'Main'],directory);}
  const binary=resolve(directory,'runner.exe');invoke(language==='cpp'?'g++':'gcc',[language==='cpp'?'-std=c++17':'-std=c11','-O2',file,'-o',binary],directory);return invoke(binary,[],directory);
 }finally{assert.ok(directory.startsWith(resolve(tmpdir(),'peerprep-stateful-')),'Unexpected test cleanup directory');await rm(directory,{recursive:true,force:true});}
}

test('fixture validation rejects unknown methods, missing constructors, wrong counts and unsafe types',()=>{
 const valid='["ParkingSystem","addCar"]\n[[1,0,0],[1]]';assert.equal(validateStatefulFixture(parkingContract,valid).calls.length,2);
 assert.throws(()=>validateStatefulFixture(parkingContract,'["addCar"]\n[[1]]'),/constructor/);
 assert.throws(()=>validateStatefulFixture(parkingContract,'["ParkingSystem","hack"]\n[[1,0,0],[]]'),/Unknown/);
 assert.throws(()=>validateStatefulFixture(parkingContract,'["ParkingSystem"]\n[[1,0]]'),/count/);
 assert.throws(()=>validateStatefulFixture(parkingContract,'["ParkingSystem"]\n[["1",0,0]]'),/integer/);
 assert.throws(()=>validateStatefulFixture(parkingContract,'["ParkingSystem"]\n[[2147483648,0,0]]'),/32-bit/);
 assert.throws(()=>prepareStatefulSource('c',{...parkingContract,cConstructorName:'absent'},parkingCode.c,valid),/signature missing/);
});

test('C retSize output alias is bound explicitly for native array-return signatures',async()=>{
 const input='["Box","get"]\n[[[4,5]],[]]';
 const source=prepareStatefulSource('c',boxContract,boxCode.c.replaceAll('returnSize','retSize'),input);
 assert.deepEqual(JSON.parse(await execute('c',source)),[null,[4,5]]);
});

test('all six languages preserve parking state, serialize boolean results and reset on a new instance',async()=>{
 const input='["ParkingSystem","addCar","addCar","addCar","ParkingSystem","addCar","addCar"]\n[[1,0,0],[1],[1],[2],[2,0,0],[1],[1]]';
 for(const language of [...STATEFUL_RUNNER_LANGUAGES.filter((value)=>value!=='java'),'java']){const source=prepareStatefulSource(language,parkingContract,parkingCode[language],input);assert.deepEqual(JSON.parse(await execute(language,source)),[null,true,false,false,null,true,true],language);}
});

const boxContract={className:'Box',constructorParameters:[{name:'values',type:'integer[]'}],operations:[{methodName:'add',parameters:[{name:'value',type:'integer'}],returnType:'void',cFunctionName:'boxAdd'},{methodName:'get',parameters:[],returnType:'integer[]',cFunctionName:'boxGet'},{methodName:'label',parameters:[{name:'text',type:'string'}],returnType:'string',cFunctionName:'boxLabel'}],cConstructorName:'boxCreate',cDestructorName:'boxFree'};
const boxCode={
 python:'class Box:\n    def __init__(self,values): self.values=values[:]\n    def add(self,value): self.values.append(value)\n    def get(self): return self.values[:]\n    def label(self,text): return text',
 javascript:'class Box {constructor(values){this.values=[...values];}add(value){this.values.push(value);}get(){return [...this.values];}label(text){return text;}}',
 typescript:'class Box {values:number[];constructor(values:number[]){this.values=[...values];}add(value:number):void{this.values.push(value);}get():number[]{return [...this.values];}label(text:string):string{return text;}}',
 cpp:'class Box { vector<int> values; public: Box(vector<int>& input):values(input){} void add(int value){values.push_back(value);} vector<int> get(){return values;} string label(string text){return text;} };',
 java:'class Box {ArrayList<Integer> values=new ArrayList<>();Box(int[] input){for(int value:input)values.add(value);}void add(int value){values.add(value);}int[] get(){return values.stream().mapToInt(Integer::intValue).toArray();}String label(String text){return text;}}',
 c:'typedef struct {int values[100];int size;} Box; Box* boxCreate(int* values,int valuesSize){Box* obj=calloc(1,sizeof(Box));for(int i=0;i<valuesSize;i++)obj->values[i]=values[i];obj->size=valuesSize;return obj;}void boxAdd(Box* obj,int value){obj->values[obj->size++]=value;}int* boxGet(Box* obj,int* returnSize){*returnSize=obj->size;return obj->values;}char* boxLabel(Box* obj,char* text){return text;}void boxFree(Box* obj){free(obj);}',
};
test('all six languages serialize mixed void, array and escaped string operation results',async()=>{
 const names=['Box','add','get','label'],args=[[[1,-2]], [3],[], ['quote" slash\\ newline\n snowman☃']];
 const input=`${JSON.stringify(names)}\n${JSON.stringify(args)}`;
 for(const language of [...STATEFUL_RUNNER_LANGUAGES.filter((value)=>value!=='java'),'java'])assert.deepEqual(JSON.parse(await execute(language,prepareStatefulSource(language,boxContract,boxCode[language],input))),[null,null,[1,-2,3],args[3][0]],language);
});

test('previous array results remain snapshots after later mutation in all six languages',async()=>{
 const contract={className:'RetainedBox',constructorParameters:[],operations:[{methodName:'get',parameters:[],returnType:'integer[]',cFunctionName:'retainedBoxGet'},{methodName:'set',parameters:[{name:'value',type:'integer'}],returnType:'void',cFunctionName:'retainedBoxSet'}],cConstructorName:'retainedBoxCreate',cDestructorName:'retainedBoxFree'};
 const code={python:'class RetainedBox:\n    def __init__(self): self.values=[1]\n    def get(self): return self.values\n    def set(self,value): self.values[0]=value',javascript:'class RetainedBox {constructor(){this.values=[1];}get(){return this.values;}set(value){this.values[0]=value;}}',typescript:'class RetainedBox {values:number[]=[1];get():number[]{return this.values;}set(value:number):void{this.values[0]=value;}}',java:'class RetainedBox {int[] values={1};int[] get(){return values;}void set(int value){values[0]=value;}}',cpp:'class RetainedBox {vector<int> values{1};public:RetainedBox(){}vector<int>& get(){return values;}void set(int value){values[0]=value;}};',c:'typedef struct {int values[1];}RetainedBox;RetainedBox* retainedBoxCreate(void){RetainedBox* obj=malloc(sizeof(RetainedBox));obj->values[0]=1;return obj;}int* retainedBoxGet(RetainedBox* obj,int* returnSize){*returnSize=1;return obj->values;}void retainedBoxSet(RetainedBox* obj,int value){obj->values[0]=value;}void retainedBoxFree(RetainedBox* obj){free(obj);}'};
 const input='["RetainedBox","get","set","get"]\n[[],[],[9],[]]';
 for(const language of STATEFUL_RUNNER_LANGUAGES)assert.deepEqual(JSON.parse(await execute(language,prepareStatefulSource(language,contract,code[language],input))),[null,[1],null,[9]],language);
});

test('native objects may retain constructor input storage across calls and resets',async()=>{
 const contract={className:'NumArray',constructorParameters:[{name:'nums',type:'integer[]'}],operations:[{methodName:'sumRange',parameters:[{name:'left',type:'integer'},{name:'right',type:'integer'}],returnType:'integer',cFunctionName:'numArraySumRange'}],cConstructorName:'numArrayCreate',cDestructorName:'numArrayFree'};
 const code={cpp:'class NumArray {vector<int>& nums;public:NumArray(vector<int>& input):nums(input){}int sumRange(int left,int right){int sum=0;for(int i=left;i<=right;i++)sum+=nums[i];return sum;}};',c:'typedef struct {int* nums;}NumArray;NumArray* numArrayCreate(int* nums,int numsSize){NumArray* obj=malloc(sizeof(NumArray));obj->nums=nums;return obj;}int numArraySumRange(NumArray* obj,int left,int right){int sum=0;for(int i=left;i<=right;i++)sum+=obj->nums[i];return sum;}void numArrayFree(NumArray* obj){free(obj);}'};
 const input='["NumArray","sumRange","sumRange","NumArray","sumRange"]\n[[[1,2,3,4]],[0,3],[1,2],[[100,-4]],[0,1]]';
 for(const language of ['cpp','c'])assert.deepEqual(JSON.parse(await execute(language,prepareStatefulSource(language,contract,code[language],input))),[null,10,5,null,96]);
});

test('all six languages handle ragged matrix constructor arguments and matrix returns',async()=>{
 const contract={className:'MatrixBox',constructorParameters:[{name:'values',type:'integer[][]'}],operations:[{methodName:'get',parameters:[],returnType:'integer[][]',cFunctionName:'matrixBoxGet'}],cConstructorName:'matrixBoxCreate',cDestructorName:'matrixBoxFree'};
 const code={python:'class MatrixBox:\n    def __init__(self,values): self.values=values\n    def get(self): return self.values',javascript:'class MatrixBox {constructor(values){this.values=values;}get(){return this.values;}}',typescript:'class MatrixBox {values:number[][];constructor(values:number[][]){this.values=values;}get():number[][]{return this.values;}}',cpp:'class MatrixBox {vector<vector<int>>& values;public:MatrixBox(vector<vector<int>>& input):values(input){}vector<vector<int>> get(){return values;}};',java:'class MatrixBox {int[][] values;MatrixBox(int[][] input){values=input;}int[][] get(){return values;}}',c:'typedef struct {int** values;int rows;int* columns;}MatrixBox;MatrixBox* matrixBoxCreate(int** values,int valuesSize,int* valuesColSize){MatrixBox* obj=malloc(sizeof(MatrixBox));obj->values=values;obj->rows=valuesSize;obj->columns=valuesColSize;return obj;}int** matrixBoxGet(MatrixBox* obj,int* returnSize,int** returnColumnSizes){*returnSize=obj->rows;*returnColumnSizes=obj->columns;return obj->values;}void matrixBoxFree(MatrixBox* obj){free(obj);}'};
 const matrix=[[1,2],[],[-3]],input=JSON.stringify([['MatrixBox','get'],[[matrix],[]]]);
 for(const language of [...STATEFUL_RUNNER_LANGUAGES.filter((value)=>value!=='java'),'java'])assert.deepEqual(JSON.parse(await execute(language,prepareStatefulSource(language,contract,code[language],input))),[null,matrix],language);
});
