import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Code2 } from 'lucide-react';
import CreateProblem from '../compiler/CreateProblem';

export default function CodingQuestionEditorPage() {
  const { tempId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const assessmentKey = params.get('assessment') || 'new';
  const sectionIndex = Number(params.get('section') || 0);
  const questionIndex = Number(params.get('question') || 0);
  const returnTo = params.get('return') || '/admin/assessment';
  const requestExit = () => {
    const event = new CustomEvent('peerprep:request-authoring-exit', {
      cancelable: true,
      detail: { target: returnTo },
    });
    if (document.dispatchEvent(event)) navigate(returnTo);
  };

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-gray-950">
      <div className="mx-auto max-w-[1180px] px-3 py-3 sm:px-5">
        <div className="mb-3 flex items-center gap-3 border-b border-slate-200 pb-3 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={requestExit}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white"><Code2 className="h-4 w-4" /></div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Assessment / Coding question</p>
              <h1 className="text-base font-semibold text-slate-900 dark:text-gray-100">Create coding question</h1>
            </div>
          </div>
        </div>

        <CreateProblem
          mode="assessment"
          assessmentContext={{
            tempId,
            assessmentKey,
            sectionIndex,
            questionIndex,
            returnTo,
          }}
        />
      </div>
    </div>
  );
}
