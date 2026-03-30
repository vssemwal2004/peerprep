import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileCode2 } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import AdminCodeEditor from './AdminCodeEditor';
import { ProblemStatementPreview } from './CompilerContentPreview';
import { formatPercent } from './compilerUtils';
import { DifficultyBadge, LoadingPanel, ProblemStatusBadge, SectionCard, StatCard } from './CompilerUi';

export default function ProblemDetail() {
  const navigate = useNavigate();
  const toast = useToast();
  const { problemId } = useParams();
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadProblem = async () => {
      try {
        setLoading(true);
        const response = await api.getCompilerProblem(problemId);
        if (isMounted) {
          setProblem(response);
        }
      } catch (error) {
        toast.error(error.message || 'Failed to load problem details.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadProblem();
    return () => {
      isMounted = false;
    };
  }, [problemId, toast]);

  if (loading) {
    return <LoadingPanel label="Loading problem workspace..." />;
  }

  if (!problem) {
    return null;
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title={problem.title}
        subtitle="Review the authored statement and run admin-only validation flows from the embedded compiler."
        action={(
          <button
            type="button"
            onClick={() => navigate('/admin/compiler/problems')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Problems
          </button>
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={problem.difficulty} />
          <ProblemStatusBadge status={problem.status} />
          {(problem.tags || []).map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-gray-800 dark:text-gray-300">{tag}</span>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Acceptance Rate" value={formatPercent(problem.acceptanceRate)} helper="Accepted submissions" Icon={FileCode2} />
        <StatCard label="Total Submissions" value={problem.totalSubmissions || 0} helper="Judge submissions" />
        <StatCard label="Hidden Cases" value={problem.hiddenTestCaseCount || 0} helper="Private evaluator pairs" />
        <StatCard label="Supported Languages" value={problem.supportedLanguages.length} helper={problem.supportedLanguages.join(', ')} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ProblemStatementPreview problem={problem} />
        <AdminCodeEditor problem={problem} />
      </div>
    </div>
  );
}
