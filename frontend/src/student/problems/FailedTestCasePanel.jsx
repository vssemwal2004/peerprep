import { CircleX, Info } from 'lucide-react';

const VERDICTS = {
  WA: { title: 'Wrong Answer', hint: 'Your output did not match the expected output for this input.' },
  RE: { title: 'Runtime Error', hint: 'Your program crashed while running this input.' },
  TLE: { title: 'Time Limit Exceeded', hint: 'Your program did not finish within the time limit for this input.' },
};

function Block({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-slate-200 bg-white text-slate-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100',
    danger: 'border-rose-200 bg-rose-50/60 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100',
    success: 'border-emerald-200 bg-emerald-50/50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100',
  };
  return <div className="min-w-0">
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">{label}</div>
    <pre className={`max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl border px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed ${tones[tone]}`}>{value === '' ? <span className="italic opacity-60">(empty)</span> : value}</pre>
  </div>;
}

/**
 * The single judge case a practice submit failed on. Judging stops at that case, so later cases were not run;
 * the student sees exactly one input to debug with, plus the expected and actual output.
 */
export default function FailedTestCasePanel({ submission, stderr = '' }) {
  const status = String(submission?.status || '').toUpperCase();
  const verdict = VERDICTS[status];
  const failed = submission?.failedCase;
  if (!verdict) return null;

  const index = Number(failed?.index || 0);
  const total = Number(submission.totalTestCases || 0);
  const passed = Number(submission.passedTestCases || 0);
  const hasInput = failed && typeof failed.input === 'string';
  // Older submissions ran every case; only ones that stopped early have fewer results than cases.
  const ran = Array.isArray(submission.testCaseResults) ? submission.testCaseResults.length : 0;
  const skipped = ran > 0 && total > ran ? total - ran : 0;

  return <section aria-label="Failed test case" className="overflow-hidden rounded-[24px] border border-rose-200 bg-white shadow-[0_12px_24px_rgba(244,63,94,0.06)] dark:border-rose-900/60 dark:bg-gray-900/80">
    <header className="flex items-start gap-3 border-b border-rose-100 bg-rose-50 px-5 py-4 dark:border-rose-900/50 dark:bg-rose-950/30">
      <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
          {index > 0 ? `${verdict.title} on test case ${index}${total ? ` of ${total}` : ''}` : verdict.title}
        </p>
        <p className="mt-0.5 text-[12.5px] text-rose-700/90 dark:text-rose-200/80">{verdict.hint}</p>
      </div>
      {total > 0 && <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-800">{passed} / {total} passed</span>}
    </header>

    <div className="space-y-3.5 px-5 py-4">
      {hasInput ? <>
        <Block label="Input" value={failed.input} />
        <div className="grid gap-3.5 md:grid-cols-2">
          <Block label="Expected output" value={failed.expectedOutput ?? ''} tone="success" />
          <Block label="Your output" value={failed.actualOutput ?? ''} tone="danger" />
        </div>
        {status === 'RE' && stderr && <Block label="Error" value={stderr} tone="danger" />}
        {failed.truncated && <p className="text-[12px] text-slate-500 dark:text-gray-400">This test case is large; only the first part is shown.</p>}
      </> : <p className="text-[13px] text-slate-600 dark:text-gray-300">{submission.fromAssessment
        ? 'This was submitted in an assessment, so test case details are not shown.'
        : 'The details of this test case are not shown for this submission.'}</p>}

      {skipped > 0 && <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12.5px] text-slate-600 dark:bg-gray-800/70 dark:text-gray-300">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Judging stopped at this case, so the remaining {skipped} test case{skipped === 1 ? ' was' : 's were'} not run. Fix this one and submit again.
      </p>}
    </div>
  </section>;
}
