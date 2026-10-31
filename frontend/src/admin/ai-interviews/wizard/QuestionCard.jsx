import { useId } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  Copy,
  CornerDownRight,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { FOLLOW_UP_ASK_LIMIT, FOLLOW_UP_LIMIT, MARKS_LIMIT, QUESTION_CATEGORIES, uid } from "../definition";
import { Toggle } from "../ui";
import { ANSWER_TIMES, DIFFICULTY, answerTimeLabel, labelOf } from "./steps";
import { followUpsOf } from "./structure";
import {
  Chip,
  FieldLabel,
  NumberField,
  SelectField,
  TextField,
  buttonGhost,
  buttonSecondary,
  iconButton,
  inputBase,
} from "./controls";

const DIFFICULTY_TONES = { easy: "emerald", medium: "amber", hard: "rose" };
const DIFFICULTY_OPTIONS = [{ value: "", label: "Not set" }, ...DIFFICULTY];
const CATEGORY_OPTIONS = [{ value: "", label: "Not set" }, ...QUESTION_CATEGORIES.map((value) => ({ value, label: value }))];

// Prepared follow-ups: the same for every student, so their audio is made once. ANVI picks the one that
// fits the answer and only writes its own when none is left.
function PreparedFollowUps({ question, onChange }) {
  const list = question.followUps || [];
  const set = (followUps) => onChange({ ...question, followUps });
  return (
    <div data-field="followUps" className="min-w-0">
      <FieldLabel optional>Prepared follow-ups</FieldLabel>
      {list.length > 0 && (
        <ol className="space-y-2">
          {list.map((followUp, index) => (
            <li key={followUp.id} className="flex items-start gap-2">
              <CornerDownRight size={15} aria-hidden="true" className="mt-3 shrink-0 text-slate-400" />
              <input
                aria-label={`Prepared follow-up ${index + 1}`}
                maxLength={600}
                value={followUp.prompt}
                placeholder="e.g. Why did you choose that approach?"
                onChange={(event) => set(list.map((f) => (f.id === followUp.id ? { ...f, prompt: event.target.value } : f)))}
                className={`${inputBase} h-10 border-slate-300 dark:border-gray-700`}
              />
              <button
                type="button"
                className={`${iconButton} mt-1`}
                aria-label={`Remove prepared follow-up ${index + 1}`}
                onClick={() => set(list.filter((f) => f.id !== followUp.id))}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className={`${buttonGhost} ${list.length ? "mt-2" : ""} -ml-2.5`}
        disabled={list.length >= FOLLOW_UP_LIMIT}
        onClick={() => set([...list, { id: uid(), prompt: "", expectedAnswer: "", ruleOverrides: {} }])}
      >
        <Plus size={15} aria-hidden="true" />
        Add follow-up
      </button>
      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-gray-400">
        ANVI picks the one that fits the answer. These cost nothing per student; when none is left, ANVI writes
        its own from the answer.
      </p>
    </div>
  );
}

const sourceOf = (question) =>
  question.provenance?.generated
    ? { label: "AI", tone: "ai", Icon: Sparkles, title: "Drafted by ANVI" }
    : question.provenance?.libraryQuestionId
      ? { label: "Library", tone: "sky", Icon: BookOpen, title: "Copied from the Question Library" }
      : { label: "Manual", tone: "slate", Icon: PenLine, title: "Written by you" };

// Answer time is a per-question override of the interview default (rules.responseSeconds).
function answerTimeOptions(override, defaultSeconds) {
  const options = [
    { value: "default", label: `Interview default (${answerTimeLabel(defaultSeconds ?? 120)})` },
    ...ANSWER_TIMES.map((o) => ({
      value: o.value === null ? "unlimited" : String(o.value),
      label: o.label,
    })),
  ];
  if (
    typeof override === "number" &&
    !ANSWER_TIMES.some((o) => o.value === override)
  )
    options.push({ value: String(override), label: `Custom (${override} s)` });
  return options;
}

export default function QuestionCard({
  entry,
  expanded,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  error,
  defaultSeconds,
  canMoveUp,
  canMoveDown,
  readOnly,
}) {
  const { question, number, groupId, index } = entry;
  const bodyId = useId();
  const source = sourceOf(question);
  const set = (patch) => onChange({ ...question, ...patch });
  const overrides = question.ruleOverrides || {};
  const override = overrides.responseSeconds;
  const followUps = followUpsOf(question);
  const resume = question.kind === "resume";
  const setAnswerTime = (value) => {
    const next = { ...overrides };
    if (value === "default") delete next.responseSeconds;
    else next.responseSeconds = value === "unlimited" ? null : Number(value);
    set({ ruleOverrides: next });
  };
  const extras = [
    question.subquestions?.length &&
      `${question.subquestions.length} sub-question${question.subquestions.length === 1 ? "" : "s"}`,
    question.context && "background context",
  ].filter(Boolean);
  return (
    <li
      data-field={`question:${groupId}:${index}`}
      data-question-card
      data-question-id={question.id}
      className={`rounded-xl border bg-white shadow-sm transition dark:bg-gray-900 ${error ? "border-rose-300 ring-1 ring-rose-300 dark:border-rose-500/60 dark:ring-rose-500/60" : expanded ? "border-sky-300 ring-1 ring-sky-200 dark:border-sky-800 dark:ring-sky-900" : "border-slate-200 dark:border-gray-800"}`}
    >
      {/* Phones: the title takes the full width and the row actions sit on their own line below it. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 p-3 sm:flex-nowrap sm:p-4">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold tabular-nums text-slate-600 dark:bg-gray-800 dark:text-gray-300"
        >
          {number}
        </span>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          data-question-toggle
          data-platform-disclosure="wizard"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <span className="min-w-0 flex-1">
          <span className="sr-only">Question {number}: </span>
          <span
            className={`block break-words text-sm font-medium leading-snug ${question.prompt || resume ? "text-slate-900 dark:text-white" : "italic text-slate-400 dark:text-gray-500"} ${expanded ? "" : "line-clamp-2"}`}
          >
            {resume
              ? `${question.resumeCount || 1} question${(question.resumeCount || 1) === 1 ? "" : "s"} from the student's resume`
              : question.prompt || "Untitled question"}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip tone={source.tone} title={source.title}>
              <source.Icon size={11} aria-hidden="true" />
              {source.label}
            </Chip>
            {question.difficulty && (
              <Chip tone={DIFFICULTY_TONES[question.difficulty]}>{labelOf(DIFFICULTY, question.difficulty)}</Chip>
            )}
            {question.category && <Chip>{question.category}</Chip>}
            <Chip>{question.marks ?? 10} marks</Chip>
            {followUps > 0 && (
              <Chip>
                {followUps} follow-up{followUps === 1 ? "" : "s"}
              </Chip>
            )}
            {override !== undefined && <Chip>{answerTimeLabel(override)}</Chip>}
            {question.skippable === false && <Chip tone="amber">Required</Chip>}
            {question.kind === "topic" && <Chip>Topic</Chip>}
            {error && <Chip tone="rose">Needs attention</Chip>}
          </span>
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`mt-0.5 shrink-0 text-slate-400 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        <div className="-mb-1 flex basis-full items-center justify-end gap-0.5 border-t border-slate-100 pt-1 dark:border-gray-800 sm:mb-0 sm:basis-auto sm:shrink-0 sm:border-0 sm:pt-0">
          <button
            type="button"
            className={iconButton}
            aria-label={`Move question ${number} up`}
            title="Move up"
            disabled={readOnly || !canMoveUp}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label={`Move question ${number} down`}
            title="Move down"
            disabled={readOnly || !canMoveDown}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label={`Duplicate question ${number}`}
            title="Duplicate"
            disabled={readOnly}
            onClick={onDuplicate}
          >
            <Copy size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${iconButton} hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400`}
            aria-label={`Delete question ${number}`}
            title="Delete"
            disabled={readOnly}
            onClick={onDelete}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div id={bodyId} hidden={!expanded}>
        {expanded && (
          <fieldset disabled={readOnly} className="min-w-0 space-y-5 border-t border-slate-100 px-4 pb-5 pt-4 dark:border-gray-800 sm:pl-14">
            {resume ? (
              <NumberField
                label="Questions from the resume"
                stepper
                min={1}
                max={50}
                value={question.resumeCount || 1}
                onChange={(resumeCount) => set({ resumeCount })}
                hint="ANVI reads the student's resume and asks about their own projects."
                className="max-w-56"
              />
            ) : (
              <TextField
                label={question.kind === "topic" ? "Topic" : "Question"}
                required
                multiline
                rows={3}
                maxLength={12000}
                value={question.prompt}
                error={error}
                placeholder={
                  question.kind === "topic"
                    ? "e.g. REST API design — ANVI phrases the question"
                    : "e.g. How would you find out why an API endpoint is slow?"
                }
                onChange={(prompt) => set({ prompt })}
              />
            )}
            <TextField
              label="Expected answer / key points"
              optional
              multiline
              rows={4}
              maxLength={12000}
              value={question.expectedAnswer}
              placeholder={"e.g. Measure latency first\nCheck slow database queries\nLook at caching"}
              hint="ANVI uses this to score answers; one point per line. Students never see it."
              onChange={(expectedAnswer) => set({ expectedAnswer })}
            />
            <div className="grid gap-5 sm:grid-cols-3">
              <TextField
                label="Topic"
                optional
                maxLength={60}
                value={question.competency}
                placeholder="e.g. DBMS"
                hint="Students get a balanced share of each topic."
                onChange={(competency) => set({ competency })}
              />
              <SelectField
                label="Difficulty"
                value={question.difficulty || ""}
                options={DIFFICULTY_OPTIONS}
                onChange={(difficulty) => set({ difficulty })}
              />
              <SelectField
                label="Type"
                value={question.category || ""}
                options={CATEGORY_OPTIONS}
                onChange={(category) => set({ category })}
              />
            </div>
            {!resume && (
              <div className="grid gap-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-gray-800 dark:bg-gray-950/40 sm:grid-cols-[180px_minmax(0,1fr)]">
                <NumberField
                  label="Follow-ups"
                  stepper
                  min={0}
                  max={FOLLOW_UP_ASK_LIMIT}
                  value={Math.min(followUps, FOLLOW_UP_ASK_LIMIT)}
                  // A limit replaces an older question's separate AI follow-up count.
                  onChange={(followUpLimit) => set({ followUpLimit, maxFollowUps: 0 })}
                  hint="At most, and only when the answer needs one."
                />
                <PreparedFollowUps question={question} onChange={onChange} />
              </div>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <NumberField
                label="Marks"
                min={1}
                max={MARKS_LIMIT}
                value={question.marks ?? 10}
                onChange={(marks) => set({ marks })}
                hint={`1–${MARKS_LIMIT}. Used for the score in the report.`}
              />
              <SelectField
                label="Max answer time"
                value={
                  override === undefined
                    ? "default"
                    : override === null
                      ? "unlimited"
                      : String(override)
                }
                options={answerTimeOptions(override, defaultSeconds)}
                onChange={setAnswerTime}
              />
            </div>
            <Toggle
              label="Students can skip this question"
              description="When off, ANVI encourages an attempt before moving on."
              checked={question.skippable ?? true}
              onChange={(skippable) => set({ skippable })}
              disabled={readOnly}
            />
            {extras.length > 0 && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-gray-800/60 dark:text-gray-400">
                Also includes {extras.join(" and ")} from the older section editor.
              </p>
            )}
            <div className="flex justify-end">
              <button type="button" className={buttonSecondary} onClick={onToggle}>
                Done
              </button>
            </div>
          </fieldset>
        )}
      </div>
    </li>
  );
}
