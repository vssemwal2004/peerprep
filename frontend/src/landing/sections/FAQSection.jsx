const FAQS = [
  {
    q: "What is PeerPrep?",
    a: "PeerPrep is a placement preparation platform that combines mock interviews, DSA practice, assessments, and performance analytics into one focused workflow.",
  },
  {
    q: "How do mock interviews work?",
    a: "You join an interview event, get paired automatically, propose a suitable time, confirm a slot with your partner, and join the session using the generated meeting link.",
  },
  {
    q: "When will the meeting link be available?",
    a: "After the interview is scheduled, a meeting link is generated. The UI typically allows joining closer to the interview time to keep sessions organized.",
  },
  {
    q: "Can I reschedule if the proposed time doesn’t work?",
    a: "Yes. You and your partner can propose a new time and confirm it. The scheduling flow keeps the latest proposal active and records past proposals for clarity.",
  },
  {
    q: "Who can submit feedback and when?",
    a: "Feedback is submitted after the session by the interviewer. This keeps feedback consistent and aligned with the completed interview.",
  },
  {
    q: "What do assessments include?",
    a: "Assessments are structured practice tests with clear rules and a timed environment. Your submissions and outcomes are tracked so you can review progress.",
  },
  {
    q: "How does Problem Solve help my preparation?",
    a: "It helps you practice curated DSA problems with a clean workflow for revision, pattern-building, and steady improvement.",
  },
  {
    q: "What can I see in Analyse Performance?",
    a: "You can view trends and gaps across practice and sessions to prioritize what to improve next, instead of relying on guesswork.",
  },
  {
    q: "Do I need to install anything to use PeerPrep?",
    a: "No. PeerPrep runs in the browser. You just need an internet connection and a modern browser.",
  },
  {
    q: "Is my data private?",
    a: "PeerPrep is designed to handle your account and preparation data responsibly. You can review the Privacy Policy for full details.",
  },
];

export default function FAQSection({ sectionRef } = {}) {
  return (
    <section id="faqs" className="relative z-10 py-20" ref={sectionRef}>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
            FAQs
            <span className="mt-2 block bg-gradient-to-r from-slate-900 via-sky-800 to-indigo-900 bg-clip-text text-transparent dark:from-slate-100 dark:via-sky-300 dark:to-indigo-300">
              Quick answers about PeerPrep
            </span>
          </h2>
          <p className="mt-4 text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
            Everything you need to know about mock interviews, scheduling, feedback, assessments, and analytics.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {FAQS.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-slate-700/75 dark:bg-slate-900/40 dark:shadow-none"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-50 sm:text-base">{item.q}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/70 text-slate-700 transition-transform duration-200 group-open:rotate-180 dark:border-slate-700/80 dark:bg-slate-900/40 dark:text-slate-200">
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </summary>
              <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
