import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AssessmentModuleLayout from './assessment-dashboard/AssessmentModuleLayout';
import AssessmentCard from './assessment-dashboard/AssessmentCard';
import AssessmentLaunchModal from './assessment-dashboard/AssessmentLaunchModal';
import { useStudentAssessmentDashboardData } from './assessment-dashboard/useStudentAssessmentDashboardData';

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
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
          <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-white px-6 py-10 text-sm text-rose-600">{error}</div>
      ) : (
        <div className="space-y-8">
          <Section title="Ongoing Assessments">
            {dashboard.ongoingAssessments?.length ? (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {dashboard.ongoingAssessments.map((assessment) => (
                  <AssessmentCard key={assessment._id} assessment={assessment} onLaunch={setLaunchAssessment} />
                ))}
              </div>
            ) : (
              <EmptyState text="No ongoing assessments." />
            )}
          </Section>

          <Section title="Upcoming Assessments">
            {dashboard.upcomingAssessments?.length ? (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {dashboard.upcomingAssessments.map((assessment) => (
                  <AssessmentCard key={assessment._id} assessment={assessment} onLaunch={setLaunchAssessment} />
                ))}
              </div>
            ) : (
              <EmptyState text="No upcoming assessments." />
            )}
          </Section>
        </div>
      )}

      <AssessmentLaunchModal
        assessment={launchAssessment}
        open={Boolean(launchAssessment)}
        onClose={() => setLaunchAssessment(null)}
        onConfirm={() => {
          if (!launchAssessment) return;
          navigate(`/student/assessment/${launchAssessment._id}${launchAssessment.hasSubmissionInProgress ? '' : '?start=1'}`);
        }}
      />
    </AssessmentModuleLayout>
  );
}
