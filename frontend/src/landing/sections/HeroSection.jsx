export default function HeroSection({ onPrimaryAction }) {
  return (
    <section id="home" className="relative isolate h-[calc(100svh-92px)] min-h-[520px] overflow-hidden bg-[#fbfdff] sm:h-[calc(100svh-96px)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[44%] top-[29%] h-[84%] w-[128%] rotate-[-4deg] rounded-[50%] bg-[#e8f5ff] sm:-right-[30%] sm:top-[24%] sm:w-[116%] lg:-right-[18%] lg:top-[18%] lg:h-[92%] lg:w-[104%]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[48%] top-[51%] h-[68%] w-[112%] rotate-[-3deg] rounded-[50%] bg-[#fbfdff] sm:-right-[32%] sm:top-[48%] sm:w-[101%] lg:-right-[20%] lg:top-[45%] lg:h-[72%] lg:w-[91%]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[31%] top-[61%] h-[58%] w-[79%] rotate-[7deg] rounded-[50%] bg-[#f0f8ff] sm:-left-[20%] sm:top-[57%] sm:w-[67%] lg:-left-[12%] lg:top-[54%] lg:h-[64%] lg:w-[57%]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[19%] top-[74%] h-[47%] w-[108%] rotate-[3deg] rounded-[50%] bg-[#f8fbff] sm:-left-[12%] sm:top-[72%] lg:-left-[6%] lg:top-[69%]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 h-14 w-[62%] max-w-4xl -translate-x-1/2 rounded-full bg-[#125ca3]/8 blur-3xl"
      />

      <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col items-center px-4 pt-7 text-center sm:px-6 sm:pt-9 lg:px-8 lg:pt-10">
        <h1 className="max-w-4xl text-balance font-sans text-[2.35rem] font-extrabold leading-[1.04] tracking-[-0.035em] text-[#10233f] sm:text-[3.15rem] lg:text-[3.75rem]">
          Practice with purpose.
          <span className="block text-[#1264a6]">Land the offer.</span>
        </h1>

        <p className="mt-4 max-w-xl text-pretty text-sm font-medium leading-6 text-[#49627a] sm:mt-5 sm:text-base sm:leading-7">
          One focused platform for coding practice, realistic assessments, and
          feedback that moves you forward.
        </p>

        <button
          type="button"
          onClick={onPrimaryAction}
          className="group mt-5 inline-flex min-h-12 items-center justify-center gap-2.5 rounded-lg bg-[#089ee4] px-6 py-3 text-sm font-bold text-white shadow-[0_12px_24px_-14px_rgba(2,132,199,0.95)] transition hover:-translate-y-0.5 hover:bg-[#078cc9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 active:translate-y-0 sm:mt-6 sm:px-7 sm:text-base"
        >
          Start preparing
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 fill-none stroke-current transition-transform duration-200 group-hover:translate-x-0.5"
            strokeWidth="2.5"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>

        <div className="relative mt-auto flex min-h-0 w-full flex-1 items-end justify-center pt-5 sm:pt-6">
          <img
            src="/images/heroo.webp"
            alt="Students using PeerPrep for coding practice, mock interviews, and performance analysis"
            width="1280"
            height="358"
            fetchPriority="high"
            decoding="async"
            className="relative block max-h-full w-full max-w-[76rem] object-contain object-bottom"
          />
        </div>
      </div>
    </section>
  );
}
