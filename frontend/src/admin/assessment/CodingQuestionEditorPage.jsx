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

  return (
    <div className="min-h-screen bg-white pt-20 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Assessment Coding Question</p>
              <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-gray-100">Compiler-Grade Authoring</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Preview validation required before adding to assessment.</p>
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
