import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateFunctionRunnerTemplate } from '../src/services/functionRunnerTemplateService.js';
import { prepareFunctionSourceForExecution } from '../src/services/functionProblemAdapterService.js';

const compiler = process.env.PEERPREP_TEST_CPP_COMPILER || 'C:\\MinGW\\bin\\g++.exe';
test('compiled C++ runner preserves double precision in scalar and array outputs', { skip: !existsSync(compiler) }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'peerprep-precision-'));
  const sourcePath = join(directory, 'runner.cpp'), binaryPath = join(directory, 'runner.exe');
  try {
    for (const array of [false, true]) {
      const contract = { className: 'Solution', methodName: 'ratio', parameters: [], returnType: array ? 'double[]' : 'double', outputMode: 'return' };
      const source = `class Solution { public: ${array ? 'vector<double>' : 'double'} ratio() { return ${array ? '{1.0/11.0, -1.0}' : '1.0/11.0'}; } };`;
      const runner = generateFunctionRunnerTemplate('cpp', contract, source);
      writeFileSync(sourcePath, prepareFunctionSourceForExecution({ executionMode: 'function', functionContract: contract, executionHarnesses: { cpp: runner } }, 'cpp', source, ''));
      execFileSync(compiler, ['-std=c++17', sourcePath, '-o', binaryPath], { timeout: 30000 });
      const output = execFileSync(binaryPath, [], { encoding: 'utf8', timeout: 5000 }).trim();
      const value = array ? JSON.parse(output)[0] : Number(output);
      assert.ok(Math.abs(value - 1 / 11) < 1e-16, output);
      if (array) assert.equal(JSON.parse(output)[1], -1);
    }
  } finally {
    for (const path of [sourcePath, binaryPath]) if (existsSync(path)) unlinkSync(path);
    rmdirSync(directory);
  }
});
