import { useEffect, useLayoutEffect, useRef } from "react";
import { MessageSquareText, Mic, PauseCircle, Repeat2, SkipForward, X } from "lucide-react";
import { AnviMark } from "../../../components/AnviApproach";
import { initialsOf, surface, surfaceRing, surfaceShadow } from "./callUtils";

const TABS = [
  { id: "question", label: "Question" },
  { id: "transcript", label: "Transcript" },
];

const TIPS = [
  { Icon: PauseCircle, title: "Pause for 2 seconds", text: "ANVI takes a pause as the end of your answer." },
  { Icon: Repeat2, title: "Say “repeat”", text: "Hear the current question again." },
  { Icon: SkipForward, title: "Say “skip”", text: "Move ahead naturally in the interview." },
  { Icon: Mic, title: "Just speak", text: "There is nothing to click to answer." },
];

const seconds = (ms) => {
  const value = Math.round((Number(ms) > 0 ? Number(ms) : 2000) / 100) / 10;
  return `${value} second${value === 1 ? "" : "s"}`;
};

/** A hybrid call's tips: hands-free answers end after the server's pause length. */
function hybridTips({ hangoverMs }) {
  return [
    { Icon: Mic, title: "Just speak", text: "There is nothing to press. ANVI listens as soon as she finishes asking." },
    { Icon: PauseCircle, title: `Pause for ${seconds(hangoverMs)}`, text: "ANVI takes the pause as the end of your answer and replies." },
    { Icon: Repeat2, title: "Say “repeat” or press Repeat", text: "Hear the current question again." },
    { Icon: SkipForward, title: "Say “skip”", text: "Move ahead naturally in the interview." },
  ];
}

/** Same look wherever it sits, including inside uppercase eyebrow labels. */
export function FollowUpChip() {
  return <span className="inline-flex items-center rounded-full bg-fuchsia-100 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-fuchsia-700 ring-1 ring-inset ring-fuchsia-300/70 dark:bg-fuchsia-400/15 dark:text-fuchsia-200 dark:ring-fuchsia-400/30">Follow-up</span>;
}

function QuestionTab({ followUp, questionText, hybrid = null }) {
  const tips = hybrid ? hybridTips(hybrid) : TIPS;
  return <div className="space-y-6 p-5">
    <div>
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">Current conversation</p>
        {followUp && <FollowUpChip />}
      </div>
      <p className="mt-4 text-[17px] font-medium leading-relaxed text-slate-900 dark:text-zinc-50">
        {questionText || "ANVI will guide the conversation naturally."}
      </p>
    </div>
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-500">Voice tips</h3>
      <ul className="mt-3 space-y-2">
        {tips.map(({ Icon, title, text }) => <li key={title} className="flex gap-3 rounded-xl bg-slate-900/[0.025] p-3 ring-1 ring-inset ring-slate-900/[0.05] dark:bg-white/[0.03] dark:ring-white/[0.06]">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden="true" />
          <span className="min-w-0 text-sm"><span className="block font-medium text-slate-800 dark:text-zinc-100">{title}</span><span className="block text-slate-500 dark:text-zinc-400">{text}</span></span>
        </li>)}
      </ul>
    </div>
  </div>;
}

function TranscriptTab({ captions, studentName }) {
  const listRef = useRef(null);
  const stickRef = useRef(true);
  // Follow new lines unless the student scrolled up to read earlier ones.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stickRef.current) list.scrollTop = list.scrollHeight;
  }, [captions]);
  useEffect(() => { stickRef.current = true; }, []);
  const onScroll = () => {
    const list = listRef.current;
    if (list) stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  };
  const initials = initialsOf(studentName);
  return <div ref={listRef} onScroll={onScroll} id="anvi-transcript" role="log" aria-live="off" aria-label="Interview transcript" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
    {captions.length ? <ol className="space-y-4">
      {captions.map((line) => {
        const anvi = line.role === "anvi";
        return <li key={line.id} className="flex gap-3">
          {anvi ? <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-900/10 dark:bg-white/[0.06] dark:ring-white/10"><AnviMark className="h-5 w-5" /></span>
            : <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-[10px] font-semibold text-white">{initials}</span>}
          <div className="min-w-0">
            <p className={`text-xs font-semibold ${anvi ? "text-violet-700 dark:text-violet-300" : "text-sky-700 dark:text-sky-300"}`}>{anvi ? "ANVI" : "You"}</p>
            <p className={`mt-0.5 text-sm leading-6 ${anvi ? "text-slate-800 dark:text-zinc-100" : "text-slate-600 dark:text-zinc-300"}`}>{line.text}</p>
          </div>
        </li>;
      })}
    </ol> : <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <MessageSquareText className="h-8 w-8 text-slate-300 dark:text-zinc-600" aria-hidden="true" />
      <p className="mt-3 text-sm text-slate-500 dark:text-zinc-400">The transcript appears here as you and ANVI talk.</p>
    </div>}
  </div>;
}

/**
 * The call's side panel: the current question with voice tips, and the full transcript.
 * `variant="dock"` sits beside the stage on wide screens; `"sheet"` slides up over it on phones.
 */
export default function SidePanel({ variant = "dock", tab, onTab, onClose, followUp, questionText, captions, studentName, hybrid = null }) {
  const sheet = variant === "sheet";
  const onKeyDown = (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = TABS.findIndex((item) => item.id === tab);
    const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    onTab(next.id);
    event.currentTarget.querySelector(`#anvi-tab-${next.id}`)?.focus();
  };
  useEffect(() => {
    if (!sheet) return undefined;
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, onClose]);

  const panel = (
    <aside id="anvi-side-panel" aria-label="Interview panel"
      className={sheet
        ? "fixed inset-x-0 bottom-0 z-[85] flex max-h-[78vh] flex-col rounded-t-3xl bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/10 dark:bg-[#151922] dark:shadow-[0_-20px_60px_rgba(0,0,0,0.5)] dark:ring-white/10"
        // Docked: the Question tab fits its content; the Transcript tab fills the column so it can scroll.
        : `flex w-[360px] shrink-0 flex-col overflow-hidden rounded-2xl ring-1 xl:w-[380px] ${surface} ${surfaceRing} ${surfaceShadow} ${tab === "transcript" ? "mb-[max(1rem,env(safe-area-inset-bottom))]" : "max-h-[calc(100%-1rem)] self-start"}`}>
      {sheet && <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-900/15 dark:bg-white/20" />}
      <div className="flex items-center justify-between gap-2 border-b border-slate-900/[0.06] px-3 py-2.5 dark:border-white/[0.07]">
        <div role="tablist" aria-label="Panel" onKeyDown={onKeyDown} className="flex gap-1 rounded-full bg-slate-900/[0.05] p-1 dark:bg-black/30">
          {TABS.map((item) => <button key={item.id} id={`anvi-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`anvi-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1}
            onClick={() => onTab(item.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:focus-visible:outline-violet-400 ${tab === item.id ? "bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white dark:shadow-none" : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-100"}`}>{item.label}</button>)}
        </div>
        <button type="button" onClick={onClose} aria-label="Close panel" className="rounded-full p-2 text-slate-400 hover:bg-slate-900/5 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:outline-violet-400"><X className="h-4 w-4" /></button>
      </div>
      <div id={`anvi-panel-${tab}`} role="tabpanel" aria-labelledby={`anvi-tab-${tab}`} className={`flex min-h-0 flex-1 flex-col ${tab === "transcript" ? "" : "overflow-y-auto overscroll-contain"}`}>
        {tab === "transcript"
          ? <TranscriptTab captions={captions} studentName={studentName} />
          : <QuestionTab followUp={followUp} questionText={questionText} hybrid={hybrid} />}
      </div>
    </aside>
  );
  if (!sheet) return panel;
  return <>
    <div aria-hidden="true" className="fixed inset-0 z-[84] bg-slate-900/30 backdrop-blur-[2px] dark:bg-black/50" onClick={onClose} />
    {panel}
  </>;
}
