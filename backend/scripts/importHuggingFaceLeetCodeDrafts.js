import '../src/setup.js';

import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import readline from 'node:readline';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

import CodingTag from '../src/models/CodingTag.js';
import CodingTopic from '../src/models/CodingTopic.js';
import Problem from '../src/models/Problem.js';
import TestCase from '../src/models/TestCase.js';
import User from '../src/models/User.js';
import { syncProblemToLibrary } from '../src/services/questionLibraryService.js';
import { closeDb, connectDb } from '../src/utils/db.js';
import { fetchVerifiedImage } from './lib/hf-content/fetchVerifiedImage.js';
import {
  attachUploadedImages,
  contentPublicationGate,
  normalizeLeetCodeContent,
} from './lib/hf-content/normalizeLeetCodeContent.js';
import {
  analyzeExecutionCandidate,
  buildExecutionArtifacts,
  isRunnerSupportedType,
  REQUIRED_LANGUAGES,
} from './lib/hf-execution/candidateValidation.js';

const PROVIDER = 'leetcode-dataset';
const DATASET_VERSION = 'whiskwhite/leetcode-complete@2026-10-04';
const DATASET_BASE = 'https://huggingface.co/datasets/whiskwhite/leetcode-complete/resolve/main';
const SPLITS = ['train', 'validation', 'test', 'unsolved'];
const MAX_CONTENT_IMAGES = 20;
const MAX_SAMPLE_IMAGES = 10;

const LANGUAGE_ALIASES = Object.freeze({
  python3: 'python', python: 'python', javascript: 'javascript', js: 'javascript',
  java: 'java', cpp: 'cpp', 'c++': 'cpp', c: 'c', typescript: 'typescript', ts: 'typescript',
  mysql: 'sql', postgresql: 'sql', mssql: 'sql', oraclesql: 'sql', sql: 'sql',
});

const registrySchema = new mongoose.Schema({
  provider: { type: String, required: true },
  externalId: { type: String, required: true },
  externalSlug: { type: String, required: true },
  datasetVersion: { type: String, required: true },
  sourceUrl: { type: String, default: '' },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  importedAt: { type: Date, default: Date.now },
  importState: { type: String, default: 'draft-blocked' },
  sourceSplit: { type: String, default: '' },
  premium: { type: Boolean, default: false },
  readiness: { type: mongoose.Schema.Types.Mixed, default: {} },
  librarySyncState: { type: String, default: 'pending' },
  externalAliases: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true, collection: 'question_import_registry', strict: false });
// LeetCode frontend IDs are not globally unique over time. Slug is the
// canonical identity; externalId remains a searchable, non-unique alias.
registrySchema.index({ provider: 1, externalId: 1 });
registrySchema.index({ provider: 1, externalSlug: 1 }, { unique: true });
const ImportRegistry = mongoose.models.QuestionImportRegistry
  || mongoose.model('QuestionImportRegistry', registrySchema);

function parseArgs(argv) {
  const readNumber = (prefix, fallback) => {
    const value = argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    commit: argv.includes('--commit'),
    mirrorImages: argv.includes('--mirror-images'),
    repairImages: argv.includes('--repair-images'),
    includePremium: argv.includes('--include-premium'),
    limit: Math.max(0, readNumber('--limit=', 0)),
    concurrency: Math.min(4, Math.max(1, readNumber('--concurrency=', 2))),
  };
}

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function semanticFingerprint({ description = '', constraints = '', category = '' } = {}) {
  const normalize = (value) => String(value || '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return crypto.createHash('sha256')
    .update(`${normalize(category)}\u0000${normalize(description)}\u0000${normalize(constraints)}`)
    .digest('hex');
}

function slugify(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'item';
}

function mapLanguageEntries(entries, codeField = 'code') {
  const mapped = {};
  const priority = { python: 1, python3: 2 };
  const selectedPriority = {};
  for (const entry of Array.isArray(entries) ? entries : []) {
    const sourceLanguage = String(entry?.lang || '').trim().toLowerCase();
    const language = LANGUAGE_ALIASES[sourceLanguage];
    const code = String(entry?.[codeField] || '').replace(/\r\n/g, '\n').trim();
    if (!language || !code) continue;
    const incomingPriority = priority[sourceLanguage] || 1;
    if (!mapped[language] || incomingPriority >= (selectedPriority[language] || 0)) {
      mapped[language] = code;
      selectedPriority[language] = incomingPriority;
    }
  }
  return mapped;
}

async function loadSplit(split) {
  const response = await fetch(`${DATASET_BASE}/${split}.jsonl`, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Unable to download ${split}: HTTP ${response.status}`);
  const rows = [];
  const lines = readline.createInterface({ input: Readable.fromWeb(response.body), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) rows.push({ ...JSON.parse(line), __split: split });
  }
  return rows;
}

async function loadDataset() {
  const splits = await Promise.all(SPLITS.map(loadSplit));
  const unique = new Map();
  for (const row of splits.flat()) {
    const slug = String(row.title_slug || '').trim().toLowerCase();
    const key = slug || `id:${String(row.frontend_id || row.id || '')}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

async function uniqueSlug(Model, base) {
  let slug = base;
  let suffix = 2;
  while (await Model.exists({ slug })) slug = `${base}-${suffix++}`.slice(0, 120);
  return slug;
}

async function ensureClassifications(names, adminId) {
  const topics = new Map();
  const tags = new Map();
  for (const name of [...names].sort((left, right) => left.localeCompare(right))) {
    const normalizedName = normalizeName(name);
    let topic = await CodingTopic.findOne({ parentId: null, normalizedName });
    if (!topic) {
      topic = await CodingTopic.create({
        name, normalizedName, slug: await uniqueSlug(CodingTopic, slugify(name)), parentId: null,
        ancestorIds: [], depth: 0, legacyTag: name, status: 'active', createdBy: adminId, updatedBy: adminId,
      });
    }
    topics.set(normalizedName, topic);
    let tag = await CodingTag.findOne({ normalizedName });
    if (!tag) {
      tag = await CodingTag.create({
        name, normalizedName, slug: await uniqueSlug(CodingTag, slugify(name)), status: 'active', createdBy: adminId,
      });
    }
    tags.set(normalizedName, tag);
  }
  return { topics, tags };
}

function buildFormats(contract, category) {
  if (category === 'SQL') {
    return {
      inputFormat: 'Use the tables and columns described in the problem statement. The executable SQLite schema must be reviewed before publication.',
      outputFormat: 'Return the requested result set with the exact columns and ordering required by the statement.',
    };
  }
  if (!contract?.methodName) {
    return {
      inputFormat: 'Follow the starter-code API shown in the editor. This draft requires an execution-contract review.',
      outputFormat: 'Return the exact value requested by the problem statement.',
    };
  }
  const parameters = (contract.parameters || []).map((entry) => `- \`${entry.name}\`: ${entry.type || 'type review required'}`);
  return {
    inputFormat: [
      `Implement \`${contract.className || 'Solution'}.${contract.methodName}\` using the supplied function signature.`,
      'PeerPrep passes arguments directly; do not read standard input.',
      ...parameters,
    ].join('\n'),
    outputFormat: contract.outputMode === 'parameter'
      ? `Modify parameter ${(contract.outputParameterIndex || 0) + 1} as required by the statement.`
      : `Return ${contract.returnType || 'the value requested by the statement'}.`,
  };
}

function buildFaqs(contract, category) {
  const method = contract?.methodName ? `\`${contract.methodName}\`` : 'the required API';
  return [
    {
      question: 'Is this question ready to publish?',
      answer: 'No. This imported record is intentionally a private draft until its hidden cases, reference solutions, runtime configuration, and content are reviewed.',
    },
    {
      question: category === 'SQL' ? 'Which SQL dialect is used?' : `Do I need to write a main function for ${method}?`,
      answer: category === 'SQL'
        ? 'PeerPrep uses SQLite. The schema and seed data must be configured and validated before publication.'
        : `No. Complete only ${method}; PeerPrep provides the private invocation harness after the function contract is approved.`,
    },
    {
      question: 'How will submissions be evaluated?',
      answer: 'After review, submissions are checked against visible examples and a separately authored private test suite. This draft does not treat public examples as hidden tests.',
    },
  ];
}

function prepareCandidate(row) {
  const content = normalizeLeetCodeContent(row);
  const snippetMap = mapLanguageEntries(row.code_snippets, 'code');
  const solutionMap = mapLanguageEntries(row.solutions, 'typed_code');
  const isSql = content.category === 'SQL';
  const supportedLanguages = isSql ? ['sql'] : [...REQUIRED_LANGUAGES];
  const codeTemplates = Object.fromEntries(supportedLanguages.map((language) => [language, snippetMap[language] || '']));
  const referenceSolutions = Object.fromEntries(supportedLanguages
    .filter((language) => solutionMap[language])
    .map((language) => [language, solutionMap[language]]));
  const artifacts = isSql
    ? { functionContract: null, executionHarnesses: {} }
    : buildExecutionArtifacts({ codeTemplates });
  const inferredContract = artifacts.functionContract || {
    className: 'Solution', methodName: '', parameters: [], returnType: '', outputMode: 'return', outputParameterIndex: 0,
  };
  const portableContract = Boolean(inferredContract.methodName)
    && (inferredContract.parameters || []).every((parameter) => parameter.name && isRunnerSupportedType(parameter.type))
    && isRunnerSupportedType(inferredContract.returnType, { allowVoid: true });
  // Mongoose requires a non-empty parameter type even for blocked drafts. Keep
  // unsupported/custom APIs explicit without pretending the generic runner can
  // execute them.
  const functionContract = {
    ...inferredContract,
    parameters: (inferredContract.parameters || []).map((parameter) => ({
      ...parameter,
      type: parameter.type || 'custom',
    })),
  };
  const sampleTestCases = content.sampleTestCases
    .filter((entry) => String(entry.input || '').trim() && String(entry.output || '').trim())
    .map((entry, index) => ({ ...entry, position: index + 1, kind: 'sample' }));
  const formats = buildFormats(functionContract, content.category);
  const execution = isSql ? {
    valid: false,
    issues: [{ code: 'SQL_RUNTIME_UNCONFIGURED', message: 'SQLite schema, seed data, and expected result fixtures require review.' }],
    fingerprint: '',
  } : analyzeExecutionCandidate({
    codeTemplates,
    referenceSolutions,
    functionContract,
    sampleTestCases,
    hiddenTestCases: [],
    timeLimitSeconds: 5,
    memoryLimitMb: 256,
  });
  const contentGate = contentPublicationGate(content);
  const blockers = [...new Set([
    ...contentGate.blockers,
    ...execution.issues.map((entry) => entry.code),
    'source-license-unknown',
    ...(row.is_paid_only ? ['premium-source-rights-review'] : []),
    'company-tags-unverified',
  ])];
  return {
    row,
    content,
    codeTemplates,
    referenceSolutions,
    supportedLanguages,
    functionContract,
    executionHarnesses: portableContract ? (artifacts.executionHarnesses || {}) : {},
    sampleTestCases,
    formats,
    faqs: buildFaqs(functionContract, content.category),
    readiness: {
      readyForPublication: false,
      blockers,
      executionFingerprint: execution.fingerprint || '',
      starterLanguagesPresent: supportedLanguages.filter((language) => codeTemplates[language]),
      referenceLanguagesPresent: supportedLanguages.filter((language) => referenceSolutions[language]),
      sampleCount: sampleTestCases.length,
      hiddenCount: 0,
      imageCandidateCount: content.imageCandidates.length,
    },
  };
}

function cloudinaryPublicId(sourceUrl) {
  const digest = crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 32);
  return `peerprep/problem-assets/leetcode-${digest}`;
}

async function mirrorCandidateImages(candidate, cache) {
  if (!candidate.content.imageCandidates.length) return candidate;
  const uploadedBySourceUrl = new Map();
  const failures = [];
  for (const image of candidate.content.imageCandidates) {
    try {
      let uploaded = cache.get(image.sourceUrl);
      if (!uploaded) {
        const verified = await fetchVerifiedImage(image.sourceUrl);
        const result = await cloudinary.uploader.upload(
          `data:${verified.contentType};base64,${verified.data.toString('base64')}`,
          {
            public_id: cloudinaryPublicId(image.sourceUrl), overwrite: true, invalidate: false,
            resource_type: 'image', unique_filename: false, use_filename: false,
          },
        );
        uploaded = {
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width || image.width,
          height: result.height || image.height,
        };
        cache.set(image.sourceUrl, uploaded);
      }
      uploadedBySourceUrl.set(image.sourceUrl, uploaded);
    } catch (error) {
      try {
        // SVGs and a few mislabeled legacy assets are never served directly.
        // Let Cloudinary decode the trusted source and rasterize it to PNG.
        const result = await cloudinary.uploader.upload(image.sourceUrl, {
          public_id: cloudinaryPublicId(image.sourceUrl), overwrite: true, invalidate: false,
          resource_type: 'image', format: 'png', unique_filename: false, use_filename: false,
        });
        const uploaded = {
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width || image.width,
          height: result.height || image.height,
        };
        cache.set(image.sourceUrl, uploaded);
        uploadedBySourceUrl.set(image.sourceUrl, uploaded);
      } catch (fallbackError) {
        failures.push({
          sourceUrl: image.sourceUrl,
          error: String(fallbackError?.message || error?.message || fallbackError || error || 'Unknown image error'),
        });
      }
    }
  }
  const content = attachUploadedImages(candidate.content, uploadedBySourceUrl);
  const mirroredImageCount = (content.imageCandidates || []).filter((image) => image.url).length;
  return {
    ...candidate,
    content,
    readiness: {
      ...candidate.readiness,
      mirroredImageCount,
      imageFailures: failures,
      blockers: failures.length
        ? [...new Set([...candidate.readiness.blockers, 'image-upload-incomplete'])]
        : candidate.readiness.blockers.filter((entry) => entry !== 'images-not-mirrored'),
    },
  };
}

function plainProblemImages(images) {
  return (images || []).slice(0, MAX_CONTENT_IMAGES).map((image) => ({
    url: image.url, publicId: image.publicId || '', sourceUrl: image.sourceUrl || '', alt: image.alt || '',
    caption: image.caption || '', width: image.width, height: image.height,
    section: image.section === 'constraints' ? 'constraints' : 'description', position: Number(image.position || 0),
  }));
}

function plainSampleImages(images) {
  return (images || []).slice(0, MAX_SAMPLE_IMAGES).map((image) => ({
    url: image.url, publicId: image.publicId || '', sourceUrl: image.sourceUrl || '', alt: image.alt || '',
    caption: image.caption || '', width: image.width, height: image.height, position: Number(image.position || 0),
  }));
}

async function persistCandidate(candidate, context) {
  const { adminId, classifications, displayOrder, session } = context;
  const externalId = candidate.content.externalId;
  const externalSlug = candidate.content.slug;
  const existingRegistry = await ImportRegistry.findOne({ provider: PROVIDER, externalSlug }).session(session);
  if (existingRegistry) return { state: 'existing', problemId: existingRegistry.problemId };

  const titleRegex = new RegExp(`^${candidate.content.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const conflict = await Problem.findOne({ title: titleRegex }).select('_id title').session(session).lean();
  if (conflict) return { state: 'title-conflict', problemId: conflict._id };

  const tags = candidate.content.tags;
  const problem = new Problem({
    title: candidate.content.title,
    displayOrder,
    description: candidate.content.description,
    contentImages: plainProblemImages(candidate.content.contentImages),
    difficulty: candidate.content.difficulty || 'Easy',
    tags,
    topicIds: tags.map((name) => classifications.topics.get(normalizeName(name))?._id).filter(Boolean),
    topicAncestorIds: [],
    codingTagIds: tags.map((name) => classifications.tags.get(normalizeName(name))?._id).filter(Boolean),
    companyTags: [],
    supportedLanguages: candidate.supportedLanguages,
    codeTemplates: new Map(Object.entries(candidate.codeTemplates)),
    executionMode: candidate.content.category === 'SQL' ? 'full_program' : 'function',
    functionContract: candidate.functionContract,
    showExecutionHarness: false,
    executionHarnesses: new Map(Object.entries(candidate.executionHarnesses)),
    referenceSolutions: new Map(Object.entries(candidate.referenceSolutions)),
    validatedLanguages: [],
    ...candidate.formats,
    constraints: candidate.content.constraints,
    category: candidate.content.category,
    sqlConfig: { dialect: 'sqlite', schemaSql: '', seedDataSql: '' },
    editorial: '',
    hints: [],
    faqs: candidate.faqs,
    timeLimitSeconds: 5,
    memoryLimitMb: 256,
    totalMarks: 1,
    status: 'draft',
    visibility: 'private',
    previewValidated: false,
    previewTested: false,
    hiddenTestSource: { provider: 'none', inputObjectKey: '', outputObjectKey: '', delimiter: '###CASE###', caseCount: 0 },
    createdBy: adminId,
    updatedBy: adminId,
  });
  await problem.save({ session });

  if (candidate.sampleTestCases.length) {
    await TestCase.insertMany(candidate.sampleTestCases.map((testCase, index) => ({
      problem: problem._id,
      kind: 'sample',
      position: index + 1,
      input: testCase.input,
      output: testCase.output,
      explanation: testCase.explanation || '',
      images: plainSampleImages(candidate.content.sampleTestCases[index]?.images),
      marks: 1,
      createdBy: adminId,
    })), { session });
  }

  await ImportRegistry.create([{
    provider: PROVIDER,
    externalId,
    externalSlug,
    datasetVersion: DATASET_VERSION,
    sourceUrl: candidate.content.sourceUrl || `https://leetcode.com/problems/${externalSlug}/`,
    problemId: problem._id,
    importedAt: new Date(),
    importState: 'draft-blocked',
    sourceSplit: candidate.row.__split,
    premium: Boolean(candidate.row.is_paid_only),
    readiness: candidate.readiness,
    librarySyncState: 'pending',
  }], { session });

  return { state: 'created', problemId: problem._id };
}

async function persistImageRepair(candidate, registryRow, session) {
  const problem = await Problem.findById(registryRow.problemId).session(session);
  if (!problem) throw new Error('Registered PeerPrep problem is missing.');
  problem.contentImages = plainProblemImages(candidate.content.contentImages);
  await problem.save({ session });
  const samples = await TestCase.find({ problem: problem._id, kind: 'sample' }).sort({ position: 1 }).session(session);
  for (const sample of samples) {
    const sourceSample = candidate.content.sampleTestCases.find((entry) => Number(entry.position) === Number(sample.position));
    sample.images = plainSampleImages(sourceSample?.images);
    await sample.save({ session });
  }
  await ImportRegistry.updateOne(
    { _id: registryRow._id },
    { $set: { readiness: candidate.readiness, librarySyncState: 'pending' } },
    { session },
  );
  return { state: 'repaired', problemId: problem._id };
}

async function mapConcurrent(items, concurrency, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }));
}

async function assertRegistrySlugUniqueness() {
  const duplicates = await mongoose.connection.collection('question_import_registry').aggregate([
    { $match: { provider: PROVIDER, externalSlug: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$externalSlug', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 },
  ]).toArray();
  if (duplicates.length) throw new Error(`Registry has duplicate LeetCode slugs: ${duplicates.map((entry) => entry._id).join(', ')}`);
  const registry = mongoose.connection.collection('question_import_registry');
  const externalIdIndex = (await registry.indexes()).find((entry) => (
    entry.key?.provider === 1 && entry.key?.externalId === 1
  ));
  if (externalIdIndex?.unique) await registry.dropIndex(externalIdIndex.name);
  await registry.createIndex(
    { provider: 1, externalId: 1 },
    { name: 'provider_1_externalId_1' },
  );
  await registry.createIndex(
    { provider: 1, externalSlug: 1 },
    { unique: true, name: 'provider_1_externalSlug_1' },
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.commit && (!process.env.MONGODB_URI || String(process.env.MONGODB_URI).toLowerCase() === 'memory')) {
    throw new Error('A persistent MONGODB_URI is required for --commit.');
  }
  if (options.commit && options.mirrorImages
    && (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)) {
    throw new Error('Cloudinary credentials are required for --mirror-images.');
  }

  const rows = await loadDataset();
  await connectDb();
  const [problems, registryRows] = await Promise.all([
    Problem.find({}).select('_id title displayOrder description constraints category').lean(),
    mongoose.connection.collection('question_import_registry').find({ provider: PROVIDER })
      .project({ externalId: 1, externalSlug: 1, problemId: 1, datasetVersion: 1, readiness: 1 }).toArray(),
  ]);
  const knownTitles = new Set(problems.map((problem) => normalizeTitle(problem.title)));
  const knownSlugs = new Set(registryRows.map((entry) => String(entry.externalSlug || '').toLowerCase()));
  const registryByProblem = new Map(registryRows.map((entry) => [String(entry.problemId), entry]));
  const problemByFingerprint = new Map(problems.map((problem) => [semanticFingerprint(problem), problem]));
  const preparedRows = rows.map((row) => ({ row, content: normalizeLeetCodeContent(row) }));
  const aliasRows = preparedRows.flatMap(({ row, content }) => {
    if (knownSlugs.has(content.slug) || knownTitles.has(normalizeTitle(content.title))) return [];
    const problem = problemByFingerprint.get(semanticFingerprint(content));
    const registry = problem ? registryByProblem.get(String(problem._id)) : null;
    return registry ? [{ row, content, problem, registry }] : [];
  });
  const aliasSlugs = new Set(aliasRows.map((entry) => entry.content.slug));
  let missingRows = preparedRows.filter(({ content }) => (
    !knownSlugs.has(content.slug)
    && !knownTitles.has(normalizeTitle(content.title))
    && !aliasSlugs.has(content.slug)
  )).map((entry) => entry.row);
  if (!options.includePremium) missingRows = missingRows.filter((row) => !row.is_paid_only);
  const registryBySlug = new Map(registryRows.map((entry) => [String(entry.externalSlug || '').toLowerCase(), entry]));
  if (options.repairImages) {
    missingRows = rows.filter((row) => {
      const registry = registryBySlug.get(String(row.title_slug || '').toLowerCase());
      return registry?.datasetVersion === DATASET_VERSION
        && Number(registry?.readiness?.imageCandidateCount || 0) > 0
        && Number(registry?.readiness?.mirroredImageCount || 0) < Number(registry?.readiness?.imageCandidateCount || 0);
    });
    options.mirrorImages = true;
  }
  missingRows.sort((left, right) => Number(left.frontend_id || Infinity) - Number(right.frontend_id || Infinity)
    || String(left.title || '').localeCompare(String(right.title || '')));
  if (options.limit) missingRows = missingRows.slice(0, options.limit);

  const candidates = missingRows.map(prepareCandidate);
  const survey = {
    mode: options.repairImages ? (options.commit ? 'repair-images' : 'repair-images-dry-run') : (options.commit ? 'commit' : 'dry-run'),
    datasetRows: rows.length,
    existingProblems: problems.length,
    selectedMissingDrafts: candidates.length,
    semanticAliases: aliasRows.length,
    algorithms: candidates.filter((entry) => entry.content.category === 'DSA').length,
    sql: candidates.filter((entry) => entry.content.category === 'SQL').length,
    premium: candidates.filter((entry) => entry.row.is_paid_only).length,
    withAllSixStarters: candidates.filter((entry) => entry.content.category === 'DSA'
      && REQUIRED_LANGUAGES.every((language) => entry.codeTemplates[language])).length,
    withImages: candidates.filter((entry) => entry.content.imageCandidates.length).length,
    readyForPublication: 0,
    invariant: 'Every created record is draft/private/unvalidated; public samples are never inserted as hidden tests.',
  };
  console.log(JSON.stringify(survey, null, 2));
  if (!options.commit || (!candidates.length && !aliasRows.length)) return;

  await assertRegistrySlugUniqueness();
  for (const alias of aliasRows) {
    await ImportRegistry.updateOne({ _id: alias.registry._id }, { $addToSet: { externalAliases: {
      externalId: String(alias.content.externalId || ''),
      externalSlug: alias.content.slug,
      title: alias.content.title,
      sourceUrl: alias.content.sourceUrl,
      semanticFingerprint: semanticFingerprint(alias.content),
    } } });
  }
  if (options.mirrorImages) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const admin = (adminEmail && await User.findOne({ role: 'admin', email: adminEmail })) || await User.findOne({ role: 'admin' });
  if (!admin) throw new Error('No admin account exists.');
  const classifications = await ensureClassifications(new Set(candidates.flatMap((entry) => entry.content.tags)), admin._id);
  const maxDisplayOrder = Math.max(0, ...problems.map((problem) => Number(problem.displayOrder || 0)).filter(Number.isFinite));
  const imageCache = new Map();
  const counts = { created: 0, repaired: 0, existing: 0, 'title-conflict': 0, failed: 0, libraryPending: 0 };
  const failures = [];
  let processed = 0;

  await mapConcurrent(candidates, options.concurrency, async (baseCandidate, index) => {
    let candidate = baseCandidate;
    try {
      if (options.mirrorImages) candidate = await mirrorCandidateImages(candidate, imageCache);
      const session = await mongoose.startSession();
      let result;
      try {
        await session.withTransaction(async () => {
          result = options.repairImages
            ? await persistImageRepair(candidate, registryBySlug.get(candidate.content.slug), session)
            : await persistCandidate(candidate, {
              adminId: admin._id,
              classifications,
              displayOrder: maxDisplayOrder + index + 1,
              session,
            });
        });
      } finally {
        await session.endSession();
      }
      counts[result.state] += 1;
      if (result.state === 'created' || result.state === 'existing' || result.state === 'repaired') {
        try {
          const problem = await Problem.findById(result.problemId).select('+executionHarnesses').lean();
          if (problem) await syncProblemToLibrary(problem);
          await ImportRegistry.updateOne({ provider: PROVIDER, problemId: result.problemId }, { $set: { librarySyncState: 'synced' } });
        } catch (error) {
          counts.libraryPending += 1;
          failures.push({ slug: candidate.content.slug, stage: 'library-sync', error: error.message });
        }
      }
    } catch (error) {
      counts.failed += 1;
      failures.push({ slug: candidate.content.slug, stage: 'persist', error: error.message });
      console.error(`[draft-import:failed] ${candidate.content.slug}: ${error.message}`);
    } finally {
      processed += 1;
      if (processed % 25 === 0 || processed === candidates.length) {
        console.log(`[draft-import] ${processed}/${candidates.length} ${JSON.stringify(counts)}`);
      }
    }
  });

  console.log(JSON.stringify({ complete: counts.failed === 0, counts, firstFailures: failures.slice(0, 30) }, null, 2));
  if (counts.failed) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(`[HF LeetCode draft import] ${error.stack || error.message}`);
    process.exitCode = 1;
  })
  .finally(closeDb);
