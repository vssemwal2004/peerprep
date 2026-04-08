import { useMemo } from "react";
const CONTENT = {
  mock: {
    heading: "Mock Interview Practice",
    highlight: "Built for real interview confidence",
    subline:
      "Pair up fast, lock a slot smoothly, and run a full interview session with structured feedback — the PeerPrep way.",
    body:
      "From scheduling to reminders to post-session feedback, everything stays in one clean workflow so you focus only on performance.",
    image: "/images/interview-img.webp",
    chips: [
      "Pairing",
      "Smart scheduling",
      "Interview session",
      "Feedback",
      "Reminders",
    ],
  },
  assessments: {
    heading: "Assessments",
    highlight: "Clear scoring. Cleaner preparation.",
    subline:
      "Run structured assessments with consistent rules and visibility — so your practice feels closer to real hiring tests.",
    body:
      "PeerPrep keeps attempts, submissions, and outcomes organized so you always know where you stand and what to improve next.",
    image: "/images/assesment_img.webp",
    chips: ["Timed tests", "Rules", "Submissions", "Reports"],
  },
  learning: {
    heading: "Learning Modules",
    highlight: "Consistency that compounds",
    subline:
      "Build strong fundamentals with guided learning that supports your daily routine and reduces random, unfocused prep.",
    body:
      "PeerPrep helps you connect concepts to practice so improvements feel measurable, not accidental.",
    image: "/images/loginimg.webp",
    chips: ["Guided learning", "Concepts", "Practice", "Consistency"],
  },
  problems: {
    heading: "Problem Solve",
    highlight: "Speed + accuracy, tracked",
    subline:
      "Solve curated problems with a clean flow designed for revision, pattern-building, and interview-style thinking.",
    body:
      "PeerPrep keeps your problem practice structured so you can iterate faster and revisit weak areas without chaos.",
    image: "/images/img%201.png",
    chips: ["DSA practice", "Difficulty", "Progress", "Revision"],
  },
  analytics: {
    heading: "Analyse Performance",
    highlight: "Turn data into direction",
    subline:
      "See your trends across sessions and practice so you can prioritize the next best improvement — not guesswork.",
    body:
      "PeerPrep highlights progress, stability, and gaps so you can plan smarter and stay confident before interviews.",
    image: "/images/analysis-img.webp",
    chips: ["Progress analytics", "Trends", "Benchmarks", "Insights"],
  },
};

export default function FeatureDeepDiveSection({
  activeTab,
  sectionRef,
}) {
  const content = useMemo(() => CONTENT[activeTab] ?? CONTENT.mock, [activeTab]);

  return (
    <section
      id="platform-preview"
      ref={sectionRef}
      className="relative scroll-mt-28 -mt-24 overflow-hidden pt-10 pb-16 sm:pt-12"
    >
      {/* Bluish shade stack (top fade + mid band + center glow) */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: [
            // soft top-to-bottom tint so it blends from hero
            "linear-gradient(to bottom, rgba(224,242,254,0) 0%, rgba(224,242,254,0.06) 18%, rgba(224,242,254,0.22) 70%, rgba(224,242,254,0.12) 100%)",
            // mid-section horizontal band like the reference
            "linear-gradient(to bottom, rgba(56,189,248,0) 0%, rgba(56,189,248,0.10) 48%, rgba(56,189,248,0) 88%)",
            // center glow to avoid the middle looking 'flat'
            "radial-gradient(circle at 50% 52%, rgba(56,189,248,0.18) 0%, rgba(56,189,248,0.0) 62%)",
          ].join(", "),
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="flex w-full justify-start">
            <img
              src={content.image}
              alt={content.heading}
              className="w-full max-w-md select-none object-contain"
              loading="lazy"
              draggable="false"
            />
          </div>

          <div className="max-w-xl text-left">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {content.heading}
              <span className="mt-2 block bg-gradient-to-r from-slate-900 via-sky-800 to-indigo-900 bg-clip-text text-transparent">
                {content.highlight}
              </span>
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-600 sm:text-lg">
              {content.subline}
            </p>
            <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
              {content.body}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {content.chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-slate-200/80 bg-white/65 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_12px_35px_-26px_rgba(15,23,42,0.22)] backdrop-blur"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
