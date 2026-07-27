const capabilities = [
  {
    title: "Coding Practice",
    eyebrow: "DSA + problem solving",
    image: "/images/coding-card.webp",
    imageAlt: "PeerPrep coding practice",
    href: "#coding-practice",
    tone: "from-blue-600 to-sky-500",
    ring: "hover:border-blue-300 focus-visible:border-blue-400",
  },
  {
    title: "Mock Interviews",
    eyebrow: "peer-to-peer practice",
    image: "/images/mock-card.webp",
    imageAlt: "PeerPrep mock interviews and learning",
    href: "#mock-interviews",
    tone: "from-emerald-600 to-teal-500",
    ring: "hover:border-emerald-300 focus-visible:border-emerald-400",
  },
  {
    title: "Performance Insights",
    eyebrow: "track readiness",
    image: "/images/analyze-card.webp",
    imageAlt: "PeerPrep AI performance insights",
    href: "#coding-practice",
    tone: "from-indigo-600 to-violet-500",
    ring: "hover:border-violet-300 focus-visible:border-violet-400",
  },
];

export default function CapabilityCards() {
  return (
    <section aria-label="PeerPrep capabilities" className="relative bg-[#eef7ff] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col gap-2 text-center sm:mb-6">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-sky-500">Explore PeerPrep</p>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
            Choose what you want to improve first
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:gap-5">
        {capabilities.map((capability) => (
          <a
            key={capability.title}
            href={capability.href}
            aria-label={capability.title}
            className={`group relative overflow-hidden rounded-2xl border border-white/80 bg-white p-2 shadow-[0_16px_38px_rgba(14,116,144,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_48px_rgba(14,116,144,0.13)] focus-visible:outline-none ${capability.ring}`}
          >
            <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-slate-50">
              <img
                src={capability.image}
                alt={capability.imageAlt}
                width="720"
                height="405"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] group-focus-visible:scale-[1.035]"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/40 via-slate-950/10 to-transparent p-4">
                <div className={`rounded-xl bg-gradient-to-r ${capability.tone} px-4 py-3 text-white shadow-lg`}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">{capability.eyebrow}</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-extrabold leading-tight sm:text-xl">{capability.title}</h3>
                    <span className="text-2xl transition group-hover:translate-x-1" aria-hidden="true">→</span>
                  </div>
                </div>
              </div>
            </div>
          </a>
        ))}
        </div>
      </div>
    </section>
  );
}
