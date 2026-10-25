import { useEffect, useRef, useState } from "react";
import { Layers, Loader2, PenLine, Settings2, Shuffle, Sparkles, Undo2, Users, X } from "lucide-react";
import Sections from "../Sections";
import { uid } from "../definition";
import { AnviTile } from "../ui";
import QuestionCard from "./QuestionCard";
import { blankQuestion } from "./defaults";
import {
  addQuestions,
  duplicateQuestion,
  estimate,
  isSimple,
  moveQuestion,
  questionEntries,
  removeQuestion,
  restoreQuestion,
  targetGroupId,
  updateQuestion,
} from "./structure";
import { livePlan } from "./livetopics/counts";
import LiveTopicsEditor from "./livetopics/LiveTopicsEditor";
import { PriorityChip } from "./livetopics/LiveTopicsSummary";
import {
  Alert,
  Chip,
  ChipInput,
  Disclosure,
  NumberField,
  StepHeading,
  TextField,
  buttonGhost,
  buttonPrimary,
  buttonSecondary,
} from "./controls";

const EXAMPLES = [
  "Core JavaScript for a fresher: closures, promises and the event loop, with one practical scenario.",
  "Behavioural questions on teamwork, handling deadlines and learning from a mistake.",
  "REST API design and debugging a slow endpoint for a junior backend developer.",
];

const generationError = (error) => {
  const code = error?.response?.data?.code;
  if (code === "AI_NOT_CONFIGURED" || error?.response?.status === 503)
    return "ANVI isn't set up on the server yet (the AI key is missing), so questions can't be generated. You can still write your own.";
  return error?.message || "ANVI could not generate questions. Try again.";
};

// The secondary path: ANVI drafts one fixed set that the admin reviews and every student gets.
function GenerateComposer({ data, interviewId, api, capacity, onAdd, onClose }) {
  const [requirements, setRequirements] = useState("");
  const [skills, setSkills] = useState([]);
  const maxCount = Math.max(0, Math.min(20, capacity));
  const [count, setCount] = useState(Math.max(1, Math.min(5, maxCount || 1)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const generate = async () => {
    if (!requirements.trim()) {
      setError("Describe what ANVI should ask first.");
      return;
    }
    setBusy(true);
    setError("");
    setAdded(0);
    try {
      const result = await api.generateQuestions(interviewId, {
        groupId: targetGroupId(data) || uid(),
        count: Math.min(count, maxCount),
        requirements: requirements.trim(),
        skills,
        difficulty: data.difficulty || "",
      });
      if (!mounted.current) return;
      const generatedAt = new Date().toISOString();
      const items = (result?.questions || [])
        .filter((q) => q?.prompt?.trim())
        .slice(0, maxCount)
        .map((q) =>
          blankQuestion({
            prompt: q.prompt.trim(),
            expectedAnswer: (q.expectedAnswer || "").trim(),
            provenance: { generated: true, generatedAt },
          }),
        );
      if (!items.length) setError("ANVI did not return any questions. Try again.");
      else {
        onAdd(items);
        setAdded(items.length);
      }
    } catch (err) {
      if (mounted.current) setError(generationError(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <section
      aria-label="Generate and review questions"
      data-generate-composer
      className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
              <AnviTile size="sm" />
              Generate &amp; review
            </h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-gray-400">
              ANVI drafts the questions once. You review and edit them below, and every student gets this same set.
            </p>
          </div>
          <button type="button" className={buttonGhost} aria-label="Close generator" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {maxCount < 1 ? (
          <Alert tone="warning">
            This interview has reached its question limit. Delete questions before generating more.
          </Alert>
        ) : (
          <>
            <div>
              <TextField
                label="Describe what ANVI should ask"
                required
                multiline
                rows={4}
                maxLength={12000}
                value={requirements}
                onChange={(value) => {
                  setRequirements(value);
                  setError("");
                }}
                placeholder="Topics, depth and the kind of questions you want…"
                hint="Include topics, depth and any scenario. ANVI also uses the job role, experience and difficulty from Basics."
              />
              <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Example descriptions">
                <span className="text-xs text-slate-500 dark:text-gray-400">Try:</span>
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setRequirements(example)}
                    className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-indigo-950/50"
                    title={example}
                  >
                    {example.length > 52 ? `${example.slice(0, 50)}…` : example}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">
              <ChipInput
                label="Skills to cover"
                values={skills}
                onChange={setSkills}
                placeholder="Type a skill and press Enter"
              />
              <NumberField
                label="Number of questions"
                stepper
                min={1}
                max={maxCount}
                value={count}
                onChange={setCount}
                hint={`1–${maxCount}`}
              />
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <p role="status" aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-400">
              {busy
                ? ""
                : added
                  ? `Added ${added} question${added === 1 ? "" : "s"} from ANVI. Review them below.`
                  : ""}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" className={buttonSecondary} onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                data-generate-submit
                className={`${buttonPrimary} !bg-violet-600 hover:!bg-violet-700`}
                disabled={busy}
                onClick={generate}
              >
                {busy ? (
                  <Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <Sparkles size={16} aria-hidden="true" />
                )}
                {busy ? "ANVI is writing…" : "Generate questions"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default function StepQuestions({
  interviewId,
  api,
  data,
  onChange,
  errors = {},
  reveal,
  limits,
  readOnly,
  sectionId,
  groupId,
  sectionsRoute = false,
  summary,
}) {
  const simple = isSimple(data);
  const entries = questionEntries(data);
  const counts = estimate(data);
  const plan = livePlan(data, summary);
  const capacity = Math.max(0, limits.questions - counts.total);
  const [composer, setComposer] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [advanced, setAdvanced] = useState(!simple || sectionsRoute);
  const [organize, setOrganize] = useState(!simple || sectionsRoute);
  const [toast, setToast] = useState(null);
  const [seenReveal, setSeenReveal] = useState(null);
  const focusNew = useRef(null);
  // Reveal requests (failed Continue, or a Fix link) open what they point at once,
  // and the admin can still collapse it afterwards. Live topics open in their own editor.
  if (reveal && reveal.nonce !== seenReveal) {
    setSeenReveal(reveal.nonce);
    const fields = reveal.fields || [];
    if (fields.includes("sections") || (reveal.advanced && !fields.includes("live"))) setAdvanced(true);
    if (fields.includes("sections")) setOrganize(true);
    const ids = entries
      .filter((e) => fields.includes(`question:${e.groupId}:${e.index}`))
      .map((e) => e.question.id);
    if (ids.length) setExpanded((previous) => new Set([...previous, ...ids]));
  }
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!focusNew.current) return;
    const card = document.querySelector(`[data-question-id="${focusNew.current}"]`);
    focusNew.current = null;
    card?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    card?.querySelector("textarea, input")?.focus({ preventScroll: true });
  });
  const toggle = (id) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const write = () => {
    if (readOnly || capacity < 1) return;
    const question = blankQuestion();
    onChange(addQuestions(data, [question]).data);
    setExpanded((previous) => new Set([...previous, question.id]));
    focusNew.current = question.id;
  };
  const remove = (entry) => {
    const { data: next, removed } = removeQuestion(data, entry.groupId, entry.question.id);
    if (!removed) return;
    onChange(next);
    setToast({ removed, number: entry.number, key: uid() });
  };
  const card = (entry) => {
    const key = `question:${entry.groupId}:${entry.index}`;
    return (
      <QuestionCard
        key={entry.question.id}
        entry={entry}
        error={errors[key]}
        expanded={expanded.has(entry.question.id)}
        onToggle={() => toggle(entry.question.id)}
        onChange={(question) => onChange(updateQuestion(data, entry.groupId, question))}
        onMove={(delta) => onChange(moveQuestion(data, entry.groupId, entry.index, delta))}
        onDuplicate={() => {
          if (capacity < 1) return;
          onChange(duplicateQuestion(data, entry.groupId, entry.question.id));
        }}
        onDelete={() => remove(entry)}
        canMoveUp={entry.index > 0}
        canMoveDown={entry.index < entry.groupSize - 1}
        defaultSeconds={data.rules?.responseSeconds}
        readOnly={readOnly}
      />
    );
  };
  // In the grouped view a live topic marks its place in a section; it has no questions to list.
  const liveRow = (group) => {
    const topic = plan.topics.find((t) => t.id === group.id);
    const count = topic?.count || 0;
    return (
      <div
        key={group.id}
        data-live-row
        className="flex items-start gap-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-3 dark:border-indigo-500/30 dark:bg-indigo-500/5"
      >
        <Shuffle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-indigo-500 dark:text-indigo-300" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
            {topic?.name || group.name || "Untitled topic"}
            <PriorityChip priority={topic?.priority} />
          </p>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-gray-400">
            ANVI asks {count} different question{count === 1 ? "" : "s"} to each student. Edit it in the topics above.
          </p>
        </div>
      </div>
    );
  };
  const grouped = () =>
    data.sections.map((section) => {
      const sectionEntries = entries.filter((e) => e.sectionId === section.id);
      const manualGroups = section.groups.filter((g) => g.source !== "annu");
      return (
        <section key={section.id} aria-label={`Section: ${section.name || "Untitled section"}`} className="space-y-3">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 dark:border-gray-800">
            <Layers size={15} aria-hidden="true" className="text-slate-400" />
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">
              {section.name || "Untitled section"}
            </h4>
            <Chip>{section.category}</Chip>
          </header>
          {section.groups.map((group) =>
            group.source === "annu" ? (
              liveRow(group)
            ) : (
              <div key={group.id} className="space-y-2">
                {manualGroups.length > 1 && (
                  <p className="text-xs font-medium text-slate-500 dark:text-gray-400">{group.name || "Untitled group"}</p>
                )}
                {group.questions.length ? (
                  <ol className="space-y-2">
                    {sectionEntries.filter((e) => e.groupId === group.id).map(card)}
                  </ol>
                ) : (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-gray-800/50 dark:text-gray-400">
                    No questions in this group yet.
                  </p>
                )}
              </div>
            ),
          )}
          {!section.groups.length && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-gray-800/50 dark:text-gray-400">
              This section has no questions yet.
            </p>
          )}
        </section>
      );
    });
  return (
    <div className="space-y-6">
      <StepHeading
        title="What should ANVI ask?"
        description="Give ANVI the topics and it writes different questions for every student. You can also add a fixed set of questions that everyone gets."
      />
      <LiveTopicsEditor
        data={data}
        onChange={onChange}
        interviewId={interviewId}
        limits={limits}
        readOnly={readOnly}
        errors={errors}
        reveal={reveal}
        summary={summary}
      />
      <section aria-labelledby="fixed-questions-heading" data-fixed-questions className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-gray-300"
            >
              <Users size={16} />
            </span>
            <div className="min-w-0">
              <h3 id="fixed-questions-heading" className="text-[15px] font-semibold leading-6 text-slate-900 dark:text-white">
                Same questions for everyone{" "}
                <span className="font-normal text-slate-500 dark:text-gray-400">({entries.length})</span>
              </h3>
              <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">
                Optional. Every student gets these exact questions, which you can see and edit. Use it for a fixed
                test or when answers must be compared question by question.
              </p>
            </div>
          </div>
          {counts.total > 0 && (
            <p className="text-sm text-slate-500 dark:text-gray-400">{counts.marks} marks in total</p>
          )}
        </div>
        {!entries.length && !readOnly && !composer && (
          <div className="flex flex-wrap gap-2 sm:pl-11">
            <button type="button" className={buttonSecondary} onClick={() => setComposer(true)}>
              <Sparkles size={15} aria-hidden="true" className="text-violet-500 dark:text-violet-400" />
              Generate &amp; review
            </button>
            <button type="button" className={buttonSecondary} disabled={capacity < 1} onClick={write}>
              <PenLine size={15} aria-hidden="true" />
              Write my own
            </button>
          </div>
        )}
        {composer && !readOnly && (
          <GenerateComposer
            data={data}
            api={api}
            interviewId={interviewId}
            capacity={capacity}
            onAdd={(items) => onChange(addQuestions(data, items).data)}
            onClose={() => setComposer(false)}
          />
        )}
        {simple ? (
          entries.length > 0 && <ol className="space-y-2">{entries.map(card)}</ol>
        ) : (
          <div className="space-y-6">{grouped()}</div>
        )}
        {entries.length > 0 && !readOnly && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonSecondary} disabled={capacity < 1} onClick={write}>
              <PenLine size={15} aria-hidden="true" />
              Add question
            </button>
            {!composer && (
              <button type="button" className={buttonGhost} onClick={() => setComposer(true)}>
                <Sparkles size={15} aria-hidden="true" className="text-violet-500 dark:text-violet-400" />
                Generate more
              </button>
            )}
          </div>
        )}
        {capacity < 1 && (
          <Alert tone="warning">
            This interview has reached its limit of {limits.questions} questions.
          </Alert>
        )}
      </section>
      <Disclosure
        title="Advanced"
        description="Sections for multi-round interviews, for example Technical and HR."
        icon={Settings2}
        open={advanced}
        onToggle={() => setAdvanced(!advanced)}
      >
        <div data-field="sections">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300">
              <Layers size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                aria-expanded={organize}
                data-platform-disclosure="wizard"
                onClick={() => setOrganize(!organize)}
                className="text-left text-sm font-medium text-slate-900 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-white dark:hover:text-sky-300"
              >
                Organize into sections
              </button>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-gray-400">
                Split the interview into rounds with their own weights. Most interviews don't need this.
              </p>
            </div>
          </div>
          {organize && (
            <div className="mt-5">
              <Sections
                interviewId={interviewId}
                data={data}
                onChange={onChange}
                sectionId={sectionId}
                groupId={groupId}
                limits={limits}
                readOnly={readOnly}
              />
            </div>
          )}
        </div>
      </Disclosure>
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-40 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-gray-100 dark:text-gray-900"
        >
          <span>Question {toast.number} deleted.</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-sky-300 hover:bg-white/10 dark:text-sky-700 dark:hover:bg-black/5"
              onClick={() => {
                onChange(restoreQuestion(data, toast.removed));
                setToast(null);
              }}
            >
              <Undo2 size={15} aria-hidden="true" />
              Undo
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              className="rounded-md p-1 text-white/70 hover:bg-white/10 dark:text-gray-600"
              onClick={() => setToast(null)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
