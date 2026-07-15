import { memo, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { RichTextPreview } from '../../admin/compiler/CompilerContentPreview';

function normalizeVisibleExamples(codingData = {}) {
  const source = Array.isArray(codingData.sampleTestCases) && codingData.sampleTestCases.length
    ? codingData.sampleTestCases
    : (Array.isArray(codingData.examples) && codingData.examples.length
      ? codingData.examples
      : (Array.isArray(codingData.testCases)
        ? codingData.testCases.filter((testCase) => testCase?.hidden !== true)
        : []));

  const visibleSource = source.length
    ? source
    : ((codingData.sampleInput !== undefined || codingData.sampleOutput !== undefined)
      ? [{ input: codingData.sampleInput, output: codingData.sampleOutput, explanation: codingData.sampleExplanation }]
      : []);

  return visibleSource.map((testCase, index) => ({
    id: testCase?.id || `example-${index + 1}`,
    input: testCase?.input ?? '',
    output: testCase?.output ?? testCase?.expectedOutput ?? '',
    explanation: testCase?.explanation ?? '',
  }));
}

function DetailBlock({ title, children }) {
  if (!String(children ?? '').trim()) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">{title}</h3>
      <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-300">{children}</div>
    </section>
  );
}

function AssessmentCodingProblemPanel({ question, codingData = {}, marks = 0, sectionLabel = 'Coding' }) {
  const examples = useMemo(() => normalizeVisibleExamples(codingData), [codingData]);
  const hints = useMemo(() => (
    Array.isArray(codingData.hints)
      ? codingData.hints.filter((hint) => String(hint || '').trim())
      : []
  ), [codingData.hints]);
  const faqs = useMemo(() => (
    Array.isArray(codingData.faqs)
      ? codingData.faqs.filter((faq) => String(faq?.question || '').trim() || String(faq?.answer || '').trim())
      : []
  ), [codingData.faqs]);
  const title = question?.questionText || codingData.title || 'Coding problem';
  const description = codingData.description || codingData.statement || '';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] bg-white/92 shadow-[0_12px_34px_rgba(15,23,42,0.05)] backdrop-blur-sm dark:bg-gray-900/92">
      <div className="flex flex-none items-center justify-between gap-3 border-b border-slate-200/70 bg-white/94 px-5 pt-3 dark:border-gray-800 dark:bg-gray-900/94">
        <div className="border-b-2 border-sky-600 pb-3 text-sm font-semibold text-slate-900 dark:border-sky-500 dark:text-gray-100">
          Description
        </div>
        <div className="pb-3 text-[11px] font-semibold text-slate-400">
          {sectionLabel} &middot; {marks} {Number(marks) === 1 ? 'mark' : 'marks'}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="space-y-6">
          <section>
            <div className="flex flex-wrap items-center gap-2">
              {codingData.difficulty ? (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                  {codingData.difficulty}
                </span>
              ) : null}
              {codingData.timeLimitSeconds ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                  {codingData.timeLimitSeconds}s limit
                </span>
              ) : null}
              {codingData.memoryLimitMb ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                  {codingData.memoryLimitMb} MB
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 text-xl font-bold leading-8 text-slate-900 dark:text-gray-100">{title}</h1>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Problem statement</h2>
            {description ? (
              <RichTextPreview content={description} />
            ) : (
              <p className="text-sm text-slate-500 dark:text-gray-400">No problem statement was provided.</p>
            )}
          </section>

          <div className="space-y-5 border-t border-slate-100 pt-5 dark:border-gray-800">
            <DetailBlock title="Input">{codingData.inputFormat}</DetailBlock>
            <DetailBlock title="Output">{codingData.outputFormat}</DetailBlock>
            <DetailBlock title="Constraints">{codingData.constraints}</DetailBlock>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Examples</h2>
              <span className="text-xs text-slate-400">{examples.length} visible</span>
            </div>
            {examples.length ? (
              <div className="space-y-4">
                {examples.map((example, index) => (
                  <article key={example.id} className="overflow-hidden rounded-[20px] border border-slate-200/70 bg-white dark:border-gray-700 dark:bg-gray-900">
                    <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                      Example {index + 1}
                    </div>
                    <div className="grid gap-3 p-4 sm:grid-cols-2">
                      <div>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Input</div>
                        <pre className="min-h-12 whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-800 dark:bg-gray-800 dark:text-gray-200">{example.input || '(empty)'}</pre>
                      </div>
                      <div>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Output</div>
                        <pre className="min-h-12 whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-800 dark:bg-gray-800 dark:text-gray-200">{example.output || '(empty)'}</pre>
                      </div>
                      {example.explanation ? (
                        <div className="sm:col-span-2">
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Explanation</div>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-300">{example.explanation}</p>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:bg-gray-800/70 dark:text-gray-400">No visible sample cases are available.</div>
            )}
          </section>

          {hints.length ? (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Hints</h2>
              {hints.map((hint, index) => (
                <details key={`hint-${index + 1}`} className="group rounded-[18px] border border-sky-100 bg-sky-50/60 px-4 py-3 dark:border-sky-900/40 dark:bg-sky-900/10">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-sky-800 dark:text-sky-200">
                    Hint {index + 1}
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-300">{hint}</p>
                </details>
              ))}
            </section>
          ) : null}

          {faqs.length ? (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Notes &amp; FAQ</h2>
              <div className="divide-y divide-slate-200/70 overflow-hidden rounded-[20px] bg-slate-50/70 dark:divide-gray-700 dark:bg-gray-800/60">
                {faqs.map((faq, index) => (
                  <details key={`faq-${index + 1}`} className="group px-4 py-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-800 dark:text-gray-100">
                      {faq.question || `Note ${index + 1}`}
                      <ChevronDown className="h-4 w-4 flex-none text-slate-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-300">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default memo(AssessmentCodingProblemPanel);
