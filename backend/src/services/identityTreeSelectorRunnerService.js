// Staged outside the active engine until the next controlled campaign boundary.
import {generateFunctionRunnerTemplate} from './functionRunnerTemplateService.js';
import {buildFunctionInputPayload,materializeFunctionInputPlaceholders} from './functionTestInputService.js';
const languages=['python','javascript','typescript','cpp','java','c'];
const type=value=>String(value||'').trim().replace(/^(['"])(.*)\1$/,'$2').toLowerCase();
export function isIdentityTreeSelectorContract(contract){return contract?.methodName==='lowestCommonAncestor'&&['tree-node','treenode'].includes(type(contract.returnType))&&contract.parameters?.length===3&&contract.parameters.every(parameter=>['tree-node','treenode'].includes(type(parameter.type)))&&contract.parameters.map(parameter=>parameter.name).join(',')==='root,p,q';}
export function validateIdentityTreeSelectorFixture(contract,input){
 if(!isIdentityTreeSelectorContract(contract))throw new Error('Explicit root/p/q TreeNode ancestor contract required');
 const args=buildFunctionInputPayload(input,contract).args,[values,p,q]=args;
 // The source task bounds node values to +/-1e9. This also keeps the C tree
 // builder's reserved INT_MIN null sentinel outside every valid node value.
 const integer=value=>Number.isSafeInteger(value)&&value>=-1000000000&&value<=1000000000;
 if(args.length!==3||!Array.isArray(values)||values.length<2||!integer(values[0])||values.some(value=>value!==null&&!integer(value))||!integer(p)||!integer(q)||p===q)throw new Error('Unique tree values and two distinct scalar node selectors required');
 const seen=new Set([values[0]]),queue=[values[0]];let cursor=1;
 for(let head=0;head<queue.length&&cursor<values.length;head++)for(let child=0;child<2&&cursor<values.length;child++){
  const value=values[cursor++];if(value===null)continue;if(seen.has(value))throw new Error('Ambiguous duplicate tree node selector');seen.add(value);queue.push(value);
 }
 if(values.slice(cursor).some(value=>value!==null))throw new Error('Unreachable tree values');
 if(!seen.has(p)||!seen.has(q))throw new Error('Selected nodes must exist in the original tree');
 return{values,p,q,nodeCount:seen.size};
}
export function prepareIdentityTreeSelectorSource(language,contract,userCode,input){
 validateIdentityTreeSelectorFixture(contract,input);
 if(!languages.includes(language))throw new Error('Six-language tree selector runner required');
 const className=contract.className||'Solution';if(!/^[A-Za-z_]\w*$/.test(className))throw new Error('Invalid source class identifier');
 const method='peerPrepSelectedAncestor',adapterClass='PeerPrepTreeSelectorAdapter';let adapter;
 if(language==='python')adapter=`\ndef peerPrepSelectNode(root,value):\n    queue=[root]\n    for node in queue:\n        if node.val==value: return node\n        if node.left is not None: queue.append(node.left)\n        if node.right is not None: queue.append(node.right)\n    raise ValueError('Unknown node selector')\nclass ${adapterClass}(${className}):\n    def ${method}(self,root,p,q):\n        return self.lowestCommonAncestor(root,peerPrepSelectNode(root,p),peerPrepSelectNode(root,q))\n`;
 if(language==='javascript'||language==='typescript'){
  const ts=language==='typescript',annotation=ts?': any':'',number=ts?': number':'';
  const uncommented=userCode.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\r\n]*/g,'');
  const call=new RegExp(`\\bclass\\s+${className}\\b`).test(uncommented)?`new ${className}().lowestCommonAncestor`:'lowestCommonAncestor';
  adapter=`\nfunction peerPrepSelectNode(root${annotation},value${number})${annotation}{const queue${annotation}=[root];for(let head=0;head<queue.length;head++){const node=queue[head];if(node.val===value)return node;if(node.left!==null&&node.left!==undefined)queue.push(node.left);if(node.right!==null&&node.right!==undefined)queue.push(node.right);}throw new Error('Unknown node selector');}\nfunction ${method}(root${annotation},p${number},q${number})${annotation}{return ${call}(root,peerPrepSelectNode(root,p),peerPrepSelectNode(root,q));}\n`;
 }
 if(language==='cpp')adapter=`\nclass ${adapterClass} : public ${className} {public: static TreeNode* peerPrepSelectNode(TreeNode* root,int value){vector<TreeNode*> queue{root};for(size_t head=0;head<queue.size();head++){TreeNode* node=queue[head];if(node->val==value)return node;if(node->left)queue.push_back(node->left);if(node->right)queue.push_back(node->right);}throw runtime_error("Unknown node selector");} TreeNode* ${method}(TreeNode* root,int p,int q){return this->lowestCommonAncestor(root,peerPrepSelectNode(root,p),peerPrepSelectNode(root,q));}};\n`;
 if(language==='java')adapter=`\nclass ${adapterClass} extends ${className} {static TreeNode peerPrepSelectNode(TreeNode root,int value){java.util.ArrayList<TreeNode> queue=new java.util.ArrayList<>();queue.add(root);for(int head=0;head<queue.size();head++){TreeNode node=queue.get(head);if(node.val==value)return node;if(node.left!=null)queue.add(node.left);if(node.right!=null)queue.add(node.right);}throw new IllegalArgumentException("Unknown node selector");}public TreeNode ${method}(TreeNode root,int p,int q){return lowestCommonAncestor(root,peerPrepSelectNode(root,p),peerPrepSelectNode(root,q));}}\n`;
 if(language==='c')adapter=`\nstatic struct TreeNode* peerPrepSelectNode(struct TreeNode* root,int value){struct TreeNode** queue=malloc(sizeof(struct TreeNode*)*${validateIdentityTreeSelectorFixture(contract,input).nodeCount});int count=1;queue[0]=root;for(int head=0;head<count;head++){struct TreeNode* node=queue[head];if(node->val==value){free(queue);return node;}if(node->left)queue[count++]=node->left;if(node->right)queue[count++]=node->right;}free(queue);exit(2);}struct TreeNode* ${method}(struct TreeNode* root,int p,int q){return lowestCommonAncestor(root,peerPrepSelectNode(root,p),peerPrepSelectNode(root,q));}\n`;
 const adapted={...contract,className:adapterClass,methodName:method,parameters:[{name:'root',type:'tree-node'},{name:'p',type:'integer'},{name:'q',type:'integer'}],returnType:'tree-node',outputMode:'return',runnerLanguage:language};
 let injectable=String(userCode);
 if(language==='java')injectable=injectable.replace(new RegExp(`(^|\\n)\\s*public\\s+class\\s+${className}\\b`),`$1class ${className}`);
 if(language==='c')injectable=injectable.replace(/\bstruct\s+TreeNode\s*\{[^}]*\}\s*;/gs,'');
 const source=injectable+adapter,template=generateFunctionRunnerTemplate(language,adapted,source);if(!template)throw new Error('Tree selector private runner generation failed');
 return materializeFunctionInputPlaceholders(template,input,adapted).replace('{{USER_CODE}}',source);
}
