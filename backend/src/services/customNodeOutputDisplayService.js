import {customNodeRule} from './customNodeRunnerService.js';
import {parseNodeResultEnvelope} from './customNodeResultEnvelopeService.js';

// The evaluator receives raw stdout; response formatting runs afterwards.
export function displayCustomNodeOutput(problem, raw) {
  const rule=customNodeRule(problem);
  if(!rule || [429,559,589,590].includes(rule.sourceId) || raw==='')return raw;
  const parsed=parseNodeResultEnvelope(raw);
  return parsed?JSON.stringify(parsed.value):'Invalid returned node structure.';
}
