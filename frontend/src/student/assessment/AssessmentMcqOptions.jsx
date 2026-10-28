import { memo } from 'react';
import { CheckCircle2 } from 'lucide-react';

function AssessmentMcqOptions({ question, answer, sectionIndex, questionIndex, onChange, disabled = false }) {
  const isMultiple = Boolean(question?.allowMultipleAnswers);
  const selectedIndexes = isMultiple
    ? (Array.isArray(answer) ? answer : [])
    : (Number.isInteger(answer) ? [answer] : []);
  // onChange is a stable (sectionIndex, questionIndex, answer) callback so this
  // memoized list skips the page's unrelated re-renders.
  const commit = (nextAnswer) => onChange(sectionIndex, questionIndex, nextAnswer);

  return (
    <div className="mt-3 space-y-2">
      <p className="pb-1 text-xs font-medium text-slate-500 dark:text-gray-400">
        {isMultiple ? 'Select all answers that apply.' : 'Select one answer.'}
      </p>
      {(question?.options || []).map((option, index) => {
        const selected = selectedIndexes.includes(index);
        const optionLabel = String.fromCharCode(65 + index);
        const optionImage = question?.optionImages?.[index];
        return (
          <button
            type="button"
            key={`opt-${index}`}
            onClick={() => {
              if (!isMultiple) {
                commit(index);
                return;
              }
              const nextAnswer = selected
                ? selectedIndexes.filter((value) => value !== index)
                : [...selectedIndexes, index].sort((a, b) => a - b);
              commit(nextAnswer);
            }}
            disabled={disabled}
            className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors duration-150 ${
              selected
                ? 'border-cyan-400 bg-cyan-50 shadow-sm dark:border-sky-500 dark:bg-sky-900/20'
                : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/40 dark:border-gray-700 dark:bg-gray-900'
            }`}
          >
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-xs font-extrabold transition-colors ${isMultiple ? 'rounded-md' : 'rounded-full'} ${
              selected ? 'bg-cyan-600 text-white' : 'border border-slate-300 text-slate-500 dark:border-gray-600'
            }`}>
              {selected ? <CheckCircle2 className="h-4 w-4" /> : optionLabel}
            </span>
            <span className="min-w-0 flex-1">
              {optionImage?.url && (
                <span className="mb-2 flex h-48 items-center justify-center overflow-hidden rounded-lg bg-white dark:bg-gray-800">
                  <img src={optionImage.url} alt={optionImage.alt || ''} decoding="async" className="max-h-full max-w-full object-contain" />
                </span>
              )}
              <span className={`block whitespace-pre-wrap break-words text-[0.94rem] font-medium leading-relaxed [overflow-wrap:anywhere] ${selected ? 'text-sky-900 dark:text-sky-100' : 'text-slate-700 dark:text-gray-200'}`}>{option || (optionImage?.url ? 'Image option' : `Option ${optionLabel}`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default memo(AssessmentMcqOptions);
