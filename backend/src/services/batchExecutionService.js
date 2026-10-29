import { runJudge0, runJudge0MultiFile } from './executionService.js';

// Compile-once execution for C++ and Java. Measured on the 16-core Judge0 node,
// one compile for all cases of a job cuts Judge0 time 3x (3 cases) to 11x (10
// cases), because header parsing and JVM start-up dominate each submission.
//
// Every case still runs in its own process with its own CPU limit. The batch is
// trusted only for cases that exit cleanly, fast, and are accepted by the
// caller's checker; any other case (and every case after a crash) is re-run on
// the single-case path, so non-accepted verdicts and messages stay identical.

const CPP_ID = 54;
const JAVA_ID = 62;
const GPP = '/usr/local/gcc-9.2.0/bin/g++';
const CPP_LIB = '/usr/local/gcc-9.2.0/lib64';
const JAVAC = '/usr/local/openjdk13/bin/javac';
const JAVA = '/usr/local/openjdk13/bin/java';
const MAX_CASES_PER_BATCH = 12;
const MAX_BATCH_OUTPUT_BYTES = 512 * 1024;
// Judge0 extracts at most 10 MB of additional files; large fixtures run per case.
const MAX_BATCH_SOURCE_BYTES = 2 * 1024 * 1024;
// A case taking more than this share of its CPU limit is re-judged on the single-case
// path, where Judge0 measures CPU time exactly.
const FAST_SHARE_OF_LIMIT = 0.5;

export function batchExecutionEnabled() {
  return String(process.env.JUDGE0_BATCH_EXECUTION || 'true').trim().toLowerCase() !== 'false';
}

function batchable(languageId, caseCount) {
  return batchExecutionEnabled() && caseCount >= 2 && [CPP_ID, JAVA_ID].includes(Number(languageId));
}

// ---------- program assembly ----------

const CPP_MAIN = /\bint\s+main\s*\(\s*(void)?\s*\)/;

function mergeCppSources(sources) {
  const includes = [];
  const bodies = sources.map((source, index) => {
    const kept = [];
    for (const line of String(source).split('\n')) {
      if (/^\s*#\s*include\b/.test(line)) {
        if (!includes.includes(line.trim())) includes.push(line.trim());
      } else kept.push(line);
    }
    const body = kept.join('\n');
    if (!CPP_MAIN.test(body)) return null;
    return `namespace __pp_case_${index} {\n${body.replace(CPP_MAIN, 'int __pp_case_main()')}\n}\n`;
  });
  if (bodies.some((body) => body === null)) return null;
  const dispatch = sources.map((_, index) => `    case ${index}: return __pp_case_${index}::__pp_case_main();`).join('\n');
  return `${includes.join('\n')}\n${bodies.join('\n')}\nint main(int argc, char **argv) {\n  switch (argc > 1 ? atoi(argv[1]) : -1) {\n${dispatch}\n  }\n  return 99;\n}\n`;
}

function buildPlan(languageId, sources, cpuLimit) {
  const identical = sources.every((source) => source === sources[0]);
  const files = {};
  let compile;
  let runCase;
  if (Number(languageId) === CPP_ID) {
    if (identical) {
      files['main.cpp'] = sources[0];
      runCase = () => `env LD_LIBRARY_PATH=${CPP_LIB} ./a.out`;
    } else {
      const merged = mergeCppSources(sources);
      if (!merged) return null;
      files['main.cpp'] = merged;
      runCase = (index) => `env LD_LIBRARY_PATH=${CPP_LIB} ./a.out ${index}`;
    }
    compile = `${GPP} -std=c++17 main.cpp -o a.out`;
  } else {
    if (sources.some((source) => !/\bclass\s+Main\b/.test(source) || /^\s*package\s/m.test(source))) return null;
    if (identical) {
      files['Main.java'] = sources[0];
      compile = `${JAVAC} Main.java`;
      runCase = () => `${JAVA} Main`;
    } else {
      sources.forEach((source, index) => { files[`c${index}/Main.java`] = `package c${index};\n${source}`; });
      compile = `${JAVAC} ${sources.map((_, index) => `c${index}/Main.java`).join(' ')}`;
      runCase = (index) => `${JAVA} -cp . c${index}.Main`;
    }
  }
  const cpuSeconds = Math.max(1, Math.ceil(cpuLimit));
  const wallSeconds = Math.max(2, Math.ceil(cpuLimit * 2));
  // A non-zero exit stops the batch: later cases go to the single-case path anyway.
  const run = sources.map((_, index) => [
    `s=$(date +%s%N)`,
    `( ulimit -t ${cpuSeconds}; exec timeout -s KILL ${wallSeconds} ${runCase(index)} ) < in_${index}.txt > out_${index}.txt 2> /dev/null`,
    'code=$?',
    `printf '\\n@@PPCASE ${index} %d %d %d@@\\n' "$code" "$(( ($(date +%s%N) - s) / 1000000 ))" "$(stat -c %s out_${index}.txt)"`,
    `cat out_${index}.txt`,
    'if [ "$code" -ne 0 ]; then exit 0; fi',
  ].join('\n')).join('\n');
  files.compile = `${compile}\n`;
  files.run = `${run}\n`;
  return files;
}

// ---------- minimal stored (uncompressed) zip ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function buildStoredZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  const count = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ---------- output parsing ----------

export function parseBatchOutput(stdout) {
  const bytes = Buffer.from(String(stdout || ''), 'utf8');
  const results = new Map();
  const marker = Buffer.from('\n@@PPCASE ');
  let position = bytes.indexOf(marker);
  while (position !== -1) {
    const lineEnd = bytes.indexOf(0x0A, position + 1);
    if (lineEnd === -1) break;
    const header = /^@@PPCASE (\d+) (-?\d+) (\d+) (\d+)@@$/.exec(bytes.subarray(position + 1, lineEnd).toString('utf8'));
    if (!header) break;
    const [, index, code, ms, size] = header.map(Number);
    const outputEnd = lineEnd + 1 + size;
    if (outputEnd > bytes.length) break;
    results.set(index, { exitCode: code, ms, stdout: bytes.subarray(lineEnd + 1, outputEnd).toString('utf8') });
    position = bytes.indexOf(marker, outputEnd);
  }
  return results;
}

// ---------- executor ----------

/**
 * cases: [{ source, stdin }]. accept(index, judgeResult) decides whether a batch
 * result may stand (normally "the checker says AC"). Returns { run(index) } giving
 * a Judge0-shaped result per case.
 */
export function createCaseExecutor({ languageId, cases, judge0Options = {}, accept = () => true }) {
  const decided = new Map();
  const cpuLimit = Number(judge0Options.cpuTimeLimitSeconds) || 2;
  let prepared = null;

  async function runBatch(indexes) {
    const sources = indexes.map((index) => cases[index].source);
    const files = buildPlan(languageId, sources, cpuLimit);
    if (!files) return;
    indexes.forEach((index, position) => { files[`in_${position}.txt`] = String(cases[index].stdin ?? ''); });
    const zip = buildStoredZip(files).toString('base64');
    let result;
    try {
      result = await runJudge0MultiFile(zip, {
        cpuTimeLimitSeconds: 15,
        wallTimeLimitSeconds: 20,
        memoryLimitKb: judge0Options.memoryLimitKb,
        maxFileSizeKb: judge0Options.maxFileSizeKb,
      });
    } catch (error) {
      // Only a refused request is safe to absorb here; the single-case path retries.
      if (error?.status >= 400 && error?.status < 500) return;
      throw error;
    }
    if (![3, 5, 11, 12, 13].includes(Number(result?.status?.id))) return; // compile error etc.
    const parsed = parseBatchOutput(result.stdout);
    for (const [position, entry] of parsed) {
      const index = indexes[position];
      if (index === undefined || entry.exitCode !== 0 || entry.ms > cpuLimit * 1000 * FAST_SHARE_OF_LIMIT) continue;
      const judgeResult = {
        status: { id: 3, description: 'Accepted' },
        stdout: entry.stdout,
        stderr: '',
        compile_output: '',
        message: '',
        time: (entry.ms / 1000).toFixed(3),
        memory: Number(result.memory || 0),
        batched: true,
      };
      if (accept(index, judgeResult)) decided.set(index, judgeResult);
    }
  }

  async function prepare() {
    if (!batchable(languageId, cases.length)) return;
    const bytes = (key) => cases.reduce((sum, testCase) => sum + Buffer.byteLength(String(testCase[key] ?? '')), 0);
    if (bytes('expectedOutput') > MAX_BATCH_OUTPUT_BYTES || bytes('source') + bytes('stdin') > MAX_BATCH_SOURCE_BYTES) return;
    for (let start = 0; start < cases.length; start += MAX_CASES_PER_BATCH) {
      const indexes = cases.slice(start, start + MAX_CASES_PER_BATCH).map((_, offset) => start + offset);
      await runBatch(indexes);
    }
  }

  return {
    async run(index) {
      if (!prepared) prepared = prepare().catch((error) => { console.warn('[BatchExecution] fell back:', error?.message || error); });
      await prepared;
      return decided.get(index) || runJudge0(cases[index].source, languageId, cases[index].stdin, judge0Options);
    },
    batchedCount: () => decided.size,
  };
}
