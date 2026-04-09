import { motion } from "framer-motion";
import { ArrowRight, Target } from "lucide-react";

const MotionDiv = motion.div;
const MotionH2 = motion.h2;
const MotionP = motion.p;
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

export default function GetReadySection({ onPrimaryAction, onSecondaryAction }) {
  return (
    <section className="relative z-10 overflow-hidden py-16 sm:py-20">
      {/* Bluish shade stack (top fade + mid band + center glow) */}
      <div
        className="pointer-events-none absolute inset-0 z-0 dark:hidden"
        style={{
          backgroundImage: [
            "linear-gradient(to bottom, rgba(224,242,254,0) 0%, rgba(224,242,254,0.06) 18%, rgba(224,242,254,0.20) 72%, rgba(224,242,254,0.10) 100%)",
            "linear-gradient(to bottom, rgba(56,189,248,0) 0%, rgba(56,189,248,0.10) 50%, rgba(56,189,248,0) 92%)",
            "radial-gradient(circle at 50% 48%, rgba(56,189,248,0.16) 0%, rgba(56,189,248,0.0) 60%)",
          ].join(", "),
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 z-0 hidden dark:block"
        style={{
          backgroundImage: [
            "linear-gradient(to bottom, rgba(2,6,23,0) 0%, rgba(15,23,42,0.20) 20%, rgba(15,23,42,0.52) 74%, rgba(2,6,23,0.26) 100%)",
            "linear-gradient(to bottom, rgba(56,189,248,0) 0%, rgba(56,189,248,0.14) 52%, rgba(56,189,248,0) 92%)",
            "radial-gradient(circle at 50% 48%, rgba(56,189,248,0.14) 0%, rgba(56,189,248,0.0) 62%)",
          ].join(", "),
        }}
      />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <MotionH2
            custom={0.05}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.5 }}
            variants={fadeUp}
            className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-5xl"
          >
            Get Ready
            <span className="mt-2 block bg-gradient-to-r from-slate-900 via-sky-800 to-indigo-900 bg-clip-text text-transparent dark:from-slate-100 dark:via-sky-300 dark:to-indigo-300">
              Your interview-ready sprint starts here
            </span>
          </MotionH2>

          <MotionP
            custom={0.14}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.5 }}
            variants={fadeUp}
            className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300 sm:text-xl"
          >
            A focused routine beats random prep. PeerPrep keeps your learning, practice, assessments,
            and feedback in one clean flow — so every session builds momentum.
          </MotionP>
        </div>

        <MotionDiv
          custom={0.3}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={fadeUp}
          className="relative z-10 mx-auto mt-10 max-w-3xl"
        >
          <div className="space-y-3 text-center text-base leading-8 text-slate-700 dark:text-slate-200 sm:text-lg">
            <p>• Practice with real interview structure: pairing, scheduling, sessions, and feedback.</p>
            <p>• Stay sharp with timed assessments that feel like actual hiring tests.</p>
            <p>• Use performance analytics to spot gaps early and fix them faster.</p>
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
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
              View FAQs
              <Target className="h-4 w-4" />
            </MotionButton>
          </div>

          <p className="mt-8 text-center text-base font-semibold text-slate-600 dark:text-slate-300 sm:text-lg">
            Show up prepared. Track progress. Repeat.
          </p>
        </MotionDiv>
      </div>
    </section>
  );
}
