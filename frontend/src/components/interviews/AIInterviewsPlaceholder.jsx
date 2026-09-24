import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  FileSearch,
  Gauge,
  Languages,
  Mic2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const plannedCapabilities = [
  { Icon: Mic2, title: 'Voice-first conversation', detail: 'Natural turn-taking, pause handling, interruption, and reliable voice fallback.' },
  { Icon: BrainCircuit, title: 'Adaptive interviews', detail: 'Role, job description, resume, rubric, and answer-aware follow-up questions.' },
  { Icon: Languages, title: 'Multilingual foundation', detail: 'Planned support for English, Hindi, and Hinglish with language-specific quality checks.' },
  { Icon: FileSearch, title: 'Reviewable evaluation', detail: 'Evidence-linked scoring, transcript review, human override, and controlled result release.' },
];

export default function AIInterviewsPlaceholder() {
  const location = useLocation();
  const coordinator = location.pathname.startsWith('/coordinator');
  const oneToOnePath = coordinator ? '/coordinator/interviews/one-to-one' : '/admin/interviews/one-to-one';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-gray-950 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="relative overflow-hidden border-b border-slate-200 px-6 py-8 dark:border-gray-800 sm:px-9 sm:py-10">
            <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-sky-100/70 blur-3xl dark:bg-sky-900/20" />
            <div className="absolute right-40 top-16 h-36 w-36 rounded-full bg-violet-100/60 blur-3xl dark:bg-violet-900/20" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  Planned capability
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">AI Interviews</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-gray-300 sm:text-base">
                  A dedicated workspace is reserved for PeerPrep's future AI mock interview system. The experience is being designed around voice reliability, evidence-based feedback, privacy, and administrator control.
                </p>
              </div>
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 to-violet-50 text-sky-700 shadow-inner dark:border-sky-900 dark:from-sky-950/40 dark:to-violet-950/30 dark:text-sky-300">
                <Bot className="h-11 w-11" />
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-6 sm:grid-cols-2 sm:p-9">
            {plannedCapabilities.map(({ Icon, title, detail }) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-gray-800 dark:bg-gray-950/40">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm ring-1 ring-slate-200 dark:bg-gray-900 dark:text-sky-300 dark:ring-gray-800">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-gray-400">{detail}</p>
              </article>
            ))}
          </div>

          <div className="mx-6 mb-6 grid gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/60 dark:bg-amber-950/20 sm:mx-9 sm:mb-9 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <h2 className="text-sm font-bold text-amber-950 dark:text-amber-100">No AI interview functionality is active yet</h2>
                <p className="mt-1 text-sm leading-6 text-amber-800 dark:text-amber-200/80">
                  This page establishes the product boundary only. Model calls, sessions, scoring, recordings, and candidate assignment remain disabled until the architecture and pilot gates are approved.
                </p>
              </div>
            </div>
            <Link to={oneToOnePath} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-gray-200">
              Open one-to-one interviews
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 text-xs text-slate-500 dark:border-gray-800 dark:bg-gray-950/50 dark:text-gray-400 sm:grid-cols-3 sm:px-9">
            <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Voice-first rollout</span>
            <span className="flex items-center gap-2"><Gauge className="h-4 w-4 text-sky-500" /> Cost and capacity controls</span>
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-violet-500" /> Consent and human review</span>
          </div>
        </div>
      </div>
    </main>
  );
}
