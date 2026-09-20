import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CalendarClock, CheckCircle2, ClipboardList } from 'lucide-react';
import AssessmentModuleLayout from './assessment-dashboard/AssessmentModuleLayout';
import AssessmentCard from './assessment-dashboard/AssessmentCard';
import AssessmentLaunchModal from './assessment-dashboard/AssessmentLaunchModal';
import { useStudentAssessmentDashboardData } from './assessment-dashboard/useStudentAssessmentDashboardData';
import { api } from '../utils/api';

function EmptyState({ text }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-7 text-center text-xs text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
      {text}
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h2><span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-gray-800">{count}</span></div>
      {children}
    </section>
  );
}

export default function StudentAssessmentList() {
  const navigate = useNavigate();
  const { dashboard, loading, error } = useStudentAssessmentDashboardData();
  const [launchAssessment, setLaunchAssessment] = useState(null);

  return (
    <AssessmentModuleLayout title="Your Assessments">
      {loading ? (
        <div className="space-y-4">
          <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900" />
          <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-white px-6 py-10 text-sm text-rose-600 dark:border-rose-900/60 dark:bg-gray-900 dark:text-rose-300">{error}</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { label: 'Live now', value: dashboard.overview?.liveCount ?? dashboard.ongoingAssessments?.length ?? 0, Icon: ClipboardList, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' },
              { label: 'Upcoming', value: dashboard.overview?.upcomingCount ?? dashboard.upcomingAssessments?.length ?? 0, Icon: CalendarClock, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300' },
              { label: 'Completed', value: dashboard.overview?.historyCount ?? dashboard.completedAssessments?.length ?? 0, Icon: CheckCircle2, tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300' },
              { label: 'Average score', value: dashboard.overview?.reportsCount ? `${Math.round(Number(dashboard.overview?.averageScore || 0))}%` : 'Not available', Icon: BarChart3, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300' },
            ].map(({ label, value, Icon, tone }) => <div key={label} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900"><span className={`flex h-8 w-8 items-center justify-center rounded-md ${tone}`}><Icon className="h-4 w-4" /></span><span><b className="block text-lg font-semibold text-slate-950 dark:text-white">{value}</b><span className="text-[10px] font-medium text-slate-500">{label}</span></span></div>)}
          </div>

          <Section title="Ongoing" count={dashboard.ongoingAssessments?.length || 0}>
            {dashboard.ongoingAssessments?.length ? (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {dashboard.ongoingAssessments.map((assessment) => (
                  <AssessmentCard key={assessment._id} assessment={assessment} onLaunch={setLaunchAssessment} />
                ))}
              </div>
            ) : (
              <EmptyState text="No ongoing assessments." />
            )}
          </Section>

          <Section title="Upcoming" count={dashboard.upcomingAssessments?.length || 0}>
            {dashboard.upcomingAssessments?.length ? (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {dashboard.upcomingAssessments.map((assessment) => (
                  <AssessmentCard key={assessment._id} assessment={assessment} onLaunch={setLaunchAssessment} />
                ))}
              </div>
            ) : (
              <EmptyState text="No upcoming assessments." />
            )}
          </Section>

          {dashboard.completedAssessments?.length ? (
            <Section title="Completed" count={dashboard.completedAssessments.length}>
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {dashboard.completedAssessments.map((assessment) => (
                  <AssessmentCard
                    key={assessment._id}
                    assessment={assessment}
                    onLaunch={setLaunchAssessment}
                    onFeedback={(completedAssessment) => navigate(`/student/assessment/${completedAssessment._id}/feedback`)}
                  />
                ))}
              </div>
            </Section>
          ) : null}

        </div>
      )}

      <AssessmentLaunchModal
        assessment={launchAssessment}
        open={Boolean(launchAssessment)}
        onClose={() => setLaunchAssessment(null)}
        onUnlock={async (password) => {
          if (!launchAssessment) return;
          await api.startStudentAssessment(launchAssessment._id, password);
        }}
        onStart={() => {
          if (!launchAssessment) return;
          const assessmentId = launchAssessment._id;
          setLaunchAssessment(null);
          navigate(`/student/assessment/${assessmentId}`);
        }}
      />
    </AssessmentModuleLayout>
  );
}
