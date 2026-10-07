import '../src/setup.js';

import { Readable } from 'node:stream';
import readline from 'node:readline';
import mongoose from 'mongoose';

import Problem from '../src/models/Problem.js';
import TestCase from '../src/models/TestCase.js';
import { closeDb, connectDb } from '../src/utils/db.js';
import { analyzeExternalCoverage } from './lib/external-source-coverage.js';

const SOURCES = Object.freeze({
  doocs: {
    dataset: 'olegshulyakov/doocs-leetcode-solutions', revision: 'main', license: 'CC-BY-SA-4.0',
    homepage: 'https://huggingface.co/datasets/olegshulyakov/doocs-leetcode-solutions',
  },
  neulab: {
    dataset: 'neulab/leetcode', revision: 'main', license: 'Apache-2.0',
    homepage: 'https://huggingface.co/datasets/neulab/leetcode',
  },
});

function parseArgs(argv) {
  const get = (name, fallback) => argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  return {
    pageConcurrency: Math.max(1, Math.min(8, Number(get('page-concurrency', 2)))),
    sampleLimit: Math.max(0, Number(get('sample-limit', 20))),
  };
}

async function fetchJson(url, attempt = 0) {
  const response = await fetch(url, { headers: { 'user-agent': 'PeerPrep-read-only-coverage-audit/1.0' } });
  if (response.ok) return response.json();
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(30_000, 750 * (2 ** attempt));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return fetchJson(url, attempt + 1);
  }
  throw new Error(`HTTP ${response.status} fetching ${url}`);
}

async function fetchDoocsRows(concurrency) {
  const base = new URL('https://datasets-server.huggingface.co/rows');
  base.searchParams.set('dataset', SOURCES.doocs.dataset);
  base.searchParams.set('config', 'default');
  base.searchParams.set('split', 'train');
  base.searchParams.set('offset', '0');
  base.searchParams.set('length', '100');
  const first = await fetchJson(base);
  const total = Number(first.num_rows_total || first.rows?.length || 0);
  const offsets = [];
  for (let offset = 100; offset < total; offset += 100) offsets.push(offset);
  const rows = [...(first.rows || [])];
  let cursor = 0;
  async function worker() {
    while (cursor < offsets.length) {
      const index = cursor;
      cursor += 1;
      const url = new URL(base);
      url.searchParams.set('offset', String(offsets[index]));
      const page = await fetchJson(url);
      rows.push(...(page.rows || []));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, offsets.length) }, worker));
  return rows;
}

async function fetchJsonLines(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'PeerPrep-read-only-coverage-audit/1.0' } });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} fetching ${url}`);
  const rows = [];
  const lines = readline.createInterface({ input: Readable.fromWeb(response.body), crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) rows.push(JSON.parse(line));
  return rows;
}

async function fetchNeulabRows(revision) {
  const base = `https://huggingface.co/datasets/${SOURCES.neulab.dataset}/resolve/${revision}/data`;
  const files = [
    'test/python-000.jsonl',
    'train/python-000.jsonl', 'train/python-001.jsonl',
    'train/python-002.jsonl', 'train/python-003.jsonl',
  ];
  return (await Promise.all(files.map((file) => fetchJsonLines(`${base}/${file}`)))).flat();
}

async function fetchSourceMetadata(source) {
  const metadata = await fetchJson(`https://huggingface.co/api/datasets/${source.dataset}`);
  return {
    resolvedRevision: String(metadata.sha || ''),
    lastModified: String(metadata.lastModified || ''),
    apiLicense: String(metadata.cardData?.license || ''),
  };
}

async function loadRegistryRows() {
  const exists = await mongoose.connection.db.listCollections({ name: 'question_import_registry' }).hasNext();
  if (!exists) return [];
  return mongoose.connection.db.collection('question_import_registry')
    .find({ provider: 'leetcode-dataset' })
    .project({ problemId: 1, externalSlug: 1, externalAliases: 1 })
    .toArray();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [doocsBefore, neulabBefore] = await Promise.all([
    fetchSourceMetadata(SOURCES.doocs), fetchSourceMetadata(SOURCES.neulab),
  ]);
  const [doocsRows, neulabRows] = await Promise.all([
    fetchDoocsRows(options.pageConcurrency), fetchNeulabRows(neulabBefore.resolvedRevision),
  ]);
  const [doocsAfter, neulabAfter] = await Promise.all([
    fetchSourceMetadata(SOURCES.doocs), fetchSourceMetadata(SOURCES.neulab),
  ]);
  if (doocsBefore.resolvedRevision !== doocsAfter.resolvedRevision
    || neulabBefore.resolvedRevision !== neulabAfter.resolvedRevision) {
    throw new Error('A source dataset revision changed during the audit; refusing mixed-revision output.');
  }
  await connectDb();
  const [problems, testCases, registryRows] = await Promise.all([
    Problem.find({}).select('_id title category status referenceSolutions').lean(),
    TestCase.find({}).select('problem kind').lean(),
    loadRegistryRows(),
  ]);
  const report = analyzeExternalCoverage({ problems, testCases, registryRows, doocsRows, neulabRows });
  const trim = (rows) => options.sampleLimit ? rows.slice(0, options.sampleLimit) : [];
  console.log(JSON.stringify({
    analyzedAt: new Date().toISOString(),
    invariant: 'Read-only audit. No PeerPrep, registry, testcase, validation, or source record was modified.',
    identityPolicy: 'Registry slug first, then exact normalized title/title-derived slug. Numeric external IDs are never used.',
    sources: {
      doocs: { ...SOURCES.doocs, ...doocsAfter },
      neulab: { ...SOURCES.neulab, ...neulabAfter },
    },
    sourceRows: { doocs: doocsRows.length, neulabPython: neulabRows.length },
    ...report,
    detail: {
      referenceBlockersSample: trim(report.detail.referenceBlockers),
      testBlockersSample: trim(report.detail.testBlockers),
      omittedReferenceBlockers: Math.max(0, report.detail.referenceBlockers.length - options.sampleLimit),
      omittedTestBlockers: Math.max(0, report.detail.testBlockers.length - options.sampleLimit),
    },
    importGate: {
      automaticMutationAllowed: false,
      doocsRequirements: [
        'preserve source URL, source row identity, CC-BY-SA-4.0 license and attribution',
        'adapt source code to the exact PeerPrep function contract',
        'Judge0-validate every proposed language against PeerPrep sample and hidden tests',
        'reject truncated, conflicting, or ambiguous source rows',
      ],
      neulabRequirements: [
        'preserve source URL, task_id, Apache-2.0 license and metadata provenance',
        'parse Python assert cases into typed PeerPrep inputs/outputs; never execute source while auditing',
        'respect comparison mode (exact, unordered, float)',
        'validate converted cases against accepted references before storing',
      ],
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
}).finally(closeDb);
