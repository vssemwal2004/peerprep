import { RichTextPreview } from '../../compiler/CompilerContentPreview';

export default function AssessmentPreview({ assessment }) {
  if (!assessment) return null;
  const sections = assessment.sections || [];
  const settings = assessment.settings || {};

  const summary = (() => {
    const counts = { mcq: 0, coding: 0, short: 0, one_line: 0, total: 0 };
    let totalMarks = 0;
    sections.forEach((section) => {
      const sectionType = section?.type;
      (section.questions || []).forEach((q) => {
        const type = q?.type || sectionType;
        if (type && counts[type] !== undefined) counts[type] += 1;
        counts.total += 1;
        const points = Number(q?.points ?? section?.marksPerQuestion ?? 1) || 1;
        totalMarks += points;
      });
    });
    return { ...counts, totalMarks, sections: sections.length };
  })();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-gray-100">{assessment.title || 'Untitled Assessment'}</h2>
        <p className="text-sm text-slate-500 dark:text-gray-400">{assessment.description || 'No description provided.'}</p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">Total Sections</div>
            <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-gray-100">{summary.sections}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">Total Questions</div>
            <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-gray-100">{summary.total}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">MCQ</div>
            <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-gray-100">{summary.mcq}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">Coding</div>
            <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-gray-100">{summary.coding}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">Short</div>
            <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-gray-100">{summary.short}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">One Line</div>
            <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-gray-100">{summary.one_line}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 sm:col-span-2 lg:col-span-6">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">Estimated Total Marks</div>
            <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-gray-100">{summary.totalMarks}</div>
          </div>
        </div>

        {settings.questionSelectionEnabled && (
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900/50 dark:bg-sky-950/20">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-800 dark:text-white">Candidate question delivery</p><p className="mt-0.5 text-[10px] text-slate-500 dark:text-gray-400">Final rules configured independently for each question type.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-sky-700 shadow-sm dark:bg-gray-900 dark:text-sky-300">Choice enabled</span></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['mcq', 'MCQ'],
                ['coding', 'Coding'],
                ['one_line', 'One word'],
                ['short', 'Short answer'],
              ].filter(([type]) => summary[type] > 0).map(([type, label]) => {
                const shown = Math.min(summary[type], Number(settings.questionRequirements?.[type] ?? summary[type]));
                const required = Math.min(shown, Number(settings.questionAttemptRequirements?.[type] ?? shown));
                const mode = settings.questionDistributionModes?.[type] || settings.questionDistributionMode || 'random_per_student';
                return <div key={type} className="rounded-lg border border-sky-100 bg-white px-3 py-2 dark:border-sky-900/50 dark:bg-gray-900"><p className="text-[11px] font-bold text-slate-800 dark:text-white">{label}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-gray-400">{summary[type]} total · show {shown} · answer {required}</p><p className="mt-1 text-[9px] font-semibold text-sky-700 dark:text-sky-300">{mode === 'same_for_all' ? 'Same set for everyone' : 'Different set per student'}</p></div>;
              })}
            </div>
          </div>
        )}

        {assessment.instructions && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <RichTextPreview content={assessment.instructions} />
          </div>
        )}
        <button
          type="button"
          disabled
          className="mt-3 inline-flex w-fit items-center justify-center rounded-xl bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 dark:bg-gray-800 dark:text-gray-400"
        >
          Start Assessment (Preview Mode)
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {sections.map((section, sectionIndex) => {
          const questionCount = section.questions?.length || 0;
          const marksPerQuestion = section.marksPerQuestion || 0;
          const questionMarks = (section.questions || []).map((question) => Number(question?.points ?? question?.marks ?? marksPerQuestion) || 0);
          const sectionTotalMarks = questionMarks.reduce((total, marks) => total + marks, 0);
          const hasUniformMarks = questionMarks.length > 0 && questionMarks.every((marks) => marks === questionMarks[0]);
          return (
            <div key={`${section.sectionName}-${sectionIndex}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 font-semibold dark:bg-sky-900/30 dark:text-sky-400">
                    {sectionIndex + 1}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100">{section.sectionName || `Section ${sectionIndex + 1}`}</h3>
                    <p className="text-xs text-slate-500 dark:text-gray-400">{section.type?.toUpperCase()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 dark:text-gray-400">{questionCount} questions</div>
                  {hasUniformMarks && questionMarks[0] > 0 && (
                    <div className="text-xs font-semibold text-slate-700 dark:text-gray-200">{questionMarks[0]} marks each</div>
                  )}
                  {sectionTotalMarks > 0 && (
                    <div className="text-xs font-semibold text-slate-800 dark:text-gray-100">Total: {sectionTotalMarks}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
