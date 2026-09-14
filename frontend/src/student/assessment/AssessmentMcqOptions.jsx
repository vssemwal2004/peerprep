import { CheckCircle2 } from 'lucide-react';

export default function AssessmentMcqOptions({ question, answer, onChange, disabled = false }) {
  const isMultiple = Boolean(question?.allowMultipleAnswers);
  const selectedIndexes = isMultiple
    ? (Array.isArray(answer) ? answer : [])
    : (Number.isInteger(answer) ? [answer] : []);

  return (
    <div className="mt-3 space-y-2">
      <p className="pb-1 text-xs font-medium text-slate-500 dark:text-gray-400">
        {isMultiple ? 'Select all answers that apply.' : 'Select one answer.'}
      </p>
      {(question?.options || []).map((option, index) => {
        const selected = selectedIndexes.includes(index);
        const optionLabel = String.fromCharCode(65 + index);
        return (
          <button
            type="button"
            key={`opt-${index}`}
            onClick={() => {
              if (!isMultiple) {
                onChange(index);
                return;
              }
              const nextAnswer = selected
                ? selectedIndexes.filter((value) => value !== index)
                : [...selectedIndexes, index].sort((a, b) => a - b);
              onChange(nextAnswer);
            }}
            disabled={disabled}
            className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-all duration-150 ${
              selected
                ? 'border-cyan-400 bg-cyan-50 shadow-sm dark:border-sky-500 dark:bg-sky-900/20'
                : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/40 dark:border-gray-700 dark:bg-gray-900'
            }`}
          >
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-xs font-extrabold transition-all ${isMultiple ? 'rounded-md' : 'rounded-full'} ${
              selected ? 'bg-cyan-600 text-white' : 'border border-slate-300 text-slate-500 dark:border-gray-600'
            }`}>
              {selected ? <CheckCircle2 className="h-4 w-4" /> : optionLabel}
            </span>
            <span className="min-w-0 flex-1">
              {question?.optionImages?.[index]?.url && <img src={question.optionImages[index].url} alt={question.optionImages[index].alt || ''} className="mb-2 max-h-48 max-w-full rounded-lg bg-white object-contain dark:bg-gray-800" />}
              <span className={`block text-[0.94rem] font-medium leading-relaxed ${selected ? 'text-sky-900 dark:text-sky-100' : 'text-slate-700 dark:text-gray-200'}`}>{option || (question?.optionImages?.[index]?.url ? 'Image option' : `Option ${optionLabel}`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
