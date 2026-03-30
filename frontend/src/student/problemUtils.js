export const PROBLEM_SORT_OPTIONS = [
  {
    value: 'acceptance-desc',
    label: 'Acceptance Rate (High to Low)',
    sortBy: 'acceptanceRate',
    sortOrder: 'desc',
  },
  {
    value: 'acceptance-asc',
    label: 'Acceptance Rate (Low to High)',
    sortBy: 'acceptanceRate',
    sortOrder: 'asc',
  },
  {
    value: 'difficulty-asc',
    label: 'Difficulty (Easy to Hard)',
    sortBy: 'difficulty',
    sortOrder: 'asc',
  },
  {
    value: 'difficulty-desc',
    label: 'Difficulty (Hard to Easy)',
    sortBy: 'difficulty',
    sortOrder: 'desc',
  },
];

const DRAFT_KEY_PREFIX = 'peerprep:problem-drafts:';

export function resolveProblemSort(value) {
  return PROBLEM_SORT_OPTIONS.find((option) => option.value === value) || PROBLEM_SORT_OPTIONS[0];
}

export function getProblemDraftStorageKey(problemId) {
  return `${DRAFT_KEY_PREFIX}${problemId}`;
}

export function loadProblemDrafts(problemId) {
  if (typeof window === 'undefined' || !problemId) {
    return {};
  }

  try {
    const storedValue = window.localStorage.getItem(getProblemDraftStorageKey(problemId));
    return storedValue ? JSON.parse(storedValue) : {};
  } catch {
    return {};
  }
}

export function saveProblemDrafts(problemId, drafts) {
  if (typeof window === 'undefined' || !problemId) {
    return;
  }

  try {
    window.localStorage.setItem(getProblemDraftStorageKey(problemId), JSON.stringify(drafts || {}));
  } catch {
    // Ignore localStorage write errors in restricted environments.
  }
}

export function buildProblemDrafts(problem, storedDrafts = {}) {
  return (problem?.supportedLanguages || []).reduce((acc, language) => {
    const fallbackTemplate = problem?.codeTemplates?.[language] || '';
    const storedDraft = storedDrafts?.[language];
    acc[language] = typeof storedDraft === 'string' ? storedDraft : fallbackTemplate;
    return acc;
  }, {});
}

export function studentStatusBadgeClass(status) {
  return status === 'Solved'
    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
    : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
}

export function buildTagsParam(tags) {
  return (tags || []).join(',');
}

export function isRunExecutionResult(result) {
  return Boolean(result?.status && typeof result.status === 'object' && 'id' in result.status);
}

export function verdictBadgeClass(status) {
  switch (status) {
    case 'Accepted':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
    case 'Wrong Answer':
      return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
    case 'Compilation Error':
    case 'Runtime Error':
    case 'Time Limit Exceeded':
      return 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800';
    default:
      return 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800';
  }
}

export function summarizeExecutionResult(result) {
  if (!result) {
    return 'No execution data yet.';
  }

  if (isRunExecutionResult(result)) {
    if (result.compile_output) {
      return 'Compilation failed. Review the compiler output below.';
    }

    if (result.stderr) {
      return 'Execution finished with an error on your custom input.';
    }

    const description = result.status?.description || '';
    if (description.trim().toLowerCase() === 'accepted') {
      return 'Run completed.';
    }

    return description || 'Run completed.';
  }

  switch (result.status) {
    case 'Accepted':
      return 'All test cases passed.';
    case 'Wrong Answer':
      return 'One of the judge test cases did not match the expected output.';
    case 'Compilation Error':
      return 'Compilation failed before execution could start.';
    case 'Runtime Error':
      return 'The program crashed while Judge0 was executing it.';
    case 'Time Limit Exceeded':
      return 'The program exceeded the allowed execution time.';
    default:
      return 'Execution finished with judge feedback.';
  }
}
