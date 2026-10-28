import { difficultyTheme } from '../../utils/difficultyTheme';
import { memo, useMemo } from 'react';
import { RichTextPreview } from '../../admin/compiler/CompilerContentPreview';
import { getDisplayProblemStatement } from '../../admin/compiler/problemStatementFormatting';
import ProblemAssetImages from '../../components/ProblemAssetImages';

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

function AssessmentCodingProblemPanel({ question, codingData = {}, marks = 0, sectionLabel = 'Coding', watermark = null }) {
  const isSql = codingData.category === 'SQL';
  const examples = useMemo(() => normalizeVisibleExamples(codingData), [codingData]);
  const title = question?.questionText || codingData.title || (isSql ? 'SQL problem' : 'Coding problem');
  const description = codingData.description || codingData.statement || '';
  const constraints = String(codingData.constraints || '')
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-[#282828]">
      <div className="flex h-11 flex-none items-end justify-between gap-3 border-b border-zinc-200 bg-white px-5 dark:border-zinc-700 dark:bg-[#282828]">
        <div className="border-b-2 border-zinc-900 pb-2.5 text-sm font-semibold text-zinc-900 dark:border-white dark:text-white">
          Description
        </div>
        <div className="pb-2.5 text-[11px] font-semibold text-slate-400">
          {sectionLabel} &middot; {marks} {Number(marks) === 1 ? 'mark' : 'marks'}
        </div>
      </div>

      <div data-problem-scroll className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="space-y-6">
          <section>
            <h1 className="text-[24px] font-semibold leading-8 tracking-tight text-slate-950 dark:text-white">{title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {codingData.difficulty ? (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${difficultyTheme(codingData.difficulty).pill}`}>
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
            <ProblemAssetImages images={(codingData.contentImages || []).filter((image) => image.section !== 'constraints')} className="mt-4" label="Problem" secure lightboxOverlay={watermark} />
          </section>

          {isSql ? <div className="space-y-5">
            {isSql && codingData.sqlConfig?.schemaSql ? <div><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Database schema</h3><pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 text-sky-100">{codingData.sqlConfig.schemaSql}</pre></div> : null}
            {isSql && codingData.sqlConfig?.seedDataSql ? <div><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Sample data</h3><pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 text-sky-100">{codingData.sqlConfig.seedDataSql}</pre></div> : null}
            <DetailBlock title="Schema notes">{codingData.inputFormat}</DetailBlock>
            <DetailBlock title="Required result">{codingData.outputFormat}</DetailBlock>
          </div> : null}

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
                    {example.images.length ? <ProblemAssetImages images={example.images} variant="sample" label={`Example ${index + 1}`} secure lightboxOverlay={watermark} /> : null}
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
            <ProblemAssetImages images={(codingData.contentImages || []).filter((image) => image.section === 'constraints')} label="Problem" secure lightboxOverlay={watermark} />
          </section>

        </div>
      </div>
    </div>
  );
}

export default memo(AssessmentCodingProblemPanel);
