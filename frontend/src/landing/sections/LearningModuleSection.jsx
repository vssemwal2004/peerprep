import { BarChart3, BookOpenCheck, ClipboardList, GraduationCap } from "lucide-react";

const learningFeatures = [
  {
    title: "Semester-wise Roadmap",
    description: "Placement prep opens in the right academic order.",
    Icon: GraduationCap,
    tone: "bg-sky-50 text-sky-600 border-sky-100",
  },
  {
    title: "Professor Curated Playlists",
    description: "Trusted video playlists mapped topic by topic.",
    Icon: BookOpenCheck,
    tone: "bg-cyan-50 text-cyan-700 border-cyan-100",
  },
  {
    title: "Notes and Content Library",
    description: "Notes, PDFs, sheets, and revision content together.",
    Icon: ClipboardList,
    tone: "bg-blue-50 text-blue-700 border-blue-100",
  },
  {
    title: "Progress Tracking",
    description: "Track watched videos and completed topics.",
    Icon: BarChart3,
    tone: "bg-indigo-50 text-indigo-700 border-indigo-100",
  },
];

export default function LearningModuleSection() {
  return (
    <section id="learning-module" className="bg-white py-10 sm:py-12 lg:py-14" aria-labelledby="learning-module-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2
            id="learning-module-heading"
            className="text-3xl font-black tracking-normal text-[#0b4a86] sm:text-4xl"
          >
            Learning Module
          </h2>
          <div className="mx-auto mt-3 h-1.5 w-44 rounded-full bg-gradient-to-r from-sky-200 via-sky-400 to-transparent" />
          <p className="mt-5 text-base font-medium leading-7 text-slate-600 sm:text-lg">
            Follow a semester-wise placement roadmap with curated playlists, notes, content, and progress tracking in one
            structured learning flow.
          </p>
        </div>

        <div className="mt-8 overflow-hidden rounded-lg border border-sky-100 bg-[#e6f5ff] shadow-[0_16px_40px_rgba(14,116,144,0.07)]">
          <img
            src="/images/learning-module-hero.webp"
            alt="PeerPrep learning module showing semester-wise playlists and study resources"
            width="1160"
            height="260"
            loading="lazy"
            decoding="async"
            className="h-[150px] w-full object-cover object-center sm:h-[190px] lg:h-[230px]"
          />
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {learningFeatures.map(({ title, description, Icon, tone }) => (
            <article
              key={title}
              className="rounded-lg border border-sky-100 bg-[#f7fcff] p-4 text-center shadow-[0_10px_26px_rgba(14,116,144,0.05)] transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white hover:shadow-[0_16px_34px_rgba(14,116,144,0.1)]"
            >
              <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg border ${tone}`}>
                <Icon className="h-7 w-7" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-extrabold leading-6 tracking-normal text-slate-800">{title}</h3>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-500">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
