import { memo, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { RichTextPreview } from '../../admin/compiler/CompilerContentPreview';
import { getDisplayProblemStatement } from '../../admin/compiler/problemStatementFormatting';
import ProblemAssetImages from '../../components/ProblemAssetImages';
import AnviApproach, { AnviMark } from '../../components/AnviApproach';

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
    images: Array.isArray(testCase?.images) ? testCase.images : [],
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

function AssessmentCodingProblemPanel({ question, codingData = {}, language = '', marks = 0, sectionLabel = 'Coding' }) {
  const isSql = codingData.category === 'SQL';
  const examples = useMemo(() => normalizeVisibleExamples(codingData), [codingData]);
  const approaches = useMemo(() => (
    Array.isArray(codingData.hints)
      ? codingData.hints.filter((approach) => String(approach || '').trim()).slice(0, 10)
      : []
  ), [codingData.hints]);
  const [anviRequestKey, setAnviRequestKey] = useState(0);
  const faqs = useMemo(() => (
    Array.isArray(codingData.faqs)
      ? codingData.faqs.filter((faq) => String(faq?.question || '').trim() || String(faq?.answer || '').trim())
      : []
  ), [codingData.faqs]);
  const companyTags = useMemo(() => (
    Array.isArray(codingData.companyTags)
      ? [...new Set(codingData.companyTags.map((company) => String(company || '').trim()).filter(Boolean))]
      : []
  ), [codingData.companyTags]);
  const title = question?.questionText || codingData.title || (isSql ? 'SQL problem' : 'Coding problem');
  const description = codingData.description || codingData.statement || '';
  const constraints = String(codingData.constraints || '')
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
  const runnerLanguage = language || codingData.supportedLanguages?.[0] || '';
  const visibleRunner = codingData.studentRunnerTemplates?.[runnerLanguage] || '';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_12px_34px_rgba(15,23,42,0.05)] backdrop-blur-sm dark:bg-gray-900 dark:shadow-black/30">
      <div className="flex flex-none items-center justify-between gap-3 border-b border-slate-200/70 bg-white px-5 pt-3 dark:border-gray-800 dark:bg-gray-900">
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
            <h1 className="text-[24px] font-semibold leading-8 tracking-tight text-slate-950 dark:text-white">{title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
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
              {isSql ? <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">SQLite</span> : null}
            </div>
          </section>

          <section className="space-y-4">
            {description ? (
              <RichTextPreview content={getDisplayProblemStatement(description, examples.length > 0)} lead />
            ) : (
              <p className="text-sm text-slate-500 dark:text-gray-400">No problem statement was provided.</p>
            )}
            <ProblemAssetImages images={(codingData.contentImages || []).filter((image) => image.section !== 'constraints')} className="mt-4" />
          </section>

          {isSql ? <div className="space-y-5">
            {isSql && codingData.sqlConfig?.schemaSql ? <div><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Database schema</h3><pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 text-sky-100">{codingData.sqlConfig.schemaSql}</pre></div> : null}
            {isSql && codingData.sqlConfig?.seedDataSql ? <div><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Sample data</h3><pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 text-sky-100">{codingData.sqlConfig.seedDataSql}</pre></div> : null}
            <DetailBlock title="Schema notes">{codingData.inputFormat}</DetailBlock>
            <DetailBlock title="Required result">{codingData.outputFormat}</DetailBlock>
          </div> : null}

          {visibleRunner ? <details className="group overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-800 dark:text-gray-100">
              Execution runner ({runnerLanguage})
              <span className="text-xs font-normal text-slate-400">Read-only</span>
            </summary>
            <pre className="max-h-72 overflow-auto border-t border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 dark:border-gray-700">{visibleRunner}</pre>
          </details> : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100">Examples</h2>
              <span className="text-xs text-slate-400">{examples.length} visible</span>
            </div>
            {examples.length ? (
              <div className="space-y-5">
                {examples.map((example, index) => (
                  <article key={example.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-gray-700 dark:bg-gray-900">
                    <div className="text-base font-semibold text-slate-900 dark:text-gray-100">Example {index + 1}:</div>
                    {example.images.length ? <ProblemAssetImages images={example.images} /> : null}
                    <div className="space-y-3 rounded-lg bg-slate-50 px-4 py-3.5 font-mono text-[13px] leading-6 text-slate-800 dark:bg-gray-800 dark:text-gray-200">
                      <div>
                        <div className="font-sans text-sm font-semibold text-slate-900 dark:text-gray-100">{isSql ? 'Additional dataset SQL:' : 'Input:'}</div>
                        <pre className="mt-1 whitespace-pre-wrap break-words font-mono">{example.input || (isSql ? 'Uses shared sample data' : '(empty)')}</pre>
                      </div>
                      <div>
                        <div className="font-sans text-sm font-semibold text-slate-900 dark:text-gray-100">{isSql ? 'Expected result:' : 'Output:'}</div>
                        <pre className="mt-1 whitespace-pre-wrap break-words font-mono">{example.output || '(empty)'}</pre>
                      </div>
                    </div>
                    {example.explanation ? <div className="border-t border-slate-100 pt-3 text-[15px] leading-6 text-slate-800 dark:border-gray-800 dark:text-gray-200"><span className="font-semibold text-slate-950 dark:text-white">Explanation: </span><RichTextPreview className="mt-1" content={example.explanation} /></div> : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:bg-gray-800/70 dark:text-gray-400">No visible sample cases are available.</div>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-gray-700 dark:bg-gray-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100">{isSql ? 'Query rules' : 'Constraints'}</h2>
            {constraints.length ? <ul className="list-disc space-y-2 pl-6 font-mono text-[13px] leading-6 text-slate-800 marker:text-slate-600 dark:text-gray-200 dark:marker:text-gray-400">{constraints.map((constraint, index) => <li key={`${constraint}-${index}`} className="break-words pl-1">{constraint}</li>)}</ul> : <p className="text-sm text-slate-500 dark:text-gray-400">No additional constraints.</p>}
            <ProblemAssetImages images={(codingData.contentImages || []).filter((image) => image.section === 'constraints')} />
          </section>

          <section className="space-y-3">
            <button type="button" onClick={() => setAnviRequestKey((current) => current + 1)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3 text-left text-violet-800 transition hover:border-violet-300 hover:shadow-md dark:border-violet-800 dark:from-violet-950/40 dark:to-fuchsia-950/30 dark:text-violet-100">
              <span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0b0714]"><AnviMark tone="dark" className="h-9 w-9" /></span><span><span className="block text-sm font-semibold">Ask AnvI</span><span className="mt-0.5 block text-xs font-normal opacity-70">Get one focused approach for this problem.</span></span></span>
              <span className="text-xs font-semibold">Explore →</span>
            </button>
            {anviRequestKey > 0 ? <AnviApproach approaches={approaches} requestKey={anviRequestKey} onRequest={() => setAnviRequestKey((current) => current + 1)} /> : null}
          </section>

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

          {companyTags.length ? (
            <details className="group overflow-hidden rounded-[20px] border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-slate-800 dark:text-gray-100">
                Company tags
                <span className="flex items-center gap-2 text-xs font-normal text-slate-400">
                  {companyTags.length}
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-4 dark:border-gray-800">
                {companyTags.map((company) => (
                  <span key={company} className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/20 dark:text-violet-200">
                    {company}
                  </span>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default memo(AssessmentCodingProblemPanel);
