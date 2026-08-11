export const COMPILER_LANGUAGES = [
  { id: 'python', label: 'Python', monacoLanguage: 'python', judge0LanguageId: 71 },
  { id: 'javascript', label: 'JavaScript', monacoLanguage: 'javascript', judge0LanguageId: 63 },
  { id: 'java', label: 'Java', monacoLanguage: 'java', judge0LanguageId: 62 },
  { id: 'cpp', label: 'C++', monacoLanguage: 'cpp', judge0LanguageId: 54 },
  { id: 'c', label: 'C', monacoLanguage: 'c', judge0LanguageId: 50 },
  { id: 'typescript', label: 'TypeScript', monacoLanguage: 'typescript', judge0LanguageId: 74 },
  { id: 'csharp', label: 'C#', monacoLanguage: 'csharp', judge0LanguageId: 51 },
  { id: 'php', label: 'PHP', monacoLanguage: 'php', judge0LanguageId: 68 },
  { id: 'go', label: 'Go', monacoLanguage: 'go', judge0LanguageId: 60 },
  { id: 'rust', label: 'Rust', monacoLanguage: 'rust', judge0LanguageId: 73 },
  { id: 'kotlin', label: 'Kotlin', monacoLanguage: 'kotlin', judge0LanguageId: 78 },
  { id: 'ruby', label: 'Ruby', monacoLanguage: 'ruby', judge0LanguageId: 72 },
  { id: 'swift', label: 'Swift', monacoLanguage: 'swift', judge0LanguageId: 83 },
];

const LANGUAGE_ID_ALIASES = {
  'c++': 'cpp',
  cpp: 'cpp',
  'c#': 'csharp',
  'c-sharp': 'csharp',
  csharp: 'csharp',
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
};

const COMPILER_LANGUAGE_IDS = new Set(COMPILER_LANGUAGES.map((language) => language.id));

export function normalizeCompilerLanguageId(languageId) {
  const normalized = String(languageId || '').trim().toLowerCase();
  return LANGUAGE_ID_ALIASES[normalized] || normalized;
}

export function normalizeCompilerLanguageIds(languageIds = []) {
  const source = Array.isArray(languageIds) ? languageIds : [languageIds];
  return Array.from(new Set(
    source
      .map(normalizeCompilerLanguageId)
      .filter((languageId) => COMPILER_LANGUAGE_IDS.has(languageId)),
  ));
}

export function normalizeCompilerCodeMap(codeMap = {}) {
  return Object.entries(codeMap || {}).reduce((normalizedMap, [languageId, code]) => {
    const normalizedId = normalizeCompilerLanguageId(languageId);
    if (COMPILER_LANGUAGE_IDS.has(normalizedId)) {
      normalizedMap[normalizedId] = code;
    }
    return normalizedMap;
  }, {});
}

export function getProblemSupportedLanguages(problem = {}) {
  const configured = normalizeCompilerLanguageIds(problem.supportedLanguages || []);
  if (configured.length > 0) return configured;

  return normalizeCompilerLanguageIds(Object.keys(problem.codeTemplates || {}));
}

export function createEmptySampleTestCase() {
  return {
    input: '',
    output: '',
    explanation: '',
    marks: 1,
  };
}

export function createEmptyHiddenTestCase() {
  return {
    input: '',
    output: '',
    marks: 1,
  };
}

export function createEmptyFaq() {
  return {
    question: '',
    answer: '',
  };
}

export function createDefaultProblemForm() {
  return {
    title: '',
    description: '',
    difficulty: 'Easy',
    tags: '',
    companyTags: '',
    supportedLanguages: ['python', 'javascript'],
    codeTemplates: {},
    referenceSolutions: {},
    inputFormat: '',
    outputFormat: '',
    constraints: '',
    hints: [],
    faqs: [],
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    sampleTestCases: [createEmptySampleTestCase()],
    hiddenTestCases: [createEmptyHiddenTestCase()],
    existingHiddenTestCaseCount: 0,
    hiddenTestUploadMode: 'pairs',
    hiddenTestFiles: [],
    hiddenBulkInputFile: null,
    hiddenBulkOutputFile: null,
    hiddenBulkDelimiter: '###CASE###',
    hiddenBulkCaseCount: 0,
    visibility: 'public',
    previewValidated: false,
    previewTested: false,
  };
}

export function createProblemFormFromProblem(problem) {
  const configuredLanguages = getProblemSupportedLanguages(problem);
  const supportedLanguages = configuredLanguages.length ? configuredLanguages : ['python'];

  return {
    title: problem?.title || '',
    description: problem?.description || '',
    difficulty: problem?.difficulty || 'Easy',
    tags: (problem?.tags || []).join(', '),
    companyTags: (problem?.companyTags || []).join(', '),
    supportedLanguages,
    codeTemplates: normalizeCompilerCodeMap(problem?.codeTemplates),
    referenceSolutions: normalizeCompilerCodeMap(problem?.referenceSolutions),
    inputFormat: problem?.inputFormat || '',
    outputFormat: problem?.outputFormat || '',
    constraints: problem?.constraints || '',
    hints: Array.isArray(problem?.hints) ? problem.hints.map((hint) => String(hint || '')) : [],
    faqs: Array.isArray(problem?.faqs)
      ? problem.faqs.map((faq) => ({
        question: faq?.question || '',
        answer: faq?.answer || '',
      }))
      : [],
    timeLimitSeconds: problem?.timeLimitSeconds || 2,
    memoryLimitMb: problem?.memoryLimitMb || 256,
    sampleTestCases: problem?.sampleTestCases?.length
      ? problem.sampleTestCases.map((testCase) => ({
        input: testCase.input || '',
        output: testCase.output || '',
        explanation: testCase.explanation || '',
        marks: Number(testCase.marks) > 0 ? Number(testCase.marks) : 1,
      }))
      : [createEmptySampleTestCase()],
    hiddenTestCases: problem?.hiddenTestCases?.length
      ? problem.hiddenTestCases.map((testCase) => ({
        input: testCase.input || '',
        output: testCase.output || '',
        marks: Number(testCase.marks) > 0 ? Number(testCase.marks) : 1,
      }))
      : [createEmptyHiddenTestCase()],
    existingHiddenTestCaseCount: problem?.hiddenTestCaseCount || 0,
    hiddenTestUploadMode: problem?.hiddenTestSource?.provider === 's3' ? 'bulk' : 'pairs',
    hiddenTestFiles: [],
    hiddenBulkInputFile: null,
    hiddenBulkOutputFile: null,
    hiddenBulkDelimiter: problem?.hiddenTestSource?.delimiter || '###CASE###',
    hiddenBulkCaseCount: problem?.hiddenTestCaseCount || 0,
    visibility: problem?.visibility || 'public',
    previewValidated: Boolean(problem?.previewValidated ?? problem?.previewTested),
    previewTested: Boolean(problem?.previewTested),
  };
}

export function parseBulkCases(content, delimiter = '###CASE###') {
  const normalizedContent = String(content ?? '').replace(/\r\n/g, '\n');
  const normalizedDelimiter = String(delimiter || '').trim();

  if (!normalizedDelimiter) {
    return [normalizedContent];
  }

  const chunks = normalizedContent
    .split(normalizedDelimiter)
    .map((chunk) => chunk.replace(/^\n+|\n+$/g, ''))
    .filter((chunk) => chunk.length > 0);

  return chunks.length > 0 ? chunks : [normalizedContent];
}

export function parseBulkCasePair(inputsContent, outputsContent, delimiter = '###CASE###') {
  const inputs = parseBulkCases(inputsContent, delimiter);
  const outputs = parseBulkCases(outputsContent, delimiter);

  if (inputs.length !== outputs.length) {
    throw new Error(`Input/output testcase count mismatch (${inputs.length} inputs vs ${outputs.length} outputs).`);
  }

  return inputs.map((input, index) => ({
    position: index + 1,
    input,
    output: outputs[index],
  }));
}

export function buildProblemFormData(problemForm, status) {
  const formData = new FormData();
  const supportedLanguages = normalizeCompilerLanguageIds(problemForm.supportedLanguages || []);
  formData.append('title', problemForm.title || '');
  formData.append('description', problemForm.description || '');
  formData.append('difficulty', problemForm.difficulty || 'Easy');
  formData.append('tags', problemForm.tags || '');
  formData.append('companyTags', problemForm.companyTags || '');
  formData.append('visibility', problemForm.visibility || 'public');
  formData.append('supportedLanguages', JSON.stringify(supportedLanguages));
  formData.append('codeTemplates', JSON.stringify(normalizeCompilerCodeMap(problemForm.codeTemplates)));
  formData.append('inputFormat', problemForm.inputFormat || '');
  formData.append('outputFormat', problemForm.outputFormat || '');
  formData.append('constraints', problemForm.constraints || '');
  formData.append('hints', JSON.stringify(problemForm.hints || []));
  formData.append('faqs', JSON.stringify(problemForm.faqs || []));
  formData.append('timeLimitSeconds', String(problemForm.timeLimitSeconds || 2));
  formData.append('memoryLimitMb', String(problemForm.memoryLimitMb || 256));
  formData.append('sampleTestCases', JSON.stringify(problemForm.sampleTestCases || []));
  formData.append('status', status);

  const uploadMode = problemForm.hiddenTestUploadMode || 'pairs';
  formData.append('hiddenTestUploadMode', uploadMode);

  if (uploadMode === 'bulk') {
    if (problemForm.hiddenBulkInputFile) {
      formData.append('hiddenBulkInputFile', problemForm.hiddenBulkInputFile);
    }
    if (problemForm.hiddenBulkOutputFile) {
      formData.append('hiddenBulkOutputFile', problemForm.hiddenBulkOutputFile);
    }
    formData.append('hiddenBulkDelimiter', problemForm.hiddenBulkDelimiter || '###CASE###');
  } else {
    const hiddenTestCases = problemForm.hiddenTestCases || [];
    const hiddenTestFiles = problemForm.hiddenTestFiles || [];
    const hasHiddenTestCaseContent = hiddenTestCases.some((testCase) => (
      String(testCase?.input || '').trim() || String(testCase?.output || '').trim()
    ));

    if (hasHiddenTestCaseContent || hiddenTestFiles.length > 0 || !problemForm.existingHiddenTestCaseCount) {
      formData.append('hiddenTestCases', JSON.stringify(hiddenTestCases));
    }

    hiddenTestFiles.forEach((file) => {
      formData.append('hiddenTestFiles', file);
    });
  }

  return formData;
}

export function buildPreviewApprovalFormData(problemForm) {
  const formData = new FormData();
  formData.append('referenceSolutions', JSON.stringify(problemForm.referenceSolutions || {}));
  return formData;
}

export function buildPreviewRunFormData(problemForm, language, customInput) {
  const formData = new FormData();
  formData.append('language', language);
  formData.append('supportedLanguages', JSON.stringify(problemForm.supportedLanguages || []));
  formData.append('codeTemplates', JSON.stringify(problemForm.codeTemplates || {}));
  formData.append('sampleTestCases', JSON.stringify(problemForm.sampleTestCases || []));
  formData.append('timeLimitSeconds', String(problemForm.timeLimitSeconds || 2));
  formData.append('customInput', customInput || '');
  return formData;
}

export function buildExecutionFormData({ language, sourceCode, customInput = '' }) {
  const formData = new FormData();
  formData.append('language', language);
  formData.append('sourceCode', sourceCode || '');
  formData.append('customInput', customInput || '');
  return formData;
}

export function deriveHiddenFilePairs(files = []) {
  const pairs = new Map();
  const issues = [];

  files.forEach((file) => {
    const match = file.name.match(/^(input|output)_([^.]+)\.txt$/i);
    if (!match) {
      issues.push(`"${file.name}" does not match input_1.txt or output_1.txt.`);
      return;
    }

    const kind = match[1].toLowerCase();
    const key = match[2];
    if (!pairs.has(key)) {
      pairs.set(key, { key });
    }
    pairs.get(key)[kind] = file.name;
  });

  const resolvedPairs = Array.from(pairs.values())
    .sort((left, right) => left.key.localeCompare(right.key, undefined, { numeric: true }))
    .map((pair) => ({
      key: pair.key,
      input: pair.input || null,
      output: pair.output || null,
      complete: Boolean(pair.input && pair.output),
    }));

  resolvedPairs.forEach((pair) => {
    if (!pair.complete) {
      issues.push(`Pair "${pair.key}" is incomplete. Upload both input_${pair.key}.txt and output_${pair.key}.txt.`);
    }
  });

  return {
    pairs: resolvedPairs,
    issues,
  };
}

export function difficultyBadgeClass(difficulty) {
  switch (difficulty) {
    case 'Hard':
      return 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800';
    case 'Medium':
      return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
    default:
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
  }
}

export function problemStatusClass(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'published' || normalized === 'active'
    ? 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800'
    : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
}

export function submissionStatusClass(status) {
  switch (status) {
    case 'AC':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
    case 'WA':
      return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
    case 'TLE':
    case 'RE':
    case 'CE':
      return 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800';
    case 'RUNNING':
      return 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800';
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
  }
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function formatDuration(value) {
  return `${Number(value || 0).toFixed(2)} ms`;
}

export function formatDateTime(value) {
  if (!value) return 'Just now';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(value) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getLanguageLabel(languageId) {
  const normalizedId = normalizeCompilerLanguageId(languageId);
  return COMPILER_LANGUAGES.find((language) => language.id === normalizedId)?.label || languageId;
}

export function getMonacoLanguage(languageId) {
  const normalizedId = normalizeCompilerLanguageId(languageId);
  return COMPILER_LANGUAGES.find((language) => language.id === normalizedId)?.monacoLanguage || 'plaintext';
}

export function getJudge0LanguageId(languageId) {
  const normalizedId = normalizeCompilerLanguageId(languageId);
  return COMPILER_LANGUAGES.find((language) => language.id === normalizedId)?.judge0LanguageId || null;
}









