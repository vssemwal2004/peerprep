import dotenv from 'dotenv';
import mongoose from 'mongoose';

const REQUIRED = ['python', 'cpp', 'c', 'java', 'javascript', 'typescript'];

function values(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (Array.isArray(value)) return Object.fromEntries(value.map((entry) => [entry?.lang, entry?.code]));
  return value;
}

function nonempty(value) { return Boolean(String(value ?? '').trim()); }

function contentIssues(problem) {
  const issues = [];
  for (const field of ['description', 'inputFormat', 'outputFormat', 'constraints']) {
    if (!nonempty(problem[field])) issues.push(`${field}-missing`);
  }
  if (String(problem.description || '').trim().length < 80) issues.push('description-too-short');
  if (!nonempty(problem.editorial)) issues.push('editorial-missing');

  const content = [problem.description, problem.inputFormat, problem.outputFormat, problem.constraints]
    .map((part) => String(part || '')).join('\n');
  if (/(?:^|\n)\s*(?:-?\d+|[,()[\]{}])\s*(?=\n){4,}/m.test(content)) issues.push('possible-vertical-token-layout');
  if (/(?:\n\s*){4,}/.test(content)) issues.push('excessive-blank-lines');
  if (/&(?:lt|gt|amp);|<\/?(?:html|body)[^>]*>/i.test(content)) issues.push('raw-or-escaped-html');
  if (/\|\s*\n\s*\|/.test(content)) issues.push('possible-broken-table');
  return issues;
}

async function audit(label, uri) {
  if (!uri) throw new Error(`${label} MONGODB_URI is missing`);
  const connection = await mongoose.createConnection(uri, { autoIndex: false, serverSelectionTimeoutMS: 15000 }).asPromise();
  try {
    const db = connection.db;
    const statuses = await db.collection('problems').aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray();
    const drafts = await db.collection('problems').find({ status: 'draft' }).sort({ displayOrder: 1, title: 1 }).toArray();
    const ids = drafts.map((problem) => problem._id);
    const [caseGroups, libraries, registries] = await Promise.all([
      db.collection('testcases').aggregate([
        { $match: { problem: { $in: ids } } },
        { $group: { _id: { problem: '$problem', kind: '$kind' }, count: { $sum: 1 } } },
      ]).toArray(),
      db.collection('questionlibraries').find({ sourceProblemId: { $in: ids } })
        .project({ sourceProblemId: 1, status: 1, visibility: 1, title: 1, displayOrder: 1 }).toArray(),
      db.collection('question_import_registry').find({ problemId: { $in: ids } })
        .project({ problemId: 1, readiness: 1, status: 1, updatedAt: 1 }).toArray(),
    ]);
    const counts = new Map(caseGroups.map((row) => [`${row._id.problem}:${row._id.kind}`, row.count]));
    const libraryById = new Map(libraries.map((row) => [String(row.sourceProblemId), row]));
    const registryById = new Map(registries.map((row) => [String(row.problemId), row]));

    const rows = drafts.map((problem) => {
      const id = String(problem._id);
      const supported = Array.isArray(problem.supportedLanguages) ? problem.supportedLanguages : [];
      const validated = Array.isArray(problem.validatedLanguages) ? problem.validatedLanguages : [];
      const references = values(problem.referenceSolutions);
      const templates = values(problem.codeTemplates);
      const sampleCount = counts.get(`${id}:sample`) || 0;
      const dbHiddenCount = counts.get(`${id}:hidden`) || 0;
      const externalHiddenCount = ['s3', 'supabase'].includes(problem.hiddenTestSource?.provider)
        ? Number(problem.hiddenTestSource?.caseCount || 0) : 0;
      const hiddenCount = Math.max(dbHiddenCount, externalHiddenCount);
      const missingSupported = REQUIRED.filter((language) => !supported.includes(language));
      const missingValidated = REQUIRED.filter((language) => !validated.includes(language));
      const missingReferences = REQUIRED.filter((language) => !nonempty(references[language]));
      const missingTemplates = REQUIRED.filter((language) => !nonempty(templates[language]));
      const issues = contentIssues(problem);
      if (sampleCount < 3) issues.push(`samples-${sampleCount}`);
      if (hiddenCount < 10 || hiddenCount > 12) issues.push(`hidden-${hiddenCount}`);
      if (missingSupported.length) issues.push(`supported-missing:${missingSupported.join(',')}`);
      if (missingValidated.length) issues.push(`validated-missing:${missingValidated.join(',')}`);
      if (missingReferences.length) issues.push(`references-missing:${missingReferences.join(',')}`);
      if (missingTemplates.length) issues.push(`templates-missing:${missingTemplates.join(',')}`);
      if (!(problem.previewValidated ?? problem.previewTested)) issues.push('preview-not-validated');
      const registry = registryById.get(id);
      const readyByFields = issues.length === 0;
      return {
        id,
        displayOrder: problem.displayOrder,
        title: problem.title,
        category: problem.category || '',
        executionMode: problem.executionMode,
        visibility: problem.visibility,
        supportedLanguages: supported,
        validatedLanguages: validated,
        sampleCount,
        hiddenCount,
        dbHiddenCount,
        externalHiddenCount,
        previewValidated: Boolean(problem.previewValidated ?? problem.previewTested),
        referenceCount: REQUIRED.length - missingReferences.length,
        templateCount: REQUIRED.length - missingTemplates.length,
        contentLength: String(problem.description || '').length,
        issues,
        readyByFields,
        registryReady: registry?.readiness?.readyForPublication ?? null,
        registryBlockers: registry?.readiness?.blockers || registry?.readiness?.issues || null,
        library: libraryById.has(id) ? {
          status: libraryById.get(id).status,
          visibility: libraryById.get(id).visibility,
          displayOrder: libraryById.get(id).displayOrder,
        } : null,
        updatedAt: problem.updatedAt,
      };
    });

    const issueCounts = {};
    for (const row of rows) for (const issue of row.issues) {
      const key = issue.split(':')[0].replace(/-\d+$/, '-count');
      issueCounts[key] = (issueCounts[key] || 0) + 1;
    }
    const ready = rows.filter((row) => row.readyByFields);
    const registryReady = rows.filter((row) => row.registryReady === true);
    return {
      label,
      database: connection.name,
      auditedAt: new Date().toISOString(),
      statuses,
      summary: {
        draftCount: rows.length,
        readyByPersistedFields: ready.length,
        registryReady: registryReady.length,
        sixSupported: rows.filter((row) => row.supportedLanguages.length >= 6 && !row.issues.some((x) => x.startsWith('supported-missing'))).length,
        sixValidated: rows.filter((row) => row.validatedLanguages.length >= 6 && !row.issues.some((x) => x.startsWith('validated-missing'))).length,
        withThreeSamples: rows.filter((row) => row.sampleCount >= 3).length,
        withTenToTwelveHidden: rows.filter((row) => row.hiddenCount >= 10 && row.hiddenCount <= 12).length,
        withAllReferences: rows.filter((row) => row.referenceCount === 6).length,
        withAllTemplates: rows.filter((row) => row.templateCount === 6).length,
        previewValidated: rows.filter((row) => row.previewValidated).length,
        possibleMalformedContent: rows.filter((row) => row.issues.some((issue) => ['possible-vertical-token-layout', 'excessive-blank-lines', 'raw-or-escaped-html', 'possible-broken-table'].includes(issue))).length,
      },
      issueCounts,
      readyIds: ready.map(({ id, displayOrder, title }) => ({ id, displayOrder, title })),
      rows,
    };
  } finally {
    await connection.close();
  }
}

const localEnv = dotenv.config({ path: 'backend/.env.local-repair', processEnv: {} }).parsed || {};
const prodEnv = dotenv.config({ path: 'backend/.env.production-repair', processEnv: {} }).parsed || {};
const productionUri = String(prodEnv.MONGODB_URI || '').replace('127.0.0.1:27017', '127.0.0.1:27020');
const report = {
  local: await audit('local-repair', localEnv.MONGODB_URI),
  production: await audit('production', productionUri),
};
console.log(JSON.stringify(report, null, 2));
