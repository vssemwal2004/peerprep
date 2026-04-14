/* eslint-disable no-unused-vars */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  ClipboardList,
  GraduationCap,
  Code2,
  ArrowRight,
  ChevronRight,
  BarChart3,
  CheckCircle2,
  Sparkles
} from "lucide-react";
import { api } from "../utils/api";
import socketService from "../utils/socket";
import { useAuth } from "../context/AuthContext";
import RequirePasswordChange from "./RequirePasswordChange";
import GridBackground from "../landing/components/GridBackground";

function RocketFlightScene() {
  return (
    <div className="relative w-full h-[300px] sm:h-[320px] overflow-hidden bg-transparent">
      <style>{`
        @keyframes ppAirflowFast {
          0% { transform: translate3d(150%, 0, 0); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translate3d(-170%, 0, 0); opacity: 0; }
        }
        @keyframes ppAirflowSlow {
          0% { transform: translate3d(130%, 0, 0); opacity: 0; }
          14% { opacity: 1; }
          100% { transform: translate3d(-150%, 0, 0); opacity: 0; }
        }
        @keyframes ppFlowDrift {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes ppGlowPulse {
          0% { transform: translate3d(-50%, -50%, 0) scale(0.96); opacity: 0.55; }
          50% { transform: translate3d(-50%, -50%, 0) scale(1.04); opacity: 0.8; }
          100% { transform: translate3d(-50%, -50%, 0) scale(0.96); opacity: 0.55; }
        }
        @keyframes ppTrail {
          0% { transform: translate3d(0, 0, 0); opacity: 0.2; }
          100% { transform: translate3d(-50%, 0, 0); opacity: 0.6; }
        }
      `}</style>

      {/* Neutral glow only (keep background fully transparent) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-200/45 blur-3xl dark:bg-white/5"
        style={{ animation: "ppGlowPulse 5.2s ease-in-out infinite" }}
      />

      {/* Speed lines / airflow (background moves more than rocket) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-0 top-[14%] h-[2px] w-[260px] rounded-full bg-slate-200/70 blur-[1px] dark:bg-white/10"
          style={{ animation: "ppAirflowFast 0.42s linear infinite" }}
        />
        <div
          className="absolute left-0 top-[22%] h-[2px] w-[180px] rounded-full bg-slate-200/55 blur-[1px] dark:bg-white/10"
          style={{ animation: "ppAirflowFast 0.5s linear infinite", animationDelay: "0.08s" }}
        />
        <div
          className="absolute left-0 top-[32%] h-[2px] w-[280px] rounded-full bg-slate-200/50 blur-[1.5px] dark:bg-white/10"
          style={{ animation: "ppAirflowFast 0.62s linear infinite", animationDelay: "0.18s" }}
        />
        <div
          className="absolute left-0 top-[44%] h-[2px] w-[210px] rounded-full bg-slate-200/45 blur-[1px] dark:bg-white/10"
          style={{ animation: "ppAirflowSlow 0.85s linear infinite", animationDelay: "0.12s" }}
        />
        <div
          className="absolute left-0 top-[56%] h-[2px] w-[250px] rounded-full bg-slate-200/40 blur-[1.5px] dark:bg-white/10"
          style={{ animation: "ppAirflowSlow 1.0s linear infinite", animationDelay: "0.24s" }}
        />
        <div
          className="absolute left-0 top-[68%] h-[2px] w-[190px] rounded-full bg-slate-200/35 blur-[1px] dark:bg-white/10"
          style={{ animation: "ppAirflowSlow 1.15s linear infinite", animationDelay: "0.34s" }}
        />
        <div
          className="absolute left-0 top-[78%] h-[2px] w-[230px] rounded-full bg-slate-200/35 blur-[1px] dark:bg-white/10"
          style={{ animation: "ppAirflowFast 0.56s linear infinite", animationDelay: "0.3s" }}
        />
        <div
          className="absolute left-0 top-[88%] h-[2px] w-[160px] rounded-full bg-slate-200/30 blur-[1px] dark:bg-white/10"
          style={{ animation: "ppAirflowSlow 0.95s linear infinite", animationDelay: "0.5s" }}
        />
      </div>

      {/* Speed haze behind rocket */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-[440px] -translate-y-1/2 -translate-x-[62%] rounded-full bg-gradient-to-r from-slate-200/55 via-slate-200/15 to-transparent blur-2xl dark:from-white/10"
        style={{ animation: "ppTrail 1.25s linear infinite" }}
      />

      {/* Rocket (subtle movement; background conveys speed) */}
      <motion.div
        className="relative z-10 h-full w-full flex items-center justify-center"
        animate={{ y: [0, -6, 0], rotate: [-8, -9, -8], x: [0, 4, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        whileHover={{ y: -10, rotate: -10, x: 6 }}
        style={{ willChange: "transform" }}
      >
        <img
          src="/images/img%201.png"
          alt="Student on a rocket"
          className="h-full w-full object-contain select-none mix-blend-multiply dark:mix-blend-normal"
          style={{
            WebkitMaskImage:
              "radial-gradient(78% 78% at 50% 48%, rgba(0,0,0,1) 66%, rgba(0,0,0,0) 100%)",
            maskImage:
              "radial-gradient(78% 78% at 50% 48%, rgba(0,0,0,1) 66%, rgba(0,0,0,0) 100%)",
          }}
          draggable="false"
        />
      </motion.div>
    </div>
  );
}

/* ─── Utility helpers ─── */
function getDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatRelativeTime(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function intensityClass(value) {
  if (!value || value <= 0) return "bg-slate-100 dark:bg-gray-700 border border-slate-200 dark:border-gray-600";
  if (value >= 1 && value <= 2) return "bg-blue-200 dark:bg-blue-800";
  if (value >= 3 && value <= 4) return "bg-blue-400 dark:bg-blue-600";
  if (value >= 5 && value <= 7) return "bg-blue-600 dark:bg-blue-500";
  return "bg-blue-700 dark:bg-blue-400";
}

/* ─── AnimatedNumber ─── */
function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = Number(value) || 0;
    if (start === end) { setDisplay(end); return; }
    const step = Math.ceil(end / 20);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setDisplay(end); clearInterval(timer); }
      else setDisplay(start);
    }, 30);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display}</>;
}

/* ─── Primary Action Card ─── */
function ActionPanel({ title, description, icon: Icon, cta, path, navigate, tone = "sky" }) {
  const toneBadge =
    tone === "indigo"
      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300"
      : tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
      : tone === "amber"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
      : "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300";

  const toneHoverOverlay =
    tone === "indigo"
      ? "from-indigo-50/80 via-white to-white dark:from-indigo-900/10 dark:via-gray-800 dark:to-gray-800"
      : tone === "emerald"
      ? "from-emerald-50/80 via-white to-white dark:from-emerald-900/10 dark:via-gray-800 dark:to-gray-800"
      : tone === "amber"
      ? "from-amber-50/80 via-white to-white dark:from-amber-900/10 dark:via-gray-800 dark:to-gray-800"
      : "from-sky-50/80 via-white to-white dark:from-sky-900/10 dark:via-gray-800 dark:to-gray-800";

  const toneCorner =
    tone === "indigo"
      ? "from-indigo-500/85 to-violet-600/85"
      : tone === "emerald"
      ? "from-emerald-500/85 to-teal-600/85"
      : tone === "amber"
      ? "from-amber-400/90 to-orange-500/90"
      : "from-sky-400/90 to-blue-600/90";

  return (
    <motion.button
      onClick={() => navigate(path)}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="group relative text-left w-full h-[196px] sm:h-[204px] overflow-hidden rounded-2xl border border-slate-200/90 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 pr-16 sm:pr-16 shadow-sm hover:shadow-md transition-all duration-300"
    >
      {/* Hover wash (tone) */}
      <div
        aria-hidden="true"
        className={
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-br " +
          toneHoverOverlay
        }
      />

      {/* Corner accent (pinned to the card corner; clipped to rounded corner) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 z-0 h-24 w-24 overflow-hidden rounded-br-2xl translate-x-10 translate-y-10 opacity-0 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100"
      >
        <div
          className={"absolute inset-0 bg-gradient-to-tr " + toneCorner}
          style={{ clipPath: "polygon(100% 0, 0 100%, 100% 100%)" }}
        />
        <div className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white/25 backdrop-blur-sm ring-1 ring-white/25">
          <ArrowRight className="h-4 w-4 text-white/95" />
        </div>
      </div>

      {/* Keep content above overlays; ensure text color stays consistent */}
      <div className="relative z-10">

        <div className="flex items-start gap-4 h-full">
          <div className="relative flex-shrink-0">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-2 rounded-2xl bg-slate-100/70 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100 dark:bg-white/5"
            />
            <div className={`relative flex h-10 w-10 items-center justify-center rounded-xl ${toneBadge}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>

          <div className="flex-1 min-w-0 h-full flex flex-col">
            <div>
              <div
                className="text-base sm:text-[17px] font-black text-sky-950 dark:text-gray-100 tracking-tight leading-snug"
                style={{
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                }}
              >
                {title}
              </div>
              <div
                className="mt-1 text-[13px] sm:text-sm text-slate-600 dark:text-gray-400 leading-relaxed"
                style={{
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 3,
                  overflow: "hidden",
                }}
              >
                {description}
              </div>
            </div>

            <div className="mt-auto pt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-950 dark:text-gray-100">
              {cta}
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            </div>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

/* ─── Weekly Activity Bars ─── */
function WeeklyHeatmap({ data }) {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-7 gap-2">
        {data.map((day) => {
          const cls = intensityClass(day.count);
          const title = `${day.fullLabel}: ${day.count} activit${day.count === 1 ? "y" : "ies"}`;
          return (
            <div key={day.key} className="flex flex-col items-center gap-1">
              <div
                title={title}
                className={
                  "h-7 w-full rounded-md transition-all " +
                  cls +
                  " hover:ring-2 hover:ring-blue-500 dark:hover:ring-blue-400"
                }
              />
              <div className="text-[10px] text-slate-400 dark:text-gray-500">{day.label}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="text-[10px] font-semibold text-slate-400 dark:text-gray-500">Less</span>
        <div className="flex gap-1">
          <div className="h-2.5 w-2.5 rounded-sm bg-slate-100 dark:bg-gray-700 border border-slate-200 dark:border-gray-600" />
          <div className="h-2.5 w-2.5 rounded-sm bg-blue-200 dark:bg-blue-800" />
          <div className="h-2.5 w-2.5 rounded-sm bg-blue-400 dark:bg-blue-600" />
          <div className="h-2.5 w-2.5 rounded-sm bg-blue-600 dark:bg-blue-500" />
          <div className="h-2.5 w-2.5 rounded-sm bg-blue-700 dark:bg-blue-400" />
        </div>
        <span className="text-[10px] font-semibold text-slate-400 dark:text-gray-500">More</span>
      </div>
    </div>
  );
}

function QuickNav({ navigate }) {
  const items = [
    { label: "Interview", Icon: Calendar, to: "/student/interview" },
    { label: "Assessment", Icon: ClipboardList, to: "/student/assessments" },
    { label: "Learning", Icon: GraduationCap, to: "/student/learning" },
    { label: "Problems", Icon: Code2, to: "/problems" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => navigate(item.to)}
          className="inline-flex items-center gap-2 rounded-xl bg-transparent px-3.5 py-2 text-sm font-semibold text-sky-950 dark:text-gray-50 border border-slate-200/60 dark:border-white/10 transition-colors duration-300 hover:bg-white/10 dark:hover:bg-white/5"
        >
          <item.Icon className="h-4 w-4 text-slate-600 dark:text-slate-200" />
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Main Dashboard ─── */
export default function StudentDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [activityByDate, setActivityByDate] = useState({});
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [thoughtIndex, setThoughtIndex] = useState(0);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      api.listEvents(),
      api.listStudentAssessments ? api.listStudentAssessments() : Promise.resolve(null)
    ]).then((results) => {
      if (!mounted) return;
      setEvents(results[0]?.status === "fulfilled" ? results[0].value || [] : []);
      const ar = results[1]?.status === "fulfilled" ? results[1].value : null;
      const al = ar?.assessments || ar || [];
      setAssessments(Array.isArray(al) ? al : []);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadActivity = async () => {
      try {
        const res = await api.getStudentActivity();
        if (!mounted) return;
        setActivityByDate(res?.activityByDate && typeof res.activityByDate === "object" ? res.activityByDate : {});
      } catch {
        if (!mounted) return;
        setActivityByDate({});
      }
    };

    loadActivity();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchAnnouncements = async () => {
      try {
        const res = await api.listStudentAnnouncements();
        if (!mounted) return;
        setAnnouncements(Array.isArray(res?.announcements) ? res.announcements : []);
        setAnnouncementIndex(0);
      } catch {
        if (!mounted) return;
        setAnnouncements([]);
      }
    };

    fetchAnnouncements();

    socketService.connect();
    const handleUpdate = () => {
      fetchAnnouncements();
    };
    socketService.on("announcement_update", handleUpdate);

    return () => {
      mounted = false;
      socketService.off("announcement_update", handleUpdate);
    };
  }, []);

  const displayAnnouncements = announcements;

  const fallbackThoughts = useMemo(
    () => [
      {
        area: "Interview practice",
        text: "Treat every session like a real interview: clarify the problem, state assumptions, then code with intention.",
      },
      {
        area: "Placement prep",
        text: "Consistency beats intensity. One focused session daily compounds faster than last‑minute marathons.",
      },
    ],
    []
  );

  useEffect(() => {
    if (!displayAnnouncements.length) return undefined;
    const id = setInterval(() => {
      setAnnouncementIndex((prev) => (prev + 1) % displayAnnouncements.length);
    }, 5000);
    return () => clearInterval(id);
  }, [displayAnnouncements.length]);

  useEffect(() => {
    if (displayAnnouncements.length > 0) return undefined;
    if (!fallbackThoughts.length) return undefined;
    const id = setInterval(() => {
      setThoughtIndex((prev) => (prev + 1) % fallbackThoughts.length);
    }, 5000);
    return () => clearInterval(id);
  }, [displayAnnouncements.length, fallbackThoughts.length]);

  const upcomingInterviews = useMemo(() =>
    events.filter(e => e.joined && e.startDate && new Date(e.startDate).getTime() > Date.now()).length,
    [events]);

  const activeAssessments = useMemo(() =>
    assessments.filter(a => a.status === "Available" || a.status === "Not Started").length,
    [assessments]);

  const progressPercent = useMemo(() => {
    const total = events.length;
    const joined = events.filter(e => e.joined).length;
    return total ? Math.min(100, Math.round((joined / total) * 100)) : 0;
  }, [events]);

  const weeklyActivity = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const key = getDateKey(day);
      const count = key ? Number(activityByDate?.[key] || 0) : 0;
      days.push({
        key: key || String(i),
        label: day.toLocaleDateString(undefined, { weekday: "short" }),
        fullLabel: day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
        count: Number.isFinite(count) ? count : 0,
      });
    }
    return days;
  }, [activityByDate]);

  const recentActivity = useMemo(() => {
    const items = [];
    events.filter(e => e.startDate).forEach(e => items.push({
      label: e.joined ? "Joined interview" : "Event available",
      detail: e.name,
      time: e.startDate
    }));
    assessments.filter(a => a.submittedAt).forEach(a => items.push({
      label: "Assessment submitted",
      detail: a.title || "Assessment",
      time: a.submittedAt
    }));
    return items.filter(i => i.time).sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 3);
  }, [events, assessments]);

  const weeklyTotalActivities = useMemo(
    () => weeklyActivity.reduce((sum, d) => sum + d.count, 0),
    [weeklyActivity]
  );

  const weeklyActiveDays = useMemo(
    () => weeklyActivity.reduce((sum, d) => sum + (d.count > 0 ? 1 : 0), 0),
    [weeklyActivity]
  );

  const weeklyGoal = 7;
  const weeklyRemaining = Math.max(0, weeklyGoal - weeklyActiveDays);

  const platformOverviewCards = [
    {
      title: "Interview Practice",
      description: "Practice real interview scenarios and improve communication.",
      cta: "Open interviews",
      icon: Calendar,
      path: "/student/interview",
      tone: "sky",
    },
    {
      title: "Assessments",
      description: "Test your skills with structured assessments.",
      cta: "View assessments",
      icon: ClipboardList,
      path: "/student/assessments",
      tone: "indigo",
    },
    {
      title: "Learning Modules",
      description: "Structured learning with topics and progress tracking.",
      cta: "Explore modules",
      icon: GraduationCap,
      path: "/student/learning",
      tone: "emerald",
    },
    {
      title: "Coding Practice",
      description: "Solve problems and improve logic building.",
      cta: "Start practice",
      icon: Code2,
      path: "/problems",
      tone: "amber",
    },
    {
      title: "Feedback System",
      description: "Get detailed feedback after every session.",
      cta: "View sessions",
      icon: CheckCircle2,
      path: "/student/session",
      tone: "emerald",
    },
    {
      title: "Performance Tracking",
      description: "Track your progress and improve consistently.",
      cta: "See analytics",
      icon: BarChart3,
      path: "/student/analysis",
      tone: "sky",
    },
  ];

  const sectionFade = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-60px" },
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  };

  return (
    <RequirePasswordChange user={user}>
      <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-sky-100 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 pt-20 pb-10">

        {/* Fixed grid background (doesn't scroll) */}
        <div aria-hidden="true" className="pointer-events-none fixed inset-0">
          <GridBackground />
        </div>

        {/* Keep all page content above the grid */}
        <div className="relative z-10">

        {/* ── 1. FULL VIEWPORT HERO (Hero + Motivation) ── */}
        <div className="relative h-[calc(100vh-5rem)] flex flex-col justify-start gap-[clamp(10px,2vh,20px)] overflow-hidden">
          {/* Shared Growth Flow background for Hero + Motivation (single continuous backdrop) */}
          <div className="pointer-events-none absolute inset-0">
            {/* Layer 1: clean gradient base */}
            <div className="absolute inset-0 bg-gradient-to-br from-sky-100 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />

            {/* Layer 2: glow accents */}
            <motion.div
              className="absolute -left-16 top-10 h-64 w-64 rounded-full bg-sky-200/35 blur-3xl dark:bg-white/6"
              animate={{ x: [0, 18, 0], y: [0, -10, 0], opacity: [0.65, 0.45, 0.65] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute -right-20 bottom-8 h-72 w-72 rounded-full bg-blue-200/30 blur-3xl dark:bg-white/6"
              animate={{ x: [0, -16, 0], y: [0, 12, 0], opacity: [0.55, 0.35, 0.55] }}
              transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Layer 4: floating geometry */}
            <motion.div
              className="absolute left-14 top-24 h-2 w-2 rounded-full bg-sky-400/25 dark:bg-white/10"
              animate={{ y: [0, -18, 0], x: [0, 8, 0], scale: [1, 1.2, 1], opacity: [0.35, 0.55, 0.35] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute right-20 top-28 h-9 w-9 rounded-2xl border border-sky-300/25 bg-white/25 backdrop-blur-sm dark:border-white/10 dark:bg-white/5"
              animate={{ y: [0, -14, 0], x: [0, -10, 0], rotate: [0, 4, 0], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute left-1/2 bottom-10 h-3 w-3 -translate-x-1/2 rounded-full bg-blue-500/15 dark:bg-white/8"
              animate={{ y: [0, -20, 0], x: [0, 10, 0], scale: [1, 1.15, 1], opacity: [0.25, 0.45, 0.25] }}
              transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute left-24 bottom-16 h-1 w-1 rounded-full bg-slate-400/35 dark:bg-slate-400/20"
              animate={{ y: [0, -26, 0], opacity: [0.25, 0.6, 0.25] }}
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute right-28 bottom-14 h-1.5 w-1.5 rounded-full bg-sky-500/20 dark:bg-sky-300/15"
              animate={{ y: [0, -22, 0], x: [0, -8, 0], opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 10.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>

          {/* ── 1A. HERO ── */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full px-4 sm:px-6 lg:px-10"
          >
            <div className="relative overflow-hidden rounded-[32px]">
              <div className="relative overflow-hidden rounded-[31px] bg-transparent">
                <div className="relative px-6 sm:px-10 py-[clamp(18px,4vh,54px)]">
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-center">
                    {/* left */}
                    <div className="lg:col-span-3">
                      <div className="pointer-events-none absolute -left-16 top-10 h-56 w-72 rounded-full bg-white/12 blur-3xl" />
                      <div className="inline-flex items-center rounded-full bg-transparent px-3 py-1 text-[12px] font-semibold text-sky-900 dark:text-sky-200">
                        PeerPrep student dashboard
                      </div>
                      <h1 className="mt-4 text-3xl sm:text-4xl lg:text-4xl font-black leading-tight tracking-tight text-sky-950 dark:text-slate-50">
                        Welcome back{user?.name ? "," : ""}{" "}
                        <span className="bg-gradient-to-r from-sky-950 via-sky-700 to-indigo-700 bg-clip-text text-transparent dark:from-slate-100 dark:via-sky-300 dark:to-indigo-300">
                          {user?.name || "Student"}
                        </span>
                      </h1>
                      <p className="mt-4 text-slate-600 dark:text-slate-300 text-sm sm:text-base max-w-xl leading-relaxed">
                        Your home for interviews, assessments, learning modules, and coding practice — all in one place.
                      </p>

                      <div className="mt-6">
                        <QuickNav navigate={navigate} />
                      </div>
                    </div>

                    {/* right: quick status */}
                    <div className="lg:col-span-2">
                      <div className="rounded-2xl bg-transparent backdrop-blur-xl p-6">
                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">This week</div>

                        <div className="mt-4 space-y-3">
                          <div className="flex items-center justify-between rounded-xl bg-white/30 dark:bg-white/10 px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Calendar className="h-4 w-4 text-slate-600 dark:text-white/80" />
                              <div className="text-sm font-semibold text-sky-950 dark:text-slate-50">Upcoming interviews</div>
                            </div>
                            <div className="text-lg font-black text-sky-950 dark:text-slate-50">
                              <AnimatedNumber value={upcomingInterviews} />
                            </div>
                          </div>

                          <div className="flex items-center justify-between rounded-xl bg-white/30 dark:bg-white/10 px-4 py-3">
                            <div className="flex items-center gap-3">
                              <ClipboardList className="h-4 w-4 text-slate-600 dark:text-white/80" />
                              <div className="text-sm font-semibold text-sky-950 dark:text-slate-50">Pending assessments</div>
                            </div>
                            <div className="text-lg font-black text-sky-950 dark:text-slate-50">
                              <AnimatedNumber value={activeAssessments} />
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 flex items-start gap-2 text-slate-600 dark:text-slate-300 text-sm">
                          <BarChart3 className="h-4 w-4 mt-0.5 text-slate-500 dark:text-slate-300" />
                          <p className="leading-relaxed">
                            {weeklyRemaining === 0
                              ? "Weekly goal reached — keep it consistent."
                              : `You're ${weeklyRemaining} day${weeklyRemaining !== 1 ? "s" : ""} away from your weekly goal.`}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          {/* ── 1B. MOTIVATION ── */}
          <section className="relative z-10 overflow-hidden flex-1 min-h-0">
          <div className="relative h-full w-full px-4 sm:px-6 lg:px-10 py-[clamp(10px,2vh,22px)] flex flex-col justify-center">
            <div className="mx-auto w-full max-w-3xl text-center">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-300">
                Daily updates
              </div>
              <h2 className="mt-3 text-xl sm:text-2xl font-black text-sky-950 dark:text-gray-50 tracking-tight">
                A small push, every day
              </h2>

              <div className="mt-6">
                {displayAnnouncements.length > 0 ? (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${announcementIndex}-${displayAnnouncements[announcementIndex]?.title}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-3"
                    >
                      <div className="inline-flex items-center rounded-full bg-transparent px-3 py-1 text-xs font-semibold text-slate-600 dark:text-gray-200">
                        Announcement
                      </div>
                      <div className="text-lg sm:text-xl font-semibold text-sky-950 dark:text-gray-50 leading-relaxed">
                        {displayAnnouncements[announcementIndex]?.title}
                      </div>
                      <div className="text-sm text-slate-600 dark:text-gray-300 leading-relaxed">
                        {displayAnnouncements[announcementIndex]?.message}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${thoughtIndex}-${fallbackThoughts[thoughtIndex]?.area}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-3"
                    >
                      <div className="inline-flex items-center rounded-full bg-transparent px-3 py-1 text-xs font-semibold text-slate-600 dark:text-gray-200">
                        {fallbackThoughts[thoughtIndex]?.area}
                      </div>
                      <div className="text-lg sm:text-xl font-semibold text-sky-950 dark:text-gray-50 leading-relaxed">
                        {fallbackThoughts[thoughtIndex]?.text}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>

              <div className="mt-10 pt-8 border-t border-slate-200/60 dark:border-gray-700/60">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-left">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-300">
                      <span className="relative flex h-2.5 w-2.5">
                        <motion.span
                          className="absolute inline-flex h-full w-full rounded-full bg-sky-400/35"
                          animate={{ scale: [1, 1.9, 1], opacity: [0.35, 0.05, 0.35] }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                        />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500/60" />
                      </span>
                      AI Insights
                    </div>

                    <div className="mt-3 text-lg sm:text-xl font-black text-sky-950 dark:text-gray-50 tracking-tight">
                      Track your performance
                    </div>
                    <div className="mt-2 text-sm text-slate-600 dark:text-gray-300 leading-relaxed max-w-xl">
                      Understand your progress, identify gaps, and improve with intelligent insights.
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    onClick={() => navigate("/student/analysis")}
                    whileHover={{ scale: 1.03, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                    className="group relative w-full sm:w-auto overflow-hidden inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-extrabold text-white tracking-tight bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 ring-1 ring-white/20 shadow-[0_18px_45px_-30px_rgba(2,132,199,0.75)] hover:from-sky-300 hover:via-sky-400 hover:to-blue-600 hover:shadow-[0_26px_65px_-38px_rgba(2,132,199,0.95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
                  >
                    <span aria-hidden="true" className="pointer-events-none absolute -inset-6 rounded-3xl opacity-0 blur-2xl bg-sky-400/30 transition-opacity duration-300 group-hover:opacity-100" />
                    <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/18 via-white/6 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-90" />
                    <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/35" />
                    <Sparkles className="relative z-10 h-4 w-4 text-white/90" />
                    <span className="relative z-10">Check Performance</span>
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
          </section>
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-10 space-y-12 pt-10 pb-16">

          {/* ── 2. PLATFORM OVERVIEW ── */}
          <motion.section {...sectionFade}>
            <div className="rounded-3xl bg-gradient-to-br from-white/80 via-white/65 to-slate-50/55 dark:from-gray-900/45 dark:via-gray-900/35 dark:to-gray-900/30 shadow-sm">
              <div className="px-6 sm:px-10 py-10 sm:py-12">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
                  {/* Left */}
                  <div className="lg:col-span-4 flex flex-col justify-center">
                    <div className="text-center lg:text-left">
                      <h2 className="text-2xl sm:text-3xl lg:text-3xl font-black text-sky-950 dark:text-gray-50 tracking-tight leading-[1.1]">
                        Grow your skills. Build your future.
                      </h2>
                      <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-gray-300 leading-relaxed max-w-xl mx-auto lg:mx-0">
                        A complete platform for interviews, assessments, learning, and coding practice.
                      </p>
                    </div>

                    <div className="mt-8 flex justify-center lg:justify-start">
                      <div className="w-full max-w-[340px]">
                        <RocketFlightScene />
                      </div>
                    </div>
                  </div>

                  {/* Right */}
                  <div className="lg:col-span-8">
                    <div className="grid auto-rows-fr grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {platformOverviewCards.map((card, i) => (
                        <motion.div
                          key={card.title}
                          initial={{ opacity: 0, y: 16 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: i * 0.06, duration: 0.5 }}
                          className="h-full"
                        >
                          <ActionPanel {...card} navigate={navigate} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          {/* ── 3. PROGRESS + ACTIVITY ── */}
          <motion.section {...sectionFade} className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-7 sm:p-8 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-slate-400 dark:text-gray-500 font-semibold">
                    Progress
                  </div>
                  <h3 className="mt-2 text-lg sm:text-xl font-bold text-sky-950 dark:text-gray-100 tracking-tight">
                    Keep your momentum
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-gray-400">
                    {weeklyActiveDays > 0 ? "You are improving steadily this week." : "Start with one activity today."}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-gray-900/40 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-gray-200">
                    {weeklyActiveDays}/{weeklyGoal} days active
                  </span>
                </div>
              </div>

              <div className="mt-7 space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-500 dark:text-gray-400">Interview participation</span>
                    <span className="font-semibold text-slate-700 dark:text-gray-200">{progressPercent}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${progressPercent}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-500 dark:text-gray-400">Assessments completed</span>
                    <span className="font-semibold text-slate-700 dark:text-gray-200">
                      {assessments.filter(a => a.status === "Completed").length}/{assessments.length}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{
                        width: assessments.length
                          ? `${Math.round((assessments.filter(a => a.status === "Completed").length / assessments.length) * 100)}%`
                          : "0%",
                      }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-7">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-500 dark:text-gray-400">Weekly activity</div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-gray-200">{weeklyTotalActivities} activities</div>
                </div>
                <WeeklyHeatmap data={weeklyActivity} />
              </div>
            </div>

            <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-7 sm:p-8 shadow-sm">
              <div className="text-[11px] uppercase tracking-widest text-slate-400 dark:text-gray-500 font-semibold">
                Recent activity
              </div>
              <h3 className="mt-2 text-lg font-bold text-sky-950 dark:text-gray-100 tracking-tight">
                Last updates
              </h3>

              <div className="mt-5 space-y-3">
                {recentActivity.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-gray-400">
                    No recent activity yet.
                  </div>
                ) : (
                  recentActivity.map((item, idx) => (
                    <div
                      key={`${item.label}-${idx}`}
                      className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-gray-800/70 transition-colors"
                    >
                      <div className="mt-1 h-2 w-2 rounded-full bg-sky-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 dark:text-gray-200 truncate">
                          {item.label}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-gray-400 truncate">
                          {item.detail}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400 dark:text-gray-500">
                          {formatRelativeTime(item.time)}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 dark:text-gray-600 flex-shrink-0 mt-1" />
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-700 px-5 py-4">
                <div className="text-sm font-bold text-slate-900 dark:text-gray-100">
                  {weeklyRemaining === 0
                    ? "Weekly goal completed"
                    : `You're ${weeklyRemaining} day${weeklyRemaining !== 1 ? "s" : ""} away from your weekly goal`}
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-gray-400">
                  A small daily effort compounds.
                </div>
                <button
                  onClick={() => navigate("/problems")}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white px-4 py-2 text-sm font-semibold hover:opacity-95 transition-opacity"
                >
                  Start a quick practice
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.section>

          {/* ── 4. FINAL CTA ── */}
          <motion.section {...sectionFade}>
            <div className="relative overflow-hidden rounded-2xl p-8 sm:p-12 flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-0 sm:justify-between">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
              <div className="absolute inset-0 bg-sky-500/10" />

              <div className="relative">
                <div className="text-xs uppercase tracking-widest text-sky-300 font-semibold mb-2">Ready to level up?</div>
                <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Start a focused practice session.</h3>
                <p className="text-slate-300 text-sm mt-2">A short daily session keeps you interview-ready.</p>
              </div>

              <motion.button
                onClick={() => navigate("/problems")}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className="relative flex-shrink-0 inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-white text-slate-900 text-sm font-bold shadow-sm hover:shadow-md transition-shadow"
              >
                Start Practice
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.section>

        </div>

        </div>
      </div>
    </RequirePasswordChange>
  );
}
