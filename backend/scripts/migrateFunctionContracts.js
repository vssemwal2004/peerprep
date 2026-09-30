import '../src/setup.js';

import Problem from '../src/models/Problem.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import { closeDb, connectDb } from '../src/utils/db.js';

function codeMap(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return typeof value === 'object' ? value : {};
}

function splitTopLevel(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if ('[({'.includes(character)) depth += 1;
    else if ('])}'.includes(character)) depth -= 1;
    else if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function canonicalType(rawType) {
  const source = String(rawType || '').trim()
    .replace(/^typing\./, '')
    .replace(/\s+/g, '');
  if (!source) return 'any';
  const optional = source.match(/^Optional\[(.*)]$/i);
  if (optional) return canonicalType(optional[1]);
  const list = source.match(/^(?:List|Sequence|Iterable)\[(.*)]$/i);
  if (list) return `${canonicalType(list[1])}[]`;
  const tuple = source.match(/^Tuple\[(.*)]$/i);
  if (tuple) {
    const members = splitTopLevel(tuple[1]);
    return members.length === 2 && members[1] === '...'
      ? `${canonicalType(members[0])}[]`
      : 'any[]';
  }
  const aliases = {
    int: 'integer', integer: 'integer', long: 'long', float: 'double', double: 'double',
    str: 'string', string: 'string', bool: 'boolean', boolean: 'boolean', char: 'character',
    treenode: 'tree-node', listnode: 'list-node', node: 'node', none: 'void', nonetype: 'void', void: 'void',
  };
  return aliases[source.toLowerCase()] || source;
}

function parsePythonContract(sourceCode) {
  const source = String(sourceCode || '').replace(/\r\n/g, '\n');
  const classMatch = source.match(/^[ \t]*class\s+([A-Za-z_]\w*)\s*[:(]/m);
  const signature = source.match(/^[ \t]*def\s+(?!__init__)([A-Za-z_]\w*)\s*\(([^\n]*)\)\s*(?:->\s*([^:\n]+))?\s*:/m);
  if (!signature) return null;
  const parameters = splitTopLevel(signature[2])
    .filter((parameter) => !/^self(?:\s|$)/.test(parameter))
    .map((parameter) => {
      const withoutDefault = splitTopLevel(parameter.replace(/=/, ',')).shift() || parameter;
      const separator = withoutDefault.indexOf(':');
      return {
        name: (separator >= 0 ? withoutDefault.slice(0, separator) : withoutDefault).trim().replace(/^\*+/, ''),
        type: canonicalType(separator >= 0 ? withoutDefault.slice(separator + 1) : ''),
      };
    })
    .filter((parameter) => /^[A-Za-z_]\w*$/.test(parameter.name));
  return {
    className: classMatch?.[1] || 'Solution',
    methodName: signature[1],
    parameters,
    returnType: canonicalType(signature[3] || ''),
    outputMode: canonicalType(signature[3] || '') === 'void' ? 'parameter' : 'return',
    outputParameterIndex: 0,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
  const limit = Math.max(0, Number(limitArgument?.split('=')[1]) || 0);
  await connectDb();
  const problems = await Problem.find({ category: { $ne: 'SQL' }, executionMode: { $ne: 'full_program' } })
    .select('_id codeTemplates functionContract')
    .sort({ _id: 1 })
    .limit(limit)
    .lean();
  const operations = [];
  const libraryOperations = [];
  let parsed = 0;
  let missing = 0;
  const examples = [];
  for (const problem of problems) {
    const contract = parsePythonContract(codeMap(problem.codeTemplates).python);
    if (!contract?.methodName) {
      missing += 1;
      if (examples.length < 20) examples.push(String(problem._id));
      continue;
    }
    parsed += 1;
    operations.push({ updateOne: { filter: { _id: problem._id }, update: { $set: { functionContract: contract } } } });
    libraryOperations.push({ updateOne: {
      filter: { sourceType: 'compiler', sourceProblemId: problem._id },
      update: { $set: { 'questionData.problemDataSnapshot.functionContract': contract, lastSyncedAt: new Date() } },
    } });
  }
  if (apply && operations.length) {
    await Problem.bulkWrite(operations, { ordered: false });
    await QuestionLibrary.bulkWrite(libraryOperations, { ordered: false });
  }
  console.log(JSON.stringify({ apply, scanned: problems.length, parsed, missing, firstMissingIds: examples }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
