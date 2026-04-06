import { RichTextPreview } from '../../compiler/CompilerContentPreview';

export default function AssessmentPreview({ assessment }) {
  if (!assessment) return null;
  const sections = assessment.sections || [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-gray-100">{assessment.title || 'Untitled Assessment'}</h2>
        <p className="text-sm text-slate-500 dark:text-gray-400">{assessment.description || 'No description provided.'}</p>
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

      <div className="mt-6 space-y-4">
        {sections.map((section, sectionIndex) => (
          <div key={`${section.sectionName}-${sectionIndex}`} className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100">{section.sectionName || `Section ${sectionIndex + 1}`}</h3>
                <p className="text-xs text-slate-500 dark:text-gray-400">{section.type?.toUpperCase()}</p>
              </div>
              <span className="text-xs text-slate-500 dark:text-gray-400">{section.questions?.length || 0} questions</span>
            </div>

            <div className="mt-4 space-y-3">
              {(section.questions || []).map((question, qIndex) => (
                <div key={`q-${sectionIndex}-${qIndex}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <div className="text-xs font-semibold text-slate-500 dark:text-gray-400">Question {qIndex + 1}</div>
                  <div className="mt-2 text-slate-800 dark:text-gray-100">{question.questionText || question?.problemDataSnapshot?.title || question?.coding?.title || 'Question'}</div>

                  {section.type === 'mcq' && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {(question.options || []).map((opt, idx) => (
                        <div key={`opt-${idx}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                          {opt || `Option ${idx + 1}`}
                        </div>
                      ))}
                    </div>
                  )}

                  {(section.type === 'short' || section.type === 'one_line') && (
                    <div className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-400 dark:border-gray-600">
                      Student response goes here
                    </div>
                  )}

                  {section.type === 'coding' && (
                    <div className="mt-3 space-y-2 text-xs text-slate-500 dark:text-gray-400">
                      {(() => {
                        const codingData = question.problemDataSnapshot || question.problemData || question.coding?.problemData || question.coding || {};
                        return (
                          <>
                      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                        <div className="font-semibold text-slate-700 dark:text-gray-200">Problem Preview</div>
                        <div className="mt-1">{codingData.description ? <RichTextPreview content={codingData.description} /> : 'Problem description will appear here.'}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                        Code editor area
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
