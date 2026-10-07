// Source-authorized answer variations, staged until the next engine boundary.
import {parseFunctionTestInput} from './functionTestInputService.js';
const parse=text=>{try{const values=parseFunctionTestInput(String(text).trim()).positional;return values.length===1?values[0]:undefined;}catch{return undefined;}};
const text=value=>{const raw=String(value).trim();return /^['"]/.test(raw)?parse(raw):raw;};
const sorted=values=>values.map(value=>JSON.stringify(value)).sort();
const multiset=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
const unorderedOuter=new Set(['getSneakyNumbers','frequenciesOfElements','twoOutOfThree','getLonelyNodes','commonChars','busiestServers','wordSquares','supersequences','deleteDuplicateFolder','closestKValues','generateValidStrings','distanceK','generateAbbreviations','generatePalindromes','findStrobogrammatic','findHighAccessEmployees','mostPopularCreator','findLonely','averageHeightOfBuildings','findOriginalArray','findFarmland','splitPainting','simplifiedFractions','queensAttacktheKing','invalidTransactions','kClosest','powerfulIntegers','subdomainVisits','allPathsSourceTarget','findFrequentTreeSum','solveNQueens']);
const unorderedInner=new Set(['findDifference','findCriticalAndPseudoCriticalEdges']);
export function acceptsRootFlexibleOutput(problem,args,actualText,expectedText){
 const method=problem?.functionContract?.methodName;
 // These later problems reuse earlier method names but explicitly require order.
 if((method==='wordSquares'&&problem?.title==='Word Squares II')||(method==='findDisappearedNumbers'&&problem?.title==='Find All Numbers Disappeared in an Array II')){const actual=parse(actualText),expected=parse(expectedText);return Array.isArray(actual)&&Array.isArray(expected)&&JSON.stringify(actual)===JSON.stringify(expected);}
 if(unorderedOuter.has(method))return multiset(parse(actualText),parse(expectedText));
 if(unorderedInner.has(method)){
  const actual=parse(actualText),expected=parse(expectedText);
  return Array.isArray(actual)&&Array.isArray(expected)&&actual.length===expected.length&&actual.every((entry,index)=>multiset(entry,expected[index]));
 }
 if(method==='sortByAbsoluteValue'){
  const input=args[0],actual=parse(actualText);
  return Array.isArray(input)&&Array.isArray(actual)&&input.every(Number.isSafeInteger)&&actual.every(Number.isSafeInteger)&&multiset(input,actual)&&actual.every((value,index)=>index===0||Math.abs(value)>=Math.abs(actual[index-1]));
 }
 if(method==='createGrid'&&problem?.title==='Create Grid With Exactly One Path'&&args.length===2){
  const [rows,columns]=args,actual=parse(actualText);
  if(!Number.isSafeInteger(rows)||!Number.isSafeInteger(columns)||rows<1||columns<1||!Array.isArray(actual)||actual.length!==rows||actual.some(row=>typeof row!=='string'||row.length!==columns||!/^[.#]+$/.test(row)))return false;
  const paths=Array(columns).fill(0);for(let row=0;row<rows;row++)for(let column=0;column<columns;column++)paths[column]=actual[row][column]==='#'?0:row===0&&column===0?1:Math.min(2,paths[column]+(column?paths[column-1]:0));return paths[columns-1]===1;
 }
 if(method==='majorityFrequencyGroup'){
  const source=args[0],actual=text(actualText);if(typeof source!=='string'||typeof actual!=='string')return false;
  const counts=new Map();for(const char of source)counts.set(char,(counts.get(char)||0)+1);
  const groups=new Map();for(const [char,count] of counts){if(!groups.has(count))groups.set(count,[]);groups.get(count).push(char);}
  let chosen=[],frequency=-1;for(const [count,group] of groups)if(group.length>chosen.length||(group.length===chosen.length&&count>frequency)){chosen=group;frequency=count;}
  return multiset([...actual],chosen);
 }
 if(method==='anagramMappings'){
  const [left,right]=args,actual=parse(actualText);
  return Array.isArray(left)&&Array.isArray(right)&&Array.isArray(actual)&&actual.length===left.length&&actual.every((index,i)=>Number.isSafeInteger(index)&&index>=0&&index<right.length&&left[i]===right[index]);
 }
 if(method==='strWithout3a3b'){
  const [a,b]=args,actual=text(actualText);return Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a>=0&&b>=0&&typeof actual==='string'&&actual.length===a+b&&/^[ab]*$/.test(actual)&&[...actual].filter(ch=>ch==='a').length===a&&!actual.includes('aaa')&&!actual.includes('bbb');
 }
 if(method==='validArrangement'){
  const pairs=args[0],actual=parse(actualText),pair=value=>Array.isArray(value)&&value.length===2&&value.every(Number.isSafeInteger);
  return Array.isArray(pairs)&&pairs.every(pair)&&Array.isArray(actual)&&actual.every(pair)&&multiset(pairs,actual)&&actual.every((entry,index)=>index===0||actual[index-1][1]===entry[0]);
 }
 if(method==='recoverArray'&&problem?.title==='Find Array Given Subset Sums'){
  const [n,input]=args,actual=parse(actualText);if(!Number.isSafeInteger(n)||n<1||n>15||!Array.isArray(input)||input.length!==2**n||!input.every(Number.isSafeInteger)||!Array.isArray(actual)||actual.length!==n||!actual.every(Number.isSafeInteger))return false;
  const sums=[0n];for(const value of actual){const length=sums.length;for(let i=0;i<length;i++)sums.push(sums[i]+BigInt(value));}return multiset(sums.map(String),input.map(value=>String(BigInt(value))));
 }
 if(method==='goodSubsetofBinaryMatrix'){
  const grid=args[0],actual=parse(actualText);if(!Array.isArray(grid)||!grid.length||!Array.isArray(grid[0])||grid[0].length<1||grid[0].length>5||grid.some(row=>!Array.isArray(row)||row.length!==grid[0].length||row.some(value=>value!==0&&value!==1))||!Array.isArray(actual)||actual.some((index,i)=>!Number.isSafeInteger(index)||index<0||index>=grid.length||(i>0&&index<=actual[i-1])))return false;
  if(actual.length)return grid[0].every((_,column)=>actual.reduce((sum,index)=>sum+grid[index][column],0)<=Math.floor(actual.length/2));
  const masks=new Set(grid.map(row=>row.reduce((mask,value,column)=>mask|(value<<column),0)));if(masks.has(0))return false;for(const a of masks)for(const b of masks)if((a&b)===0)return false;return true;
 }
 if(method==='modifiedGraphEdges'){
  const [n,edges,source,destination,target]=args,actual=parse(actualText),edge=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isSafeInteger)&&value[0]>=0&&value[0]<n&&value[1]>=0&&value[1]<n&&value[0]!==value[1];
  if(!Number.isSafeInteger(n)||n<2||n>100||!Array.isArray(edges)||!edges.every(edge)||!Number.isSafeInteger(source)||!Number.isSafeInteger(destination)||source<0||source>=n||destination<0||destination>=n||source===destination||!Number.isSafeInteger(target)||target<1||target>1000000000||!Array.isArray(actual))return false;
  const key=(a,b)=>a<b?a+','+b:b+','+a,original=new Map(edges.map(([a,b,w])=>[key(a,b),w]));if(original.size!==edges.length||edges.some(e=>e[2]!==-1&&e[2]<1))return false;
  const distance=values=>{const adjacency=Array.from({length:n},()=>[]);for(const [a,b,w]of values){adjacency[a].push([b,w]);adjacency[b].push([a,w]);}const dist=Array(n).fill(Infinity),used=Array(n).fill(false);dist[source]=0;for(let iteration=0;iteration<n;iteration++){let node=-1;for(let i=0;i<n;i++)if(!used[i]&&(node<0||dist[i]<dist[node]))node=i;if(node<0||!Number.isFinite(dist[node]))break;used[node]=true;for(const [next,weight]of adjacency[node])dist[next]=Math.min(dist[next],dist[node]+weight);}return dist[destination];};
  if(!actual.length)return distance(edges.map(([a,b,w])=>[a,b,w===-1?1:w]))>target||distance(edges.map(([a,b,w])=>[a,b,w===-1?2000000000:w]))<target;
  if(actual.length!==edges.length||!actual.every(edge))return false;const seen=new Set();for(const [a,b,w]of actual){const id=key(a,b);if(!original.has(id)||seen.has(id)||w<1||w>2000000000||(original.get(id)!==-1&&original.get(id)!==w))return false;seen.add(id);}return distance(actual)===target;
 }
 if(method==='shortestSuperstring'&&problem?.title==='Find the Shortest Superstring II'){
  const [a,b]=args,actual=text(actualText);if(typeof a!=='string'||typeof b!=='string'||typeof actual!=='string'||!actual.includes(a)||!actual.includes(b))return false;
  if(a.includes(b))return actual.length===a.length;if(b.includes(a))return actual.length===b.length;
  let overlap=0;for(let length=1;length<=Math.min(a.length,b.length);length++)if(a.endsWith(b.slice(0,length))||b.endsWith(a.slice(0,length)))overlap=length;
  return actual.length===a.length+b.length-overlap;
 }
 if(method==='longestDupSubstring'){
  const source=args[0],actual=text(actualText);if(typeof source!=='string'||typeof actual!=='string')return false;
  const states=[{next:new Map(),link:-1,length:0,count:0}];let last=0;
  for(const char of source){
   const current=states.length;states.push({next:new Map(),link:0,length:states[last].length+1,count:1});let p=last;
   while(p>=0&&!states[p].next.has(char)){states[p].next.set(char,current);p=states[p].link;}
   if(p>=0){const q=states[p].next.get(char);if(states[p].length+1===states[q].length)states[current].link=q;
    else{const clone=states.length;states.push({next:new Map(states[q].next),link:states[q].link,length:states[p].length+1,count:0});while(p>=0&&states[p].next.get(char)===q){states[p].next.set(char,clone);p=states[p].link;}states[q].link=states[current].link=clone;}}
   last=current;
  }
  const order=Array.from({length:states.length},(_,i)=>i).sort((a,b)=>states[b].length-states[a].length);let optimum=0;
  for(const index of order){const state=states[index];if(state.count>=2)optimum=Math.max(optimum,state.length);if(state.link>=0)states[state.link].count+=state.count;}
  if(actual.length!==optimum)return false;if(optimum===0)return actual==='';const first=source.indexOf(actual);return first>=0&&source.indexOf(actual,first+1)>=0;
 }
 if(method==='alienOrder'){
  const words=args[0],actual=text(actualText);if(!Array.isArray(words)||words.some(word=>typeof word!=='string')||typeof actual!=='string')return false;
  const characters=new Set(words.join('')),edges=new Map([...characters].map(char=>[char,new Set()])),degrees=new Map([...characters].map(char=>[char,0]));let invalid=false;
  for(let i=1;i<words.length;i++){const left=words[i-1],right=words[i];let j=0;while(j<Math.min(left.length,right.length)&&left[j]===right[j])j++;if(j===Math.min(left.length,right.length)){if(left.length>right.length)invalid=true;}else if(!edges.get(left[j]).has(right[j])){edges.get(left[j]).add(right[j]);degrees.set(right[j],degrees.get(right[j])+1);}}
  const queue=[...characters].filter(char=>degrees.get(char)===0);for(let i=0;i<queue.length;i++)for(const next of edges.get(queue[i])){degrees.set(next,degrees.get(next)-1);if(degrees.get(next)===0)queue.push(next);}
  if(invalid||queue.length!==characters.size)return actual==='';
  if(actual.length!==characters.size||new Set(actual).size!==characters.size||[...actual].some(char=>!characters.has(char)))return false;
  const ranks=new Map([...actual].map((char,index)=>[char,index]));return [...edges].every(([from,targets])=>[...targets].every(to=>ranks.get(from)<ranks.get(to)));
 }
 if(method==='avoidFlood'){
  const rains=args[0],actual=parse(actualText);if(!Array.isArray(rains)||!rains.every(value=>Number.isSafeInteger(value)&&value>=0)||!Array.isArray(actual)||!actual.every(Number.isSafeInteger))return false;
  const dry=[];for(let i=0;i<rains.length;i++)if(rains[i]===0)dry.push(i);const parents=Array.from({length:dry.length+1},(_,i)=>i),last=new Map();
  const find=index=>{let root=index;while(parents[root]!==root)root=parents[root];while(parents[index]!==index){const next=parents[index];parents[index]=root;index=next;}return root;};let possible=true;
  for(let day=0;day<rains.length;day++)if(rains[day]){const lake=rains[day];if(last.has(lake)){let low=0,high=dry.length;while(low<high){const mid=Math.floor((low+high)/2);if(dry[mid]<=last.get(lake))low=mid+1;else high=mid;}const index=find(low);if(index===dry.length||dry[index]>=day){possible=false;break;}parents[index]=find(index+1);}last.set(lake,day);}
  if(actual.length===0)return !possible;if(!possible||actual.length!==rains.length)return false;
  const full=new Set();for(let day=0;day<rains.length;day++)if(rains[day]){if(actual[day]!==-1||full.has(rains[day]))return false;full.add(rains[day]);}else{if(actual[day]<1)return false;full.delete(actual[day]);}return true;
 }
 if(method==='smallestSufficientTeam'){
  const [skills,people]=args,actual=parse(actualText);if(!Array.isArray(skills)||skills.length>16||!skills.every(skill=>typeof skill==='string')||new Set(skills).size!==skills.length||!Array.isArray(people)||people.some(person=>!Array.isArray(person)||person.some(skill=>!skills.includes(skill)))||!Array.isArray(actual)||actual.some(index=>!Number.isSafeInteger(index)||index<0||index>=people.length)||new Set(actual).size!==actual.length)return false;
  const masks=people.map(person=>person.reduce((mask,skill)=>mask|(1<<skills.indexOf(skill)),0)),target=(1<<skills.length)-1,cover=actual.reduce((mask,index)=>mask|masks[index],0);if(cover!==target)return false;
  const best=new Uint8Array(1<<skills.length).fill(255);best[0]=0;for(const person of masks)for(let mask=0;mask<=target;mask++)if(best[mask]<255)best[mask|person]=Math.min(best[mask|person],best[mask]+1);
  return actual.length===best[target];
 }
 return null;
}
