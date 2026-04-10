import { HttpError } from '../utils/errors.js';

const JUDGE0_BASE_URL = process.env.JUDGE0_BASE_URL || 'https://ce.judge0.com';
const JUDGE0_AUTH_HEADER = String(process.env.JUDGE0_AUTH_HEADER || '').trim();
const JUDGE0_AUTH_TOKEN = String(process.env.JUDGE0_AUTH_TOKEN || '').trim();
const JUDGE0_BASE_URLS = String(process.env.JUDGE0_BASE_URLS || JUDGE0_BASE_URL)
  .split(',')
  .map((url) => String(url || '').trim().replace(/\/+$/, ''))
  .filter(Boolean);

const MAX_SOURCE_CODE_SIZE_BYTES = 50 * 1024;
const MAX_STDIN_SIZE_BYTES = 64 * 1024;
const MAX_TESTCASE_TEXT_BYTES = 64 * 1024;
const POLL_DELAY_MS = 1000;
const POLL_MAX_ATTEMPTS = 10;
const JUDGE0_REQUEST_TIMEOUT_MS = Number(process.env.JUDGE0_REQUEST_TIMEOUT_MS || 15000);
const DEFAULT_TIME_LIMIT_SECONDS = 2;
const DEFAULT_MEMORY_LIMIT_KB = 256 * 1024;
const JUDGE0_MAX_CPU_TIME_LIMIT_SECONDS = Number(process.env.JUDGE0_MAX_CPU_TIME_LIMIT_SECONDS || 15);
const JUDGE0_MAX_WALL_TIME_LIMIT_SECONDS = Number(process.env.JUDGE0_MAX_WALL_TIME_LIMIT_SECONDS || 20);
const JUDGE0_MAX_MEMORY_LIMIT_KB = Number(process.env.JUDGE0_MAX_MEMORY_LIMIT_KB || 512000);

let judge0RoundRobinIndex = 0;

export const LANGUAGE_ID_TO_KEY = {
  50: 'c',
  54: 'cpp',
  62: 'java',
  63: 'javascript',
  71: 'python',
};

export const KEY_TO_LANGUAGE_ID = {
  c: 50,
  cpp: 54,
  java: 62,
  javascript: 63,
  python: 71,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeBase64(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).replace(/\s+/g, '');
  if (!text || text.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(text);
}

function toBase64Utf8(value) {
  return Buffer.from(String(value ?? ''), 'utf8').toString('base64');
}

function fromBase64Utf8(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (!looksLikeBase64(text)) return text;

  try {
    const compactBase64 = text.replace(/\s+/g, '');
    const decoded = Buffer.from(compactBase64, 'base64').toString('utf8');
    const roundTrip = Buffer.from(decoded, 'utf8').toString('base64');
    return roundTrip === compactBase64 ? decoded : text;
  } catch {
    return text;
  }
}

function normalizeJudge0Result(result) {
  if (!result || typeof result !== 'object') return result;
  return {
    ...result,
    stdout: fromBase64Utf8(result.stdout),
    stderr: fromBase64Utf8(result.stderr),
    compile_output: fromBase64Utf8(result.compile_output),
    message: fromBase64Utf8(result.message),
  };
}

export function sanitizeExecutionText(value, maxBytes, fieldName) {
  const normalized = String(value ?? '').replace(/\r\n/g, '\n');
  if (Buffer.byteLength(normalized, 'utf8') > maxBytes) {
    throw new HttpError(400, `${fieldName} exceeds the ${Math.round(maxBytes / 1024)} KB limit.`);
  }
  return normalized;
}

export function normalizeComparableOutput(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

export function roundNumber(value, digits = 3) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  return Number(numericValue.toFixed(digits));
}

export function secondsToMilliseconds(value) {
  return roundNumber(Number(value || 0) * 1000, 2);
}

function buildJudge0Error(message, statusCode = 502) {
  return new HttpError(statusCode, message);
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function extractJudge0ErrorMessage(parsedBody, statusCode) {
  if (!parsedBody || typeof parsedBody !== 'object') {
    return `Judge0 request failed with status ${statusCode}.`;
  }

  if (parsedBody.message) return String(parsedBody.message);
  if (parsedBody.error) return String(parsedBody.error);
  if (parsedBody.stderr) return String(parsedBody.stderr);

  for (const [field, value] of Object.entries(parsedBody)) {
    if (Array.isArray(value) && value.length > 0) {
      return `${field}: ${String(value[0])}`;
    }
    if (typeof value === 'string' && value.trim()) {
      return `${field}: ${value}`;
    }
  }

  try {
    return `Judge0 request failed with status ${statusCode}. ${JSON.stringify(parsedBody).slice(0, 240)}`;
  } catch {
    return `Judge0 request failed with status ${statusCode}.`;
  }
}

function getNextJudge0Targets() {
  if (JUDGE0_BASE_URLS.length <= 1) {
    return JUDGE0_BASE_URLS;
  }

  const start = judge0RoundRobinIndex % JUDGE0_BASE_URLS.length;
  judge0RoundRobinIndex = (judge0RoundRobinIndex + 1) % JUDGE0_BASE_URLS.length;

  return [
    ...JUDGE0_BASE_URLS.slice(start),
    ...JUDGE0_BASE_URLS.slice(0, start),
  ];
}

export function resolveLanguageRequest(body) {
  if (body.language_id !== undefined && body.language_id !== null && body.language_id !== '') {
    const languageId = Number(body.language_id);
    const languageKey = LANGUAGE_ID_TO_KEY[languageId];
    if (!languageKey) {
      throw new HttpError(400, 'Unsupported language_id. Use one of 50, 54, 62, 63, or 71.');
    }
    return { languageId, languageKey };
  }

  const languageKey = String(body.language || '').trim().toLowerCase();
  const languageId = KEY_TO_LANGUAGE_ID[languageKey];
  if (!languageId) {
    throw new HttpError(400, 'A supported language_id is required.');
  }

  return { languageId, languageKey };
}

async function judge0Request(path, { method = 'GET', body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (JUDGE0_AUTH_HEADER && JUDGE0_AUTH_TOKEN) {
    headers[JUDGE0_AUTH_HEADER] = JUDGE0_AUTH_TOKEN;
  }

  const targets = getNextJudge0Targets();
  let lastError = null;

  for (const target of targets) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), JUDGE0_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${target}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const rawBody = await response.text();
      let parsedBody = {};
      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        parsedBody = { message: rawBody };
      }

      if (!response.ok) {
        const upstreamMessage = extractJudge0ErrorMessage(parsedBody, response.status);
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw buildJudge0Error(upstreamMessage, response.status);
        }

        lastError = buildJudge0Error(upstreamMessage, response.status === 429 ? 503 : 502);
        continue;
      }

      return parsedBody;
    } catch (error) {
      if (error.name === 'AbortError') {
        lastError = buildJudge0Error('Judge0 request timed out.', 504);
        continue;
      }

      if (error instanceof HttpError) {
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          throw error;
        }
        lastError = error;
        continue;
      }

      lastError = buildJudge0Error(error.message || 'Unable to reach Judge0.');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || buildJudge0Error('Unable to reach any Judge0 node.');
}

export async function runJudge0(sourceCodeInput, languageId, stdin = '', options = {}) {
  const sourceCode = sanitizeExecutionText(sourceCodeInput, MAX_SOURCE_CODE_SIZE_BYTES, 'Source code');
  const standardInput = sanitizeExecutionText(stdin, MAX_STDIN_SIZE_BYTES, 'Input');
  const numericLanguageId = Number(languageId);

  if (!LANGUAGE_ID_TO_KEY[numericLanguageId]) {
    throw new HttpError(400, 'Unsupported language_id.');
  }

  const cpuTimeLimit = clampNumber(
    options.cpuTimeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS,
    1,
    JUDGE0_MAX_CPU_TIME_LIMIT_SECONDS,
    DEFAULT_TIME_LIMIT_SECONDS,
  );
  const wallTimeLimit = clampNumber(
    options.wallTimeLimitSeconds || Math.max(5, cpuTimeLimit * 2),
    2,
    JUDGE0_MAX_WALL_TIME_LIMIT_SECONDS,
    Math.min(JUDGE0_MAX_WALL_TIME_LIMIT_SECONDS, Math.max(5, cpuTimeLimit * 2)),
  );
  const memoryLimitKb = Math.trunc(clampNumber(
    options.memoryLimitKb || DEFAULT_MEMORY_LIMIT_KB,
    32 * 1024,
    JUDGE0_MAX_MEMORY_LIMIT_KB,
    DEFAULT_MEMORY_LIMIT_KB,
  ));

  const createSubmissionResponse = await judge0Request('/submissions/?base64_encoded=true&wait=false', {
    method: 'POST',
    body: {
      source_code: toBase64Utf8(sourceCode),
      language_id: numericLanguageId,
      stdin: toBase64Utf8(standardInput),
      cpu_time_limit: roundNumber(cpuTimeLimit, 2),
      wall_time_limit: roundNumber(wallTimeLimit, 2),
      memory_limit: memoryLimitKb,
      number_of_runs: 1,
      max_file_size: 1024,
    },
  });

  if (!createSubmissionResponse.token) {
    throw buildJudge0Error('Judge0 did not return a submission token.');
  }

  let latestResult = null;
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    await sleep(POLL_DELAY_MS);
    latestResult = await judge0Request(`/submissions/${createSubmissionResponse.token}?base64_encoded=true`);
    const normalized = normalizeJudge0Result(latestResult);
    if ((normalized.status?.id || 0) > 2) {
      return normalized;
    }
  }

  throw buildJudge0Error('Judge0 did not finish processing in time.', 504);
}

export function mapRunStatusCode(result) {
  if (result.compile_output || result.status?.id === 6) {
    return 'CE';
  }
  if (result.status?.id === 5) {
    return 'TLE';
  }
  if (result.stderr || (result.status?.id >= 7 && result.status?.id <= 13) || result.message) {
    return 'RE';
  }
  return 'AC';
}

export function buildRunResponse(result) {
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    compile_output: result.compile_output || '',
    status: result.status || { id: 13, description: 'Runtime Error (Other)' },
    time: roundNumber(result.time || 0, 3),
    memory: Math.trunc(Number(result.memory || 0)),
  };
}

export function evaluateSubmissionResult(result, expectedOutput) {
  if (result.compile_output || result.status?.id === 6) {
    return {
      verdict: 'Compilation Error',
      internalStatus: 'CE',
      error: result.compile_output || 'Compilation failed.',
    };
  }

  if (result.status?.id === 5) {
    return {
      verdict: 'Time Limit Exceeded',
      internalStatus: 'TLE',
      error: result.message || 'Execution exceeded the configured time limit.',
    };
  }

  if (result.stderr || (result.status?.id >= 7 && result.status?.id <= 13) || result.message) {
    return {
      verdict: 'Runtime Error',
      internalStatus: 'RE',
      error: result.stderr || result.message || result.status?.description || 'Runtime error.',
    };
  }

  const actualOutput = result.stdout || '';
  const expected = String(expectedOutput ?? '');
  if (normalizeComparableOutput(actualOutput) !== normalizeComparableOutput(expected)) {
    return {
      verdict: 'Wrong Answer',
      internalStatus: 'WA',
      actualOutput,
      expectedOutput: expected,
    };
  }

  return {
    verdict: 'Accepted',
    internalStatus: 'AC',
    actualOutput,
    expectedOutput: expected,
  };
}

export function buildJudge0Options(problem) {
  return {
    cpuTimeLimitSeconds: problem?.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS,
    wallTimeLimitSeconds: Math.max(5, (problem?.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS) * 2),
    memoryLimitKb: Math.trunc((problem?.memoryLimitMb || 256) * 1024),
  };
}

export async function checkJudge0Health() {
  const headers = {};
  if (JUDGE0_AUTH_HEADER && JUDGE0_AUTH_TOKEN) {
    headers[JUDGE0_AUTH_HEADER] = JUDGE0_AUTH_TOKEN;
  }

  const checks = await Promise.all(
    JUDGE0_BASE_URLS.map(async (baseUrl) => {
      const startedAt = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), Math.min(JUDGE0_REQUEST_TIMEOUT_MS, 5000));
        const response = await fetch(`${baseUrl}/languages`, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        return {
          node: baseUrl,
          ok: response.ok,
          status: response.status,
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        return {
          node: baseUrl,
          ok: false,
          status: 0,
          latencyMs: Date.now() - startedAt,
          error: error?.name === 'AbortError' ? 'timeout' : (error?.message || 'request failed'),
        };
      }
    }),
  );

  const healthyNodes = checks.filter((entry) => entry.ok).length;
  return {
    totalNodes: checks.length,
    healthyNodes,
    degraded: healthyNodes < checks.length,
    nodes: checks,
  };
}

export {
  DEFAULT_TIME_LIMIT_SECONDS,
  MAX_SOURCE_CODE_SIZE_BYTES,
  MAX_STDIN_SIZE_BYTES,
  MAX_TESTCASE_TEXT_BYTES,
};
