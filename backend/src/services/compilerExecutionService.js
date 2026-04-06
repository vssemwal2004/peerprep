import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const MAX_OUTPUT_SIZE = 1024 * 1024;
const TEMP_DIR_PREFIX = path.join(os.tmpdir(), 'peerprep-compiler-');
const WINDOWS_EXECUTABLE = process.platform === 'win32' ? '.exe' : '';

class ExecutionQueue {
  constructor() {
    this.chain = Promise.resolve();
  }

  enqueue(task) {
    const nextTask = this.chain.then(task);
    this.chain = nextTask.catch(() => {});
    return nextTask;
  }
}

const executionQueue = new ExecutionQueue();

function normalizeOutput(output = '') {
  return String(output).replace(/\r\n/g, '\n').trim();
}

function roundDuration(durationMs = 0) {
  return Number(durationMs.toFixed(2));
}

function mapExecutionStatus(result, hasExpectedOutput = false) {
  if (result.compileError) return 'CE';
  if (result.timeout) return 'TLE';
  if (!result.ok) return 'RE';
  if (hasExpectedOutput && result.outputMatched === false) return 'WA';
  return 'AC';
}

function createStatusPayload(result, hasExpectedOutput = false) {
  return {
    status: mapExecutionStatus(result, hasExpectedOutput),
    output: result.stdout || '',
    stderr: result.stderr || '',
    executionTimeMs: roundDuration(result.executionTimeMs || 0),
    memoryUsedKb: 0,
    provider: 'local-sandbox',
  };
}

function runProcess({ command, args = [], stdin = '', cwd, timeoutMs }) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const startedAt = process.hrtime.bigint();

    let child;
    try {
      child = spawn(command, args, {
        cwd,
        windowsHide: true,
        stdio: 'pipe',
      });
    } catch (error) {
      resolve({
        ok: false,
        timeout: false,
        stdout: '',
        stderr: error.message,
        executionTimeMs: 0,
      });
      return;
    }

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      resolve({
        stdout,
        stderr,
        executionTimeMs: roundDuration(durationMs),
        timeout: false,
        ...payload,
      });
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({
        ok: false,
        timeout: true,
        stdout,
        stderr: stderr || 'Execution timed out.',
        executionTimeMs: timeoutMs,
      });
    }, timeoutMs);

    child.on('error', (error) => {
      finish({
        ok: false,
        stderr: error.message,
      });
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_OUTPUT_SIZE) {
        stdout = stdout.slice(0, MAX_OUTPUT_SIZE);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > MAX_OUTPUT_SIZE) {
        stderr = stderr.slice(0, MAX_OUTPUT_SIZE);
      }
    });

    child.on('close', (code) => {
      finish({
        ok: code === 0,
        exitCode: code,
      });
    });

    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

const languageRuntimes = {
  python: async ({ workdir, sourceCode }) => {
    const sourcePath = path.join(workdir, 'solution.py');
    await fs.writeFile(sourcePath, sourceCode, 'utf8');
    return {
      run: (stdin, timeoutMs) => runProcess({
        command: 'python',
        args: [sourcePath],
        stdin,
        cwd: workdir,
        timeoutMs,
      }),
    };
  },
  javascript: async ({ workdir, sourceCode }) => {
    const sourcePath = path.join(workdir, 'solution.js');
    await fs.writeFile(sourcePath, sourceCode, 'utf8');
    return {
      run: (stdin, timeoutMs) => runProcess({
        command: 'node',
        args: [sourcePath],
        stdin,
        cwd: workdir,
        timeoutMs,
      }),
    };
  },
  java: async ({ workdir, sourceCode, compileTimeoutMs }) => {
    const sourcePath = path.join(workdir, 'Main.java');
    await fs.writeFile(sourcePath, sourceCode, 'utf8');

    const compileResult = await runProcess({
      command: 'javac',
      args: [sourcePath],
      cwd: workdir,
      timeoutMs: compileTimeoutMs,
    });

    if (!compileResult.ok) {
      return {
        compileError: compileResult.stderr || compileResult.stdout || 'Java compilation failed.',
      };
    }

    return {
      run: (stdin, timeoutMs) => runProcess({
        command: 'java',
        args: ['-cp', workdir, 'Main'],
        stdin,
        cwd: workdir,
        timeoutMs,
      }),
    };
  },
  cpp: async ({ workdir, sourceCode, compileTimeoutMs }) => {
    const sourcePath = path.join(workdir, 'solution.cpp');
    const outputPath = path.join(workdir, `solution${WINDOWS_EXECUTABLE}`);
    await fs.writeFile(sourcePath, sourceCode, 'utf8');

    const compileResult = await runProcess({
      command: 'g++',
      args: [sourcePath, '-O2', '-std=c++17', '-o', outputPath],
      cwd: workdir,
      timeoutMs: compileTimeoutMs,
    });

    if (!compileResult.ok) {
      return {
        compileError: compileResult.stderr || compileResult.stdout || 'C++ compilation failed.',
      };
    }

    return {
      run: (stdin, timeoutMs) => runProcess({
        command: outputPath,
        cwd: workdir,
        stdin,
        timeoutMs,
      }),
    };
  },
  c: async ({ workdir, sourceCode, compileTimeoutMs }) => {
    const sourcePath = path.join(workdir, 'solution.c');
    const outputPath = path.join(workdir, `solution${WINDOWS_EXECUTABLE}`);
    await fs.writeFile(sourcePath, sourceCode, 'utf8');

    const compileResult = await runProcess({
      command: 'gcc',
      args: [sourcePath, '-O2', '-std=c11', '-o', outputPath],
      cwd: workdir,
      timeoutMs: compileTimeoutMs,
    });

    if (!compileResult.ok) {
      return {
        compileError: compileResult.stderr || compileResult.stdout || 'C compilation failed.',
      };
    }

    return {
      run: (stdin, timeoutMs) => runProcess({
        command: outputPath,
        cwd: workdir,
        stdin,
        timeoutMs,
      }),
    };
  },
};

async function withRuntime({ language, sourceCode, timeLimitSeconds }, task) {
  const runtimeFactory = languageRuntimes[language];
  if (!runtimeFactory) {
    return {
      status: 'RE',
      output: '',
      stderr: `Unsupported language: ${language}`,
      executionTimeMs: 0,
      memoryUsedKb: 0,
      provider: 'local-sandbox',
    };
  }

  const workdir = await fs.mkdtemp(TEMP_DIR_PREFIX);
  const compileTimeoutMs = Math.max(5000, (timeLimitSeconds || 2) * 1000 + 3000);

  try {
    const runtime = await runtimeFactory({
      workdir,
      sourceCode,
      compileTimeoutMs,
    });

    if (runtime.compileError) {
      return {
        status: 'CE',
        output: '',
        stderr: runtime.compileError,
        executionTimeMs: 0,
        memoryUsedKb: 0,
        provider: 'local-sandbox',
      };
    }

    return await task(runtime);
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}

export async function executeWithCustomInput({ language, sourceCode, customInput = '', timeLimitSeconds = 2 }) {
  return executionQueue.enqueue(() => withRuntime(
    { language, sourceCode, timeLimitSeconds },
    async (runtime) => {
      const result = await runtime.run(customInput, Math.max(1000, timeLimitSeconds * 1000));
      return createStatusPayload(result, false);
    },
  ));
}

export async function executeAgainstTestCases({ language, sourceCode, testCases, timeLimitSeconds = 2 }) {
  return executionQueue.enqueue(() => withRuntime(
    { language, sourceCode, timeLimitSeconds },
    async (runtime) => {
      const caseResults = [];
      let totalExecutionTimeMs = 0;
      let failedCase = null;
      let finalStatus = 'AC';
      let finalOutput = '';
      let finalStderr = '';

      for (let index = 0; index < testCases.length; index += 1) {
        const testCase = testCases[index];
        const runResult = await runtime.run(
          testCase.input || '',
          Math.max(1000, timeLimitSeconds * 1000),
        );

        const actualOutput = runResult.stdout || '';
        const expectedOutput = testCase.output || '';
        const outputMatched = normalizeOutput(actualOutput) === normalizeOutput(expectedOutput);
        const status = mapExecutionStatus({
          ...runResult,
          outputMatched,
        }, true);

        totalExecutionTimeMs += runResult.executionTimeMs || 0;
        caseResults.push({
          index: index + 1,
          status,
          input: testCase.input || '',
          expectedOutput,
          actualOutput,
          executionTimeMs: roundDuration(runResult.executionTimeMs || 0),
        });

        finalOutput = actualOutput;
        finalStderr = runResult.stderr || '';

        if (status !== 'AC') {
          failedCase = {
            index: index + 1,
            input: testCase.input || '',
            expectedOutput,
            actualOutput,
          };
          finalStatus = status;
          break;
        }
      }

      return {
        status: finalStatus,
        output: finalOutput,
        stderr: finalStderr,
        executionTimeMs: roundDuration(totalExecutionTimeMs),
        memoryUsedKb: 0,
        provider: 'local-sandbox',
        failedCase,
        testCaseResults: caseResults,
        totalTestCases: testCases.length,
        passedTestCases: failedCase ? Math.max(caseResults.length - 1, 0) : testCases.length,
      };
    },
  ));
}
