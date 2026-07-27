import { useState } from "react";

const faqs = [
  {
    question: "What is PeerPrep?",
    answer:
      "PeerPrep is a placement preparation platform where students can practice coding problems, follow learning modules, take assessments, and prepare through peer mock interviews.",
  },
  {
    question: "Who can use PeerPrep?",
    answer:
      "PeerPrep is built for college students preparing for internships, campus placements, coding tests, and technical interviews.",
  },
  {
    question: "Does PeerPrep provide coding practice?",
    answer:
      "Yes. Students can solve topic-wise coding problems, practice DSA, and improve through structured problem-solving flows.",
  },
  {
    question: "Are assessment tests available?",
    answer:
      "Yes. PeerPrep supports assessment-style practice so students can test speed, accuracy, and readiness before company rounds.",
  },
  {
    question: "Can students track their performance?",
    answer:
      "Yes. The platform is designed to help students understand progress, weak areas, consistency, and improvement over time.",
  },
  {
    question: "How do mock interviews work?",
    answer:
      "Students can practice with other students in a peer-to-peer mock interview setup and exchange feedback after the session.",
  },
  {
    question: "Is the mock interview real-time?",
    answer:
      "The mock interview section represents live practice where students collaborate, solve questions, and build interview confidence.",
  },
  {
    question: "Does PeerPrep help with semester-wise preparation?",
    answer:
      "Yes. The learning module is planned around semester-wise placement preparation so students can follow the right order.",
  },
  {
    question: "What is included in the learning module?",
    answer:
      "The learning module can include curated playlists, notes, content resources, topic order, and progress tracking.",
  },
  {
    question: "Are playlists curated by professors?",
    answer:
      "The section is designed to represent trusted, professor-curated or expert-recommended learning playlists and resources.",
  },
  {
    question: "Can PeerPrep be used for DSA preparation?",
    answer:
      "Yes. DSA practice is one of the core areas, including topic-based practice and company-style problem solving.",
  },
  {
    question: "Can beginners start with PeerPrep?",
    answer:
      "Yes. The flow is structured so beginners can start with basics and gradually move toward assessments and interviews.",
  },
  {
    question: "Is PeerPrep only for final-year students?",
    answer:
      "No. Students from earlier semesters can also use it to build coding and interview skills step by step.",
  },
  {
    question: "Does it show company preparation context?",
    answer:
      "Yes. The landing page includes recruiter/company context to show placement-focused preparation.",
  },
  {
    question: "Can students revise solved problems?",
    answer:
      "The problem-solving flow is designed to support revision, marked problems, and repeated practice.",
  },
  {
    question: "Will students get feedback?",
    answer:
      "Peer mock interviews are planned around practical peer feedback, helping students improve communication and problem-solving clarity.",
  },
  {
    question: "Does PeerPrep support coding test readiness?",
    answer:
      "Yes. Assessment tests and timed practice help students prepare for screening rounds and coding evaluations.",
  },
  {
    question: "Is the landing page optimized for fast loading?",
    answer:
      "Yes. The landing page uses lightweight sections, optimized images, lazy loading, and simple UI patterns.",
  },
  {
    question: "Can this platform be expanded later?",
    answer:
      "Yes. The landing page is being built section by section so more modules, testimonials, stats, and features can be added cleanly.",
  },
  {
    question: "How do I start using PeerPrep?",
    answer:
      "Click the login or start button and continue into the student area to begin preparation.",
  },
  {
    question: "Is PeerPrep focused on placement preparation?",
    answer:
      "Yes. Every major section is aligned with placement readiness: learning, practice, assessments, mock interviews, and performance improvement.",
  },
  {
    question: "Who developed PeerPrep?",
    answer: "PeerPrep is developed by Anubhav and Vivek.",
  },
];

export default function FAQSection() {
  const [showAll, setShowAll] = useState(false);
  const visibleFaqs = showAll ? faqs : faqs.slice(0, 6);

  return (
    <section id="faq" className="bg-white py-12 sm:py-14 lg:py-16" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-sky-500">FAQ</p>
          <h2 id="faq-heading" className="mt-3 text-3xl font-medium leading-tight text-slate-700 sm:text-4xl">
            Questions students usually ask before starting.
          </h2>
          <p className="mt-4 text-base font-medium leading-7 text-slate-500">
            Clear answers about practice, assessments, learning modules, mock interviews, and placement preparation.
          </p>
        </div>

        <div className="mt-8 grid gap-3">
          {visibleFaqs.map((faq, index) => (
            <details
              key={faq.question}
              className="group rounded-xl border border-sky-100 bg-[#f8fcff] px-5 py-4 shadow-[0_8px_24px_rgba(14,116,144,0.045)] open:bg-white open:shadow-[0_14px_32px_rgba(14,116,144,0.08)]"
              open={index === 0}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-extrabold text-slate-800 marker:hidden">
                <span>{faq.question}</span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-lg leading-none text-sky-700 transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-slate-500">{faq.answer}</p>
            </details>
          ))}
        </div>

        <div className="mt-7 text-center">
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            className="inline-flex items-center justify-center rounded-lg border border-sky-200 bg-white px-6 py-3 text-sm font-extrabold text-sky-700 shadow-[0_10px_24px_rgba(14,116,144,0.06)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
            aria-expanded={showAll}
          >
            {showAll ? "Show fewer questions" : "Show more questions"}
          </button>
        </div>
      </div>
    </section>
  );
}
