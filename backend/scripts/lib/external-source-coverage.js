import { createHash } from 'node:crypto';

const REQUIRED_LANGUAGES = Object.freeze([
  'python', 'cpp', 'c', 'java', 'javascript', 'typescript',
]);

const DOOCS_LANGUAGE_ALIASES = Object.freeze({
  Python: 'python',
  'C++': 'cpp',
  C: 'c',
  Java: 'java',
  JavaScript: 'javascript',
  TypeScript: 'typescript',
});

export function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeSlug(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function addToMultiMap(map, key, value) {
  if (!key) return;
  const entries = map.get(key) || [];
  entries.push(value);
  map.set(key, entries);
}

export function buildProblemIdentityIndex(problems, registryRows = []) {
  const registryByProblem = new Map();
  for (const row of registryRows) {
    const problemId = String(row.problemId || '');
    if (!problemId) continue;
    const slugs = [row.externalSlug, ...(row.externalAliases || []).map((entry) => entry?.externalSlug)]
      .map(normalizeSlug)
      .filter(Boolean);
    registryByProblem.set(problemId, Array.from(new Set(slugs)));
  }

  const bySlug = new Map();
  const byTitle = new Map();
  for (const problem of problems) {
    const identity = {
      problem,
      problemId: String(problem._id),
      title: String(problem.title || ''),
      normalizedTitle: normalizeTitle(problem.title),
      slugs: registryByProblem.get(String(problem._id)) || [],
    };
    for (const slug of identity.slugs) addToMultiMap(bySlug, slug, identity);
    addToMultiMap(byTitle, identity.normalizedTitle, identity);
  }
  return { bySlug, byTitle };
}

export function matchProblemIdentity(index, { slug, title } = {}) {
  const normalizedSlug = normalizeSlug(slug);
  if (normalizedSlug) {
    const slugMatches = index.bySlug.get(normalizedSlug) || [];
    if (slugMatches.length === 1) return { status: 'matched', method: 'registry-slug', identity: slugMatches[0] };
    if (slugMatches.length > 1) return { status: 'ambiguous', method: 'registry-slug', candidates: slugMatches };
  }
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) return { status: 'unmatched', method: 'none', candidates: [] };
  const titleMatches = index.byTitle.get(normalizedTitle) || [];
  if (titleMatches.length === 1) return { status: 'matched', method: 'normalized-title', identity: titleMatches[0] };
  if (titleMatches.length > 1) return { status: 'ambiguous', method: 'normalized-title', candidates: titleMatches };
  return { status: 'unmatched', method: 'normalized-title', candidates: [] };
}

export function indexDoocsRows(rows) {
  const byTitle = new Map();
  const invalidRows = [];
  for (const wrapper of rows) {
    const row = wrapper?.row || wrapper;
    const language = DOOCS_LANGUAGE_ALIASES[String(row?.language || '')];
    if (!language || !String(row?.solution || '').trim()) continue;
    const titleKey = normalizeTitle(row.title);
    if (!titleKey) continue;
    if ((wrapper?.truncated_cells || []).includes('solution')) {
      invalidRows.push({ title: row.title, language, reason: 'truncated-solution' });
      continue;
    }
    const entry = byTitle.get(titleKey) || {
      title: row.title,
      slug: normalizeSlug(row.title),
      solutions: {},
      sourceIds: new Set(),
    };
    if (entry.solutions[language] && entry.solutions[language] !== row.solution) {
      invalidRows.push({ title: row.title, language, reason: 'conflicting-duplicate-solution' });
      entry.solutions[language] = null;
    } else if (entry.solutions[language] !== null) {
      entry.solutions[language] = row.solution;
    }
    entry.sourceIds.add(String(row.id ?? ''));
    byTitle.set(titleKey, entry);
  }
  return { byTitle, invalidRows };
}

export function indexNeulabRows(rows) {
  const bySlug = new Map();
  const invalidRows = [];
  for (const row of rows) {
    const slug = normalizeSlug(row?.task_id);
    const source = String(row?.canonical_tests?.source || '').trim();
    if (!slug || !source) continue;
    const assertCount = (source.match(/^\s*assert\s+/gm) || []).length;
    const entry = {
      slug,
      comparison: String(row?.canonical_tests?.comparison || 'exact'),
      canonicalTestSource: source,
      canonicalTestCount: assertCount,
      testsTotal: Number(row?.metadata?.tests_total || assertCount),
      testsDropped: Number(row?.metadata?.tests_dropped || 0),
      flags: Array.isArray(row?.metadata?.flags) ? row.metadata.flags : [],
      sourceFetchedAt: String(row?.metadata?.fetched_at || ''),
    };
    if (bySlug.has(slug)) {
      const previous = bySlug.get(slug);
      if (previous?.canonicalTestSource !== entry.canonicalTestSource) {
        invalidRows.push({ slug, reason: 'conflicting-duplicate-test-suite' });
        bySlug.set(slug, null);
      }
    } else {
      bySlug.set(slug, entry);
    }
  }
  return { bySlug, invalidRows };
}

function mapValue(value) {
  if (value instanceof Map) return Object.fromEntries(value);
  return value || {};
}

export function missingReferenceLanguages(problem) {
  const references = mapValue(problem.referenceSolutions);
  return REQUIRED_LANGUAGES.filter((language) => !String(references[language] || '').trim());
}

export function analyzeExternalCoverage({
  problems, registryRows, testCases, doocsRows, neulabRows,
  sampleMinimum = 3, hiddenMinimum = 10, hiddenMaximum = 12,
}) {
  const dsaProblems = problems.filter((problem) => problem.category !== 'SQL');
  const identityIndex = buildProblemIdentityIndex(dsaProblems, registryRows);
  const doocs = indexDoocsRows(doocsRows);
  const neulab = indexNeulabRows(neulabRows);
  const casesByProblem = new Map();
  for (const testCase of testCases) {
    const key = String(testCase.problem);
    const counts = casesByProblem.get(key) || { sample: 0, hidden: 0 };
    if (testCase.kind === 'sample') counts.sample += 1;
    if (testCase.kind === 'hidden') counts.hidden += 1;
    casesByProblem.set(key, counts);
  }

  const referenceBlockers = dsaProblems.filter((problem) => missingReferenceLanguages(problem).length > 0);
  const testBlockers = dsaProblems.filter((problem) => {
    const counts = casesByProblem.get(String(problem._id)) || { sample: 0, hidden: 0 };
    return counts.sample < sampleMinimum || counts.hidden < hiddenMinimum || counts.hidden > hiddenMaximum;
  });
  const referenceRows = [];
  const doocsMatchMethods = {};
  const doocsByProblemId = new Map();
  for (const source of doocs.byTitle.values()) {
    const match = matchProblemIdentity(identityIndex, { slug: source.slug, title: source.title });
    if (match.status !== 'matched') continue;
    const key = match.identity.problemId;
    if (doocsByProblemId.has(key) && doocsByProblemId.get(key) !== source) {
      doocsByProblemId.set(key, null);
    } else {
      doocsByProblemId.set(key, source);
    }
  }
  for (const problem of referenceBlockers) {
    const missing = missingReferenceLanguages(problem);
    const source = doocsByProblemId.get(String(problem._id));
    const available = source ? missing.filter((language) => String(source.solutions[language] || '').trim()) : [];
    const sourceIdentity = source
      ? matchProblemIdentity(identityIndex, { slug: source.slug, title: source.title })
      : { status: 'unmatched', method: 'unmatched' };
    const method = source ? sourceIdentity.method : 'unmatched';
    doocsMatchMethods[method] = (doocsMatchMethods[method] || 0) + 1;
    referenceRows.push({
      problemId: String(problem._id), title: problem.title, status: problem.status,
      sourceTitle: source?.title || '', sourceSlug: source?.slug || '', sourceIds: source ? [...source.sourceIds] : [],
      missing, available, fullyFillable: available.length === missing.length, match: method,
      proposedPatches: available.map((language) => ({
        language,
        sourceLanguage: Object.entries(DOOCS_LANGUAGE_ALIASES).find(([, target]) => target === language)?.[0] || language,
        sourceCodeSha256: createHash('sha256').update(source.solutions[language]).digest('hex'),
        sourceCodeCharacters: source.solutions[language].length,
        gates: ['contract-adaptation', 'compile', 'all-testcases-pass', 'manual-license-review'],
      })),
    });
  }

  const testRows = [];
  const neulabMatchMethods = {};
  for (const problem of testBlockers) {
    const counts = casesByProblem.get(String(problem._id)) || { sample: 0, hidden: 0 };
    const slugs = (identityIndex.byTitle.get(normalizeTitle(problem.title)) || [])
      .find((entry) => entry.problemId === String(problem._id))?.slugs || [];
    let source = null;
    let matchMethod = 'unmatched';
    for (const slug of slugs) {
      if (neulab.bySlug.get(slug)) {
        source = neulab.bySlug.get(slug);
        matchMethod = 'registry-slug';
        break;
      }
    }
    if (!source) {
      const fallbackSlug = normalizeSlug(problem.title);
      if (neulab.bySlug.get(fallbackSlug)) {
        source = neulab.bySlug.get(fallbackSlug);
        matchMethod = 'normalized-title-slug';
      }
    }
    neulabMatchMethods[matchMethod] = (neulabMatchMethods[matchMethod] || 0) + 1;
    const hiddenNeeded = Math.max(0, hiddenMinimum - counts.hidden);
    testRows.push({
      problemId: String(problem._id), title: problem.title, status: problem.status,
      sampleCount: counts.sample, hiddenCount: counts.hidden, hiddenNeeded,
      sourceCanonicalTests: source?.canonicalTestCount || 0,
      sourceComparison: source?.comparison || '',
      enoughCanonicalTests: Boolean(source && source.canonicalTestCount >= hiddenNeeded && hiddenNeeded > 0),
      requiresSampleRepair: counts.sample < sampleMinimum,
      overHiddenMaximum: counts.hidden > hiddenMaximum,
      match: matchMethod,
    });
  }

  const languageCoverage = Object.fromEntries(REQUIRED_LANGUAGES.map((language) => [language, {
    missing: referenceRows.filter((row) => row.missing.includes(language)).length,
    sourceAvailable: referenceRows.filter((row) => row.available.includes(language)).length,
  }]));
  const countByStatus = (rows) => Object.fromEntries([...rows.reduce((counts, row) => {
    const key = String(row.status || 'unknown');
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map())]);
  const testBreakdown = {
    sampleBelowMinimum: testRows.filter((row) => row.sampleCount < sampleMinimum).length,
    hiddenMissingEntirely: testRows.filter((row) => row.hiddenCount === 0).length,
    hiddenOneToNine: testRows.filter((row) => row.hiddenCount > 0 && row.hiddenCount < hiddenMinimum).length,
    hiddenAboveMaximum: testRows.filter((row) => row.hiddenCount > hiddenMaximum).length,
    samplesReadyButHiddenIncomplete: testRows.filter((row) => row.sampleCount >= sampleMinimum
      && (row.hiddenCount < hiddenMinimum || row.hiddenCount > hiddenMaximum)).length,
    hiddenReadyButSamplesIncomplete: testRows.filter((row) => row.sampleCount < sampleMinimum
      && row.hiddenCount >= hiddenMinimum && row.hiddenCount <= hiddenMaximum).length,
  };
  return {
    cohorts: {
      dsaProblems: dsaProblems.length,
      missingAnySixLanguageReference: referenceBlockers.length,
      incompleteTestSuites: testBlockers.length,
      referenceBlockersByStatus: countByStatus(referenceRows),
      testBlockersByStatus: countByStatus(testRows),
      testBreakdown,
    },
    doocs: {
      sourceProblems: doocs.byTitle.size,
      invalidRows: doocs.invalidRows.length,
      matchedBlockers: referenceRows.filter((row) => row.available.length > 0).length,
      fullyFillableBlockers: referenceRows.filter((row) => row.fullyFillable).length,
      partiallyFillableBlockers: referenceRows.filter((row) => row.available.length > 0 && !row.fullyFillable).length,
      unavailableBlockers: referenceRows.filter((row) => row.available.length === 0).length,
      referencesFillable: referenceRows.reduce((sum, row) => sum + row.available.length, 0),
      matchMethods: doocsMatchMethods,
      languageCoverage,
      fullyFillable: referenceRows.filter((row) => row.fullyFillable),
    },
    neulab: {
      sourceProblems: [...neulab.bySlug.values()].filter(Boolean).length,
      invalidRows: neulab.invalidRows.length,
      matchedBlockers: testRows.filter((row) => row.sourceCanonicalTests > 0).length,
      enoughCanonicalTestsForHiddenMinimum: testRows.filter((row) => row.enoughCanonicalTests).length,
      matchedButSampleRepairAlsoRequired: testRows.filter((row) => row.sourceCanonicalTests > 0 && row.requiresSampleRepair).length,
      matchMethods: neulabMatchMethods,
    },
    detail: { referenceBlockers: referenceRows, testBlockers: testRows },
  };
}

export { REQUIRED_LANGUAGES };
