// These source statements explicitly permit multiple valid answers.
// This file remains outside production until a drained campaign boundary.
import {buildFunctionInputPayload,parseFunctionTestInput}from'./functionTestInputService.js';
import{validateStatefulFixture}from'./statefulRunnerService.js';
import {acceptsRootFlexibleOutput} from './flexibleOutputPropertyService.js';
const integers=xs=>Array.isArray(xs)&&xs.every(Number.isSafeInteger);
const parse=raw=>{try{const p=parseFunctionTestInput(String(raw??'').trim());return p.positional.length===1?p.positional[0]:undefined;}catch{return undefined;}};
const string=raw=>{const s=String(raw??'').trim();return /^["']/.test(s)?parse(s):s;};
const subsequence=(xs,ys)=>{let i=0;for(const value of ys)if(i<xs.length&&xs[i]===value)i++;return i===xs.length;};
export function validShortestCommonSupersequence(args,raw){const[a,b]=args,out=string(raw);if(typeof a!=='string'||typeof b!=='string'||typeof out!=='string'||a.length>1000||b.length>1000||!subsequence(a,out)||!subsequence(b,out))return false;let dp=new Uint16Array(b.length+1);for(const x of a){const next=new Uint16Array(b.length+1);for(let j=1;j<=b.length;j++)next[j]=x===b[j-1]?dp[j-1]+1:Math.max(dp[j],next[j-1]);dp=next;}return out.length===a.length+b.length-dp[b.length];}
export function validAlphabetBoardPath(args,raw){const[target]=args,out=string(raw);if(typeof target!=='string'||!/^[a-z]{1,100}$/.test(target)||typeof out!=='string'||!/^[UDLR!]+$/.test(out))return false;let row=0,col=0,at=0,moves=0,optimal=0,previous=0;for(const ch of target){const index=ch.charCodeAt(0)-97;optimal+=Math.abs(Math.floor(index/5)-Math.floor(previous/5))+Math.abs(index%5-previous%5);previous=index;}for(const step of out){if(step==='!'){if(at>=target.length||String.fromCharCode(97+row*5+col)!==target[at++])return false;}else{if(step==='U')row--;if(step==='D')row++;if(step==='L')col--;if(step==='R')col++;moves++;if(row<0||row>5||col<0||col>4||(row===5&&col!==0))return false;}}return at===target.length&&moves===optimal;}
export function validMaxSumSubsequence(args,raw){const[nums,k]=args,out=parse(raw);if(!integers(nums)||!Number.isInteger(k)||k<1||k>nums.length||!integers(out)||out.length!==k||!subsequence(out,nums))return false;const best=nums.slice().sort((a,b)=>b-a).slice(0,k).reduce((a,b)=>a+b,0);return Number.isSafeInteger(best)&&out.reduce((a,b)=>a+b,0)===best;}
export function validPeakGrid(args,raw){const[mat]=args,out=parse(raw);if(!Array.isArray(mat)||!mat.length||!integers(mat[0])||!mat[0].length||mat.some(row=>!integers(row)||row.length!==mat[0].length||row.some(x=>x<1))||!integers(out)||out.length!==2)return false;const[r,c]=out;if(r<0||r>=mat.length||c<0||c>=mat[0].length)return false;const value=mat[r][c];return[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].every(([y,x])=>y<0||x<0||y>=mat.length||x>=mat[0].length||value>mat[y][x]);}
// 3955: the cost is the sum of the zero-based positions occupied by ones.
// Check each witness, then count all eligible masks independently of its order.
export function validBinaryStringsWithCost(args,raw){const[n,k]=args,out=parse(raw);if(!Number.isInteger(n)||n<1||n>12||!Number.isInteger(k)||k<0||k>n*(n-1)/2||!Array.isArray(out)||out.some(s=>typeof s!=='string'||s.length!==n||!/^[01]+$/.test(s)||s.includes('11'))||new Set(out).size!==out.length)return false;for(const s of out){let cost=0;for(let i=0;i<n;i++)if(s[i]==='1')cost+=i;if(cost>k)return false;}let count=0;for(let mask=0;mask<2**n;mask++){if(mask&(mask>>1))continue;let cost=0;for(let i=0;i<n;i++)if(mask>>i&1)cost+=i;if(cost<=k)count++;}return out.length===count;}
export function validUniqueZeroSum(args,raw){const[n]=args,out=parse(raw);return Number.isInteger(n)&&n>=1&&n<=1000&&integers(out)&&out.length===n&&new Set(out).size===n&&out.every(v=>v>=-2147483648&&v<=2147483647)&&out.reduce((sum,v)=>sum+BigInt(v),0n)===0n;}
export function validCustomSortString(args,raw){const[order,s]=args,out=string(raw);if(typeof order!=='string'||!/^[a-z]{1,26}$/.test(order)||new Set(order).size!==order.length||typeof s!=='string'||!/^[a-z]{1,200}$/.test(s)||typeof out!=='string'||out.length!==s.length)return false;const counts=new Map();for(const ch of s)counts.set(ch,(counts.get(ch)||0)+1);let previous=-1;for(const ch of out){if(!counts.get(ch))return false;counts.set(ch,counts.get(ch)-1);const rank=order.indexOf(ch);if(rank>=0){if(rank<previous)return false;previous=rank;}}return true;}
export function validIndexDifferencePair(args,raw){const[nums,indexDifference,valueDifference]=args,out=parse(raw);if(!integers(nums)||nums.length<1||nums.length>100000||nums.some(v=>v<0||v>1000000000)||!Number.isInteger(indexDifference)||indexDifference<0||indexDifference>100000||!Number.isInteger(valueDifference)||valueDifference<0||valueDifference>1000000000||!integers(out)||out.length!==2)return false;const[i,j]=out;if(i===-1&&j===-1){let low=Infinity,high=-Infinity;for(let right=indexDifference;right<nums.length;right++){const value=nums[right-indexDifference];low=Math.min(low,value);high=Math.max(high,value);if(nums[right]-low>=valueDifference||high-nums[right]>=valueDifference)return false;}return true;}return i>=0&&j>=0&&i<nums.length&&j<nums.length&&Math.abs(i-j)>=indexDifference&&Math.abs(nums[i]-nums[j])>=valueDifference;}
export function validNotAverageNeighbors(args,raw){const[nums]=args,out=parse(raw);if(!integers(nums)||nums.length<3||nums.length>100000||nums.some(v=>v<0||v>100000)||new Set(nums).size!==nums.length||!integers(out)||out.length!==nums.length||new Set(out).size!==out.length)return false;const original=new Set(nums);if(out.some(v=>!original.has(v)))return false;for(let i=1;i+1<out.length;i++)if(out[i]*2===out[i-1]+out[i+1])return false;return true;}
export function validExactlyKPathsGridOne(args,raw){const[m,n,k]=args,out=parse(raw);if(!Number.isInteger(m)||m<1||m>10||!Number.isInteger(n)||n<1||n>10||!Number.isInteger(k)||k<1||k>4||!Array.isArray(out))return false;if(!out.length){const max=Array(n).fill(1);for(let r=1;r<m;r++)for(let c=1;c<n;c++)max[c]+=max[c-1];return max[n-1]<k;}if(out.length!==m||out.some(row=>typeof row!=='string'||row.length!==n||!/^[.#]+$/.test(row)))return false;const dp=Array(n).fill(0);for(let r=0;r<m;r++)for(let c=0;c<n;c++){if(out[r][c]==='#')dp[c]=0;else dp[c]=r===0&&c===0?1:dp[c]+(c?dp[c-1]:0);}return dp[n-1]===k;}
const profiles={shortestCommonSupersequence:{title:'Shortest Common Supersequence',parameters:['string','string'],returnType:'string',accepts:validShortestCommonSupersequence},alphabetBoardPath:{title:'Alphabet Board Path',parameters:['string'],returnType:'string',accepts:validAlphabetBoardPath},maxSubsequence:{title:'Find Subsequence of Length K With the Largest Sum',parameters:['integer[]','integer'],returnType:'integer[]',accepts:validMaxSumSubsequence},findPeakGrid:{title:'Find a Peak Element II',parameters:['integer[][]'],returnType:'integer[]',accepts:validPeakGrid},generateValidStrings:{title:'Valid Binary Strings With Cost Limit',parameters:['integer','integer'],returnType:'string[]',accepts:validBinaryStringsWithCost}};
profiles.sumZero={title:'Find N Unique Integers Sum up to Zero',parameters:['integer'],returnType:'integer[]',accepts:validUniqueZeroSum};
profiles.customSortString={title:'Custom Sort String',parameters:['string','string'],returnType:'string',accepts:validCustomSortString};
profiles.findIndices={title:'Find Indices With Index and Value Difference II',parameters:['integer[]','integer','integer'],returnType:'integer[]',accepts:validIndexDifferencePair};
profiles.rearrangeArray={title:'Array With Elements Not Equal to Average of Neighbors',parameters:['integer[]'],returnType:'integer[]',accepts:validNotAverageNeighbors};
profiles.createGrid={title:'Create Grid With Exactly K Paths I',parameters:['integer','integer','integer'],returnType:'string[]',accepts:validExactlyKPathsGridOne};
// 366: remove all current leaves simultaneously; values may repeat across nodes.
// Only values within each round may be permuted. Round positions stay ordered.
export function validFindLeavesRounds(args,raw){
 const[values]=args,out=parse(raw);
 if(!Array.isArray(values)||!values.length||!Number.isInteger(values[0])||!Array.isArray(out))return false;
 const parents=[-1],degrees=[0],nodes=[values[0]];let cursor=1;
 for(let parent=0;parent<nodes.length;parent++)for(let side=0;side<2&&cursor<values.length;side++){
  const value=values[cursor++];if(value===null)continue;
  if(!Number.isInteger(value)||value< -100||value>100)return false;
  nodes.push(value);parents.push(parent);degrees.push(0);degrees[parent]++;
 }
 if(values.slice(cursor).some(value=>value!==null)||nodes.length>100||nodes[0]< -100||nodes[0]>100)return false;
 let leaves=degrees.map((n,i)=>n===0?i:-1).filter(i=>i>=0),round=0;
 while(leaves.length){
  const actual=out[round++];if(!integers(actual)||actual.length!==leaves.length)return false;
  const counts=new Map();for(const i of leaves)counts.set(nodes[i],(counts.get(nodes[i])||0)+1);
  for(const value of actual){if(!counts.get(value))return false;counts.set(value,counts.get(value)-1);}
  const next=[];for(const i of leaves){const p=parents[i];if(p>=0&&--degrees[p]===0)next.push(p);}leaves=next;
 }
 return out.length===round;
}
profiles.findLeaves={title:'Find Leaves of Binary Tree',parameters:['tree-node'],returnType:'integer[][]',accepts:validFindLeavesRounds};
// 742: a closest leaf may be reached through either child or the parent.
export function validClosestLeaf(args,raw){
 const[values,k]=args,answer=parse(raw);
 if(!Array.isArray(values)||!values.length||!Number.isInteger(k)||!Number.isInteger(answer)||!Number.isInteger(values[0]))return false;
 const nodes=[values[0]],parents=[-1],children=[[]];let cursor=1;
 for(let p=0;p<nodes.length;p++)for(let side=0;side<2&&cursor<values.length;side++){
  const value=values[cursor++];if(value===null)continue;
  if(!Number.isInteger(value)||value<1||value>1000)return false;
  children[p].push(nodes.length);nodes.push(value);parents.push(p);children.push([]);
 }
 if(nodes[0]<1||nodes[0]>1000||nodes.length>1000||new Set(nodes).size!==nodes.length||values.slice(cursor).some(v=>v!==null))return false;
 const start=nodes.indexOf(k),selected=nodes.indexOf(answer);if(start<0||selected<0||children[selected].length)return false;
 const distance=Array(nodes.length).fill(-1),queue=[start];distance[start]=0;let minimum=Infinity;
 for(let i=0;i<queue.length;i++){const p=queue[i];if(distance[p]>minimum)break;if(!children[p].length)minimum=distance[p];for(const next of [...children[p],parents[p]])if(next>=0&&distance[next]<0){distance[next]=distance[p]+1;queue.push(next);}}
 return distance[selected]===minimum;
}
profiles.findClosestLeaf={title:'Closest Leaf In A Binary Tree',parameters:['tree-node','integer'],returnType:'integer',accepts:validClosestLeaf};
export function validStrobogrammaticNumbers(args,raw){
 const[n]=args,out=parse(raw),turn={'0':'0','1':'1','6':'9','8':'8','9':'6'};
 if(!Number.isInteger(n)||n<1||n>14||!Array.isArray(out)||new Set(out).size!==out.length)return false;
 const count=n===1?3:4*5**(Math.floor(n/2)-1)*(n%2?3:1);if(out.length!==count)return false;
 return out.every(s=>typeof s==='string'&&s.length===n&&(n===1||s[0]!=='0')&&[...s].every((ch,i)=>turn[ch]===s[n-i-1]));
}
profiles.findStrobogrammatic={title:'Strobogrammatic Number II',parameters:['integer'],returnType:'string[]',accepts:validStrobogrammaticNumbers};
// 3313: simultaneous marking reaches exactly the nodes at maximum graph distance.
// Diameter endpoints give the eccentricity; LCA checks each selected witness.
export function validLastMarkedTreeNodes(args,raw){
 const[edges]=args,out=parse(raw);
 if(!Array.isArray(edges)||edges.length<1||edges.length>=100000||!integers(out)||out.length!==edges.length+1)return false;
 const n=edges.length+1,adj=Array.from({length:n},()=>[]);
 for(const edge of edges){if(!integers(edge)||edge.length!==2)return false;const[a,b]=edge;if(a<0||b<0||a>=n||b>=n||a===b)return false;adj[a].push(b);adj[b].push(a);}
 if(out.some(x=>x<0||x>=n))return false;
 const parent=new Int32Array(n),depth=new Int32Array(n),seen=new Uint8Array(n),queue=new Int32Array(n);let tail=1;seen[0]=1;
 for(let i=0;i<tail;i++){const u=queue[i];for(const v of adj[u])if(!seen[v]){seen[v]=1;parent[v]=u;depth[v]=depth[u]+1;queue[tail++]=v;}}
 if(tail!==n)return false;
 const distances=start=>{const d=new Int32Array(n);d.fill(-1);d[start]=0;queue[0]=start;let end=1,farthest=start;for(let i=0;i<end;i++){const u=queue[i];if(d[u]>d[farthest])farthest=u;for(const v of adj[u])if(d[v]<0){d[v]=d[u]+1;queue[end++]=v;}}return{d,farthest};};
 const a=distances(0).farthest,fromA=distances(a),fromB=distances(fromA.farthest),levels=Math.ceil(Math.log2(n))+1,up=[parent];
 for(let level=1;level<levels;level++){const next=new Int32Array(n),previous=up[level-1];for(let i=0;i<n;i++)next[i]=previous[previous[i]];up.push(next);}
 const ancestor=(a,b)=>{if(depth[a]<depth[b])[a,b]=[b,a];let gap=depth[a]-depth[b];for(let bit=0;gap;bit++,gap>>=1)if(gap&1)a=up[bit][a];if(a===b)return a;for(let level=levels-1;level>=0;level--)if(up[level][a]!==up[level][b]){a=up[level][a];b=up[level][b];}return parent[a];};
 return out.every((chosen,start)=>depth[start]+depth[chosen]-2*depth[ancestor(start,chosen)]===Math.max(fromA.d[start],fromB.d[start]));
}
profiles.lastMarkedNodes={title:'Find The Last Marked Nodes In Tree',parameters:['integer[][]'],returnType:'integer[]',accepts:validLastMarkedTreeNodes};
export function validSpecialGrid(args,raw){
 const[n]=args,out=parse(raw);if(!Number.isInteger(n)||n<0||n>10||!Array.isArray(out))return false;
 const side=2**n,total=side*side;if(out.length!==side||out.some(row=>!Array.isArray(row)||row.length!==side))return false;
 const seen=new Uint8Array(total);
 const walk=(r,c,size)=>{if(size===1){const value=out[r][c];if(!Number.isSafeInteger(value)||value<0||value>=total||seen[value])return-1;seen[value]=1;return value*total+value;}const half=size/2,tr=walk(r,c+half,half),br=walk(r+half,c+half,half),bl=walk(r+half,c,half),tl=walk(r,c,half);if(tr<0||br<0||bl<0||tl<0||tr%total>=Math.floor(br/total)||br%total>=Math.floor(bl/total)||bl%total>=Math.floor(tl/total))return-1;return Math.floor(tr/total)*total+tl%total;};
 return walk(0,0,side)>=0;
}
profiles.specialGrid={title:'Fill a Special Grid',parameters:['integer'],returnType:'integer[][]',accepts:validSpecialGrid};
// Complete collections are checked independently, preserving every board's row order.
export function validParenthesesCollection(args,raw){
 const[n]=args,out=parse(raw);if(!Number.isInteger(n)||n<1||n>8||!Array.isArray(out)||new Set(out).size!==out.length)return false;
 for(const text of out){if(typeof text!=='string'||text.length!==2*n||!/^[()]+$/.test(text))return false;let depth=0;for(const ch of text){depth+=ch==='('?1:-1;if(depth<0)return false;}if(depth!==0)return false;}
 const count=[1];for(let size=1;size<=n;size++){let total=0;for(let left=0;left<size;left++)total+=count[left]*count[size-1-left];count.push(total);}return out.length===count[n];
}
export function validQueensCollection(args,raw){
 const[n]=args,out=parse(raw);if(!Number.isInteger(n)||n<1||n>9||!Array.isArray(out)||new Set(out.map(JSON.stringify)).size!==out.length)return false;
 for(const board of out){if(!Array.isArray(board)||board.length!==n||board.some(row=>typeof row!=='string'||row.length!==n||!/^[.Q]+$/.test(row)))return false;const cols=new Set(),rising=new Set(),falling=new Set();for(let r=0;r<n;r++){const c=board[r].indexOf('Q');if(c<0||board[r].lastIndexOf('Q')!==c||cols.has(c)||rising.has(r+c)||falling.has(r-c))return false;cols.add(c);rising.add(r+c);falling.add(r-c);}}
 const all=(1<<n)-1;function count(cols,left,right){if(cols===all)return 1;let choices=all&~(cols|left|right),total=0;while(choices){const bit=choices&-choices;choices-=bit;total+=count(cols|bit,((left|bit)<<1)&all,(right|bit)>>>1);}return total;}return out.length===count(0,0,0);
}
export function validBinaryCycle(args,raw,requiresZero=false){
 const[n,start=0]=args,out=parse(raw);if(!Number.isInteger(n)||n<1||n>16||!Number.isInteger(start)||start<0||start>=2**n||!integers(out)||out.length!==2**n||out[0]!==start||(requiresZero&&args.length!==1))return false;
 const seen=new Uint8Array(2**n);for(let i=0;i<out.length;i++){const value=out[i],next=out[(i+1)%out.length];if(value<0||value>=seen.length||seen[value])return false;seen[value]=1;const diff=value^next;if(!diff||(diff&(diff-1)))return false;}return true;
}
profiles.generateParenthesis={title:'Generate Parentheses',parameters:['integer'],returnType:'string[]',accepts:validParenthesesCollection};
profiles.solveNQueens={title:'N-Queens',parameters:['integer'],returnType:'string[][]',accepts:validQueensCollection};
profiles.grayCode={title:'Gray Code',parameters:['integer'],returnType:'integer[]',accepts:(args,raw)=>validBinaryCycle(args,raw,true)};
profiles.circularPermutation={title:'Circular Permutation in Binary Representation',parameters:['integer','integer'],returnType:'integer[]',accepts:validBinaryCycle};
export function validMostSimilarWalk(args,raw){
 const[n,roads,names,target]=args,out=parse(raw),word=x=>typeof x==='string'&&/^[A-Z]{3}$/.test(x);
 if(!Number.isInteger(n)||n<2||n>100||!Array.isArray(roads)||!Array.isArray(names)||names.length!==n||!names.every(word)||!Array.isArray(target)||target.length<1||target.length>100||!target.every(word)||!integers(out)||out.length!==target.length||out.some(x=>x<0||x>=n))return false;
 const adjacency=Array.from({length:n},()=>new Set());for(const edge of roads){if(!integers(edge)||edge.length!==2||edge.some(x=>x<0||x>=n)||edge[0]===edge[1]||adjacency[edge[0]].has(edge[1]))return false;adjacency[edge[0]].add(edge[1]);adjacency[edge[1]].add(edge[0]);}
 const visited=new Set([0]),queue=[0];for(let i=0;i<queue.length;i++)for(const next of adjacency[queue[i]])if(!visited.has(next)){visited.add(next);queue.push(next);}if(visited.size!==n||out.some((x,i)=>i&&!adjacency[out[i-1]].has(x)))return false;
 let costs=names.map(name=>Number(name!==target[0]));for(let at=1;at<target.length;at++)costs=names.map((name,node)=>Math.min(...[...adjacency[node]].map(previous=>costs[previous]))+Number(name!==target[at]));
 return out.reduce((sum,node,i)=>sum+Number(names[node]!==target[i]),0)===Math.min(...costs);
}
export function validShortestEncoding(args,raw){
 const[s]=args,out=string(raw);if(typeof s!=='string'||!/^[a-z]{1,150}$/.test(s)||typeof out!=='string'||out.length>s.length)return false;
 let cursor=0;function decode(nested=false){let decoded='';while(cursor<out.length&&out[cursor]!==']'){const ch=out[cursor];if(/[a-z]/.test(ch)){decoded+=ch;cursor++;}else if(/[1-9]/.test(ch)){let digits='';while(cursor<out.length&&/[0-9]/.test(out[cursor]))digits+=out[cursor++];const count=Number(digits);if(!Number.isSafeInteger(count)||count<1||count>s.length||out[cursor++]!=='[')throw Error('Invalid encoding count');const inside=decode(true);if(!inside.length||out[cursor++]!==']'||inside.length*count>s.length)throw Error('Invalid encoding group');decoded+=inside.repeat(count);}else throw Error('Invalid encoding grammar');if(decoded.length>s.length)throw Error('Excess expanded length');}if(nested&&cursor===out.length)throw Error('Missing closing bracket');return decoded;}
 try{if(decode()!==s||cursor!==out.length)return false;}catch{return false;}
 const size=s.length,dp=Array.from({length:size},()=>Array(size).fill(0));for(let length=1;length<=size;length++)for(let left=0;left+length<=size;left++){const right=left+length-1;let best=length;for(let cut=left;cut<right;cut++)best=Math.min(best,dp[left][cut]+dp[cut+1][right]);for(let period=1;period<length;period++)if(length%period===0&&s.slice(left,right+1)===s.slice(left,left+period).repeat(length/period))best=Math.min(best,String(length/period).length+2+dp[left][left+period-1]);dp[left][right]=best;}
 return out.length===dp[0][size-1]&&(out.length<size||out===s);
}
export function validUniqueAbbreviation(args,raw){
 const[target,dictionary]=args,out=string(raw);if(typeof target!=='string'||!/^[a-z]{1,21}$/.test(target)||!Array.isArray(dictionary)||dictionary.length>1000||dictionary.some(x=>typeof x!=='string'||!/^[a-z]{1,100}$/.test(x)||x===target)||(dictionary.length&&Math.log2(dictionary.length)+target.length>21)||typeof out!=='string')return false;
 let at=0,cost=0,keep=0;for(let i=0;i<out.length;){if(/[a-z]/.test(out[i])){if(at>=target.length||target[at]!==out[i++])return false;keep|=1<<at++;cost++;}else{if(!/[1-9]/.test(out[i]))return false;let digits='';while(i<out.length&&/[0-9]/.test(out[i]))digits+=out[i++];const length=Number(digits);if(!Number.isSafeInteger(length)||length<1||at+length>target.length)return false;at+=length;cost++;}}if(at!==target.length)return false;
 const differences=dictionary.filter(x=>x.length===target.length).map(word=>{let bits=0;for(let i=0;i<target.length;i++)if(word[i]!==target[i])bits|=1<<i;return bits;});if(differences.some(bits=>(bits&keep)===0))return false;
 const all=(1<<target.length)-1,popcount=value=>{let count=0;while(value){value&=value-1;count++;}return count;};
 // Each consecutive omitted run counts as one token, including multi-digit runs.
 for(let mask=0;mask<=all;mask++){const omitted=all^mask,runStarts=omitted&~(omitted<<1),tokens=popcount(mask)+popcount(runStarts);if(tokens<cost&&differences.every(bits=>(bits&mask)!==0))return false;}return true;
}
export function validKSeparatedPermutation(args,raw){
 const[s,k]=args,out=string(raw);if(typeof s!=='string'||!/^[a-z]{1,300000}$/.test(s)||!Number.isInteger(k)||k<0||k>s.length||typeof out!=='string')return false;
 const counts=new Map();for(const ch of s)counts.set(ch,(counts.get(ch)||0)+1);const max=Math.max(...counts.values()),tied=[...counts.values()].filter(x=>x===max).length;
 if(out==='')return (max-1)*k+tied>s.length;
 if(out.length!==s.length)return false;const previous=new Map();for(let i=0;i<out.length;i++){const ch=out[i];if(!counts.get(ch)||(previous.has(ch)&&i-previous.get(ch)<k))return false;counts.set(ch,counts.get(ch)-1);previous.set(ch,i);}return true;
}
profiles.mostSimilar={title:'The Most Similar Path In A Graph',parameters:['integer','integer[][]','string[]','string[]'],returnType:'integer[]',accepts:validMostSimilarWalk};
profiles.encode={title:'Encode String With Shortest Length',parameters:['string'],returnType:'string',accepts:validShortestEncoding};
profiles.minAbbreviation={title:'Minimum Unique Word Abbreviation',parameters:['string','string[]'],returnType:'string',accepts:validUniqueAbbreviation};
profiles.rearrangeString={title:'Rearrange String K Distance Apart',parameters:['string','integer'],returnType:'string',accepts:validKSeparatedPermutation};
export function validMergedSortedLists(args,raw){const[lists]=args,out=parse(raw);if(!Array.isArray(lists)||lists.length>10000||lists.some(row=>!integers(row)||row.some((v,i)=>v< -10000||v>10000||(i&&v<row[i-1]))))return false;const merged=lists.flat();if(merged.length>10000)return false;if(!merged.length)return out===null||(Array.isArray(out)&&out.length===0);if(!integers(out)||out.length!==merged.length)return false;merged.sort((a,b)=>a-b);return out.every((v,i)=>v===merged[i]);}
profiles.mergeKLists={title:'Merge k Sorted Lists',parameters:['list-node[]'],returnType:'list-node',accepts:validMergedSortedLists};
export function validFloodActions(args,raw){const[rains]=args;if(!integers(rains)||rains.length<1||rains.length>100000||rains.some(v=>v<0||v>1000000000))return false;return acceptsRootFlexibleOutput({title:'Avoid Flood in The City',functionContract:{methodName:'avoidFlood'}},args,raw,'')===true;}
export function validRecoveredSubsetSums(args,raw){const[n,sums]=args;if(!Number.isInteger(n)||n<1||n>15||!integers(sums)||sums.length!==2**n||sums.some(v=>v< -10000||v>10000))return false;return acceptsRootFlexibleOutput({title:'Find Array Given Subset Sums',functionContract:{methodName:'recoverArray'}},args,raw,'')===true;}
export function validThreeEqualBinaryParts(args,raw){
 const[bits]=args,out=parse(raw);if(!integers(bits)||bits.length<3||bits.length>30000||bits.some(x=>x!==0&&x!==1)||!integers(out)||out.length!==2)return false;
 const ones=[];for(let i=0;i<bits.length;i++)if(bits[i])ones.push(i);
 if(out[0]===-1&&out[1]===-1){if(!ones.length)return false;if(ones.length%3)return true;const step=ones.length/3,starts=[ones[0],ones[step],ones[step*2]],length=bits.length-starts[2];if(starts[0]+length>starts[1]||starts[1]+length>starts[2])return true;for(let i=0;i<length;i++)if(bits[starts[0]+i]!==bits[starts[1]+i]||bits[starts[0]+i]!==bits[starts[2]+i])return true;return false;}
 const[i,j]=out;if(i<0||i+1>=j||j>=bits.length)return false;const value=part=>part.join('').replace(/^0+/,'');return value(bits.slice(0,i+1))===value(bits.slice(i+1,j))&&value(bits.slice(i+1,j))===value(bits.slice(j));
}
export function validNoTripleLetterCounts(args,raw){const[a,b]=args,out=string(raw);return Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&a<=100&&b>=0&&b<=100&&Math.max(a,b)<=2*(Math.min(a,b)+1)&&typeof out==='string'&&out.length===a+b&&/^[ab]*$/.test(out)&&[...out].filter(ch=>ch==='a').length===a&&!out.includes('aaa')&&!out.includes('bbb');}
profiles.avoidFlood={title:'Avoid Flood in The City',parameters:['integer[]'],returnType:'integer[]',accepts:validFloodActions};
profiles.recoverArray={title:'Find Array Given Subset Sums',parameters:['integer','integer[]'],returnType:'integer[]',accepts:validRecoveredSubsetSums};
// These existing input-derived validators must run before fixed-oracle equality.
// An identical malformed stored witness must never bypass their source rules.
export function validModifiedGraphEdgeWeights(args,raw){return acceptsRootFlexibleOutput({title:'Modify Graph Edge Weights',functionContract:{methodName:'modifiedGraphEdges'}},args,raw,'')===true;}
export function validGoodMatrixSubset(args,raw){const[grid]=args;if(!Array.isArray(grid)||grid.length<1||grid.length>10000)return false;return acceptsRootFlexibleOutput({title:'Find a Good Subset of the Matrix',functionContract:{methodName:'goodSubsetofBinaryMatrix'}},args,raw,'')===true;}
profiles.modifiedGraphEdges={title:'Modify Graph Edge Weights',parameters:['integer','integer[][]','integer','integer','integer'],returnType:'integer[][]',accepts:validModifiedGraphEdgeWeights};
profiles.goodSubsetofBinaryMatrix={title:'Find a Good Subset of the Matrix',parameters:['integer[][]'],returnType:'integer[]',accepts:validGoodMatrixSubset};
profiles.threeEqualParts={title:'Three Equal Parts',parameters:['integer[]'],returnType:'integer[]',accepts:validThreeEqualBinaryParts};
profiles.strWithout3a3b={title:'String Without AAA or BBB',parameters:['integer','integer'],returnType:'string',accepts:validNoTripleLetterCounts};
const orderMethods={addOrder:{parameters:['integer','string','integer'],returnType:'void'},modifyOrder:{parameters:['integer','integer'],returnType:'void'},cancelOrder:{parameters:['integer'],returnType:'void'},getOrdersAtPrice:{parameters:['string','integer'],returnType:'integer[]'}};
function exactStatefulProfile(problem,title,className,ctor,methods){const c=problem?.functionContract;return problem?.title===title&&problem.executionMode==='function'&&c?.kind==='stateful'&&c.className===className&&c.constructorParameters?.length===ctor.length&&c.constructorParameters.every((p,i)=>p.type===ctor[i])&&c.operations?.length===Object.keys(methods).length&&new Set(c.operations.map(o=>o.methodName)).size===c.operations.length&&c.operations.every(o=>{const m=methods[o.methodName];return m&&o.returnType===m.returnType&&o.parameters?.length===m.parameters.length&&o.parameters.every((p,i)=>p.type===m.parameters[i]);});}
export function acceptsPhoneDirectoryOutput(problem,fixture,raw){
 const methods={get:{parameters:[],returnType:'integer'},check:{parameters:['integer'],returnType:'boolean'},release:{parameters:['integer'],returnType:'void'}};
 if(!exactStatefulProfile(problem,'Design Phone Directory','PhoneDirectory',['integer'],methods))return null;
 try{const calls=validateStatefulFixture(problem.functionContract,fixture.input).calls,out=parse(raw),n=calls[0].args[0];if(!Number.isInteger(n)||n<1||n>10000||!Array.isArray(out)||out.length!==calls.length||out[0]!==null)return false;const free=new Set(Array.from({length:n},(_,i)=>i));for(let i=1;i<calls.length;i++){const call=calls[i],number=call.args[0];if(call.methodName==='get'){const answer=out[i];if(!Number.isInteger(answer))return false;if(!free.size){if(answer!==-1)return false;}else{if(!free.delete(answer))return false;}}else{if(!Number.isInteger(number)||number<0||number>=n)return false;if(call.methodName==='check'){if(out[i]!==free.has(number))return false;}else{if(out[i]!==null)return false;free.add(number);}}}return true;}catch{return false;}
}
export function acceptsLogSystemOutput(problem,fixture,raw){
 const methods={put:{parameters:['integer','string'],returnType:'void'},retrieve:{parameters:['string','string','string'],returnType:'integer[]'}};
 if(!exactStatefulProfile(problem,'Design Log Storage System','LogSystem',[],methods))return null;
 try{const calls=validateStatefulFixture(problem.functionContract,fixture.input).calls,out=parse(raw);if(!Array.isArray(out)||out.length!==calls.length||out[0]!==null)return false;const logs=[],lengths={Year:4,Month:7,Day:10,Hour:13,Minute:16,Second:19},timestamp=s=>typeof s==='string'&&/^\d{4}:\d{2}:\d{2}:\d{2}:\d{2}:\d{2}$/.test(s);for(let i=1;i<calls.length;i++){const{methodName,args:a}=calls[i];if(methodName==='put'){if(!Number.isInteger(a[0])||a[0]<1||a[0]>500||!timestamp(a[1])||logs.length>=500||out[i]!==null)return false;logs.push([a[0],a[1]]);}else{const n=lengths[a[2]];if(!n||!timestamp(a[0])||!timestamp(a[1])||!integers(out[i]))return false;const start=a[0].slice(0,n),end=a[1].slice(0,n),expected=logs.filter(([,time])=>time.slice(0,n)>=start&&time.slice(0,n)<=end).map(([id])=>id).sort((a,b)=>a-b),actual=out[i].slice().sort((a,b)=>a-b);if(expected.length!==actual.length||expected.some((id,j)=>id!==actual[j]))return false;}}return true;}catch{return false;}
}
export function acceptsOrderManagementOutput(problem,testCase,raw){const c=problem?.functionContract;if(problem?.title!=='Design Order Management System'||problem.executionMode!=='function'||c?.kind!=='stateful'||c.className!=='OrderManagementSystem'||c.constructorParameters?.length!==0||c.operations?.length!==4||new Set(c.operations.map(o=>o.methodName)).size!==4||c.operations.some(o=>{const spec=orderMethods[o.methodName];return!spec||o.returnType!==spec.returnType||o.parameters?.length!==spec.parameters.length||o.parameters.some((p,i)=>p.type!==spec.parameters[i]);}))return null;try{const calls=validateStatefulFixture(c,testCase.input).calls,out=parse(raw);if(!Array.isArray(out)||out.length!==calls.length||out[0]!==null)return false;const orders=new Map(),seen=new Set(),validId=id=>Number.isInteger(id)&&id>=1&&id<=2000,validPrice=p=>Number.isInteger(p)&&p>=1&&p<=1000000000;for(let i=1;i<calls.length;i++){const{methodName:name,args:a}=calls[i];if(name==='addOrder'){if(!validId(a[0])||seen.has(a[0])||!['buy','sell'].includes(a[1])||!validPrice(a[2]))return false;orders.set(a[0],[a[1],a[2]]);seen.add(a[0]);}else if(name==='modifyOrder'){if(!orders.has(a[0])||!validPrice(a[1]))return false;orders.get(a[0])[1]=a[1];}else if(name==='cancelOrder'){if(!orders.has(a[0]))return false;orders.delete(a[0]);}else{if(!['buy','sell'].includes(a[0])||!validPrice(a[1])||!integers(out[i])||new Set(out[i]).size!==out[i].length)return false;const expected=[...orders].filter(([id,o])=>o[0]===a[0]&&o[1]===a[1]).map(([id])=>id);if(out[i].length!==expected.length||out[i].some(id=>!expected.includes(id)))return false;continue;}if(out[i]!==null)return false;}return true;}catch{return false;}}
export function acceptsSourceNamedFlexibleOutput(problem,testCase,output){for(const profile of[acceptsPhoneDirectoryOutput,acceptsLogSystemOutput,acceptsOrderManagementOutput]){const verdict=profile(problem,testCase,output);if(verdict!==null)return verdict;}const c=problem?.functionContract,p=profiles[c?.methodName];if(problem?.executionMode!=='function'||c?.kind==='stateful'||!p||problem.title!==p.title||c.returnType!==p.returnType||c.outputMode==='parameter'||c.parameters?.length!==p.parameters.length||c.parameters.some((arg,i)=>arg.type!==p.parameters[i]))return null;try{return p.accepts(buildFunctionInputPayload(testCase.input,c).args,output);}catch{return false;}}
