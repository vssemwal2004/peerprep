import { parseFunctionTestInput, materializeFunctionInputPlaceholders } from './functionTestInputService.js';
import { generateFunctionRunnerTemplate } from './functionRunnerTemplateService.js';

export function isSelectedLinkedMutationProblem(problem) {
  const c=problem?.functionContract;
  return problem?.title==='Delete Node in a Linked List' && problem.executionMode==='function' && c?.kind!=='stateful'
    && c.className==='Solution' && c.methodName==='deleteNode' && c.returnType==='void' && c.outputMode==='parameter'
    && c.outputParameterIndex===0 && c.parameters?.length===1 && c.parameters[0].name==='node' && c.parameters[0].type==='list-node';
}

export function validateSelectedLinkedMutationFixture(problem,input) {
  if(!isSelectedLinkedMutationProblem(problem))throw Error('Unsupported selected linked-list mutation contract.');
  const {named,positional}=parseFunctionTestInput(input);
  if(positional.length||Object.keys(named).length!==2||!Object.hasOwn(named,'head')||!Object.hasOwn(named,'node'))throw Error('Delete Node input requires exactly head and node.');
  const values=named.head,node=named.node;
  if(!Array.isArray(values)||values.length<2||values.length>1000||values.some(v=>!Number.isInteger(v)||v< -1000||v>1000)||new Set(values).size!==values.length)throw Error('Delete Node head violates source constraints.');
  const index=values.indexOf(node);if(index<0||index===values.length-1)throw Error('Delete Node selector must identify a non-tail node.');
  return {values,index,node,expected:values.slice(0,index).concat(values.slice(index+1))};
}

export function acceptsSelectedLinkedMutationOutput(problem,testCase,raw) {
  if(!isSelectedLinkedMutationProblem(problem))return undefined;
  try{return JSON.stringify(JSON.parse(String(raw).trim()))===JSON.stringify(validateSelectedLinkedMutationFixture(problem,testCase.input).expected);}catch{return false;}
}

export function prepareSelectedLinkedMutationSource(language,problem,userCode,input) {
  const f=validateSelectedLinkedMutationFixture(problem,input),value=f.node;
  const wrapper={
    c:`struct ListNode* captureDelete(struct ListNode* head){struct ListNode* node=head;while(node&&node->val!=${value})node=node->next;deleteNode(node);return head;}`,
    cpp:`class CaptureDelete{public:ListNode* captureDelete(ListNode* head){ListNode* node=head;while(node&&node->val!=${value})node=node->next;Solution().deleteNode(node);return head;}};`,
    java:`class CaptureDelete{ListNode captureDelete(ListNode head){ListNode node=head;while(node!=null&&node.val!=${value})node=node.next;new Solution().deleteNode(node);return head;}}`,
    python:`class CaptureDelete:\n    def captureDelete(self, head):\n        node=head\n        while node is not None and node.val != ${value}: node=node.next\n        Solution().deleteNode(node)\n        return head`,
    javascript:`function captureDelete(head){let node=head;while(node&&node.val!==${value})node=node.next;${/\bclass\s+Solution\b/.test(userCode)?'new Solution().deleteNode(node)':'deleteNode(node)'};return head;}`,
    typescript:`function captureDelete(head:ListNode|null):ListNode|null{let node:ListNode|null=head;while(node&&node.val!==${value})node=node.next;${/\bclass\s+Solution\b/.test(userCode)?'new Solution().deleteNode(node)':'deleteNode(node)'};return head;}`,
  }[language];
  if(!wrapper)throw Error('Unsupported selected linked-list language.');
  const code=language==='java'?String(userCode).replace(/(^|\n)\s*public\s+class\s+Solution\b/,'$1class Solution'):String(userCode);
  const className={c:'',cpp:'CaptureDelete',java:'CaptureDelete',python:'CaptureDelete',javascript:'',typescript:''}[language];
  const contract={className,methodName:'captureDelete',parameters:[{name:'head',type:'list-node'}],returnType:'list-node',outputMode:'return',runnerLanguage:language};
  const joined=code+'\n'+wrapper,template=generateFunctionRunnerTemplate(language,contract,joined);
  return materializeFunctionInputPlaceholders(template,'head='+JSON.stringify(f.values),contract).replace('{{USER_CODE}}',joined);
}
