export const COMPILER_LANGUAGES = [
  { id: 'python', label: 'Python', monacoLanguage: 'python', judge0LanguageId: 71 },
  { id: 'javascript', label: 'JavaScript', monacoLanguage: 'javascript', judge0LanguageId: 63 },
  { id: 'java', label: 'Java', monacoLanguage: 'java', judge0LanguageId: 62 },
  { id: 'cpp', label: 'C++', monacoLanguage: 'cpp', judge0LanguageId: 54 },
  { id: 'c', label: 'C', monacoLanguage: 'c', judge0LanguageId: 50 },
];

export const DEFAULT_CODE_TEMPLATES = {
  python: `def solve():
    # STUDENT_CODE_START
    pass
    # STUDENT_CODE_END


if __name__ == "__main__":
    solve()
`,
  javascript: `function solve() {
  // STUDENT_CODE_START

  // STUDENT_CODE_END
}

solve();
`,
  java: `import java.io.*;
import java.util.*;

public class Main {
    public static void solve() throws Exception {
        // STUDENT_CODE_START

        // STUDENT_CODE_END
    }

    public static void main(String[] args) throws Exception {
        solve();
    }
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // STUDENT_CODE_START

    // STUDENT_CODE_END

    return 0;
}
`,
  c: `#include <stdio.h>

int main(void) {
    // STUDENT_CODE_START

    // STUDENT_CODE_END

    return 0;
}
`,
};

export function createEmptySampleTestCase() {
  return {
    input: '',
    output: '',
    explanation: '',
  };
}

export function createEmptyHiddenTestCase() {
  return {
    input: '',
    output: '',
  };
}

export function createDefaultProblemForm() {
  return {
    title: '',
    description: '',
    difficulty: 'Easy',
    tags: '',
    companyTags: '',
    supportedLanguages: ['python'],
    codeTemplates: { python: '' },
    referenceSolutions: {},
    inputFormat: '',
    outputFormat: '',
    constraints: '',
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
    previewTested: false,
  };
}

export function createProblemFormFromProblem(problem) {
  const supportedLanguages = problem?.supportedLanguages?.length
    ? problem.supportedLanguages
    : ['python'];
  const savedTemplates = problem?.codeTemplates || {};
  const codeTemplates = supportedLanguages.reduce((acc, language) => {
    acc[language] = typeof savedTemplates?.[language] === 'string'
      ? savedTemplates[language]
      : '';
    return acc;
  }, {});

  return {
    title: problem?.title || '',
    description: problem?.description || '',
    difficulty: problem?.difficulty || 'Easy',
    tags: (problem?.tags || []).join(', '),
    companyTags: (problem?.companyTags || []).join(', '),
    supportedLanguages,
    codeTemplates,
    referenceSolutions: problem?.referenceSolutions || {},
    inputFormat: problem?.inputFormat || '',
    outputFormat: problem?.outputFormat || '',
    constraints: problem?.constraints || '',
    timeLimitSeconds: problem?.timeLimitSeconds || 2,
    memoryLimitMb: problem?.memoryLimitMb || 256,
    sampleTestCases: problem?.sampleTestCases?.length
      ? problem.sampleTestCases.map((testCase) => ({
        input: testCase.input || '',
        output: testCase.output || '',
        explanation: testCase.explanation || '',
      }))
      : [createEmptySampleTestCase()],
    hiddenTestCases: problem?.hiddenTestCases?.length
      ? problem.hiddenTestCases.map((testCase) => ({
        input: testCase.input || '',
        output: testCase.output || '',
      }))
      : [createEmptyHiddenTestCase()],
    existingHiddenTestCaseCount: problem?.hiddenTestCaseCount || 0,
    hiddenTestUploadMode: problem?.hiddenTestSource?.provider === 's3' ? 'bulk' : 'pairs',
    hiddenTestFiles: [],
    hiddenBulkInputFile: null,
    hiddenBulkOutputFile: null,
    hiddenBulkDelimiter: problem?.hiddenTestSource?.delimiter || '###CASE###',
    previewTested: Boolean(problem?.previewTested),
  };
}

export function buildProblemFormData(problemForm, status) {
  const formData = new FormData();
  formData.append('title', problemForm.title || '');
  formData.append('description', problemForm.description || '');
  formData.append('difficulty', problemForm.difficulty || 'Easy');
  formData.append('tags', problemForm.tags || '');
  formData.append('companyTags', problemForm.companyTags || '');
  formData.append('supportedLanguages', JSON.stringify(problemForm.supportedLanguages || []));
  formData.append('codeTemplates', JSON.stringify(problemForm.codeTemplates || {}));
  formData.append('referenceSolutions', JSON.stringify(problemForm.referenceSolutions || {}));
  formData.append('inputFormat', problemForm.inputFormat || '');
  formData.append('outputFormat', problemForm.outputFormat || '');
  formData.append('constraints', problemForm.constraints || '');
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
    formData.append('hiddenTestCases', JSON.stringify(problemForm.hiddenTestCases || []));
    (problemForm.hiddenTestFiles || []).forEach((file) => {
      formData.append('hiddenTestFiles', file);
    });
  }

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
  return status === 'Active'
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
  return COMPILER_LANGUAGES.find((language) => language.id === languageId)?.label || languageId;
}

export function getMonacoLanguage(languageId) {
  return COMPILER_LANGUAGES.find((language) => language.id === languageId)?.monacoLanguage || 'plaintext';
}

export function getJudge0LanguageId(languageId) {
  return COMPILER_LANGUAGES.find((language) => language.id === languageId)?.judge0LanguageId || null;
}



