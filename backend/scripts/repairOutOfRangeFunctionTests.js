import '../src/setup.js';

import { spawn } from 'node:child_process';

import Problem from '../src/models/Problem.js';
import TestCase from '../src/models/TestCase.js';
import { prepareFunctionSourceForExecution } from '../src/services/functionProblemAdapterService.js';
import { parseFunctionTestInput } from '../src/services/functionTestInputService.js';
import { closeDb, connectDb } from '../src/utils/db.js';

const SAFE_INTEGER_EDGE = 1_000_000_000;

function clampValue(value) {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => { const result = clampValue(entry); changed ||= result.changed; return result.value; });
    return { value: next, changed };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const next = Object.fromEntries(Object.entries(value).map(([key, entry]) => {
      const result = clampValue(entry); changed ||= result.changed; return [key, result.value];
    }));
    return { value: next, changed };
  }
  if (typeof value === 'number' && Number.isInteger(value) && (value > 2_147_483_647 || value < -2_147_483_648)) {
    return { value: value < 0 ? -SAFE_INTEGER_EDGE : SAFE_INTEGER_EDGE, changed: true };
  }
  return { value, changed: false };
}

function pythonLiteral(value) {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pythonLiteral).join(', ')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).map(([key, entry]) => `${JSON.stringify(key)}: ${pythonLiteral(entry)}`).join(', ')}}`;
  return String(value);
}

function repairInput(input) {
  const parsed = parseFunctionTestInput(input);
  if (Object.keys(parsed.named).length) {
    let changed = false;
    const entries = Object.entries(parsed.named).map(([name, value]) => {
      const result = clampValue(value); changed ||= result.changed; return [name, result.value];
    });
    return { changed, input: entries.map(([name, value]) => `${name} = ${pythonLiteral(value)}`).join(', ') };
  }
  let changed = false;
  const values = parsed.positional.map((value) => { const result = clampValue(value); changed ||= result.changed; return result.value; });
  return { changed, input: values.map(pythonLiteral).join(', ') };
}

function executePython(source, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_BIN || 'python', ['-c', source], { windowsHide: true });
    const stdout = []; const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (status) => {
      if (status !== 0) return reject(new Error(Buffer.concat(stderr).toString('utf8') || `Python exited ${status}`));
      resolve(Buffer.concat(stdout).toString('utf8').trim());
    });
    child.stdin.end(input);
  });
}

async function main() {
  const apply = process.argv.includes('--apply');
  const repairEmpty = process.argv.includes('--repair-empty');
  const repairParameterOutputs = process.argv.includes('--repair-parameter-outputs');
  const verbose = process.argv.includes('--verbose');
  const problemArgument = process.argv.find((argument) => argument.startsWith('--problem-id='));
  const problemIdFilter = String(problemArgument?.split('=')[1] || '').trim();
  await connectDb();
  const parameterProblemIds = repairParameterOutputs
    ? await Problem.distinct('_id', { executionMode: 'function', 'functionContract.outputMode': 'parameter' })
    : [];
  const testCaseQuery = problemIdFilter
    ? { problem: problemIdFilter }
    : (repairParameterOutputs ? { problem: { $in: parameterProblemIds } } : {});
  const testCases = await TestCase.find(testCaseQuery)
    .select('_id problem input output').lean();
  const repairsByProblem = new Map();
  for (const testCase of testCases) {
    let repair;
    try { repair = repairInput(testCase.input || ''); } catch { continue; }
    if (!repair.changed
      && !(repairEmpty && !String(testCase.output || '').trim())
      && !repairParameterOutputs) continue;
    const key = String(testCase.problem);
    if (!repairsByProblem.has(key)) repairsByProblem.set(key, []);
    repairsByProblem.get(key).push({ testCase, input: repair.input });
  }
  let repaired = 0; const failures = [];
  for (const [problemId, entries] of repairsByProblem) {
    const problem = await Problem.findById(problemId).select('+executionHarnesses');
    const source = String(problem?.referenceSolutions?.get?.('python') || '');
    if (!source) { failures.push({ problemId, reason: 'missing Python reference' }); continue; }
    try {
      const outputs = [];
      for (const entry of entries) {
        const executableSource = [
          'from typing import *',
          'from collections import *',
          'from functools import *',
          'from itertools import *',
          'from math import *',
          'from heapq import *',
          'from bisect import *',
          prepareFunctionSourceForExecution(problem, 'python', source, entry.input),
        ].join('\n');
        if (verbose) console.log('[source]', executableSource.length, executableSource.slice(-240));
        outputs.push(await executePython(executableSource, entry.input));
      }
      if (verbose) console.log('[repair]', problem.title, entries.map((entry, index) => ({ input: entry.input, output: outputs[index] })));
      if (apply) await TestCase.bulkWrite(entries.map((entry, index) => ({ updateOne: {
        filter: { _id: entry.testCase._id }, update: { $set: { input: entry.input, output: String(outputs[index] ?? '') } },
      } })), { ordered: false });
      repaired += entries.length;
    } catch (error) {
      failures.push({ problemId, reason: error.message.slice(0, 300) });
    }
  }
  console.log(JSON.stringify({ apply, repairEmpty, repairParameterOutputs, affectedProblems: repairsByProblem.size, repaired, failures: failures.slice(0, 20) }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(closeDb);
