import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  MessageSquareText,
  Sparkles,
  Target,
} from "lucide-react";
import { FEATURE_TABS } from "../constants/featureTabs";

const MotionH1 = motion.h1;
const MotionP = motion.p;
const MotionDiv = motion.div;
const MotionButton = motion.button;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      delay,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

export default function HeroSection({
  onPrimaryAction,
  onSecondaryAction,
  activeTab,
  onTabSelect,
}) {
  const [internalTab, setInternalTab] = useState(FEATURE_TABS[0].key);
  const resolvedActiveTab = activeTab ?? internalTab;

  const handleTabClick = (key) => {
    if (onTabSelect) onTabSelect(key);
    else setInternalTab(key);
  };

  return (
    <section className="relative min-h-screen overflow-hidden">

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pt-28 pb-4 sm:px-6 lg:px-8">
        <div className="flex flex-1 -translate-y-12 flex-col items-center justify-center text-center">
         
           

          <MotionH1
            custom={0.1}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="mt-8 max-w-5xl text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-5xl md:text-6xl"
          >
            Practice Smart. Track Progress.
            <span className="block bg-gradient-to-r from-slate-900 via-sky-700 to-indigo-700 bg-clip-text text-transparent dark:from-slate-100 dark:via-sky-300 dark:to-indigo-300">
              Crack Every Interview.
            </span>
          </MotionH1>

          <MotionP
            custom={0.2}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="mt-6 max-w-2xl text-base leading-8 text-slate-500 dark:text-slate-300 sm:text-lg"
          >
            PeerPrep brings DSA practice, mock interviews, AI-driven feedback, assessments, and progress analytics into one focused workflow so every prep session moves you closer to interview-ready confidence.
          </MotionP>

          <MotionDiv
            custom={0.3}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
          >
            <MotionButton
              type="button"
              onClick={onPrimaryAction}
              whileHover={{ scale: 1.05, y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_22px_50px_-25px_rgba(37,99,235,0.55)] transition-all duration-300"
            >
              Start Practicing
              <ArrowRight className="h-4 w-4" />
            </MotionButton>

            <MotionButton
              type="button"
              onClick={onSecondaryAction}
              whileHover={{ scale: 1.05, y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/85 px-6 py-3 text-sm font-semibold text-emerald-700 shadow-[0_18px_45px_-30px_rgba(16,185,129,0.28)] backdrop-blur-xl transition-all duration-300 hover:border-emerald-300 hover:text-emerald-800 dark:border-slate-700/80 dark:bg-slate-900/40 dark:text-emerald-200 dark:shadow-none dark:hover:border-slate-600 dark:hover:text-emerald-100"
            >
              Explore Platform
              <Target className="h-4 w-4" />
            </MotionButton>
          </MotionDiv>

          <MotionDiv
            custom={0.38}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="mt-24 w-full max-w-4xl"
          >
            <div className="mx-auto flex w-full items-center justify-center">
              <div className="w-full max-w-4xl rounded-2xl border border-slate-200/80 bg-white/75 p-2 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/40 dark:shadow-none">
                <div className="flex items-center gap-2 overflow-x-auto sm:grid sm:grid-cols-5 sm:gap-2 sm:overflow-visible">
                {FEATURE_TABS.map((tab) => {
                  const isActive = tab.key === resolvedActiveTab;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => handleTabClick(tab.key)}
                      className={
                        "whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-semibold transition-colors duration-200 sm:w-full sm:text-center " +
                        (isActive
                          ? tab.activeClass
                          : "border-transparent bg-transparent " + tab.idleClass)
                      }
                    >
                      {tab.label}
                    </button>
                  );
                })}
                </div>
              </div>
            </div>
          </MotionDiv>
        </div>
      </div>
    </section>
  );
}
