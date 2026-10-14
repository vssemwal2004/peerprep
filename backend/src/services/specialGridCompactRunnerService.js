import { buildFunctionInputPayload } from './functionTestInputService.js';

export const SPECIAL_GRID_COMPACT_PREFIX = 'PP_SPECIAL_GRID_VALID:';

export function isSpecialGridCompactProblem(problem) {
  const contract = problem?.functionContract;
  return problem?.title === 'Fill a Special Grid'
    && problem?.executionMode === 'function'
    && String(problem?.category || 'DSA').toUpperCase() === 'DSA'
    && contract?.kind !== 'stateful'
    && contract?.className === 'Solution'
    && contract?.methodName === 'specialGrid'
    && contract?.returnType === 'integer[][]'
    && contract?.outputMode === 'return'
    && contract?.parameters?.length === 1
    && contract.parameters[0].name === 'n'
    && contract.parameters[0].type === 'integer';
}

export function acceptsSpecialGridCompactOutput(problem, testCase, actualOutput) {
  if (!isSpecialGridCompactProblem(problem)) return null;
  const text = String(actualOutput || '').trim();
  if (text === 'PP_SPECIAL_GRID_INVALID') return false;
  if (!text.startsWith(SPECIAL_GRID_COMPACT_PREFIX)) return null;
  let n;
  try { [n] = buildFunctionInputPayload(testCase?.input || '', problem.functionContract).args; } catch { return false; }
  return text === `${SPECIAL_GRID_COMPACT_PREFIX}${n}`;
}

const runners = {
  python: (source, n) => `${source}\n\ndef __pp_special_validate(g,n):\n s=1<<n; total=s*s\n if not isinstance(g,list) or len(g)!=s or any(not isinstance(row,list) or len(row)!=s for row in g): return False\n seen=bytearray(total)\n def walk(r,c,size):\n  if size==1:\n   v=g[r][c]\n   if type(v) is not int or v<0 or v>=total or seen[v]: return None\n   seen[v]=1; return (v,v)\n  h=size//2; tr=walk(r,c+h,h); br=walk(r+h,c+h,h); bl=walk(r+h,c,h); tl=walk(r,c,h)\n  if None in (tr,br,bl,tl) or not (tr[1]<br[0] and br[1]<bl[0] and bl[1]<tl[0]): return None\n  return (tr[0],tl[1])\n return walk(0,0,s) is not None and all(seen)\n__pp_n=${n}\n__pp_grid=Solution().specialGrid(__pp_n)\nprint('${SPECIAL_GRID_COMPACT_PREFIX}'+str(__pp_n) if __pp_special_validate(__pp_grid,__pp_n) else 'PP_SPECIAL_GRID_INVALID')\n`,
  cpp: (source, n) => `#include <bits/stdc++.h>\nusing namespace std;\n${source}\nstatic vector<vector<int>>* __ppg; static vector<unsigned char> __pps; static int __ppt;\nstatic pair<int,int> __ppwalk(int r,int c,int z){if(z==1){int v=(*__ppg)[r][c];if(v<0||v>=__ppt||__pps[v])return {-1,-1};__pps[v]=1;return {v,v};}int h=z/2;auto tr=__ppwalk(r,c+h,h),br=__ppwalk(r+h,c+h,h),bl=__ppwalk(r+h,c,h),tl=__ppwalk(r,c,h);if(tr.first<0||br.first<0||bl.first<0||tl.first<0||tr.second>=br.first||br.second>=bl.first||bl.second>=tl.first)return {-1,-1};return {tr.first,tl.second};}\nint main(){int n=${n},s=1<<n;auto g=Solution().specialGrid(n);bool ok=(int)g.size()==s;for(auto&r:g)ok=ok&&(int)r.size()==s;__ppg=&g;__ppt=s*s;__pps.assign(__ppt,0);if(ok)ok=__ppwalk(0,0,s).first>=0&&find(__pps.begin(),__pps.end(),0)==__pps.end();cout<<(ok?"${SPECIAL_GRID_COMPACT_PREFIX}${n}":"PP_SPECIAL_GRID_INVALID");}\n`,
  c: (source, n) => `#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n${source}\nstatic int**__ppg;static unsigned char*__pps;static int __ppt;typedef struct{int lo,hi,ok;}__ppR;static __ppR __ppwalk(int r,int c,int z){if(z==1){int v=__ppg[r][c];if(v<0||v>=__ppt||__pps[v])return(__ppR){0,0,0};__pps[v]=1;return(__ppR){v,v,1};}int h=z/2;__ppR tr=__ppwalk(r,c+h,h),br=__ppwalk(r+h,c+h,h),bl=__ppwalk(r+h,c,h),tl=__ppwalk(r,c,h);if(!tr.ok||!br.ok||!bl.ok||!tl.ok||tr.hi>=br.lo||br.hi>=bl.lo||bl.hi>=tl.lo)return(__ppR){0,0,0};return(__ppR){tr.lo,tl.hi,1};}int main(void){int n=${n},s=1<<n,rows=0,*cols=NULL;__ppg=specialGrid(n,&rows,&cols);__ppt=s*s;__pps=calloc(__ppt,1);int ok=__ppg&&cols&&rows==s;for(int i=0;i<rows&&ok;i++)ok=cols[i]==s&&__ppg[i];if(ok)ok=__ppwalk(0,0,s).ok;for(int i=0;i<__ppt&&ok;i++)ok=__pps[i];printf("%s",ok?"${SPECIAL_GRID_COMPACT_PREFIX}${n}":"PP_SPECIAL_GRID_INVALID");return 0;}\n`,
  java: (source, n) => `import java.util.*;\n${source}\nclass Main{static int[][]g;static boolean[]seen;static int total;static int[]walk(int r,int c,int z){if(z==1){int v=g[r][c];if(v<0||v>=total||seen[v])return null;seen[v]=true;return new int[]{v,v};}int h=z/2;int[]tr=walk(r,c+h,h),br=walk(r+h,c+h,h),bl=walk(r+h,c,h),tl=walk(r,c,h);if(tr==null||br==null||bl==null||tl==null||tr[1]>=br[0]||br[1]>=bl[0]||bl[1]>=tl[0])return null;return new int[]{tr[0],tl[1]};}public static void main(String[]x){int n=${n},s=1<<n;g=new Solution().specialGrid(n);boolean ok=g!=null&&g.length==s;if(ok)for(int[]row:g)ok&=row!=null&&row.length==s;total=s*s;seen=new boolean[total];if(ok)ok=walk(0,0,s)!=null;for(boolean value:seen)ok&=value;System.out.print(ok?"${SPECIAL_GRID_COMPACT_PREFIX}${n}":"PP_SPECIAL_GRID_INVALID");}}\n`,
  javascript: (source, n) => `${source}\nfunction __ppSpecialValidate(g,n){const s=2**n,total=s*s;if(!Array.isArray(g)||g.length!==s||g.some(r=>!Array.isArray(r)||r.length!==s))return false;const seen=new Uint8Array(total);function walk(r,c,z){if(z===1){const v=g[r][c];if(!Number.isSafeInteger(v)||v<0||v>=total||seen[v])return null;seen[v]=1;return[v,v];}const h=z/2,tr=walk(r,c+h,h),br=walk(r+h,c+h,h),bl=walk(r+h,c,h),tl=walk(r,c,h);if(!tr||!br||!bl||!tl||tr[1]>=br[0]||br[1]>=bl[0]||bl[1]>=tl[0])return null;return[tr[0],tl[1]];}return !!walk(0,0,s)&&seen.every(Boolean);}\n{const n=${n},g=specialGrid(n);console.log(__ppSpecialValidate(g,n)?'${SPECIAL_GRID_COMPACT_PREFIX}${n}':'PP_SPECIAL_GRID_INVALID');}\n`,
  typescript: (source, n) => `${source}\nfunction __ppSpecialValidate(g:any,n:number):boolean{const s=2**n,total=s*s;if(!Array.isArray(g)||g.length!==s||g.some((r:any)=>!Array.isArray(r)||r.length!==s))return false;const seen=new Uint8Array(total);function walk(r:number,c:number,z:number):number[]|null{if(z===1){const v=g[r][c];if(!Number.isSafeInteger(v)||v<0||v>=total||seen[v])return null;seen[v]=1;return[v,v];}const h=z/2,tr=walk(r,c+h,h),br=walk(r+h,c+h,h),bl=walk(r+h,c,h),tl=walk(r,c,h);if(!tr||!br||!bl||!tl||tr[1]>=br[0]||br[1]>=bl[0]||bl[1]>=tl[0])return null;return[tr[0],tl[1]];}return !!walk(0,0,s)&&seen.every(Boolean);}\n{const n=${n},g=specialGrid(n);console.log(__ppSpecialValidate(g,n)?'${SPECIAL_GRID_COMPACT_PREFIX}${n}':'PP_SPECIAL_GRID_INVALID');}\n`,
};

export function prepareSpecialGridCompactSource(language, problem, source, testInput) {
  if (!isSpecialGridCompactProblem(problem) || !runners[language]) throw new Error('Unsupported compact Special Grid runner request.');
  const [n] = buildFunctionInputPayload(testInput, problem.functionContract).args;
  if (!Number.isInteger(n) || n < 0 || n > 10) throw new Error('Special Grid requires n between 0 and 10.');
  return runners[language](String(source || ''), n);
}
