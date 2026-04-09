import AssessmentModuleLayout from './assessment-dashboard/AssessmentModuleLayout';
import AssessmentLeaderboard from './assessment-dashboard/AssessmentLeaderboard';
import { useStudentAssessmentDashboardData } from './assessment-dashboard/useStudentAssessmentDashboardData';

export default function AssessmentRanksPage() {
  const { dashboard, loading, error } = useStudentAssessmentDashboardData();

  return (
    <AssessmentModuleLayout title="Ranks">
      {loading ? (
        <div className="h-[720px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-white px-6 py-10 text-sm text-rose-600">{error}</div>
      ) : (
        <AssessmentLeaderboard entries={dashboard.leaderboard || []} />
      )}
    </AssessmentModuleLayout>
  );
}
