import { useId } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  Copy,
  PenLine,
  Sparkles,
  Trash2,
} from "lucide-react";
import { FOLLOW_UP_LIMIT, MARKS_LIMIT } from "../definition";
import { Toggle } from "../ui";
import { ANSWER_TIMES, answerTimeLabel } from "./steps";
import {
  Chip,
  NumberField,
  SelectField,
  TextField,
  buttonSecondary,
  iconButton,
} from "./controls";

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
  const authored = (question.followUps || []).length;
  const followUpMax = Math.max(0, FOLLOW_UP_LIMIT - authored);
  const followUps = authored + (question.maxFollowUps || 0);
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
    authored && `${authored} written cross-question${authored === 1 ? "" : "s"}`,
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
            <div className="grid gap-5 sm:grid-cols-2">
              <NumberField
                label="Marks"
                min={1}
                max={MARKS_LIMIT}
                value={question.marks ?? 10}
                onChange={(marks) => set({ marks })}
                hint={`1–${MARKS_LIMIT}. Used for the score in the report.`}
              />
              <NumberField
                label="Follow-ups"
                stepper
                min={0}
                max={followUpMax}
                value={Math.min(question.maxFollowUps || 0, followUpMax)}
                onChange={(maxFollowUps) => set({ maxFollowUps })}
                hint="ANVI asks up to this many follow-ups based on the answer."
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
              <TextField
                label="Competency"
                optional
                maxLength={60}
                value={question.competency}
                placeholder="e.g. API design"
                hint="Groups scores in the report."
                onChange={(competency) => set({ competency })}
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
                Also includes {extras.join(", ")}. Edit these under Advanced → Organize into sections.
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
