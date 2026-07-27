import { ClipboardCheck, Code2, LineChart, TimerReset } from "lucide-react";

const problemFeatures = [
  {
    title: "Practice by Topic",
    description: "Start with arrays, strings, recursion, DP, graphs, and company-style problem sets.",
    Icon: Code2,
  },
  {
    title: "Assessment Tests",
    description: "Attempt timed tests that feel close to real placement screening rounds.",
    Icon: ClipboardCheck,
  },
  {
    title: "Performance Insights",
    description: "See weak topics, accuracy, speed, and consistency so every attempt improves.",
    Icon: LineChart,
  },
  {
    title: "Revision Flow",
    description: "Revisit marked problems and keep a clean preparation rhythm before interviews.",
    Icon: TimerReset,
  },
];

export default function ProblemSolvingSection({ onPrimaryAction }) {
  return (
    <section id="coding-practice" className="bg-[#f7fbff] py-10 sm:py-12 lg:py-14" aria-labelledby="problem-solving-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
          <div className="max-w-xl">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-sky-500">Coding Problem Solver</p>
            <h2
              id="problem-solving-heading"
              className="mt-4 text-3xl font-medium leading-[1.2] tracking-normal text-slate-700 sm:text-4xl lg:text-[2.75rem]"
            >
              Solve problems, take assessments, and improve with every attempt.
            </h2>
            <p className="mt-5 text-base font-medium leading-7 text-slate-500 sm:text-lg">
              PeerPrep helps students practice DSA in a structured way, test readiness through assessments, and track
              performance without making the preparation flow heavy.
            </p>
            <button
              type="button"
              onClick={onPrimaryAction}
              className="mt-7 inline-flex items-center justify-center rounded-lg bg-[#155ea8] px-7 py-3.5 text-base font-extrabold text-white shadow-[0_14px_28px_rgba(21,94,168,0.18)] transition hover:-translate-y-0.5 hover:bg-[#0d4f93] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155ea8]"
            >
              Start solving
            </button>
          </div>

          <div className="relative min-h-[240px] sm:min-h-[320px] lg:min-h-[390px]">
            <div className="absolute inset-x-6 bottom-4 h-24 rounded-full bg-sky-200/45 blur-3xl" aria-hidden="true" />
            <img
              src="/images/solvingproblem-Photoroom.png"
              alt="Student solving coding problems and improving through assessments"
              width="1320"
              height="760"
              loading="lazy"
              decoding="async"
              className="relative mx-auto h-[245px] w-full max-w-[680px] object-contain object-center sm:h-[330px] lg:h-[400px]"
            />
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {problemFeatures.map(({ title, description, Icon }) => (
            <article
              key={title}
              className="rounded-xl border border-sky-100 bg-white p-4 shadow-[0_10px_28px_rgba(15,89,140,0.055)] transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_36px_rgba(15,89,140,0.1)]"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#eef7ff] text-[#155ea8]">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-extrabold leading-6 text-slate-800">{title}</h3>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-500">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
