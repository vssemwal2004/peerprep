import { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import { Activity, ClipboardList, Users, CalendarDays, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

function StatCard({ label, value, Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-gray-100">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-gray-800 dark:text-sky-400">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function AdminOverview() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    students: 0,
    interviews: 0,
    activeUsers: 0,
    assessments: 0,
  });
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        const [studentsRes, eventsRes, assessmentsRes, activityStats, activityRes] = await Promise.all([
          api.listAllStudents(),
          api.listEvents(),
          api.listAssessments(),
          api.getActivityStats(),
          api.getActivities('limit=6'),
        ]);

        if (!isMounted) return;

        const totalStudents = studentsRes?.count || studentsRes?.students?.length || 0;
        const totalInterviews = eventsRes?.events?.length || eventsRes?.length || 0;
        const totalAssessments = assessmentsRes?.assessments?.length || assessmentsRes?.length || 0;
        const activeUsers = activityStats?.todayActivities || 0;

        setStats({
          students: totalStudents,
          interviews: totalInterviews,
          activeUsers,
          assessments: totalAssessments,
        });

        setActivities(activityRes?.activities || []);
      } catch {
        // Keep UI resilient
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const activityItems = useMemo(() => {
    if (!activities.length) return [];
    return activities.slice(0, 6).map((entry) => ({
      id: entry._id,
      label: entry.description || `${entry.actionType} ${entry.targetType}`,
      time: entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '',
    }));
  }, [activities]);

  return (
    <div className="min-h-screen bg-white pt-20 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Overview</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">A quick snapshot of platform health and recent activity.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Students" value={loading ? '�' : stats.students} Icon={Users} />
          <StatCard label="Total Interviews" value={loading ? '�' : stats.interviews} Icon={CalendarDays} />
          <StatCard label="Active Users" value={loading ? '�' : stats.activeUsers} Icon={Activity} />
          <StatCard label="Assessments" value={loading ? '�' : stats.assessments} Icon={ClipboardList} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Recent Activity</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Latest admin actions across the platform.</p>
            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="text-sm text-slate-500 dark:text-gray-400">Loading activity...</div>
              ) : activityItems.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-gray-400">No recent activity yet.</div>
              ) : (
                activityItems.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-300">
                    <span className="font-medium text-slate-700 dark:text-gray-200">{item.label}</span>
                    <span className="text-xs text-slate-400 dark:text-gray-500">{item.time}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-sky-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Quick Actions</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Jump into common admin tasks.</p>
            <div className="mt-4 space-y-3">
              <Link to="/admin/event" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-200 dark:hover:bg-gray-800">
                Create Interview
                <span className="text-xs text-slate-400">Event setup</span>
              </Link>
              <Link to="/admin/onboarding" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-200 dark:hover:bg-gray-800">
                Add Students
                <span className="text-xs text-slate-400">Onboarding</span>
              </Link>
              <Link to="/admin/assessment" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-200 dark:hover:bg-gray-800">
                Review Assessments
                <span className="text-xs text-slate-400">Publishing</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
