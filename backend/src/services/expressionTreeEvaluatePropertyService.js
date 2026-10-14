import {validateStatefulFixture} from './statefulRunnerService.js';
import {finishProvidedCapture,withoutDefinitionComments} from './remainingProvidedCaptureService.js';
import {parseNodeResultEnvelope} from './customNodeResultEnvelopeService.js';

const ID='6ace186f6ca3216598beea52',TITLE='Design an Expression Tree With Evaluate Function',OPS=new Set(['+','-','*','/']);
export function expressionTreeEvaluateRule(problem){const c=problem?.functionContract,op=c?.operations?.[0];return String(problem?._id||'')===ID&&problem?.title===TITLE&&problem?.executionMode==='function'&&c?.kind==='stateful'&&c?.className==='TreeBuilder'&&c?.constructorParameters?.length===0&&c?.operations?.length===1&&op?.methodName==='buildTree'&&op?.parameters?.length===1&&op.parameters[0]?.name==='postfix'&&op.parameters[0]?.type==='string[]'&&op?.returnType==='integer';}
function truncDivide(a,b){if(!b)throw Error('Division by zero.');return Math.trunc(a/b);}
function evaluate(tokens){
 if(!Array.isArray(tokens)||tokens.length<1||tokens.length>=100||tokens.length%2===0)throw Error('postfix length must be odd and in [1, 99].');
 const stack=[];
 for(const token of tokens){
  if(typeof token!=='string')throw Error('Every postfix token must be a string.');
  if(OPS.has(token)){if(stack.length<2)throw Error('Invalid postfix expression.');const right=stack.pop(),left=stack.pop();let value;if(token==='+')value=left+right;else if(token==='-')value=left-right;else if(token==='*')value=left*right;else value=truncDivide(left,right);if(Math.abs(value)>1e9)throw Error('Intermediate result exceeds 10^9.');stack.push(value);}
  else{if(!/^(0|[1-9]\d{0,5})$/.test(token)||Number(token)>100000)throw Error('Operand must be an integer string in [0, 100000].');stack.push(Number(token));}
 }
 if(stack.length!==1)throw Error('Invalid postfix expression.');return stack[0];
}
export function validateExpressionTreeEvaluateFixture(problem,input){if(!expressionTreeEvaluateRule(problem))throw Error('Unsupported expression-tree contract.');const state=validateStatefulFixture(problem.functionContract,input),first=state.calls[0];if(!first?.constructor||state.calls.slice(1).some(call=>call.constructor||call.methodName!=='buildTree'))throw Error('Expected one TreeBuilder constructor followed only by buildTree operations.');if(state.calls.length<2||state.calls.length>21)throw Error('Expected 1..20 buildTree calls.');const postfixes=state.calls.slice(1).map(call=>call.args[0]);return{postfixes,expected:[null,...postfixes.map(evaluate)]};}
export function validateExpressionTreeEvaluateOracle(problem,testCase){try{return JSON.stringify(JSON.parse(String(testCase.output).trim()))===JSON.stringify(validateExpressionTreeEvaluateFixture(problem,testCase.input).expected);}catch{return false;}}
export function acceptsExpressionTreeEvaluateOutput(problem,testCase,raw){if(!expressionTreeEvaluateRule(problem))return undefined;try{const envelope=parseNodeResultEnvelope(raw);return!!envelope&&JSON.stringify(envelope.value)===JSON.stringify(validateExpressionTreeEvaluateFixture(problem,testCase.input).expected);}catch{return false;}}

const q=value=>JSON.stringify(value),javaStrings=a=>`new String[]{${a.map(q).join(',')}}`;
function native(language,f){
 if(language==='cpp'){const body=f.postfixes.map((tokens,i)=>`{vector<string>p={${tokens.map(q)}};Node*n=builder.buildTree(p);for(string&s:p)s="99999";if(!n||n->evaluate()!=${f.expected[i+1]}||n->evaluate()!=${f.expected[i+1]})return false;delete n;}`).join('');return{prefix:'',wrapper:`class TreeBuilderCapture{public:bool captureNode(int seed){TreeBuilder builder;${body}return true;}};`};}
 const body=f.postfixes.map((tokens,i)=>`{char* p${i}[${tokens.length}]={${tokens.map(q)}};Node*n=treeBuilderBuildTree(builder,p${i},${tokens.length});for(int j=0;j<${tokens.length};j++)p${i}[j]="99999";if(!n||nodeEvaluate(n)!=${f.expected[i+1]}||nodeEvaluate(n)!=${f.expected[i+1]})return false;}`).join('');return{prefix:'',wrapper:`bool captureNode(int seed){TreeBuilder*builder=treeBuilderCreate();if(!builder)return false;${body}return true;}`};
}
function managed(language,f){
 if(language==='python'){const rows=f.postfixes.map((tokens,i)=>`        p=${q(tokens)};n=builder.buildTree(p);p[:]=['99999']*len(p)\n        if n is None or n.evaluate()!=${f.expected[i+1]} or n.evaluate()!=${f.expected[i+1]}:return False`).join('\n');return{prefix:'',wrapper:`class TreeBuilderCapture:\n    def captureNode(self,seed):\n        builder=TreeBuilder()\n${rows}\n        return True\n`};}
 if(language==='java'){const rows=f.postfixes.map((tokens,i)=>`{String[]p=${javaStrings(tokens)};Node n=builder.buildTree(p);java.util.Arrays.fill(p,"99999");if(n==null||n.evaluate()!=${f.expected[i+1]}||n.evaluate()!=${f.expected[i+1]})return false;}`).join('');return{prefix:'',wrapper:`class TreeBuilderCapture{public boolean captureNode(int seed){TreeBuilder builder=new TreeBuilder();${rows}return true;}}`};}
 const ts=language==='typescript',rows=f.postfixes.map((tokens,i)=>`{const p${ts?':string[]':''}=${q(tokens)};const n=builder.buildTree(p);p.fill('99999');if(!n||n.evaluate()!==${f.expected[i+1]}||n.evaluate()!==${f.expected[i+1]})return false;}`).join('');return{prefix:'',wrapper:`function captureNode(seed${ts?':number':''})${ts?':boolean':''}{const builder=new TreeBuilder();${rows}return true;}`};
}
export function prepareExpressionTreeEvaluateSource(language,problem,userCode,input){const fixture=validateExpressionTreeEvaluateFixture(problem,input);let source=withoutDefinitionComments(userCode);if(language==='typescript')source=source.replace(/\bNode\b/g,'PPExpressionNode');const parts=language==='c'||language==='cpp'?native(language,fixture):managed(language,fixture);return finishProvidedCapture(language,source,parts.prefix,parts.wrapper,'TreeBuilderCapture',fixture.expected);}
