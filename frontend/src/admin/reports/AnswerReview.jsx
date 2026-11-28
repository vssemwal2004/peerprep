import { Check, Lightbulb, X } from 'lucide-react';
import { indexList, optionState } from './answerReviewState';

// How a question was answered, for the admin report. MCQ: every option, the official answer in
// green, the student's pick in deep green when it is right and red when it is wrong. Written answers:
// the student's text beside the expected answer.

const letter = (index) => String.fromCharCode(65 + index);

const LOOKS = {
  hit: {
    row: 'border-emerald-600 bg-emerald-100 ring-2 ring-emerald-500/30 dark:border-emerald-500 dark:bg-emerald-500/25 dark:ring-emerald-400/30',
    badge: 'bg-emerald-600 text-white',
    text: 'font-semibold text-emerald-950 dark:text-emerald-50',
  },
  key: {
    row: 'border-emerald-300 bg-emerald-50 dark:border-emerald-700/70 dark:bg-emerald-500/10',
    badge: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/40',
    text: 'font-medium text-emerald-900 dark:text-emerald-100',
  },
  miss: {
    row: 'border-rose-400 bg-rose-50 ring-2 ring-rose-400/25 dark:border-rose-500/70 dark:bg-rose-500/15 dark:ring-rose-400/25',
    badge: 'bg-rose-600 text-white',
    text: 'font-semibold text-rose-900 dark:text-rose-100',
  },
  plain: {
    row: 'border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900',
    badge: 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300',
    text: 'text-slate-700 dark:text-gray-200',
  },
};

function Tag({ tone, children }) {
  const tones = {
    green: 'bg-emerald-600 text-white',
    softGreen: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
    red: 'bg-rose-600 text-white',
  };
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${tones[tone]}`}>{children}</span>;
}

function McqReview({ question, owner }) {
  const options = question.options || [];
  const chosen = indexList(question.selectedOptionIndexes, question.selectedOptionIndex);
  const correct = indexList(question.correctOptionIndexes, question.correctOptionIndex);
  const showsKey = correct.length > 0;
  const names = (list) => list.map(letter).join(', ');
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-gray-800">
      <span className="text-slate-500 dark:text-gray-400">{owner.label}: <b className={chosen.length ? (showsKey && chosen.every((index) => correct.includes(index)) && chosen.length === correct.length ? 'text-emerald-700 dark:text-emerald-300' : showsKey ? 'text-rose-700 dark:text-rose-300' : question.isCorrect ? 'text-emerald-700 dark:text-emerald-300' : question.isCorrect === false && question.status !== 'partial' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-white') : 'text-slate-500 dark:text-gray-400'}>{chosen.length ? names(chosen) : 'Not answered'}</b></span>
      {showsKey && <span className="text-slate-500 dark:text-gray-400">Correct answer: <b className="text-emerald-700 dark:text-emerald-300">{names(correct)}</b></span>}
      {question.allowMultipleAnswers && <span className="text-slate-400 dark:text-gray-500">More than one answer</span>}
    </div>
    <ol className="space-y-2" aria-label="Options">
      {options.map((option, index) => {
        // Without the answer key (a student before answers are released), the pick is coloured by
        // the question's own result, so a right pick is never shown red.
        const state = showsKey ? optionState(index, correct, chosen)
          : chosen.includes(index) ? (question.isCorrect ? 'hit' : question.status === 'partial' ? 'plain' : 'miss') : 'plain';
        const look = LOOKS[state];
        return <li key={index} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${look.row}`}
          aria-label={`Option ${letter(index)}: ${option}${correct.includes(index) ? ', correct answer' : ''}${chosen.includes(index) ? `, chosen by ${owner.who}` : ''}`}>
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${look.badge}`}>
            {state === 'hit' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : state === 'miss' ? <X className="h-3.5 w-3.5" strokeWidth={3} /> : letter(index)}
          </span>
          <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words pt-0.5 text-sm leading-5 ${look.text}`}>{option}</span>
          <span className="flex shrink-0 flex-wrap justify-end gap-1 pt-0.5">
            {state === 'hit' && <Tag tone="green"><Check className="h-3 w-3" strokeWidth={3} />Correct · {owner.label}</Tag>}
            {state === 'key' && <Tag tone="softGreen">Correct answer</Tag>}
            {state === 'miss' && <Tag tone="red"><X className="h-3 w-3" strokeWidth={3} />{owner.label}</Tag>}
          </span>
        </li>;
      })}
    </ol>
    {!chosen.length && <p className="text-xs text-slate-500 dark:text-gray-400">{owner.skipped}{showsKey ? '; the correct answer is shown in green' : ''}.</p>}
  </div>;
}

function WrittenReview({ question, owner }) {
  const raw = question.studentAnswer;
  const answer = raw === undefined || raw === null || raw === '' ? '' : typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
  const expected = typeof question.correctAnswer === 'string' ? question.correctAnswer : '';
  const tone = question.isCorrect ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-500/15'
    : question.isSkipped || question.status === 'pending' ? 'border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800'
      : 'border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-500/15';
  return <div className={`grid gap-3 ${expected ? 'sm:grid-cols-2' : ''}`}>
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-400">{owner.label}</div>
      <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm text-slate-800 dark:text-gray-100">{answer || 'No answer submitted'}</pre>
    </div>
    {expected && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700/70 dark:bg-emerald-500/10">
      <div className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">Correct answer</div>
      <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm text-emerald-900 dark:text-emerald-100">{expected}</pre>
    </div>}
  </div>;
}

// `you`: the student is reading their own result ("Your answer" instead of "Student's answer").
const OWNERS = {
  admin: { label: "Student's answer", who: 'the student', skipped: 'The student did not answer this question' },
  you: { label: 'Your answer', who: 'you', skipped: 'You did not answer this question' },
};

export default function AnswerReview({ question, you = false }) {
  const owner = you ? OWNERS.you : OWNERS.admin;
  const isMcq = (question.type || 'mcq') === 'mcq' && (question.options || []).length > 0;
  return <div className="space-y-3">
    {isMcq ? <McqReview question={question} owner={owner} /> : <WrittenReview question={question} owner={owner} />}
    {question.explanation && <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-100">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
      <div><span className="font-semibold">Explanation: </span><span className="whitespace-pre-wrap">{typeof question.explanation === 'string' ? question.explanation : JSON.stringify(question.explanation)}</span></div>
    </div>}
  </div>;
}
