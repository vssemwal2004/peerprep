import { generateFunctionRunnerTemplate } from './functionRunnerTemplateService.js';
import { materializeFunctionInputPlaceholders, parseFunctionTestInput } from './functionTestInputService.js';

const USER_CODE_PLACEHOLDER = '{{USER_CODE}}';

const RULES = Object.freeze({
  'Remove Duplicates From an Unsorted Linked List': { method: 'deleteDuplicatesUnsorted', kind: 'dedupe' },
  'Sort Linked List Already Sorted Using Absolute Values': { method: 'sortLinkedList', kind: 'sort' },
  'Split a Circular Linked List': { method: 'splitCircularLinkedList', kind: 'split' },
});

export function linkedListRewireRule(problem) {
  const rule = RULES[String(problem?.title || '')];
  const contract = problem?.functionContract;
  if (!rule || problem?.executionMode !== 'function' || contract?.kind === 'stateful'
    || contract?.className !== 'Solution' || contract?.methodName !== rule.method
    || contract?.parameters?.length !== 1 || contract.parameters[0]?.type !== 'list-node'
    || contract.parameters[0]?.name !== (rule.kind === 'split' ? 'list' : 'head')
    || contract?.returnType !== (rule.kind === 'split' ? 'list-node[]' : 'list-node')) return null;
  return rule;
}

function fixtureValues(problem, input) {
  const rule = linkedListRewireRule(problem);
  if (!rule) throw new Error('Unsupported linked-list rewire contract.');
  const parsed = parseFunctionTestInput(input);
  const name = rule.kind === 'split' ? 'list' : 'head';
  if (parsed.positional.length || Object.keys(parsed.named).length !== 1 || !Object.hasOwn(parsed.named, name)) {
    throw new Error(`Fixture requires exactly ${name}.`);
  }
  const values = parsed.named[name];
  const minimum = rule.kind === 'split' ? 2 : 1;
  const low = rule.kind === 'dedupe' ? 1 : rule.kind === 'sort' ? -5000 : 0;
  const high = rule.kind === 'dedupe' ? 100000 : rule.kind === 'sort' ? 5000 : 1000000000;
  if (!Array.isArray(values) || values.length < minimum || values.length > 100000
    || values.some(value => !Number.isSafeInteger(value) || value < low || value > high)) {
    throw new Error('Linked-list fixture violates the published value or length constraints.');
  }
  if (rule.kind === 'sort' && values.some((value, index) => index && Math.abs(values[index - 1]) > Math.abs(value))) {
    throw new Error('sortLinkedList input must be non-decreasing by absolute value.');
  }
  return { rule, values, name };
}

function expectedValue(rule, values) {
  if (rule.kind === 'dedupe') {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    return values.filter(value => counts.get(value) === 1);
  }
  if (rule.kind === 'sort') return [...values].sort((left, right) => left - right);
  const first = Math.ceil(values.length / 2);
  return [values.slice(0, first), values.slice(first)];
}

export function validateLinkedListRewireFixture(problem, input) {
  const fixture = fixtureValues(problem, input);
  return { ...fixture, expected: expectedValue(fixture.rule, fixture.values) };
}

export function validateLinkedListRewireOracle(problem, testCase) {
  try {
    const expected = validateLinkedListRewireFixture(problem, testCase.input).expected;
    const text = String(testCase.output).trim();
    const actual = /^(?:None|null)$/i.test(text) ? [] : JSON.parse(text);
    return JSON.stringify(actual) === JSON.stringify(expected);
  } catch { return false; }
}

export function acceptsLinkedListRewireOutput(problem, testCase, raw) {
  if (!linkedListRewireRule(problem)) return undefined;
  try {
    const expected = validateLinkedListRewireFixture(problem, testCase.input).expected;
    const text = String(raw).trim();
    const actual = /^(?:None|null)$/i.test(text) ? [] : JSON.parse(text);
    return JSON.stringify(actual) === JSON.stringify(expected);
  } catch { return false; }
}

function invoke(language, method, source, argument) {
  if (language === 'c') return `${method}(${argument})`;
  if (language === 'javascript' || language === 'typescript') {
    return new RegExp('\\bclass\\s+Solution\\b').test(source) ? `new Solution().${method}(${argument})` : `${method}(${argument})`;
  }
  if (language === 'python' || language === 'cpp') return `Solution().${method}(${argument})`;
  return `new Solution().${method}(${argument})`;
}

function wrapper(language, rule, source) {
  const call = invoke(language, rule.method, source, 'head');
  if (language === 'python') return rule.kind === 'dedupe' ? `
class __PPVerify:
    def run(self, head):
        nodes=[]; p=head
        while p is not None: nodes.append(p); p=p.next
        original={id(node):node.val for node in nodes}
        counts={}
        for node in nodes: counts[node.val]=counts.get(node.val,0)+1
        expected=[node for node in nodes if counts[node.val]==1]
        result=${call}
        actual=[]; seen=set(); p=result
        while p is not None and id(p) not in seen and len(actual)<=len(nodes): seen.add(id(p)); actual.append(p); p=p.next
        valid=p is None and actual==expected and all(node.val==original[id(node)] for node in actual)
        return result if valid else ListNode(123456789)
` : rule.kind === 'sort' ? `
class __PPVerify:
    def run(self, head):
        nodes=[]; p=head
        while p is not None: nodes.append(p); p=p.next
        original={id(node):node.val for node in nodes}
        result=${call}
        actual=[]; seen=set(); p=result
        while p is not None and id(p) not in seen and len(actual)<=len(nodes): seen.add(id(p)); actual.append(p); p=p.next
        valid=p is None and len(actual)==len(nodes) and seen==set(original) and all(node.val==original[id(node)] for node in actual) and all(actual[i-1].val<=actual[i].val for i in range(1,len(actual)))
        return result if valid else ListNode(123456789)
` : `
class __PPVerify:
    def run(self, head):
        nodes=[head]; p=head.next
        while p is not head and len(nodes)<=100000: nodes.append(p); p=p.next
        original={id(node):node.val for node in nodes}; first=(len(nodes)+1)//2
        result=${call}
        valid=isinstance(result,(list,tuple)) and len(result)==2 and result[0] is nodes[0] and result[1] is nodes[first]
        if valid:
            p=result[0]
            for i in range(first): valid=valid and p is nodes[i] and p.val==original[id(p)]; p=p.next
            valid=valid and p is result[0]; p=result[1]
            for i in range(first,len(nodes)): valid=valid and p is nodes[i] and p.val==original[id(p)]; p=p.next
            valid=valid and p is result[1]
        if not valid: return [ListNode(123456789), None]
        nodes[first-1].next=None; nodes[-1].next=None
        return result
`;
  if (language === 'javascript' || language === 'typescript') {
    const t = language === 'typescript', any = t ? ': any' : '', arr = t ? ': ListNode[]' : '', ret = t ? ': any' : '';
    const prefix = `function __ppVerify(head${t ? ': ListNode' : ''})${ret}{`;
    if (rule.kind === 'dedupe') return `${prefix}const nodes${arr}=[],original=new Map();for(let p=head;p;p=p.next){nodes.push(p);original.set(p,p.val);}const counts=new Map();for(const p of nodes)counts.set(p.val,(counts.get(p.val)||0)+1);const expected=nodes.filter(p=>counts.get(p.val)===1);const result=${call};const actual${arr}=[],seen=new Set();let p=result;while(p&&!seen.has(p)&&actual.length<=nodes.length){seen.add(p);actual.push(p);p=p.next;}const valid=p===null&&actual.length===expected.length&&actual.every((x,i)=>x===expected[i]&&x.val===original.get(x));return valid?result:new ListNode(123456789);}`;
    if (rule.kind === 'sort') return `${prefix}const nodes${arr}=[],original=new Map();for(let p=head;p;p=p.next){nodes.push(p);original.set(p,p.val);}const result=${call};const actual${arr}=[],seen=new Set();let p=result;while(p&&!seen.has(p)&&actual.length<=nodes.length){seen.add(p);actual.push(p);p=p.next;}const valid=p===null&&actual.length===nodes.length&&actual.every((x,i)=>original.has(x)&&x.val===original.get(x)&&(i===0||actual[i-1].val<=x.val));return valid?result:new ListNode(123456789);}`;
    return `${prefix}const nodes${arr}=[head],original=new Map([[head,head.val]]);for(let p=head.next;p!==head&&nodes.length<=100000;p=p.next){nodes.push(p);original.set(p,p.val);}const first=Math.ceil(nodes.length/2),result=${call};let valid=Array.isArray(result)&&result.length===2&&result[0]===nodes[0]&&result[1]===nodes[first];if(valid){let p=result[0];for(let i=0;i<first;i++){valid=valid&&p===nodes[i]&&p.val===original.get(p);p=p.next;}valid=valid&&p===result[0];p=result[1];for(let i=first;i<nodes.length;i++){valid=valid&&p===nodes[i]&&p.val===original.get(p);p=p.next;}valid=valid&&p===result[1];}if(!valid)return [new ListNode(123456789),null];nodes[first-1].next=null;nodes[nodes.length-1].next=null;return result;}`;
  }
  if (language === 'java') {
    if (rule.kind === 'dedupe') return `class __PPVerify{ListNode run(ListNode head){ArrayList<ListNode>nodes=new ArrayList<>();IdentityHashMap<ListNode,Integer>original=new IdentityHashMap<>();HashMap<Integer,Integer>counts=new HashMap<>();for(ListNode p=head;p!=null;p=p.next){nodes.add(p);original.put(p,p.val);counts.put(p.val,counts.getOrDefault(p.val,0)+1);}ArrayList<ListNode>expected=new ArrayList<>();for(ListNode p:nodes)if(counts.get(p.val)==1)expected.add(p);ListNode result=${call},p=result;ArrayList<ListNode>actual=new ArrayList<>();IdentityHashMap<ListNode,Boolean>seen=new IdentityHashMap<>();while(p!=null&&!seen.containsKey(p)&&actual.size()<=nodes.size()){seen.put(p,true);actual.add(p);p=p.next;}boolean valid=p==null&&actual.size()==expected.size();for(int i=0;valid&&i<actual.size();i++)valid=actual.get(i)==expected.get(i)&&actual.get(i).val==original.get(actual.get(i));return valid?result:new ListNode(123456789);}}`;
    if (rule.kind === 'sort') return `class __PPVerify{ListNode run(ListNode head){ArrayList<ListNode>nodes=new ArrayList<>();IdentityHashMap<ListNode,Integer>original=new IdentityHashMap<>();for(ListNode p=head;p!=null;p=p.next){nodes.add(p);original.put(p,p.val);}ListNode result=${call},p=result;ArrayList<ListNode>actual=new ArrayList<>();IdentityHashMap<ListNode,Boolean>seen=new IdentityHashMap<>();while(p!=null&&!seen.containsKey(p)&&actual.size()<=nodes.size()){seen.put(p,true);actual.add(p);p=p.next;}boolean valid=p==null&&actual.size()==nodes.size();for(int i=0;valid&&i<actual.size();i++){ListNode x=actual.get(i);valid=original.containsKey(x)&&x.val==original.get(x)&&(i==0||actual.get(i-1).val<=x.val);}return valid?result:new ListNode(123456789);}}`;
    return `class __PPVerify{ListNode[] run(ListNode head){ArrayList<ListNode>nodes=new ArrayList<>();IdentityHashMap<ListNode,Integer>original=new IdentityHashMap<>();nodes.add(head);original.put(head,head.val);for(ListNode p=head.next;p!=head&&nodes.size()<=100000;p=p.next){nodes.add(p);original.put(p,p.val);}int first=(nodes.size()+1)/2;ListNode[]result=${call};boolean valid=result!=null&&result.length==2&&result[0]==nodes.get(0)&&result[1]==nodes.get(first);if(valid){ListNode p=result[0];for(int i=0;i<first;i++){valid=valid&&p==nodes.get(i)&&p.val==original.get(p);p=p.next;}valid=valid&&p==result[0];p=result[1];for(int i=first;i<nodes.size();i++){valid=valid&&p==nodes.get(i)&&p.val==original.get(p);p=p.next;}valid=valid&&p==result[1];}if(!valid)return new ListNode[]{new ListNode(123456789),null};nodes.get(first-1).next=null;nodes.get(nodes.size()-1).next=null;return result;}}`;
  }
  if (language === 'cpp') {
    if (rule.kind === 'dedupe') return `class __PPVerify{public:ListNode*run(ListNode*head){vector<ListNode*>nodes,expected,actual;unordered_map<ListNode*,int>original;unordered_map<int,int>counts;for(auto*p=head;p;p=p->next){nodes.push_back(p);original[p]=p->val;counts[p->val]++;}for(auto*p:nodes)if(counts[p->val]==1)expected.push_back(p);auto*result=${call};unordered_set<ListNode*>seen;auto*p=result;while(p&&!seen.count(p)&&actual.size()<=nodes.size()){seen.insert(p);actual.push_back(p);p=p->next;}bool valid=!p&&actual.size()==expected.size();for(size_t i=0;valid&&i<actual.size();i++)valid=actual[i]==expected[i]&&actual[i]->val==original[actual[i]];return valid?result:new ListNode(123456789);}};`;
    if (rule.kind === 'sort') return `class __PPVerify{public:ListNode*run(ListNode*head){vector<ListNode*>nodes,actual;unordered_map<ListNode*,int>original;for(auto*p=head;p;p=p->next){nodes.push_back(p);original[p]=p->val;}auto*result=${call};unordered_set<ListNode*>seen;auto*p=result;while(p&&!seen.count(p)&&actual.size()<=nodes.size()){seen.insert(p);actual.push_back(p);p=p->next;}bool valid=!p&&actual.size()==nodes.size();for(size_t i=0;valid&&i<actual.size();i++)valid=original.count(actual[i])&&actual[i]->val==original[actual[i]]&&(!i||actual[i-1]->val<=actual[i]->val);return valid?result:new ListNode(123456789);}};`;
    return `class __PPVerify{public:vector<ListNode*>run(ListNode*head){vector<ListNode*>nodes{head};unordered_map<ListNode*,int>original{{head,head->val}};for(auto*p=head->next;p!=head&&nodes.size()<=100000;p=p->next){nodes.push_back(p);original[p]=p->val;}size_t first=(nodes.size()+1)/2;auto result=${call};bool valid=result.size()==2&&result[0]==nodes[0]&&result[1]==nodes[first];if(valid){auto*p=result[0];for(size_t i=0;i<first;i++){valid=valid&&p==nodes[i]&&p->val==original[p];p=p->next;}valid=valid&&p==result[0];p=result[1];for(size_t i=first;i<nodes.size();i++){valid=valid&&p==nodes[i]&&p->val==original[p];p=p->next;}valid=valid&&p==result[1];}if(!valid)return {new ListNode(123456789),nullptr};nodes[first-1]->next=nullptr;nodes.back()->next=nullptr;return result;}};`;
  }
  if (rule.kind === 'dedupe') return `struct ListNode*__ppVerify(struct ListNode*head){struct ListNode*nodes[100000],*expected[100000],*actual[100001];int values[100000],counts[100001]={0},n=0,e=0,a=0;for(struct ListNode*p=head;p;p=p->next){nodes[n]=p;values[n++]=p->val;counts[p->val]++;}for(int i=0;i<n;i++)if(counts[values[i]]==1)expected[e++]=nodes[i];struct ListNode*result=${call},*p=result;while(p&&a<=n){for(int i=0;i<a;i++)if(actual[i]==p)goto done;actual[a++]=p;p=p->next;}done:;int valid=!p&&a==e;for(int i=0;valid&&i<a;i++)valid=actual[i]==expected[i];if(valid){for(int i=0;i<a;i++){int found=0;for(int j=0;j<n;j++)if(actual[i]==nodes[j]&&actual[i]->val==values[j])found=1;if(!found)valid=0;}}if(valid)return result;struct ListNode*bad=malloc(sizeof(*bad));bad->val=123456789;bad->next=NULL;return bad;}`;
  if (rule.kind === 'sort') return `struct ListNode*__ppVerify(struct ListNode*head){struct ListNode*nodes[100000],*actual[100001];int values[100000],n=0,a=0;for(struct ListNode*p=head;p;p=p->next){nodes[n]=p;values[n++]=p->val;}struct ListNode*result=${call},*p=result;while(p&&a<=n){for(int i=0;i<a;i++)if(actual[i]==p)goto done;actual[a++]=p;p=p->next;}done:;int valid=!p&&a==n;for(int i=0;valid&&i<a;i++){int found=0;for(int j=0;j<n;j++)if(actual[i]==nodes[j]&&actual[i]->val==values[j])found++;valid=found==1&&(!i||actual[i-1]->val<=actual[i]->val);}if(valid)return result;struct ListNode*bad=malloc(sizeof(*bad));bad->val=123456789;bad->next=NULL;return bad;}`;
  return `struct ListNode**__ppVerify(struct ListNode*head){struct ListNode*nodes[100000];int values[100000],n=1;nodes[0]=head;values[0]=head->val;for(struct ListNode*p=head->next;p!=head&&n<=100000;p=p->next){nodes[n]=p;values[n++]=p->val;}int first=(n+1)/2;struct ListNode**result=${call};int valid=result&&result[0]==nodes[0]&&result[1]==nodes[first];if(valid){struct ListNode*p=result[0];for(int i=0;i<first;i++){valid=valid&&p==nodes[i]&&p->val==values[i];p=p->next;}valid=valid&&p==result[0];p=result[1];for(int i=first;i<n;i++){valid=valid&&p==nodes[i]&&p->val==values[i];p=p->next;}valid=valid&&p==result[1];}if(!valid){result=malloc(2*sizeof(*result));result[0]=malloc(sizeof(**result));result[0]->val=123456789;result[0]->next=NULL;result[1]=NULL;return result;}nodes[first-1]->next=NULL;nodes[n-1]->next=NULL;return result;}`;
}

export function prepareLinkedListRewireSource(language, problem, userCode, input) {
  const { rule, values, name } = validateLinkedListRewireFixture(problem, input);
  const normalized = String(language || '').toLowerCase();
  const code = normalized === 'java' ? String(userCode).replace(/(^|\n)\s*public\s+class\s+Solution\b/, '$1class Solution') : String(userCode);
  const verifier = wrapper(normalized, rule, code);
  if (!verifier) throw new Error('Unsupported linked-list rewire language.');
  const internal = {
    className: ({python:'__PPVerify',cpp:'__PPVerify',java:'__PPVerify',c:'',javascript:'',typescript:''})[normalized],
    methodName: normalized === 'c' ? '__ppVerify' : ['javascript','typescript'].includes(normalized) ? '__ppVerify' : 'run',
    parameters: [{name:'head',type:'list-node'}],
    returnType: rule.kind === 'split' ? 'list-node[]' : 'list-node', outputMode:'return', runnerLanguage:normalized,
  };
  const joined = `${code}\n${verifier}`;
  let template = generateFunctionRunnerTemplate(normalized, internal, joined);
  template = materializeFunctionInputPlaceholders(template, `head=${JSON.stringify(values)}`, internal);
  template = template.split(USER_CODE_PLACEHOLDER).join(joined);
  if (rule.kind === 'split') {
    if (normalized === 'python') template = template.replace('__pp_args = [__pp_convert(value,', '__pp_args = [__pp_convert(value,').replace(`${joined}\n\n# PeerPrep private runner`, `${joined}\n\n# PeerPrep private runner`);
    // The generic builder creates a linear list; close the sole input list before invoking the verifier.
    const close = {
      python:'__pp_args[0] and setattr(__pp_args[-1] if False else (lambda h: (lambda p: p)(h))(__pp_args[0]), "val", __pp_args[0].val)',
    };
    // Patch the invocation sites narrowly, after argument construction, to make the input circular.
    if (normalized === 'python') template = template.replace('__pp_result = getattr(__PPVerify(), "run")(*__pp_args)', 'if __pp_args[0]:\n    __pp_tail=__pp_args[0]\n    while __pp_tail.next is not None: __pp_tail=__pp_tail.next\n    __pp_tail.next=__pp_args[0]\n__pp_result = getattr(__PPVerify(), "run")(*__pp_args)');
    if (normalized === 'javascript' || normalized === 'typescript') template = template.replace('const __ppResult', 'if (__ppArgs[0]) { let __ppTail = __ppArgs[0]; while (__ppTail.next) __ppTail = __ppTail.next; __ppTail.next = __ppArgs[0]; }\nconst __ppResult');
    if (normalized === 'java') template = template
      .replace('ListNode[] __ppResult =', 'if (__ppArgs0 != null) { ListNode __ppTail=__ppArgs0; while (__ppTail.next != null) __ppTail=__ppTail.next; __ppTail.next=__ppArgs0; }\n    ListNode[] __ppResult =')
      .replace('Object __ppReceiver =', 'if (__ppArgs[0] != null) { ListNode __ppHead=(ListNode)__ppArgs[0], __ppTail=__ppHead; while (__ppTail.next != null) __ppTail=__ppTail.next; __ppTail.next=__ppHead; }\n    Object __ppReceiver =');
    if (normalized === 'cpp') template = template.replace('auto __ppResult =', 'if (__ppArg0) { auto* __ppTail=__ppArg0; while (__ppTail->next) __ppTail=__ppTail->next; __ppTail->next=__ppArg0; }\n  auto __ppResult =');
    if (normalized === 'c') template = template
      .replace('struct ListNode** __ppResult =', 'if (__ppArg0) { struct ListNode*__ppTail=__ppArg0; while(__ppTail->next)__ppTail=__ppTail->next; __ppTail->next=__ppArg0; }\n  struct ListNode** __ppResult =')
      .replace('__ppResult = __ppVerify(__ppArg0);', '__ppResult = __ppVerify(__ppArg0);\n  __ppReturnSize = 2;');
  }
  return template;
}
