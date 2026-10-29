import { useState } from "react";
import {
  Plus,
  Trash2,
  BookOpen,
  ArrowUp,
  ArrowDown,
  Pencil,
  Sparkles,
  MessageSquare,
  Radio,
  ListChecks,
} from "lucide-react";
import { interviewApi } from "./api";
import { MARKS_LIMIT, uid, newQuestion } from "./definition";
import { useRemote, useDebounced } from "./useRemote";
import { useStagedDraft } from "./useStagedDraft";
import { AnnuBrand } from "./AnnuBrand";
import GenerateReviewDialog from "./GenerateReviewDialog";
import {
  Badge,
  Dialog,
  Drawer,
  EmptyState,
  Field,
  Notice,
  Pagination,
  Select,
  TextArea,
  TextInput,
  Toggle,
  primaryClass,
  secondaryClass,
} from "./ui";

const difficultyOptions = [
  { value: "", label: "Select difficulty" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];
const TIMING_FIELDS = [
  ["preparationSeconds", "Preparation time", 600],
  ["responseSeconds", "Response limit", 1800],
  ["minimumSeconds", "Minimum response time", 1800],
  ["replays", "Question replays", 7],
];
export function TimingFields({
  value = {},
  onChange,
  overrides = false,
  fields = TIMING_FIELDS.map(([key]) => key),
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {TIMING_FIELDS.filter(([key]) => fields.includes(key)).map(([key, label, max]) => (
        <Field
          key={key}
          label={`${label}${key === "replays" ? "" : " (seconds)"}`}
        >
          <div className="flex gap-2">
            {overrides && (
              <select
                aria-label={`${label} override`}
                className="w-28 rounded-lg border border-slate-200 bg-transparent px-2 text-xs dark:border-gray-700 dark:[color-scheme:dark]"
                value={key in value ? "custom" : "inherit"}
                onChange={(e) => {
                  const next = { ...value };
                  if (e.target.value === "inherit") delete next[key];
                  else next[key] = key === "responseSeconds" ? 120 : 0;
                  onChange(next);
                }}
              >
                <option value="inherit">Inherit</option>
                <option value="custom">Custom</option>
              </select>
            )}
            <TextInput
              type="number"
              min={0}
              max={max}
              disabled={(overrides && !(key in value)) || value[key] === null}
              value={value[key] ?? ""}
              placeholder={overrides ? "Inherited" : "Unlimited"}
              onChange={(e) =>
                onChange({
                  ...value,
                  [key]: e.target.value === "" ? 0 : Number(e.target.value),
                })
              }
            />
          </div>
          {["preparationSeconds", "responseSeconds"].includes(key) &&
            (!overrides || key in value) && (
              <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <input
                  aria-label={`Unlimited ${label.toLowerCase()}`}
                  type="checkbox"
                  checked={value[key] === null}
                  onChange={(e) =>
                    onChange({ ...value, [key]: e.target.checked ? null : 120 })
                  }
                />
                Unlimited
              </span>
            )}
        </Field>
      ))}
    </div>
  );
}
function LibraryPicker({ onAdd, onClose, maxCount = 200 }) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState({});
  const settled = useDebounced(search);
  const remote = useRemote(
    () => interviewApi.library({ page, search: settled }),
    [page, settled],
  );
  return (
    <Dialog title="Add from Question Library" onClose={onClose}>
      <div className="space-y-3">
        <TextInput
          aria-label="Search Library questions"
          placeholder="Search short-answer questions…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <p className="text-xs text-slate-500">
          Compatible short-answer questions only. Selected questions are copied;
          the Library is unchanged.
        </p>
        {remote.error && (
          <Notice error>
            {remote.error}
            <button className="ml-2 underline" onClick={remote.reload}>
              Retry
            </button>
          </Notice>
        )}
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {remote.loading ? (
            <p role="status">Loading questions…</p>
          ) : !remote.result?.items.length ? (
            <EmptyState
              title="No compatible questions"
              detail="Try another search, or write a manual question."
            />
          ) : (
            remote.result.items.map((q) => (
              <label
                key={q._id}
                className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-gray-700"
              >
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={Boolean(selected[q._id])}
                  disabled={
                    !selected[q._id] && Object.keys(selected).length >= maxCount
                  }
                  onChange={(e) =>
                    setSelected((previous) => {
                      const next = { ...previous };
                      if (e.target.checked) next[q._id] = q;
                      else delete next[q._id];
                      return next;
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="block whitespace-pre-wrap text-sm">
                    {q.questionText}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {q.difficulty || "Unspecified difficulty"}
                    {q.tags?.length ? ` · ${q.tags.join(", ")}` : ""}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
        <Pagination value={remote.result?.pagination} onPage={setPage} />
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {Object.keys(selected).length} selected · {maxCount} available slots
          </span>
          <button
            type="button"
            disabled={
              !Object.keys(selected).length ||
              Object.keys(selected).length > maxCount
            }
            className={primaryClass}
            onClick={() => {
              onAdd(
                Object.values(selected).map((q) => ({
                  ...newQuestion(),
                  prompt: q.questionText,
                  tags: q.tags || [],
                  difficulty: ["easy", "medium", "hard"].includes(
                    q.difficulty?.toLowerCase(),
                  )
                    ? q.difficulty.toLowerCase()
                    : "",
                  expectedAnswer: q.questionData?.expectedAnswer || "",
                  provenance: {
                    libraryQuestionId: q._id,
                    importedAt: new Date().toISOString(),
                  },
                })),
              );
              onClose();
            }}
          >
            Add selected
          </button>
        </div>
      </div>
    </Dialog>
  );
}
// A promoted timing override: empty inherits the topic/interview default, and it still writes ruleOverrides.
function OverrideSeconds({ label, hint, field, max, value = {}, onChange }) {
  const current = value[field];
  const update = (next) => {
    const rules = { ...value };
    if (next === undefined) delete rules[field];
    else rules[field] = next;
    onChange(rules);
  };
  return (
    <Field label={label} hint={hint}>
      <TextInput
        type="number"
        min={0}
        max={max}
        step={1}
        value={current ?? ""}
        disabled={current === null}
        placeholder={current === null ? "Unlimited" : "Inherit"}
        onChange={(e) =>
          update(
            e.target.value === ""
              ? undefined
              : Math.max(0, Math.round(Number(e.target.value))),
          )
        }
      />
      <span className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-gray-400">
        <input
          type="checkbox"
          aria-label={`Unlimited ${label.toLowerCase()}`}
          checked={current === null}
          onChange={(e) => update(e.target.checked ? null : undefined)}
        />
        Unlimited
      </span>
    </Field>
  );
}
function QuestionDrawer({
  question,
  groupId,
  isNew,
  onSave,
  onClose,
  limits,
  readOnly,
}) {
  const {
    draft,
    setDraft,
    close,
    commit,
    recovered,
    stale,
    restore,
    discardRecovery,
  } = useStagedDraft({
    cacheKey: `question:${groupId}:${isNew ? "new" : question.id}`,
    initial: question,
    onClose,
    isNew,
  });
  const [error, setError] = useState("");
  const set = (key, value) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const updatePart = (key, id, patch) =>
    setDraft((previous) => ({
      ...previous,
      [key]: previous[key].map((part) =>
        part.id === id ? { ...part, ...patch } : part,
      ),
    }));
  const save = () => {
    if (readOnly || stale) return;
    if (draft.kind !== "resume" && !draft.prompt.trim()) {
      setError("Write the main question or topic before saving.");
      return;
    }
    const aiFollowUps = draft.maxFollowUps ?? 0;
    if (!Number.isInteger(aiFollowUps) || aiFollowUps < 0 || aiFollowUps > limits.followUps) {
      setError(`Choose 0–${limits.followUps} AI follow-ups.`);
      return;
    }
    if (draft.followUps.length + aiFollowUps > limits.followUps) {
      setError(
        `Use at most ${limits.followUps} follow-ups in total: cross-questions plus AI follow-ups.`,
      );
      return;
    }
    const marks = draft.marks ?? 10;
    if (!Number.isInteger(marks) || marks < 1 || marks > MARKS_LIMIT) {
      setError(`Give this question 1–${MARKS_LIMIT} marks.`);
      return;
    }
    if (draft.kind === "resume" && (!Number.isInteger(draft.resumeCount) || draft.resumeCount < 1 || draft.resumeCount > (limits.plannedQuestionsPerGroup ?? 50))) {
      setError(`Choose 1–${limits.plannedQuestionsPerGroup ?? 50} resume questions.`);
      return;
    }
    if (
      [...draft.subquestions, ...draft.followUps].some(
        (part) => !part.prompt.trim(),
      )
    ) {
      setError(
        "Complete each subquestion and cross-question, or remove any empty ones.",
      );
      return;
    }
    commit();
    onSave(draft);
  };
  return (
    <Drawer
      title={isNew ? "Add question" : "Edit question"}
      description="Write what the candidate should answer."
      onClose={close}
      readOnly={readOnly}
      footer={
        <>
          <p className="mr-auto w-full text-xs text-slate-500 sm:w-auto">
            Changes are staged until you save the topic.
          </p>
          <button type="button" className={secondaryClass} onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className={primaryClass}
            disabled={readOnly || stale}
            onClick={save}
          >
            {isNew ? "Add question" : "Save question"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {stale ? (
          <Notice>
            This question changed since your unsaved edit. Restore that edit or
            keep the current question.
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className="font-medium underline"
                onClick={restore}
              >
                Restore unsaved edit
              </button>
              <button
                type="button"
                className="underline"
                onClick={discardRecovery}
              >
                Discard recovered edit
              </button>
            </div>
          </Notice>
        ) : (
          recovered && (
            <p role="status" className="text-xs text-sky-700 dark:text-sky-300">
              Your unsaved question was recovered in this tab. Save the
              question, then save the topic.
            </p>
          )
        )}
        {error && <Notice error>{error}</Notice>}
        <Field label="Question type">
          <Select
            value={draft.kind || "specific"}
            options={[
              { value: "specific", label: "Specific question" },
              { value: "topic", label: "Topic question (AI writes the question)" },
              { value: "resume", label: "Question from student's resume" },
            ]}
            onChange={(e) => set("kind", e.target.value)}
          />
        </Field>
        {draft.kind === "resume" ? (
          <Field label="Number of questions from the resume">
            <TextInput type="number" min={1} max={limits.plannedQuestionsPerGroup ?? 50} value={draft.resumeCount ?? 1} onChange={(e) => set("resumeCount", Number(e.target.value))} />
          </Field>
        ) : <Field label={draft.kind === "topic" ? "Topic" : "Main question"} required>
          <TextArea
            rows={4}
            autoFocus
            maxLength={12000}
            value={draft.prompt}
            placeholder={draft.kind === "topic" ? "e.g. REST API design" : "e.g. How would you investigate a slow API?"}
            onChange={(e) => set("prompt", e.target.value)}
          />
        </Field>}
        {draft.provenance?.generated && (
          <p className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300">
            <Sparkles size={13} aria-hidden="true" />
            Generated by ANVI and reviewed by you
            {draft.provenance.generatedAt
              ? ` on ${new Date(draft.provenance.generatedAt).toLocaleDateString()}`
              : ""}
            .
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Marks"
            required
            hint={`1–${MARKS_LIMIT}. Used for the score in the report.`}
          >
            <TextInput
              type="number"
              min={1}
              max={MARKS_LIMIT}
              step={1}
              value={draft.marks ?? 10}
              onChange={(e) => set("marks", Number(e.target.value))}
            />
          </Field>
          <Field
            label="Competency"
            hint="Optional. Empty uses the section type in the report."
          >
            <TextInput
              maxLength={60}
              value={draft.competency ?? ""}
              placeholder="e.g. API design"
              onChange={(e) => set("competency", e.target.value)}
            />
          </Field>
          <OverrideSeconds
            label="Max answer time (seconds)"
            hint="Empty uses the topic or interview default."
            field="responseSeconds"
            max={1800}
            value={draft.ruleOverrides}
            onChange={(value) => set("ruleOverrides", value)}
          />
          <OverrideSeconds
            label="Think time (seconds)"
            hint="Time to think before answering. Empty inherits."
            field="preparationSeconds"
            max={600}
            value={draft.ruleOverrides}
            onChange={(value) => set("ruleOverrides", value)}
          />
        </div>
        <Field
          label="AI follow-ups after each answer"
          hint={`ANVI writes each follow-up using the student's most recent answer. Up to ${limits.followUps} in total with cross-questions.`}
        >
          <TextInput type="number" min={0} max={Math.max(0, limits.followUps - draft.followUps.length)} value={draft.maxFollowUps ?? 0} onChange={(e) => set("maxFollowUps", Number(e.target.value))} />
        </Field>
        <Toggle
          label="Students can skip this question"
          description="When off, ANVI encourages an attempt instead of moving on when a student asks to skip."
          checked={draft.skippable ?? true}
          onChange={(skippable) => set("skippable", skippable)}
        />
        {[
          [
            "subquestions",
            "Subquestions",
            "Extra parts asked together with the main question.",
            limits.subquestions ?? 10,
            "subquestion",
          ],
          [
            "followUps",
            "Cross-questions",
            "Follow-up prompts asked in order after the candidate answers.",
            Math.max(
              0,
              limits.followUps -
                (Number.isInteger(draft.maxFollowUps) ? draft.maxFollowUps : 0),
            ),
            "cross-question",
          ],
        ].map(([key, title, description, max, singular]) => (
          <section
            key={key}
            className="rounded-xl border border-slate-200 p-4 dark:border-gray-700"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {title}{" "}
                <span className="font-normal text-slate-400">
                  ({draft[key].length})
                </span>
              </h3>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-40 dark:text-sky-400 dark:hover:bg-sky-400/10"
                disabled={draft[key].length >= max}
                onClick={() =>
                  set(key, [
                    ...draft[key],
                    {
                      id: uid(),
                      prompt: "",
                      ...(key === "followUps"
                        ? { expectedAnswer: "", ruleOverrides: {} }
                        : {}),
                    },
                  ])
                }
              >
                <Plus size={13} />
                Add {singular}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">{description}</p>
            <div className="mt-3 space-y-3">
              {draft[key].map((part, index) => (
                <div key={part.id} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="pt-2 text-xs font-medium text-slate-400">
                      {index + 1}.
                    </span>
                    <TextArea
                      aria-label={`${title} ${index + 1}`}
                      rows={2}
                      className="min-h-16"
                      maxLength={12000}
                      value={part.prompt}
                      placeholder={
                        key === "followUps"
                          ? "e.g. What would you check next, and why?"
                          : "e.g. Which metrics would you look at?"
                      }
                      onChange={(e) =>
                        updatePart(key, part.id, { prompt: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      className={secondaryClass}
                      aria-label={`Remove ${singular} ${index + 1}`}
                      onClick={() =>
                        set(
                          key,
                          draft[key].filter((item) => item.id !== part.id),
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {key === "followUps" && (
                    <details className="ml-5 text-xs">
                      <summary className="cursor-pointer text-slate-500">
                        Answer guidance & timing
                      </summary>
                      <div className="mt-3 space-y-3">
                        <Field
                          label={`Cross-question ${index + 1} guidance (admin only)`}
                        >
                          <TextArea
                            maxLength={12000}
                            value={part.expectedAnswer}
                            onChange={(e) =>
                              updatePart(key, part.id, {
                                expectedAnswer: e.target.value,
                              })
                            }
                          />
                        </Field>
                        <TimingFields
                          overrides
                          value={part.ruleOverrides}
                          onChange={(value) =>
                            updatePart(key, part.id, { ruleOverrides: value })
                          }
                        />
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        <details className="rounded-xl border border-slate-200 p-4 dark:border-gray-700">
          <summary className="cursor-pointer text-sm font-medium">
            Answer guidance & question settings{" "}
            <span className="font-normal text-slate-400">· Optional</span>
          </summary>
          <div className="mt-4 space-y-4">
            <Field label="Scenario / context">
              <TextArea
                maxLength={12000}
                value={draft.context}
                onChange={(e) => set("context", e.target.value)}
              />
            </Field>
            <Field label="Expected answer / evaluation guidance (admin only)">
              <TextArea
                maxLength={12000}
                value={draft.expectedAnswer}
                onChange={(e) => set("expectedAnswer", e.target.value)}
              />
            </Field>
            <Field label="Question difficulty">
              <Select
                options={[
                  { value: "", label: "Use topic / interview default" },
                  ...difficultyOptions.slice(1),
                ]}
                value={draft.difficulty}
                onChange={(e) => set("difficulty", e.target.value)}
              />
            </Field>
            <Field label="Tags (comma-separated)">
              <TextInput
                value={draft.tags.join(", ")}
                onChange={(e) =>
                  set(
                    "tags",
                    e.target.value.split(",").map((tag) => tag.trim()),
                  )
                }
              />
            </Field>
            <details>
              <summary className="cursor-pointer text-xs font-medium text-slate-500">
                More timing
              </summary>
              <div className="mt-3">
                <TimingFields
                  overrides
                  fields={["minimumSeconds", "replays"]}
                  value={draft.ruleOverrides}
                  onChange={(value) => set("ruleOverrides", value)}
                />
              </div>
            </details>
          </div>
        </details>
      </div>
    </Drawer>
  );
}

function ReadOnlyTiming({ value = {} }) {
  const labels = {
    preparationSeconds: "Preparation",
    responseSeconds: "Response limit",
    minimumSeconds: "Minimum response",
    replays: "Replays",
  };
  const entries = Object.entries(value);
  return entries.length ? (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
      {entries.map(([key, item]) => (
        <div key={key}>
          <dt className="inline">{labels[key] || key}: </dt>
          <dd className="inline font-medium">
            {item === null
              ? "Unlimited"
              : `${item}${key === "replays" ? "" : " sec"}`}
          </dd>
        </div>
      ))}
    </dl>
  ) : (
    <p className="text-xs text-slate-500">Uses the inherited timing.</p>
  );
}
function ReadOnlyTopic({ group }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{group.name}</h3>
        {group.source === "manual" ? (
          <Badge>Manual questions</Badge>
        ) : (
          <AnnuBrand compact />
        )}
        <Badge>Read only</Badge>
      </div>
      {group.source === "annu" ? (
        <div className="space-y-3 rounded-xl border border-indigo-100 bg-gradient-to-br from-sky-50/60 to-indigo-50/40 p-4 dark:border-indigo-900 dark:from-sky-950/30 dark:to-indigo-950/20">
          <p className="whitespace-pre-wrap break-words text-sm">
            {group.annu.requirements || "No ANVI instructions added."}
          </p>
          <p className="text-xs text-slate-500">
            {group.annu.targetCount == null
              ? "Shares the question total by priority"
              : `${group.annu.targetCount} planned questions`}{" "}
            · Up to{" "}
            {group.annu.maxFollowUps} cross-questions per answer
          </p>
          {!!group.annu.skills?.length && (
            <p className="text-xs text-slate-500">
              Topics: {group.annu.skills.join(", ")}
            </p>
          )}
          {group.annu.exclusions && (
            <p className="whitespace-pre-wrap text-xs text-slate-500">
              Avoid: {group.annu.exclusions}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {!group.questions.length && (
            <p className="text-sm text-slate-500">No questions added.</p>
          )}
          {group.questions.map((question, index) => (
            <section
              key={question.id}
              className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-gray-700"
            >
              <h4 className="text-xs font-semibold text-slate-500">
                Question {index + 1}
              </h4>
              <p className="whitespace-pre-wrap break-words text-sm font-medium">
                {question.prompt || "No main question added."}
              </p>
              {question.context && (
                <p className="whitespace-pre-wrap break-words text-sm text-slate-500">
                  {question.context}
                </p>
              )}
              {[
                ["subquestions", "Subquestions"],
                ["followUps", "Cross-questions"],
              ].map(
                ([key, label]) =>
                  !!question[key].length && (
                    <div key={key}>
                      <h5 className="mb-1 text-xs font-semibold text-slate-500">
                        {label}
                      </h5>
                      <ol className="ml-5 list-decimal space-y-2 text-sm">
                        {question[key].map((part) => (
                          <li key={part.id}>
                            <p className="whitespace-pre-wrap break-words">
                              {part.prompt}
                            </p>
                            {key === "followUps" &&
                              (part.expectedAnswer ||
                                Object.keys(part.ruleOverrides || {}).length >
                                  0) && (
                                <details className="mt-1 text-xs text-slate-500">
                                  <summary className="cursor-pointer">
                                    Answer guidance & timing
                                  </summary>
                                  <div className="mt-2 space-y-2">
                                    {part.expectedAnswer && (
                                      <p className="whitespace-pre-wrap">
                                        {part.expectedAnswer}
                                      </p>
                                    )}
                                    <ReadOnlyTiming
                                      value={part.ruleOverrides}
                                    />
                                  </div>
                                </details>
                              )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ),
              )}
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer font-medium">
                  Answer guidance & question settings
                </summary>
                <div className="mt-3 space-y-2">
                  <p className="whitespace-pre-wrap">
                    {question.expectedAnswer || "No answer guidance added."}
                  </p>
                  <p>
                    Difficulty:{" "}
                    {question.difficulty || "Use topic / interview default"}
                  </p>
                  <p>
                    {question.marks ?? 10} marks · Competency:{" "}
                    {question.competency || "Section type"} ·{" "}
                    {question.skippable === false ? "Cannot be skipped" : "Can be skipped"}
                  </p>
                  {!!question.tags?.length && (
                    <p>Tags: {question.tags.join(", ")}</p>
                  )}
                  <ReadOnlyTiming value={question.ruleOverrides} />
                </div>
              </details>
            </section>
          ))}
        </div>
      )}
      <details className="rounded-xl border border-slate-200 p-4 text-xs dark:border-gray-700">
        <summary className="cursor-pointer font-medium">Topic settings</summary>
        <div className="mt-3 space-y-2 text-slate-500">
          <p>Difficulty: {group.difficulty || "Use interview default"}</p>
          {group.source === "manual" && (
            <p>Question order varies by student; follow-ups stay with their main question.</p>
          )}
          <ReadOnlyTiming value={group.ruleOverrides} />
        </div>
      </details>
    </div>
  );
}

export function GroupEditor({
  group,
  onChange,
  limits,
  readOnly = false,
  recoveryKey = group.id,
  onGenerate,
}) {
  const [library, setLibrary] = useState(false);
  const [switchTo, setSwitchTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [generating, setGenerating] = useState(false);
  // Approved generated questions replace the ANVI instructions (replaceSource semantics, confirmed in the dialog).
  const applyGenerated = (items) => {
    if (readOnly) return;
    const { questions: _questions, annu, ...settings } = group;
    const generatedAt = new Date().toISOString();
    onChange({
      ...settings,
      source: "manual",
      questions: items.map((item) => ({
        ...newQuestion(),
        kind: "specific",
        prompt: item.prompt.trim(),
        expectedAnswer: item.expectedAnswer.trim(),
        maxFollowUps: Math.min(annu?.maxFollowUps || 0, limits.followUps),
        provenance: { generated: true, generatedAt },
      })),
    });
    setGenerating(false);
  };
  const set = (key, value) => {
    if (!readOnly) onChange({ ...group, [key]: value });
  };
  const replaceSource = (source) => {
    if (readOnly) return;
    const { questions: _questions, annu: _annu, ...settings } = group;
    onChange({
      ...settings,
      source,
      ...(source === "manual"
        ? { questions: [] }
        : {
            annu: {
              requirements: "",
              skills: [],
              exclusions: "",
              targetCount: Math.max(
                1,
                Math.min(
                  3,
                  limits.questions,
                  limits.plannedQuestionsPerGroup ?? 50,
                ),
              ),
              maxFollowUps: 0,
            },
          }),
    });
    setSwitchTo(null);
  };
  const switchSource = (source) => {
    if (readOnly || source === group.source) return;
    const hasContent =
      group.source === "manual"
        ? group.questions.length > 0
        : Boolean(
            group.annu.requirements.trim() ||
              group.annu.exclusions.trim() ||
              group.annu.skills.some((s) => s.trim()) ||
              group.annu.targetCount !== 3 ||
              group.annu.maxFollowUps !== 0,
          );
    if (hasContent) setSwitchTo(source);
    else replaceSource(source);
  };
  const moveQuestion = (index, delta) => {
    const next = [...group.questions];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    set("questions", next);
  };
  if (readOnly && !editing) return <ReadOnlyTopic group={group} />;
  return (
    <fieldset disabled={readOnly} className="min-w-0 space-y-5">
      <Field
        label="Topic name"
        required
        hint="Keep related questions together in one topic."
      >
        <TextInput
          value={group.name}
          maxLength={120}
          placeholder="e.g. API fundamentals"
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <div
        role="group"
        aria-label="Question source"
        className="grid grid-cols-2 gap-2"
      >
        {[
          [
            "manual",
            "Manual questions",
            "Write or pick from your Library",
            MessageSquare,
          ],
          ["annu", "ANVI AI", "Describe what ANVI should ask", Sparkles],
        ].map(([value, label, hint, Icon]) => (
          <button
            key={value}
            type="button"
            aria-pressed={group.source === value}
            onClick={() => switchSource(value)}
            className={`flex min-w-0 flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${group.source === value ? (value === "annu" ? "border-indigo-400 bg-gradient-to-br from-sky-50 to-indigo-50/70 text-indigo-900 ring-1 ring-indigo-400 dark:from-sky-950/50 dark:to-indigo-950/50 dark:text-indigo-200" : "border-sky-500 bg-sky-50 text-sky-800 ring-1 ring-sky-500 dark:bg-sky-950 dark:text-sky-200") : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"}`}
          >
            {value === "annu" ? (
              <AnnuBrand compact />
            ) : (
              <span className="inline-flex min-h-6 items-center gap-2 text-sm font-semibold">
                <Icon size={17} className="shrink-0" />
                {label}
              </span>
            )}
            <span className="hidden text-xs leading-relaxed opacity-80 sm:block">
              {hint}
            </span>
          </button>
        ))}
      </div>
      {group.source === "annu" ? (
        <div className="space-y-4">
          <section
            data-annu-prompt
            className="overflow-hidden rounded-xl border border-indigo-200/80 bg-white shadow-sm dark:border-indigo-900 dark:bg-gray-900"
          >
            <div
              aria-hidden="true"
              className="h-0.5 bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 bg-gradient-to-r from-sky-50/70 to-indigo-50/50 px-4 py-3 dark:border-indigo-900 dark:from-sky-950/30 dark:to-indigo-950/30">
              <AnnuBrand />
              <span className="rounded-full border border-indigo-100 bg-white/90 px-2 py-1 text-[10px] font-semibold tracking-wide text-indigo-700 dark:border-indigo-800 dark:bg-gray-900 dark:text-indigo-300">
                Generated during student interviews
              </span>
            </div>
            <div className="space-y-2 p-4">
              <Field label="What should ANVI ask?" required>
                <TextArea
                  rows={5}
                  maxLength={12000}
                  className="min-h-36 resize-y leading-relaxed focus:border-indigo-400 focus:ring-indigo-100 dark:focus:ring-indigo-950"
                  value={group.annu.requirements}
                  placeholder="e.g. Interview a fresher on REST APIs. Start with request methods, then ask about error handling. Use a practical scenario and keep the language simple."
                  onChange={(e) =>
                    set("annu", { ...group.annu, requirements: e.target.value })
                  }
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-gray-400">
                <span>Include the role, topics and expected depth.</span>
                <span
                  className="tabular-nums"
                  aria-label="ANVI prompt character count"
                >
                  {group.annu.requirements.length.toLocaleString()} / 12,000
                </span>
              </div>
            </div>
            <p className="flex items-start gap-2 border-t border-indigo-100 bg-indigo-50/40 px-4 py-2.5 text-xs leading-relaxed text-slate-600 dark:border-indigo-900 dark:bg-indigo-950/20 dark:text-gray-400">
              <Sparkles
                size={14}
                className="mt-0.5 shrink-0 text-indigo-500 dark:text-indigo-400"
              />
              ANVI uses these instructions when a student starts an available interview.
            </p>
          </section>
          <section
            data-annu-mode
            aria-labelledby={`annu-mode-${group.id}`}
            className="rounded-xl border border-slate-200 p-4 dark:border-gray-700"
          >
            <h3 id={`annu-mode-${group.id}`} className="text-sm font-semibold">
              When should ANVI write the questions?
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-lg border border-indigo-300 bg-indigo-50/60 p-3 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100">
                <span className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <Radio size={15} aria-hidden="true" />
                    Live
                  </span>
                  <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-gray-900 dark:text-indigo-300">
                    Current
                  </span>
                </span>
                <span className="text-xs leading-relaxed opacity-80">
                  New questions for each student, written when they start.
                </span>
              </div>
              <button
                type="button"
                data-generate-review
                disabled={!onGenerate || !group.annu.requirements.trim()}
                onClick={() => setGenerating(true)}
                className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-left text-slate-700 transition-colors hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-sky-950 dark:focus-visible:ring-offset-gray-900"
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <ListChecks size={15} aria-hidden="true" className="text-sky-600 dark:text-sky-400" />
                  Generate now & review
                </span>
                <span className="text-xs leading-relaxed text-slate-500 dark:text-gray-400">
                  Same questions for everyone; recommended for assigned
                  interviews.
                </span>
              </button>
            </div>
            {!group.annu.requirements.trim() && onGenerate && (
              <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">
                Describe what ANVI should ask to generate questions now.
              </p>
            )}
          </section>
          <details className="rounded-xl border border-slate-200 p-4 dark:border-gray-700">
            <summary className="cursor-pointer text-sm font-medium">
              Fine-tune ANVI{" "}
              <span className="font-normal text-slate-400">· Optional</span>
            </summary>
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Planned main questions">
                  <TextInput
                    type="number"
                    min={1}
                    max={Math.min(
                      limits.plannedQuestionsPerGroup ?? 50,
                      limits.questions,
                    )}
                    value={group.annu.targetCount ?? ""}
                    placeholder="Shared by priority"
                    onChange={(e) =>
                      set("annu", {
                        ...group.annu,
                        // Empty keeps the topic on the shared, priority-based total.
                        targetCount: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Maximum cross-questions per answer">
                  <TextInput
                    type="number"
                    min={0}
                    max={limits.followUps}
                    value={group.annu.maxFollowUps}
                    onChange={(e) =>
                      set("annu", {
                        ...group.annu,
                        maxFollowUps: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <Field label="Skills / topics (comma-separated)">
                <TextInput
                  value={group.annu.skills.join(", ")}
                  onChange={(e) =>
                    set("annu", {
                      ...group.annu,
                      skills: e.target.value.split(",").map((s) => s.trim()),
                    })
                  }
                />
              </Field>
              <Field label="Topics to avoid">
                <TextArea
                  maxLength={2000}
                  value={group.annu.exclusions}
                  onChange={(e) =>
                    set("annu", { ...group.annu, exclusions: e.target.value })
                  }
                />
              </Field>
            </div>
          </details>
        </div>
      ) : (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Questions{" "}
              <span className="font-normal text-slate-400">
                ({group.questions.length})
              </span>
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                className={secondaryClass}
                disabled={group.questions.length >= limits.questions}
                onClick={() => setLibrary(true)}
              >
                <BookOpen size={14} />
                Library
              </button>
              <button
                type="button"
                className={primaryClass}
                disabled={group.questions.length >= limits.questions}
                onClick={() =>
                  setEditing({ question: newQuestion(), isNew: true })
                }
              >
                <Plus size={14} />
                Add question
              </button>
            </div>
          </div>
          {!group.questions.length ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-7 text-center dark:border-gray-700 dark:bg-gray-900">
              <MessageSquare size={25} className="mb-2 text-sky-500" />
              <p className="text-sm font-medium">No questions yet</p>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                Add a main question, then include subquestions or
                cross-questions if needed.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-gray-800 dark:border-gray-700">
              {group.questions.map((q, index) => (
                <li key={q.id} className="flex items-start gap-2 px-3 py-3">
                  <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-medium text-slate-500 dark:bg-gray-800">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded py-1 text-left hover:text-sky-700 dark:hover:text-sky-300"
                    aria-label={`Edit question ${index + 1}`}
                    onClick={() => setEditing({ question: q, isNew: false })}
                  >
                    <span className="line-clamp-2 break-words text-sm font-medium">
                      {q.prompt || "Untitled question"}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {q.subquestions.length} subquestions ·{" "}
                      {q.followUps.length} cross-questions
                      {q.provenance ? " · From Library" : ""}
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <button
                      type="button"
                      title="Move up"
                      aria-label={`Move question ${index + 1} up`}
                      disabled={index === 0}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-25 dark:hover:bg-gray-800"
                      onClick={() => moveQuestion(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      aria-label={`Move question ${index + 1} down`}
                      disabled={index === group.questions.length - 1}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-25 dark:hover:bg-gray-800"
                      onClick={() => moveQuestion(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      title="Edit question"
                      aria-label={`Edit question ${index + 1} details`}
                      className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-400/10 dark:hover:text-sky-300"
                      onClick={() => setEditing({ question: q, isNew: false })}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title="Remove question"
                      aria-label={`Remove question ${index + 1}`}
                      className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remove this question, its subquestions and cross-questions?",
                          )
                        ) {
                          set(
                            "questions",
                            group.questions.filter((item) => item.id !== q.id),
                          );
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      <details className="rounded-xl border border-slate-200 p-4 dark:border-gray-700">
        <summary className="cursor-pointer text-sm font-medium">
          Topic settings{" "}
          <span className="font-normal text-slate-400">· Optional</span>
        </summary>
        <div className="mt-4 space-y-4">
          <Field label="Topic difficulty">
            <Select
              options={[
                { value: "", label: "Use interview default" },
                ...difficultyOptions.slice(1),
              ]}
              value={group.difficulty}
              onChange={(e) => set("difficulty", e.target.value)}
            />
          </Field>
          <p className="text-xs text-slate-500">Topic and main-question order varies by student. Follow-ups stay with their main question.</p>
          <details>
            <summary className="cursor-pointer text-xs font-medium text-slate-500">
              Custom timing
            </summary>
            <div className="mt-3">
              <TimingFields
                overrides
                value={group.ruleOverrides}
                onChange={(value) => set("ruleOverrides", value)}
              />
            </div>
          </details>
        </div>
      </details>
      {editing && (
        <QuestionDrawer
          question={editing.question}
          groupId={recoveryKey}
          isNew={editing.isNew}
          limits={limits}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onSave={(question) => {
            if (readOnly) return;
            if (editing.isNew && group.questions.length >= limits.questions)
              return;
            set(
              "questions",
              editing.isNew
                ? [...group.questions, question]
                : group.questions.map((q) =>
                    q.id === question.id ? question : q,
                  ),
            );
            setEditing(null);
          }}
        />
      )}
      {library && !readOnly && (
        <LibraryPicker
          maxCount={Math.max(0, limits.questions - group.questions.length)}
          onClose={() => setLibrary(false)}
          onAdd={(items) => {
            if (
              !readOnly &&
              group.questions.length + items.length <= limits.questions
            ) {
              set("questions", [...group.questions, ...items]);
            }
          }}
        />
      )}
      {generating && !readOnly && onGenerate && group.source === "annu" && (
        <GenerateReviewDialog
          group={group}
          capacity={limits.questions}
          onGenerate={onGenerate}
          onUse={applyGenerated}
          onClose={() => setGenerating(false)}
        />
      )}
      {switchTo && !readOnly && (
        <Dialog
          title="Change question source?"
          onClose={() => setSwitchTo(null)}
        >
          <p className="text-sm text-slate-600 dark:text-gray-300">
            Changing to {switchTo === "annu" ? "ANVI AI" : "manual questions"}{" "}
            removes this topic’s{" "}
            {group.source === "manual"
              ? "questions and cross-questions"
              : "ANVI instructions"}
            . The topic name and settings stay unchanged.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className={secondaryClass}
              onClick={() => setSwitchTo(null)}
            >
              Keep current source
            </button>
            <button
              type="button"
              className={primaryClass}
              onClick={() => replaceSource(switchTo)}
            >
              Change source
            </button>
          </div>
        </Dialog>
      )}
    </fieldset>
  );
}
