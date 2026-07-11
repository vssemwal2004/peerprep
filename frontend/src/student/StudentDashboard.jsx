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
  Megaphone,
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

function HeroAmbientBackground() {
  const sparks = [
    { left: "7%", top: "18%", delay: "0s", duration: "10s" },
    { left: "18%", top: "78%", delay: "1.2s", duration: "12s" },
    { left: "42%", top: "14%", delay: "0.5s", duration: "11s" },
    { left: "68%", top: "24%", delay: "2.1s", duration: "13s" },
    { left: "84%", top: "68%", delay: "0.8s", duration: "12s" },
    { left: "56%", top: "84%", delay: "1.6s", duration: "10s" },
  ];

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes ppHeroAurora {
          0% { transform: translate3d(-3%, -2%, 0) rotate(0deg); opacity: .72; }
          50% { transform: translate3d(3%, 2%, 0) rotate(1deg); opacity: .92; }
          100% { transform: translate3d(-3%, -2%, 0) rotate(0deg); opacity: .72; }
        }
        @keyframes ppHeroGrid {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(34px, 34px, 0); }
        }
        @keyframes ppHeroSpark {
          0% { transform: translate3d(0, 26px, 0) scaleY(.65); opacity: 0; }
          15% { opacity: .42; }
          70% { opacity: .2; }
          100% { transform: translate3d(32px, -38px, 0) scaleY(1.15); opacity: 0; }
        }
        @keyframes ppHeroScan {
          0% { transform: translateX(-55%); opacity: 0; }
          20% { opacity: .42; }
          80% { opacity: .18; }
          100% { transform: translateX(55%); opacity: 0; }
        }
        @keyframes ppHeroBorder {
          0% { opacity: .4; transform: translateX(-45%); }
          50% { opacity: .9; }
          100% { opacity: .4; transform: translateX(45%); }
        }
      `}</style>

      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(224,242,254,.86),rgba(255,255,255,.76)_38%,rgba(219,234,254,.62)_100%)] dark:bg-[linear-gradient(135deg,rgba(2,6,23,.96),rgba(8,47,73,.9)_42%,rgba(15,23,42,.96)_100%)]" />
      <div
        className="absolute -inset-20 opacity-80 blur-3xl dark:opacity-50"
        style={{
          animation: "ppHeroAurora 16s ease-in-out infinite",
          background:
            "linear-gradient(120deg, rgba(14,165,233,.28), transparent 28%, rgba(56,189,248,.24) 46%, rgba(99,102,241,.18) 68%, transparent)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.22] dark:opacity-[0.16]"
        style={{
          animation: "ppHeroGrid 18s linear infinite",
          backgroundImage:
            "linear-gradient(rgba(14,165,233,.26) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,.26) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
          maskImage: "linear-gradient(to bottom, transparent, black 14%, black 78%, transparent)",
        }}
      />
      <div
        className="absolute inset-x-[-20%] top-[18%] h-16 rotate-[-8deg] bg-gradient-to-r from-transparent via-white/45 to-transparent blur-xl dark:via-sky-300/10"
        style={{ animation: "ppHeroScan 9s ease-in-out infinite" }}
      />
      <div className="absolute inset-x-6 top-0 h-px overflow-hidden">
        <div
          className="h-px w-2/3 bg-gradient-to-r from-transparent via-sky-300 to-transparent"
          style={{ animation: "ppHeroBorder 6s ease-in-out infinite" }}
        />
      </div>
      {sparks.map((spark, index) => (
        <span
          key={`${spark.left}-${spark.top}`}
          className="absolute h-8 w-px rounded bg-gradient-to-b from-transparent via-sky-400/45 to-transparent dark:via-cyan-200/25"
          style={{
            left: spark.left,
            top: spark.top,
            animation: `ppHeroSpark ${spark.duration} ease-in-out infinite`,
            animationDelay: spark.delay,
            opacity: index % 2 ? 0.7 : 0.48,
          }}
        />
      ))}
    </div>
  );
}

function HeroMetricCard({ icon: Icon, label, value, helper, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, scale: 1.01 }}
      className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white/62 p-4 shadow-[0_18px_50px_-34px_rgba(2,132,199,.65)] backdrop-blur-2xl transition-shadow duration-300 hover:shadow-[0_28px_70px_-42px_rgba(2,132,199,.85)] dark:border-white/10 dark:bg-white/[0.07]"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-cyan-200/30" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-200/70 bg-sky-50/80 text-sky-700 shadow-inner dark:border-sky-300/10 dark:bg-sky-300/10 dark:text-sky-200">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tracking-normal text-sky-950 dark:text-white">
            <AnimatedNumber value={value} />
          </div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">{label}</div>
        </div>
      </div>
      <div className="mt-3 text-xs font-medium leading-5 text-slate-500 dark:text-slate-300">{helper}</div>
    </motion.div>
  );
}

function HeroWeeklyWidget({ weeklyActivity, weeklyActiveDays, weeklyGoal, weeklyTotalActivities, weeklyRemaining }) {
  const progress = Math.min(100, Math.round((weeklyActiveDays / weeklyGoal) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.18, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      className="relative overflow-hidden rounded-[28px] border border-white/65 bg-white/60 p-5 shadow-[0_30px_90px_-58px_rgba(2,132,199,.9)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.075] sm:p-6"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-200 to-transparent dark:via-cyan-200/30" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-200">Live weekly system</div>
          <h2 className="mt-2 text-lg font-black tracking-normal text-sky-950 dark:text-white">Momentum engine</h2>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:border-emerald-300/10 dark:bg-emerald-300/10 dark:text-emerald-200">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,.7)]" />
          Active
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[120px_minmax(0,1fr)] gap-5 max-sm:grid-cols-1">
        <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(148,163,184,.18)" strokeWidth="12" />
            <motion.circle
              cx="60"
              cy="60"
              r="48"
              fill="none"
              stroke="url(#heroProgress)"
              strokeWidth="12"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: progress / 100 }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            />
            <defs>
              <linearGradient id="heroProgress" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="48%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute text-center">
            <div className="text-2xl font-black text-sky-950 dark:text-white">{progress}%</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-400">Goal</div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-7 gap-1.5">
            {weeklyActivity.map((day, index) => (
              <motion.div
                key={day.key}
                initial={{ scaleY: 0.25, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{ delay: 0.34 + index * 0.045, duration: 0.42 }}
                className="flex flex-col items-center gap-2"
              >
                <div className="flex h-20 w-full items-end rounded-full bg-white/60 p-1 shadow-inner dark:bg-white/10">
                  <div
                    title={`${day.fullLabel}: ${day.count} activities`}
                    className="w-full rounded-full bg-gradient-to-t from-sky-600 via-sky-400 to-cyan-200 shadow-[0_0_18px_rgba(14,165,233,.38)]"
                    style={{ height: `${Math.max(10, Math.min(100, day.count * 18))}%` }}
                  />
                </div>
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">{day.label.slice(0, 3)}</div>
              </motion.div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/45 px-4 py-3 text-sm font-semibold leading-6 text-slate-700 dark:border-white/10 dark:bg-white/[0.055] dark:text-slate-200">
            {weeklyRemaining === 0
              ? "Weekly goal reached. Keep the rhythm alive."
              : `${weeklyTotalActivities} activities logged. ${weeklyRemaining} day${weeklyRemaining !== 1 ? "s" : ""} left for the weekly goal.`}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function HeroInsightPanel({ displayAnnouncements, announcementIndex, fallbackThoughts, thoughtIndex, navigate }) {
  const hasAnnouncement = displayAnnouncements.length > 0;
  const activeAnnouncement = hasAnnouncement ? displayAnnouncements[announcementIndex] : null;
  const activeTitle = hasAnnouncement
    ? activeAnnouncement?.title
    : fallbackThoughts[thoughtIndex]?.area;
  const activeText = hasAnnouncement
    ? activeAnnouncement?.message
    : fallbackThoughts[thoughtIndex]?.text;
  const announcementType = String(activeAnnouncement?.type || "info").toLowerCase();
  const announcementTone = announcementType === "alert"
    ? "border-rose-200/70 bg-rose-50/75 text-rose-700 dark:border-rose-300/10 dark:bg-rose-300/10 dark:text-rose-200"
    : announcementType === "motivation"
      ? "border-emerald-200/70 bg-emerald-50/75 text-emerald-700 dark:border-emerald-300/10 dark:bg-emerald-300/10 dark:text-emerald-200"
      : "border-sky-200/70 bg-sky-50/70 text-sky-700 dark:border-sky-300/10 dark:bg-sky-300/10 dark:text-sky-200";
  const dotTone = announcementType === "alert"
    ? "bg-rose-500"
    : announcementType === "motivation"
      ? "bg-emerald-500"
      : "bg-sky-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.28, duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[28px] border border-white/65 bg-white/58 p-4 shadow-[0_28px_80px_-58px_rgba(15,23,42,.55)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.07] sm:p-5"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200 to-transparent dark:via-cyan-200/30" />
      <div className="absolute inset-y-6 right-1/3 w-px rotate-12 bg-gradient-to-b from-transparent via-sky-300/30 to-transparent" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${hasAnnouncement ? announcementTone : "border-sky-200/70 bg-sky-50/70 text-sky-700 dark:border-sky-300/10 dark:bg-sky-300/10 dark:text-sky-200"}`}>
            <span className="relative flex h-2 w-2">
              <motion.span
                className={`absolute inline-flex h-full w-full rounded-full ${hasAnnouncement ? dotTone : "bg-sky-400"} opacity-40`}
                animate={{ scale: [1, 2, 1], opacity: [0.42, 0.02, 0.42] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${hasAnnouncement ? dotTone : "bg-sky-500"}`} />
            </span>
            {hasAnnouncement ? `${announcementType} announcement` : "AI insights"}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeTitle}-${activeText}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              <h2 className="mt-3 text-lg font-black tracking-normal text-sky-950 dark:text-white sm:text-xl">
                {hasAnnouncement ? activeTitle : "Track your performance"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {hasAnnouncement ? activeText : activeText || "Understand your progress, identify gaps, and improve with intelligent insights."}
              </p>
              {hasAnnouncement && displayAnnouncements.length > 1 && (
                <div className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  Update {announcementIndex + 1} of {displayAnnouncements.length}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {hasAnnouncement ? (
          <div className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/55 px-6 py-3 text-sm font-black capitalize text-slate-700 shadow-[0_22px_60px_-44px_rgba(15,23,42,.55)] dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 sm:w-auto">
            <Megaphone className="h-4 w-4 text-sky-600 dark:text-sky-300" />
            {activeAnnouncement?.priority || "normal"} priority
          </div>
        ) : (
          <motion.button
            type="button"
            onClick={() => navigate("/student/analysis")}
            whileHover={{ scale: 1.025, y: -2 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="group relative inline-flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-sky-500 px-6 py-3 text-sm font-black text-white shadow-[0_22px_60px_-34px_rgba(2,132,199,.95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 sm:w-auto"
          >
            <span className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-18deg] bg-white/25 opacity-0 blur-sm transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
            <Sparkles className="relative h-4 w-4" />
            <span className="relative">Check Performance</span>
            <ArrowRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </motion.button>
        )}
      </div>
    </motion.div>
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

        {/* ── 1. PREMIUM DASHBOARD HERO ── */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="relative px-4 pb-6 pt-4 sm:px-6 lg:px-10"
        >
          <div className="relative min-h-[calc(100vh-7rem)] overflow-hidden rounded-[28px] border border-white/70 bg-white/45 shadow-[0_34px_120px_-84px_rgba(2,132,199,.85)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.045]">
            <HeroAmbientBackground />

            <div className="relative z-10 flex min-h-[calc(100vh-7rem)] flex-col justify-between gap-6 p-4 sm:p-6 lg:p-8">
              <div className="grid flex-1 items-center gap-6 lg:grid-cols-[minmax(0,1.18fr)_minmax(340px,.82fr)] xl:gap-8">
                <div className="min-w-0">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08, duration: 0.5 }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-800 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.07] dark:text-sky-200"
                  >
                    <span className="h-1.5 w-6 rounded-full bg-gradient-to-r from-cyan-300 to-sky-600 shadow-[0_0_16px_rgba(14,165,233,.55)]" />
                    PeerPrep student dashboard
                  </motion.div>

                  <motion.h1
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.13, duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-5 max-w-4xl text-4xl font-black leading-[1.04] tracking-normal text-sky-950 dark:text-white sm:text-5xl lg:text-6xl"
                  >
                    Welcome back{user?.name ? "," : ""}{" "}
                    <span className="bg-gradient-to-r from-sky-700 via-blue-600 to-cyan-500 bg-clip-text text-transparent dark:from-sky-200 dark:via-cyan-200 dark:to-white">
                      {user?.name || "Student"}
                    </span>
                  </motion.h1>

                  <motion.p
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.55 }}
                    className="mt-5 max-w-2xl text-base font-medium leading-7 text-slate-600 dark:text-slate-300 sm:text-lg"
                  >
                    Your home for interviews, assessments, learning modules, and coding practice, tuned for consistent placement momentum.
                  </motion.p>

                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28, duration: 0.55 }}
                    className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center"
                  >
                    <motion.button
                      type="button"
                      onClick={() => navigate("/problems")}
                      whileHover={{ y: -2, scale: 1.025 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 320, damping: 21 }}
                      className="group relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-sky-500 px-6 py-3 text-sm font-black text-white shadow-[0_24px_70px_-38px_rgba(2,132,199,.95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                    >
                      <span className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-18deg] bg-white/25 opacity-0 blur-sm transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
                      <Code2 className="relative h-4 w-4" />
                      <span className="relative">Start Practice</span>
                      <ArrowRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </motion.button>

                    <motion.button
                      type="button"
                      onClick={() => navigate("/student/assessments")}
                      whileHover={{ y: -2, scale: 1.018 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 320, damping: 22 }}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/48 px-6 py-3 text-sm font-black text-sky-900 shadow-sm backdrop-blur-xl transition-colors duration-300 hover:bg-white/68 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 dark:border-white/10 dark:bg-white/[0.07] dark:text-sky-100 dark:hover:bg-white/[0.1]"
                    >
                      <ClipboardList className="h-4 w-4" />
                      View Assessments
                    </motion.button>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.36, duration: 0.58 }}
                    className="mt-6"
                  >
                    <QuickNav navigate={navigate} />
                  </motion.div>
                </div>

                <div className="min-w-0 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <HeroMetricCard
                      icon={Calendar}
                      label="Interviews"
                      value={upcomingInterviews}
                      helper="Upcoming joined sessions"
                      delay={0.2}
                    />
                    <HeroMetricCard
                      icon={ClipboardList}
                      label="Assessments"
                      value={activeAssessments}
                      helper="Pending assessment actions"
                      delay={0.26}
                    />
                  </div>
                  <HeroWeeklyWidget
                    weeklyActivity={weeklyActivity}
                    weeklyActiveDays={weeklyActiveDays}
                    weeklyGoal={weeklyGoal}
                    weeklyTotalActivities={weeklyTotalActivities}
                    weeklyRemaining={weeklyRemaining}
                  />
                </div>
              </div>

              <HeroInsightPanel
                displayAnnouncements={displayAnnouncements}
                announcementIndex={announcementIndex}
                fallbackThoughts={fallbackThoughts}
                thoughtIndex={thoughtIndex}
                navigate={navigate}
              />
            </div>
          </div>
        </motion.section>

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
