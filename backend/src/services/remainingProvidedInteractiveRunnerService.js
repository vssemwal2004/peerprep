import {validateRemainingProvidedNodeFixture,remainingProvidedNodeRule} from './remainingProvidedNodeFixtureService.js';
import {parseNodeResultEnvelope} from './customNodeResultEnvelopeService.js';
import {finishProvidedCapture,compactJavaInts} from './remainingProvidedCaptureService.js';
const kinds=new Set(['hidden-grid-unweighted','hidden-grid-weighted','robot-clean']);
export function acceptsRemainingInteractiveOutput(p,tc,raw){const r=remainingProvidedNodeRule(p);if(!r||!kinds.has(r.kind))return undefined;try{const env=parseNodeResultEnvelope(raw);return !!env&&JSON.stringify(env.value)===JSON.stringify(validateRemainingProvidedNodeFixture(p,tc.input).expected);}catch{return false;}}
// The hidden environment supplies precisely the documented public operations.
// No cell matrix, position, target coordinates or cleaned set is passed as a
// learner-method argument. The wrapper retains the independent result oracle.
export function prepareRemainingInteractiveSource(language,p,userCode,input) {
 const f=validateRemainingProvidedNodeFixture(p,input);if(!kinds.has(f.rule.kind))throw Error('Unsupported private interactive API.');
 const robot=f.rule.kind==='robot-clean',weighted=f.rule.kind==='hidden-grid-weighted',cells=f.grid.flat(),rows=f.rows,cols=f.columns,ts=language==='typescript',cpp=language==='cpp',T=robot?'Robot':'GridMaster';
 let prefix='',body='',wrapper='';
 const expected=f.expected;
 if(language==='c') {
  prefix=robot?'typedef struct Robot Robot;bool robotMove(Robot*);void robotTurnLeft(Robot*);void robotTurnRight(Robot*);void robotClean(Robot*);':`typedef struct GridMaster GridMaster;bool gridMasterCanMove(GridMaster*,char);${weighted?'int':'void'} gridMasterMove(GridMaster*,char);bool gridMasterIsTarget(GridMaster*);`;
  const state=`struct ${T}{int* cells;int rows,cols,pos,target,dir;unsigned char*cleaned;};static int _ppI_next(struct ${T}*a,int d){int dr[]={-1,0,1,0},dc[]={0,1,0,-1};if(d<0||d>3)return -1;int r=a->pos/a->cols+dr[d],c=a->pos%a->cols+dc[d];if(r<0||r>=a->rows||c<0||c>=a->cols||a->cells[r*a->cols+c]==0)return -1;return r*a->cols+c;}static int _ppI_direction(char d){return d=='U'?0:d=='R'?1:d=='D'?2:d=='L'?3:-1;}`;
  const methods=robot?'bool robotMove(Robot*a){int n=_ppI_next(a,a->dir);if(n<0)return false;a->pos=n;return true;}void robotTurnLeft(Robot*a){a->dir=(a->dir+3)%4;}void robotTurnRight(Robot*a){a->dir=(a->dir+1)%4;}void robotClean(Robot*a){a->cleaned[a->pos]=1;}':`bool gridMasterCanMove(GridMaster*a,char d){return _ppI_next(a,_ppI_direction(d))>=0;}${weighted?'int':'void'} gridMasterMove(GridMaster*a,char d){int n=_ppI_next(a,_ppI_direction(d));if(n<0)${weighted?'return -1':'return'};a->pos=n;${weighted?'return a->cells[n];':''}}bool gridMasterIsTarget(GridMaster*a){return a->pos==a->target;}`;
  body=`static int cells[]={${cells.join(',')}};unsigned char*cleaned=calloc(${cells.length},1);${T} api={cells,${rows},${cols},${f.start},${f.target??-1},0,cleaned};`;
  if(robot)body+=`${f.rule.methodName}(&api);bool valid=true;for(int i=0;i<${cells.length};i++)if((cells[i]!=0)!=(cleaned[i]!=0))valid=false;free(cleaned);return valid;`;
  else body+=`int result=${f.rule.methodName}(&api);free(cleaned);return result==${expected};`;
  wrapper=state+methods+`bool captureNode(int seed){${body}}`;
 }else if(cpp) {
  prefix=`class ${T}{std::vector<int>cells;int rows,cols,pos,target,dir=0;std::vector<unsigned char>&cleaned;int step(int d){int dr[]={-1,0,1,0},dc[]={0,1,0,-1};if(d<0||d>3)return -1;int r=pos/cols+dr[d],c=pos%cols+dc[d];return r<0||r>=rows||c<0||c>=cols||cells[r*cols+c]==0?-1:r*cols+c;}int direction(char d){return d=='U'?0:d=='R'?1:d=='D'?2:d=='L'?3:-1;}public:${T}(const std::vector<int>&a,int r,int c,int s,int t,std::vector<unsigned char>&mark):cells(a),rows(r),cols(c),pos(s),target(t),cleaned(mark){}${robot?'bool move(){int n=step(dir);if(n<0)return false;pos=n;return true;}void turnLeft(){dir=(dir+3)%4;}void turnRight(){dir=(dir+1)%4;}void clean(){cleaned[pos]=1;}':`bool canMove(char d){return step(direction(d))>=0;}${weighted?'int':'void'} move(char d){int n=step(direction(d));if(n<0)${weighted?'return -1':'return'};pos=n;${weighted?'return cells[n];':''}}bool isTarget(){return pos==target;}`}};`;
  body=`std::vector<int>cells={${cells.join(',')}};std::vector<unsigned char>cleaned(${cells.length},0);${T} api(cells,${rows},${cols},${f.start},${f.target??-1},cleaned);`;
  body+=robot?`Solution().${f.rule.methodName}(api);for(int i=0;i<${cells.length};i++)if((cells[i]!=0)!=(cleaned[i]!=0))return false;return true;`:`int result=Solution().${f.rule.methodName}(api);return result==${expected};`;
  wrapper=`class RemainingInteractiveCapture{public:bool captureNode(int seed){${body}}};`;
 }else if(language==='java') {
  prefix=`class ${T}{private int[]cells;private int rows,cols,pos,target,dir=0;private boolean[]cleaned;${T}(int[]a,int r,int c,int s,int t,boolean[]mark){cells=a.clone();rows=r;cols=c;pos=s;target=t;cleaned=mark;}private int step(int d){int[]dr={-1,0,1,0},dc={0,1,0,-1};if(d<0||d>3)return -1;int r=pos/cols+dr[d],c=pos%cols+dc[d];return r<0||r>=rows||c<0||c>=cols||cells[r*cols+c]==0?-1:r*cols+c;}private int direction(char d){return d=='U'?0:d=='R'?1:d=='D'?2:d=='L'?3:-1;}${robot?'public boolean move(){int n=step(dir);if(n<0)return false;pos=n;return true;}public void turnLeft(){dir=(dir+3)%4;}public void turnRight(){dir=(dir+1)%4;}public void clean(){cleaned[pos]=true;}':`public boolean canMove(char d){return step(direction(d))>=0;}public ${weighted?'int':'void'} move(char d){int n=step(direction(d));if(n<0)${weighted?'return -1':'return'};pos=n;${weighted?'return cells[n];':''}}public boolean isTarget(){return pos==target;}`}}`;
  body=`int[]cells=${compactJavaInts(cells)};boolean[]cleaned=new boolean[${cells.length}];${T} api=new ${T}(cells,${rows},${cols},${f.start},${f.target??-1},cleaned);`;
  body+=robot?`new Solution().${f.rule.methodName}(api);for(int i=0;i<${cells.length};i++)if((cells[i]!=0)!=cleaned[i])return false;return true;`:`int result=new Solution().${f.rule.methodName}(api);return result==${expected};`;
  wrapper=`class RemainingInteractiveCapture{public boolean captureNode(int seed){${body}}}`;
 }else if(language==='python') {
  const lines=[`class ${T}:`,'    def __init__(self,cells,rows,cols,start,target,cleaned):','        self.__cells=tuple(cells)','        self.__rows=rows; self.__cols=cols','        self.__pos=start; self.__target=target; self.__dir=0','        self.__cleaned=cleaned','    def __step(self,d):','        if d<0 or d>3: return -1','        r=self.__pos//self.__cols+[-1,0,1,0][d]','        c=self.__pos%self.__cols+[0,1,0,-1][d]','        if r<0 or r>=self.__rows or c<0 or c>=self.__cols or self.__cells[r*self.__cols+c]==0: return -1','        return r*self.__cols+c'];
  if(robot)lines.push('    def move(self):','        nxt=self.__step(self.__dir)','        if nxt<0: return False','        self.__pos=nxt','        return True','    def turnLeft(self): self.__dir=(self.__dir+3)%4','    def turnRight(self): self.__dir=(self.__dir+1)%4','    def clean(self): self.__cleaned[self.__pos]=True');
  else lines.push('    def canMove(self,d): return self.__step("URDL".find(d) if len(d)==1 else -1)>=0','    def move(self,d):','        nxt=self.__step("URDL".find(d) if len(d)==1 else -1)',`        if nxt<0: return ${weighted?'-1':'None'}`,'        self.__pos=nxt',...(weighted?['        return self.__cells[nxt]']:[]),'    def isTarget(self): return self.__pos==self.__target');
  prefix=lines.join('\n')+'\n';
  const capture=[`cells=${JSON.stringify(cells)}`,`cleaned=[False]*${cells.length}`,`api=${T}(cells,${rows},${cols},${f.start},${f.target??-1},cleaned)`];
  capture.push(robot?`Solution().${f.rule.methodName}(api)`:`result=Solution().${f.rule.methodName}(api)`,robot?'return all(bool(value)==bool(mark) for value,mark in zip(cells,cleaned))':`return result==${expected}`);
  wrapper='class RemainingInteractiveCapture:\n    def captureNode(self,seed):\n'+capture.map(s=>'        '+s).join('\n')+'\n';
 }else if(language==='javascript'||ts) {
  // Closure-held state is not a public object property. Methods cannot reveal
  // the environment matrix or coordinates to a learner's public API.
  const apiTypes=robot?'move:()=>boolean;turnLeft:()=>void;turnRight:()=>void;clean:()=>void;':`canMove:(direction:string)=>boolean;move:(direction:string)=>${weighted?'number':'void'};isTarget:()=>boolean;`;
  prefix=`class ${T}{${ts?apiTypes:''}constructor(cells${ts?':number[]':''},rows${ts?':number':''},cols${ts?':number':''},start${ts?':number':''},target${ts?':number':''},cleaned${ts?':boolean[]':''}){cells=cells.slice();let pos=start,dir=0;const step=(d${ts?':number':''})=>{if(d<0||d>3)return -1;const r=Math.floor(pos/cols)+[-1,0,1,0][d],c=pos%cols+[0,1,0,-1][d];return r<0||r>=rows||c<0||c>=cols||cells[r*cols+c]===0?-1:r*cols+c;};${robot?'this.move=()=>{const n=step(dir);if(n<0)return false;pos=n;return true;};this.turnLeft=()=>{dir=(dir+3)%4;};this.turnRight=()=>{dir=(dir+1)%4;};this.clean=()=>{cleaned[pos]=true;};':`const direction=(d${ts?':string':''})=>d.length===1?'URDL'.indexOf(d):-1;this.canMove=(d${ts?':string':''})=>step(direction(d))>=0;this.move=(d${ts?':string':''})=>{const n=step(direction(d));if(n<0)return ${weighted?'-1':'undefined'};pos=n;${weighted?'return cells[n];':''}};this.isTarget=()=>pos===target;`}}}`;
  body=`const cells=${JSON.stringify(cells)},cleaned=Array(cells.length).fill(false),api=new ${T}(cells,${rows},${cols},${f.start},${f.target??-1},cleaned);`;
  const call=(/class\s+Solution\b/.test(userCode)?'new Solution().':'')+f.rule.methodName+'(api)';
  body+=robot?`${call};return cells.every((v,i)=>Boolean(v)===Boolean(cleaned[i]));`:`const result=${call};return result===${expected};`;
  wrapper=`function captureNode(seed${ts?':number':''}){${body}}`;
 }else throw Error('Six requested languages required.');
 return finishProvidedCapture(language,userCode,prefix,wrapper,'RemainingInteractiveCapture',f.expected);
}
