import { useEffect, useRef, useState } from "react";
import { Layers, Library, Loader2, PenLine, Settings2, Shuffle, Sparkles, Undo2, X } from "lucide-react";
import Sections from "../Sections";
import { FOLLOW_UP_ASK_LIMIT, QUESTION_CATEGORIES, questionSlots, uid } from "../definition";
import { AnviTile, Toggle } from "../ui";
import QuestionCard from "./QuestionCard";
import { blankQuestion, readDefaultFollowUps, writeDefaultFollowUps } from "./defaults";
import {
  addQuestions,
  bankGroup,
  duplicateQuestion,
  estimate,
  isSimple,
  liveGroups,
  moveQuestion,
  questionEntries,
  removeQuestion,
  restoreQuestion,
  topicGroups,
  updateBank,
  updateQuestion,
} from "./structure";
import { livePlan } from "./livetopics/counts";
import LiveTopicsEditor from "./livetopics/LiveTopicsEditor";
import { PriorityChip } from "./livetopics/LiveTopicsSummary";
import { DIFFICULTY } from "./steps";
import {
  Alert,
  Card,
  Chip,
  ChipInput,
  Disclosure,
  NumberField,
  Segmented,
  StepHeading,
  TextField,
  buttonGhost,
  buttonPrimary,
  buttonSecondary,
} from "./controls";

const TOPIC_LIMIT = 12;
const CATEGORY_OPTIONS = QUESTION_CATEGORIES.map((value) => ({ value, label: value }));
const DIFFICULTY_MIX = [{ value: "mixed", label: "Mixed" }, ...DIFFICULTY];
// Quick picks for the topics field, by question type.
const TOPIC_SUGGESTIONS = {
  Technical: ["Data Structures", "Algorithms", "DBMS", "Operating Systems", "Computer Networks", "OOP"],
  Behavioral: ["Teamwork", "Ownership", "Handling conflict", "Deadlines", "Learning from mistakes"],
  Communication: ["Explaining a concept", "Presenting a decision", "Disagreeing politely", "Summarising"],
};

const generationError = (error) => {
  const code = error?.response?.data?.code;
  if (code === "AI_NOT_CONFIGURED" || error?.response?.status === 503)
    return "ANVI isn't set up on the server yet (the AI key is missing), so questions can't be generated. You can still write your own.";
  return error?.message || "ANVI could not generate questions. Try again.";
};

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// "Generate with ANVI": one request drafts part of the bank (topics, type, difficulty, follow-ups); the
// admin reviews the questions in the list. Run it again for another type or more topics.
function GeneratePanel({ interviewId, api, capacity, onAdd, onClose }) {
  const maxCount = Math.max(0, Math.min(50, capacity));
  const [topics, setTopics] = useState([]);
  const [category, setCategory] = useState("Technical");
  const [difficulty, setDifficulty] = useState("mixed");
  const [count, setCount] = useState(Math.max(1, Math.min(10, maxCount || 1)));
  const [followUps, setFollowUps] = useState(() => readDefaultFollowUps());
  const [requirements, setRequirements] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [topicError, setTopicError] = useState("");
  const [added, setAdded] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const suggestions = TOPIC_SUGGESTIONS[category].filter(
    (topic) => !topics.some((t) => t.toLowerCase() === topic.toLowerCase()),
  );
  const generate = async () => {
    if (!topics.length) {
      setTopicError("Add at least one topic.");
      return;
    }
    if (count < topics.length) {
      setError(`Ask for at least ${topics.length} questions: one per topic.`);
      return;
    }
    setBusy(true);
    setError("");
    setAdded(0);
    writeDefaultFollowUps(followUps);
    try {
      const result = await api.generateQuestions(interviewId, {
        mode: "pool",
        topics,
        category,
        difficulty,
        count: Math.min(count, maxCount),
        followUps,
        requirements: requirements.trim(),
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
            competency: q.topic || "",
            difficulty: ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "",
            category: QUESTION_CATEGORIES.includes(q.category) ? q.category : category,
            followUpLimit: Number.isInteger(q.followUpLimit) ? q.followUpLimit : followUps,
            followUps: (q.followUps || []).map((prompt) => ({ id: uid(), prompt, expectedAnswer: "", ruleOverrides: {} })),
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
      aria-label="Generate with ANVI"
      data-generate-panel
      className="rounded-2xl border border-violet-200 bg-white shadow-sm dark:border-violet-500/30 dark:bg-gray-900"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-gray-800">
        <div className="flex min-w-0 items-start gap-3">
          <AnviTile size="sm" />
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-6 text-slate-900 dark:text-white">Generate with ANVI</h3>
            <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">
              ANVI drafts the questions once, with key points and follow-ups. You review them, and every student is
              asked from this bank.
            </p>
          </div>
        </div>
        <button type="button" className={buttonGhost} aria-label="Close generator" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {maxCount < 1 ? (
        <div className="p-5">
          <Alert tone="warning">This interview has reached its question limit. Delete questions before generating more.</Alert>
        </div>
      ) : (
        <fieldset disabled={busy} className="min-w-0 space-y-5 p-5">
          <Segmented
            label="Question type"
            field="category"
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={setCategory}
          />
          <div>
            <ChipInput
              label="Topics"
              field="topics"
              required
              max={TOPIC_LIMIT}
              values={topics}
              error={topicError}
              onChange={(next) => {
                setTopics(next);
                setTopicError("");
              }}
              placeholder="Type a topic and press Enter"
              hint={`Up to ${TOPIC_LIMIT}. The questions are shared out evenly across them.`}
            />
            {suggestions.length > 0 && topics.length < TOPIC_LIMIT && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Suggested topics">
                <span className="text-xs text-slate-500 dark:text-gray-400">Add:</span>
                {suggestions.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => {
                      setTopics([...topics, topic]);
                      setTopicError("");
                    }}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-violet-950/40"
                  >
                    + {topic}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Segmented label="Difficulty" field="difficultyMix" options={DIFFICULTY_MIX} value={difficulty} onChange={setDifficulty} />
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField
              label="Number of questions"
              stepper
              min={1}
              max={maxCount}
              value={Math.min(count, maxCount)}
              onChange={setCount}
              hint={`1–${maxCount}. Generate a large bank; each student is asked only some of it.`}
            />
            <NumberField
              label="Follow-ups per question"
              stepper
              min={0}
              max={FOLLOW_UP_ASK_LIMIT}
              value={followUps}
              onChange={setFollowUps}
              hint="ANVI writes these now, so asking them costs nothing per student."
            />
          </div>
          <TextField
            label="Anything else ANVI should know"
            optional
            multiline
            rows={2}
            maxLength={4000}
            value={requirements}
            onChange={setRequirements}
            placeholder="e.g. Campus placement level, focus on practical scenarios, avoid trick questions."
            hint="ANVI also uses the job name, role, company and experience level from Basics."
          />
          {error && <Alert tone="error">{error}</Alert>}
          <p role="status" aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-400">
            {busy ? "" : added ? `Added ${plural(added, "question")} from ANVI. Review them below.` : ""}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className={buttonSecondary} onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              data-generate-submit
              className={`${buttonPrimary} !bg-violet-600 hover:!bg-violet-700`}
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
        </fieldset>
      )}
    </section>
  );
}

// What each student gets from the bank: all of it or a balanced random set, and the order.
function BankSettings({ data, onChange, readOnly }) {
  const group = bankGroup(data);
  const pool = (group?.questions || []).filter((q) => q.kind !== "resume").length;
  if (!group || !pool) return null;
  const picking = Number.isInteger(group.pick) && group.pick < pool;
  const ordered = Boolean(group.shuffle && group.byTopic);
  const topics = topicGroups(questionEntries(data).filter((e) => e.groupId === group.id && e.question.kind !== "resume")).length;
  return (
    <Card
      icon={Shuffle}
      title="What each student gets"
      description="Questions come from this bank only, so ANVI never writes new questions during an interview."
      data-bank-settings
    >
      <fieldset disabled={readOnly} className="min-w-0 space-y-5">
        <Segmented
          label="Questions per student"
          field="pick"
          options={[
            { value: "all", label: `All ${pool}` },
            { value: "some", label: "A random set" },
          ]}
          value={picking ? "some" : "all"}
          onChange={(choice) =>
            onChange(updateBank(data, { pick: choice === "all" ? null : Math.max(1, Math.min(pool - 1, Math.ceil(pool / 2))) }))
          }
        />
        {picking && (
          <NumberField
            label="Questions each student is asked"
            stepper
            min={1}
            max={pool}
            value={group.pick}
            onChange={(pick) => onChange(updateBank(data, { pick: pick >= pool ? null : pick }))}
            hint={`Of ${pool}. Every topic gives its share and the difficulty mix stays the same, so students face comparable interviews with different questions.`}
            className="max-w-xs"
          />
        )}
        <Toggle
          label="Ask topic by topic, in a different order for each student"
          description={
            topics > 1
              ? `One student may start with one topic, the next with another (${plural(topics, "topic")}).`
              : "Questions are also shuffled for each student. Add topics to questions to group them."
          }
          checked={ordered}
          onChange={(on) => onChange(updateBank(data, { shuffle: on, byTopic: on }))}
          disabled={readOnly}
        />
      </fieldset>
    </Card>
  );
}

const difficultySummary = (entries) => {
  const counts = DIFFICULTY.map((d) => [d.label.toLowerCase(), entries.filter((e) => e.question.difficulty === d.value).length]);
  return counts.filter(([, n]) => n).map(([label, n]) => `${n} ${label}`).join(" · ");
};

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
  const hasLive = liveGroups(data).length > 0;
  const capacity = Math.max(0, limits.questions - counts.stored);
  const [panel, setPanel] = useState(false);
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
  // The bank, grouped by topic.
  const byTopic = () => (
    <div className="space-y-5">
      {topicGroups(entries).map(({ topic, entries: list }) => (
        <section key={topic || "-"} aria-label={`Topic: ${topic || "No topic"}`} data-topic-group className="space-y-2">
          <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100">{topic || "No topic"}</h4>
            <span className="text-xs text-slate-500 dark:text-gray-400">
              {plural(list.length, "question")}
              {difficultySummary(list) && ` · ${difficultySummary(list)}`}
            </span>
          </header>
          <ol className="space-y-2">{list.map(card)}</ol>
        </section>
      ))}
    </div>
  );
  // An older interview's live topic marks its place in a section; it has no questions to list.
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
  const bankSize = entries.reduce((n, e) => n + questionSlots(e.question), 0);
  const topicCount = topicGroups(entries).filter((g) => g.topic).length;
  return (
    <div className="space-y-6">
      <StepHeading
        title="What should ANVI ask?"
        description="Build a question bank once, by hand or with ANVI. Every student is asked from this bank, so questions and their audio are made only once."
      />
      {!entries.length && !panel && (
        <div data-field="questions" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              data-start="manual"
              disabled={readOnly || capacity < 1}
              onClick={write}
              className="group flex min-h-36 flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-sky-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-sky-700"
            >
              <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
                <PenLine size={20} />
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-slate-900 dark:text-white">Write manually</span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-500 dark:text-gray-400">
                  Add your own questions with key points and the follow-ups ANVI may ask.
                </span>
              </span>
            </button>
            <button
              type="button"
              data-start="anvi"
              disabled={readOnly || capacity < 1}
              onClick={() => setPanel(true)}
              className="group flex min-h-36 flex-col items-start gap-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/70 to-white p-5 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-500/30 dark:from-violet-500/10 dark:to-gray-900"
            >
              <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                <Sparkles size={20} />
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-slate-900 dark:text-white">Generate with ANVI</span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-500 dark:text-gray-400">
                  Give topics and a count. ANVI drafts the questions, key points and follow-ups for you to review.
                </span>
              </span>
            </button>
          </div>
          {errors.questions && <Alert tone="error">{errors.questions}</Alert>}
        </div>
      )}
      {panel && !readOnly && (
        <GeneratePanel
          api={api}
          interviewId={interviewId}
          capacity={capacity}
          onAdd={(items) => onChange(addQuestions(data, items).data)}
          onClose={() => setPanel(false)}
        />
      )}
      {entries.length > 0 && (
        <section aria-labelledby="bank-heading" data-question-bank className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-gray-300">
                <Library size={16} />
              </span>
              <div className="min-w-0">
                <h3 id="bank-heading" className="text-[15px] font-semibold leading-6 text-slate-900 dark:text-white">
                  Question bank <span className="font-normal text-slate-500 dark:text-gray-400">({bankSize})</span>
                </h3>
                <p className="mt-0.5 text-[13px] text-slate-500 dark:text-gray-400">
                  {[topicCount && plural(topicCount, "topic"), difficultySummary(entries), counts.total && `${counts.marks} marks per student`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonSecondary} disabled={capacity < 1} onClick={write}>
                  <PenLine size={15} aria-hidden="true" />
                  Add question
                </button>
                {!panel && (
                  <button type="button" className={buttonSecondary} disabled={capacity < 1} onClick={() => setPanel(true)}>
                    <Sparkles size={15} aria-hidden="true" className="text-violet-500 dark:text-violet-400" />
                    Generate with ANVI
                  </button>
                )}
              </div>
            )}
          </div>
          {simple && <BankSettings data={data} onChange={onChange} readOnly={readOnly} />}
          {simple ? byTopic() : <div className="space-y-6">{grouped()}</div>}
          {capacity < 1 && (
            <Alert tone="warning">This interview has reached its limit of {limits.questions} questions.</Alert>
          )}
        </section>
      )}
      {hasLive && (
        <div className="space-y-3">
          <Alert tone="warning" title="Older format: ANVI writes these topics for each student">
            Every student's questions are generated during their interview, which costs more per student. New
            interviews use the question bank above; you can remove these topics and generate a bank instead.
          </Alert>
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
        </div>
      )}
      {(!simple || sectionsRoute) && (
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
      )}
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
