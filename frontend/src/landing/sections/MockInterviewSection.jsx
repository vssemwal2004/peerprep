const learnerCompanies = [
  { name: "Google", logo: "/images/recruiters/google.svg" },
  { name: "Microsoft", logo: "/images/recruiters/microsoft.svg" },
  { name: "Amazon", logo: "/images/recruiters/amazon.svg" },
  { name: "Adobe", logo: "/images/recruiters/adobe.svg" },
  { name: "Atlassian", logo: "/images/recruiters/atlassian.svg" },
  { name: "Visa", logo: "/images/recruiters/visa.svg" },
];

export default function MockInterviewSection({ onPrimaryAction }) {
  return (
    <section id="mock-interviews" className="bg-white py-12 sm:py-14 lg:py-16" aria-labelledby="mock-interview-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-8 lg:grid-cols-[0.98fr_1.02fr] lg:gap-12">
          <div className="max-w-2xl">
            <h2
              id="mock-interview-heading"
              className="text-3xl font-medium leading-[1.25] tracking-normal text-slate-600 sm:text-4xl lg:text-[2.65rem]"
            >
              Unsure how you will perform in a real interview?
            </h2>

            <p className="mt-6 text-3xl font-medium leading-[1.25] tracking-normal text-slate-600 sm:text-4xl lg:text-[2.65rem]">
              Take a
            </p>

            <p className="mt-3 inline-block rounded-md bg-sky-50 px-2 text-4xl font-semibold leading-[1.12] tracking-normal text-sky-500 sm:text-5xl lg:text-[4.15rem]">
              Live Peer Mock Interview
            </p>

            <p className="mt-5 text-3xl font-medium leading-[1.25] tracking-normal text-slate-600 sm:text-4xl lg:text-[2.45rem]">
              with students preparing like you
            </p>

            <p className="mt-5 max-w-xl text-base font-medium leading-7 text-slate-500 sm:text-lg">
              Pair up, solve interview-style problems live, and exchange practical feedback before your company round.
            </p>

            <button
              type="button"
              onClick={onPrimaryAction}
              className="mt-7 inline-flex items-center justify-center rounded-lg bg-cyan-600 px-7 py-4 text-base font-extrabold text-white shadow-[0_14px_30px_rgba(8,145,178,0.22)] transition hover:-translate-y-0.5 hover:bg-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
            >
              Attempt now
            </button>
          </div>

          <div className="relative">
            <div className="absolute -inset-x-4 bottom-4 h-20 rounded-full bg-sky-100/70 blur-3xl" aria-hidden="true" />
            <img
              src="/images/interview-section-hero.webp"
              alt="Students practicing a peer mock interview on PeerPrep"
              width="920"
              height="603"
              loading="lazy"
              decoding="async"
              className="relative mx-auto w-full max-w-[640px] object-contain lg:ml-auto"
            />
          </div>
        </div>

        <div className="mt-9 sm:mt-10">
          <p className="text-base font-medium text-slate-500 sm:text-lg">Our learners prepare for interviews at</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4 sm:gap-x-10 lg:gap-x-12">
            {learnerCompanies.map((company) => (
              <img
                key={company.name}
                src={company.logo}
                alt={`${company.name} logo`}
                width="132"
                height="44"
                loading="lazy"
                decoding="async"
                className="h-8 w-auto max-w-[132px] object-contain sm:h-9"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
