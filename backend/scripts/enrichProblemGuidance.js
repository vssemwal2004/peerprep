import '../src/setup.js';

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { parse } from 'csv-parse/sync';

import Problem from '../src/models/Problem.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import { closeDb, connectDb } from '../src/utils/db.js';

const BATCH_SIZE = 150;
const MAX_COMPANY_TAGS = 20;

function parseArgs(argv) {
  const sourceArgs = argv.filter((arg) => arg.startsWith('--company-data-dir='));
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  return {
    apply: argv.includes('--apply'),
    replaceGenerated: argv.includes('--replace-generated'),
    companyDataDirs: sourceArgs.map((arg) => path.resolve(arg.slice('--company-data-dir='.length))),
    limit: limitArg ? Math.max(1, Number(limitArg.slice('--limit='.length)) || 1) : 0,
  };
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugFromLink(value) {
  return String(value || '').match(/\/problems\/([^/?#]+)/i)?.[1]?.toLowerCase() || '';
}

function mapValue(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function walkCsvFiles(directory) {
  if (!directory || !fs.existsSync(directory)) return [];
  const files = [];
  const visit = (current) => {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      if (entry.name === '.git') return;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) files.push(target);
    });
  };
  visit(directory);
  return files;
}

function parseFrequency(value) {
  const numeric = Number.parseFloat(String(value || '').replace('%', ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

const COMPANY_NAME_OVERRIDES = new Map(Object.entries({
  '1kosmos': '1Kosmos',
  '6sense': '6sense',
  'adp': 'ADP',
  'att': 'AT&T',
  'bcg': 'BCG',
  'bnp-paribas': 'BNP Paribas',
  'bp': 'BP',
  'bt-group': 'BT Group',
  'bytedance': 'ByteDance',
  'c3-ai': 'C3 AI',
  'clevertap': 'CleverTap',
  'coindcx': 'CoinDCX',
  'de-shaw': 'DE Shaw',
  'dji': 'DJI',
  'docusign': 'DocuSign',
  'doordash': 'DoorDash',
  'dtcc': 'DTCC',
  'ebay': 'eBay',
  'f5-networks': 'F5 Networks',
  'fico': 'FICO',
  'github': 'GitHub',
  'gojek': 'Gojek',
  'gopuff': 'Gopuff',
  'hrt': 'HRT',
  'htc': 'HTC',
  'ibm': 'IBM',
  'imc': 'IMC',
  'jpmorgan': 'JPMorgan',
  'lti': 'LTI',
  'linkedin': 'LinkedIn',
  'mcdonalds': "McDonald's",
  'medianet': 'Media.net',
  'netapp': 'NetApp',
  'nvidia': 'NVIDIA',
  'openai': 'OpenAI',
  'opentext': 'OpenText',
  'paypal': 'PayPal',
  'paytm': 'Paytm',
  'phonepe': 'PhonePe',
  'redbus': 'redBus',
  'servicenow': 'ServiceNow',
  'singlestore': 'SingleStore',
  'spacex': 'SpaceX',
  'sumologic': 'Sumo Logic',
  'tcs': 'TCS',
  'tiktok': 'TikTok',
  'tripadvisor': 'Tripadvisor',
  'twitter': 'Twitter',
  'udemy': 'Udemy',
  'walmart-labs': 'Walmart Labs',
  'zs-associates': 'ZS Associates',
}));

function formatCompanyName(value) {
  const raw = String(value || '').trim();
  const lookup = raw.toLowerCase().replace(/\s+/g, '-');
  if (COMPANY_NAME_OVERRIDES.has(lookup)) return COMPANY_NAME_OVERRIDES.get(lookup);
  if (raw !== raw.toLowerCase()) return raw.replaceAll('-', ' ');
  return raw
    .replaceAll('-', ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function addCompanyMatch(index, key, company, frequency) {
  if (!key || !company) return;
  if (!index.has(key)) index.set(key, new Map());
  const companies = index.get(key);
  const companyKey = normalizeTitle(company);
  if (!companyKey) return;
  const existing = companies.get(companyKey);
  const incomingName = formatCompanyName(company);
  const preferIncomingName = !existing || (
    existing.name === existing.name.toLowerCase()
    && incomingName !== incomingName.toLowerCase()
  );
  companies.set(companyKey, {
    name: preferIncomingName ? incomingName : existing.name,
    frequency: Math.max(Number(existing?.frequency || 0), frequency),
  });
}

function loadCompanyIndex(directories) {
  const bySlug = new Map();
  const byTitle = new Map();
  let csvFileCount = 0;
  let rowsRead = 0;

  directories.forEach((directory) => {
    const csvFiles = walkCsvFiles(directory);
    csvFileCount += csvFiles.length;
    csvFiles.forEach((file) => {
      const relative = path.relative(directory, file);
      const company = relative.split(path.sep)[0]?.trim();
      if (!company) return;
      const rows = parse(fs.readFileSync(file, 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_quotes: true,
        relax_column_count: true,
      });
      rows.forEach((row) => {
        const title = String(row.Title || row.title || row.Question || '').trim();
        const slug = slugFromLink(row.Link || row.link || row.URL || row.url);
        const frequency = parseFrequency(row.Frequency || row.frequency);
        addCompanyMatch(bySlug, slug, company, frequency);
        addCompanyMatch(byTitle, normalizeTitle(title), company, frequency);
        rowsRead += 1;
      });
    });
  });

  return { bySlug, byTitle, csvFiles: csvFileCount, rowsRead };
}

function parseFunctionContract(problem) {
  const templates = mapValue(problem.codeTemplates);
  const python = String(templates.python || '');
  const pythonMatch = python.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^\n]*)\)/m);
  if (pythonMatch) {
    const parameters = pythonMatch[2]
      .split(',')
      .map((entry) => entry.trim().replace(/\s*=.*$/, '').split(':')[0].trim())
      .filter((name) => name && name !== 'self');
    return { method: pythonMatch[1], parameters };
  }

  const source = Object.values(templates).map(String).find(Boolean) || '';
  const genericMatch = source.match(/\b([A-Za-z_]\w*)\s*\(([^()]*)\)\s*(?:\{|=>|:)/m);
  return {
    method: genericMatch?.[1] || 'the required function',
    parameters: genericMatch?.[2]
      ? genericMatch[2].split(',').map((entry) => entry.trim().split(/\s+/).pop()).filter(Boolean)
      : [],
  };
}

function readableList(values) {
  const cleaned = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  if (!cleaned.length) return 'the problem constraints';
  if (cleaned.length === 1) return cleaned[0];
  return `${cleaned.slice(0, -1).join(', ')} and ${cleaned.at(-1)}`;
}

function deriveEdgeCases(problem, contract) {
  const tags = new Set((problem.tags || []).map((tag) => String(tag).toLowerCase()));
  const cases = [];
  if ([...tags].some((tag) => tag.includes('array') || tag.includes('matrix'))) cases.push('minimum-size inputs, repeated values, already ordered data and boundary indices');
  if ([...tags].some((tag) => tag.includes('string'))) cases.push('empty or single-character strings and repeated characters');
  if ([...tags].some((tag) => tag.includes('tree'))) cases.push('an empty tree, a single node and highly skewed trees');
  if ([...tags].some((tag) => tag.includes('graph') || tag.includes('union find'))) cases.push('disconnected components, cycles and isolated vertices');
  if ([...tags].some((tag) => tag.includes('linked list'))) cases.push('an empty list, one node and pointer changes at the head or tail');
  if ([...tags].some((tag) => tag.includes('binary search'))) cases.push('answers at both search boundaries and duplicate values');
  if ([...tags].some((tag) => tag.includes('dynamic programming'))) cases.push('base states and the smallest dimensions allowed by the constraints');
  if (!cases.length) cases.push('the smallest valid input, boundary values and repeated values where allowed');
  if (contract.parameters.length > 1) cases.push(`interactions between ${readableList(contract.parameters.slice(0, 4))}`);
  return [...new Set(cases)].slice(0, 3).join('; ');
}

function buildHints(problem, contract) {
  const topics = (problem.tags || []).map(String).filter(Boolean).slice(0, 4);
  const constraints = String(problem.constraints || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const boundary = constraints.find((line) => /<=|≥|maximum|length|size/i.test(line));
  const parameterText = contract.parameters.length ? readableList(contract.parameters.slice(0, 4)) : 'the supplied inputs';
  return [
    `Start by restating what ${contract.method} must return for ${parameterText}. Work through the smallest valid example before choosing a data structure.`,
    topics.length
      ? `The relevant techniques are ${readableList(topics)}. Identify the invariant or reusable state that lets you avoid recomputing the same information.`
      : 'Identify repeated work in the direct simulation and store or update only the information needed for the next decision.',
    boundary
      ? `Use the constraint “${boundary}” to set the target complexity, then test boundary positions, duplicates and minimum-size inputs.`
      : 'Choose a complexity that scales with the input size, and verify boundary positions, duplicates and minimum-size inputs.',
  ];
}

function compactFormat(value, fallback) {
  const normalized = String(value || '').replace(/\r\n/g, '\n').trim();
  return (normalized || fallback).slice(0, 2800);
}

function buildFaqs(problem, contract) {
  const methodLabel = contract.method === 'the required function' ? 'my solution' : contract.method;
  const edgeCases = deriveEdgeCases(problem, contract);
  const isFullProgram = problem.executionMode === 'full_program';
  return [
    {
      question: `What should ${methodLabel} produce?`,
      answer: compactFormat(problem.outputFormat, 'Return exactly the value requested by the problem statement without additional diagnostic output.'),
    },
    {
      question: isFullProgram ? 'How should input and output be handled?' : `Do I need to write a main function for ${methodLabel}?`,
      answer: isFullProgram
        ? compactFormat(problem.inputFormat, 'Read the provided input, compute the requested result, and print only the required output.')
        : `No. Complete only the provided function or class method. PeerPrep supplies testcase arguments and invokes ${methodLabel} using the configured execution runner.`,
    },
    {
      question: 'Which edge cases should I validate before submitting?',
      answer: `Check ${edgeCases}. Also respect every numeric and structural limit listed in the constraints.`,
    },
    {
      question: 'How is the submission evaluated?',
      answer: 'Your code is compiled or interpreted in the selected language and checked against visible examples plus private validation cases. Returned output must match the expected result exactly.',
    },
  ];
}

function rankedCompanies(matches) {
  if (!matches) return [];
  return [...matches.values()]
    .sort((left, right) => right.frequency - left.frequency || left.name.localeCompare(right.name))
    .slice(0, MAX_COMPANY_TAGS)
    .map(({ name }) => name);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.companyDataDirs.forEach((directory) => {
    if (!fs.existsSync(directory)) throw new Error(`Company data directory not found: ${directory}`);
  });

  const companyIndex = loadCompanyIndex(options.companyDataDirs);
  await connectDb();
  const registryRows = await mongoose.connection.collection('question_import_registry')
    .find({ problemId: { $exists: true } })
    .project({ problemId: 1, externalSlug: 1 })
    .toArray();
  const slugByProblemId = new Map(registryRows.map((row) => [String(row.problemId), String(row.externalSlug || '').toLowerCase()]));
  const query = {};
  const cursor = Problem.find(query)
    .select('_id title description tags companyTags hints faqs constraints inputFormat outputFormat codeTemplates executionMode')
    .lean()
    .cursor();
  const stats = {
    scanned: 0,
    hintsAdded: 0,
    faqsAdded: 0,
    companyTagsAdded: 0,
    companyMatchedProblems: 0,
    unmatchedCompanies: 0,
    csvFiles: companyIndex.csvFiles,
    companyRowsRead: companyIndex.rowsRead,
    applied: options.apply,
    unmatchedCompanySamples: [],
  };
  let problemOps = [];
  let libraryOps = [];

  const flush = async () => {
    if (!problemOps.length || !options.apply) {
      problemOps = [];
      libraryOps = [];
      return;
    }
    await Problem.bulkWrite(problemOps, { ordered: false });
    await QuestionLibrary.bulkWrite(libraryOps, { ordered: false });
    problemOps = [];
    libraryOps = [];
  };

  for await (const problem of cursor) {
    if (options.limit && stats.scanned >= options.limit) break;
    stats.scanned += 1;
    const contract = parseFunctionContract(problem);
    const existingHints = Array.isArray(problem.hints) ? problem.hints.filter((value) => String(value || '').trim()) : [];
    const existingFaqs = Array.isArray(problem.faqs) ? problem.faqs.filter((faq) => faq?.question && faq?.answer) : [];
    const hints = existingHints.length && !options.replaceGenerated ? existingHints : buildHints(problem, contract);
    const faqs = existingFaqs.length && !options.replaceGenerated ? existingFaqs : buildFaqs(problem, contract);
    const slug = slugByProblemId.get(String(problem._id));
    const companyMatches = companyIndex.bySlug.get(slug) || companyIndex.byTitle.get(normalizeTitle(problem.title));
    const verifiedCompanies = rankedCompanies(companyMatches);
    const existingCompanies = Array.isArray(problem.companyTags) ? problem.companyTags.filter(Boolean) : [];
    const companyTags = verifiedCompanies.length ? verifiedCompanies : existingCompanies;

    if (!existingHints.length) stats.hintsAdded += hints.length;
    if (!existingFaqs.length) stats.faqsAdded += faqs.length;
    if (verifiedCompanies.length) {
      stats.companyMatchedProblems += 1;
      stats.companyTagsAdded += verifiedCompanies.length;
    } else {
      stats.unmatchedCompanies += 1;
      if (stats.unmatchedCompanySamples.length < 15) {
        stats.unmatchedCompanySamples.push({ title: problem.title, slug: slug || '' });
      }
    }

    const set = { hints, faqs, companyTags };
    problemOps.push({ updateOne: { filter: { _id: problem._id }, update: { $set: set } } });
    libraryOps.push({ updateOne: { filter: { sourceType: 'compiler', sourceProblemId: problem._id }, update: { $set: {
      keywords: companyTags,
      'questionData.keywords': companyTags,
      'questionData.problemDataSnapshot.companyTags': companyTags,
      'questionData.problemDataSnapshot.hints': hints,
      'questionData.problemDataSnapshot.faqs': faqs,
    } } } });
    if (problemOps.length >= BATCH_SIZE) await flush();
  }
  await flush();
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
