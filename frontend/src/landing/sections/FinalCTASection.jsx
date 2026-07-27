export default function FinalCTASection({ onPrimaryAction }) {
  return (
    <section className="bg-white py-14 sm:py-16 lg:py-20" aria-labelledby="final-cta-heading">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <p className="text-3xl font-light leading-tight tracking-normal text-slate-600 sm:text-4xl">
          Start preparing for
        </p>
        <h2
          id="final-cta-heading"
          className="mx-auto mt-4 inline-block rounded-sm bg-cyan-100 px-4 py-1 text-5xl font-extrabold leading-tight tracking-tight text-slate-700 sm:text-6xl lg:text-[4.75rem]"
        >
          Your Next Tech Round
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-slate-500 sm:text-lg">
          Practice problems, take assessments, follow guided learning, and build interview confidence in one focused
          placement preparation flow.
        </p>
        <button
          type="button"
          onClick={onPrimaryAction}
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-cyan-500 px-9 py-4 text-lg font-extrabold text-white shadow-[0_6px_0_#087987,0_18px_34px_rgba(8,145,178,0.18)] transition hover:-translate-y-0.5 hover:bg-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
        >
          Get started for free <span className="ml-3" aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
