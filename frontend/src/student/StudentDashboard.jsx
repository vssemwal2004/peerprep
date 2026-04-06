import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Calendar,
  ClipboardList,
  GraduationCap,
  Code2,
  Bell,
  ArrowRight,
  Target
} from "lucide-react";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import RequirePasswordChange from "./RequirePasswordChange";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 }
};

function formatRelativeTime(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

function getDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      api.listEvents(),
      api.listStudentAssessments ? api.listStudentAssessments() : Promise.resolve(null),
      api.getNotifications ? api.getNotifications() : Promise.resolve(null)
    ]).then((results) => {
      if (!mounted) return;
      const eventsRes = results[0]?.status === "fulfilled" ? results[0].value : [];
      setEvents(eventsRes || []);

      const assessmentsRes = results[1]?.status === "fulfilled" ? results[1].value : null;
      const assessmentList = assessmentsRes?.assessments || assessmentsRes || [];
      setAssessments(Array.isArray(assessmentList) ? assessmentList : []);

      const notificationsRes = results[2]?.status === "fulfilled" ? results[2].value : null;
      setNotifications(notificationsRes?.notifications || []);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const upcomingInterviews = useMemo(() => {
    const now = Date.now();
    return events.filter((event) => event.joined && event.startDate && new Date(event.startDate).getTime() > now).length;
  }, [events]);

  const pendingAssessments = useMemo(() => {
    return assessments.filter((assessment) =>
      assessment.status === "Available" || assessment.status === "Not Started"
    ).length;
  }, [assessments]);

  const progressPercent = useMemo(() => {
    const total = events.length;
    const joined = events.filter((event) => event.joined).length;
    if (!total) return 0;
    return Math.min(100, Math.round((joined / total) * 100));
  }, [events]);

  const weeklyActivity = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const key = getDateKey(day);
      const count = events.filter((event) => event.joined && getDateKey(event.startDate) === key).length;
      days.push({
        key,
        label: day.toLocaleDateString(undefined, { weekday: "short" }),
        count
      });
    }
    return days;
  }, [events]);

  const weeklyTotal = useMemo(() => weeklyActivity.reduce((acc, item) => acc + item.count, 0), [weeklyActivity]);

  const weeklyInsight = useMemo(() => {
    if (weeklyTotal >= 4) return "You are improving steadily this week.";
    if (weeklyTotal >= 2) return "Nice momentum. Keep the streak alive.";
    return "Start one session this week to build consistency.";
  }, [weeklyTotal]);

  const recentActivity = useMemo(() => {
    const items = events
      .filter((event) => event.startDate)
      .map((event) => ({
        label: event.joined ? "Joined interview event" : "Interview event available",
        detail: event.name,
        time: event.startDate
      }))
      .sort((a, b) => new Date(b.time) - new Date(a.time));
    return items.slice(0, 3);
  }, [events]);

  const notificationPreview = useMemo(() => notifications.slice(0, 3), [notifications]);

  const motivationMessage = useMemo(() => {
    if (progressPercent >= 80) return "You are 2 steps away from completing this module.";
    if (progressPercent >= 50) return "You are building momentum. One more session to keep the streak.";
    return "Start one session today to build your rhythm.";
  }, [progressPercent]);

  const primaryActions = [
    {
      title: "Continue Interview",
      description: upcomingInterviews ? "Your next session is ready" : "Schedule your next interview",
      cta: "Go to Interviews",
      icon: Calendar,
      path: "/student/interview",
      accent: "sky"
    },
    {
      title: "Start Assessment",
      description: pendingAssessments
        ? `${pendingAssessments} pending assessment${pendingAssessments === 1 ? "" : "s"}`
        : "Check available assessments",
      cta: "View Assessments",
      icon: ClipboardList,
      path: "/student/assessments",
      accent: "indigo"
    },
    {
      title: "Resume Learning",
      description: "Continue your learning path",
      cta: "Open Learning",
      icon: GraduationCap,
      path: "/student/learning",
      accent: "emerald"
    },
    {
      title: "Practice Coding",
      description: "Sharpen problem-solving skills",
      cta: "Solve Problems",
      icon: Code2,
      path: "/problems",
      accent: "amber"
    }
  ];

  const quickNav = [
    { label: "Interview", path: "/student/interview", icon: Calendar },
    { label: "Assessment", path: "/student/assessments", icon: ClipboardList },
    { label: "Learning", path: "/student/learning", icon: GraduationCap },
    { label: "Problems", path: "/problems", icon: Code2 }
  ];

  const accentStyles = {
    sky: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300",
    indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300",
    emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
  };

  const openNotifications = () => {
    window.dispatchEvent(new Event("open-notifications"));
  };

  return (
    <RequirePasswordChange user={user}>
      <div className="min-h-screen w-full bg-slate-50 dark:bg-gray-900 pt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
          {/* Hero Section */}
          <motion.section
            {...fadeUp}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-700 text-white p-8 sm:p-10"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/10" />
            <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
              <div className="lg:col-span-2">
                <div className="text-xs uppercase tracking-[0.35em] text-sky-100/80 mb-3">Welcome</div>
                <h1 className="text-3xl sm:text-4xl font-semibold">
                  Welcome back, {user?.name || "Student"}
                </h1>
                <p className="mt-3 text-sky-100 text-sm sm:text-base max-w-xl">
                  Build your interview skills step by step.
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 border border-white/20 backdrop-blur-xl p-5">
                <div className="text-xs uppercase tracking-wider text-sky-100/80 mb-3">Insights</div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-sky-100">Upcoming interviews</div>
                    <div className="text-2xl font-semibold text-white">{upcomingInterviews}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-sky-100">Pending assessments</div>
                    <div className="text-2xl font-semibold text-white">{pendingAssessments}</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Primary Actions */}
          <motion.section {...fadeUp} transition={{ delay: 0.05, duration: 0.6 }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-gray-100">Primary Actions</h2>
                <p className="text-sm text-slate-500 dark:text-gray-400">
                  Start with the most impactful next step.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {primaryActions.map((action) => (
                <motion.button
                  key={action.title}
                  onClick={() => navigate(action.path)}
                  whileHover={{ y: -6, scale: 1.02 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{ type: "spring", stiffness: 220, damping: 18 }}
                  className="group text-left rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 sm:p-8 shadow-sm hover:shadow-lg hover:shadow-sky-500/10 transition-all"
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${accentStyles[action.accent]}`}>
                    <action.icon className="w-6 h-6" />
                  </div>
                  <div className="mt-5">
                    <div className="text-base font-semibold text-slate-800 dark:text-gray-100">
                      {action.title}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-gray-400 mt-1">
                      {action.description}
                    </div>
                  </div>
                  <div className="mt-6 inline-flex items-center text-sm font-semibold text-sky-600 dark:text-sky-400">
                    {action.cta}
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.section>

          {/* Progress + Activity */}
          <motion.section
            {...fadeUp}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-gray-100">Progress & Activity</h3>
                <span className="text-xs text-slate-400">{progressPercent}% complete</span>
              </div>
              <div className="h-3 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full bg-sky-600"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-4 text-sm text-slate-600 dark:text-gray-300">{weeklyInsight}</p>
              <div className="mt-6 grid grid-cols-7 gap-2 items-end">
                {weeklyActivity.map((day) => (
                  <div key={day.key} className="flex flex-col items-center gap-1">
                    <div
                      className="w-6 rounded-md bg-sky-500/70"
                      style={{ height: `${Math.max(6, day.count * 8)}px` }}
                    />
                    <div className="text-[10px] text-slate-400 dark:text-gray-500">{day.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 sm:p-8">
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Weekly Summary</div>
              <div className="text-3xl font-semibold text-slate-800 dark:text-gray-100">{weeklyTotal}</div>
              <div className="text-sm text-slate-500 dark:text-gray-400">sessions this week</div>
              <div className="mt-6 text-sm text-slate-600 dark:text-gray-300">
                Keep momentum with one more focused interview session.
              </div>
              <button
                onClick={() => navigate("/student/interview")}
                className="mt-5 inline-flex items-center text-sm font-semibold text-sky-600 dark:text-sky-400"
              >
                View schedule
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </div>
          </motion.section>

          {/* Recent Activity + Notifications */}
          <motion.section
            {...fadeUp}
            transition={{ delay: 0.15, duration: 0.6 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            <div className="lg:col-span-2 rounded-2xl border border-slate-200/70 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-gray-100">Recent Activity</h3>
                <span className="text-xs text-slate-400">Last 3</span>
              </div>
              {recentActivity.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-gray-400">No recent activity yet.</div>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((item, idx) => (
                    <div key={`${item.label}-${idx}`} className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-700 dark:text-gray-200">{item.label}</div>
                        <div className="text-xs text-slate-500 dark:text-gray-400">{item.detail}</div>
                      </div>
                      <div className="text-xs text-slate-400">{formatRelativeTime(item.time)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200/70 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-slate-500" />
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-gray-100">Notifications</h3>
                </div>
                <button
                  onClick={openNotifications}
                  className="text-xs font-semibold text-sky-600 hover:text-sky-500"
                >
                  View all
                </button>
              </div>
              {notificationPreview.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-gray-400">No notifications yet.</div>
              ) : (
                <div className="space-y-3">
                  {notificationPreview.map((notif) => (
                    <div key={notif._id} className="text-sm">
                      <div className="text-slate-700 dark:text-gray-200 truncate">{notif.title}</div>
                      <div className="text-xs text-slate-500 dark:text-gray-400">
                        {formatRelativeTime(notif.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.section>

          {/* Quick Navigation */}
          <motion.section {...fadeUp} transition={{ delay: 0.2, duration: 0.6 }}>
            <div className="flex flex-wrap items-center gap-3">
              {quickNav.map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-gray-200 hover:shadow-sm transition"
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </div>
          </motion.section>

          {/* Motivation */}
          <motion.section {...fadeUp} transition={{ delay: 0.25, duration: 0.6 }}>
            <div className="rounded-2xl border border-sky-100 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-900/20 p-6 sm:p-7 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-gray-100">Momentum</div>
                <p className="text-sm text-slate-600 dark:text-gray-300 mt-1">{motivationMessage}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-sky-600 flex items-center justify-center text-white">
                <Target className="w-5 h-5" />
              </div>
            </div>
          </motion.section>

          {/* Bottom CTA */}
          <motion.section {...fadeUp} transition={{ delay: 0.3, duration: 0.6 }}>
            <div className="rounded-3xl bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-700 text-white p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">Ready to level up?</h3>
                <p className="text-sm text-sky-100">Start practice and keep your momentum strong.</p>
              </div>
              <button
                onClick={() => navigate("/problems")}
                className="px-5 py-2.5 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-semibold transition-colors"
              >
                Start Practice
              </button>
            </div>
          </motion.section>
        </div>
      </div>
    </RequirePasswordChange>
  );
}
