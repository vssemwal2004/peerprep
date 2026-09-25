import { useState } from "react";
import { Plus, Trash2, BookOpen, ArrowUp, ArrowDown } from "lucide-react";
import { ResourcePicker } from "./Resources";
import { interviewApi } from "./api";
import { uid, newQuestion } from "./definition";
import { useRemote, useDebounced } from "./useRemote";
import {
  Avatar,
  Badge,
  Dialog,
  EmptyState,
  Field,
  Notice,
  Panel,
  Pagination,
  Select,
  TextArea,
  TextInput,
  primaryClass,
  secondaryClass,
} from "./ui";

const difficultyOptions = [
  { value: "", label: "Select difficulty" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];
function QuestionDisclosure({ initiallyOpen, children, className }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className={className}
    >
      {children}
    </details>
  );
}
export function BasicsEditor({ data, onChange }) {
  const set = (key, value) => onChange({ ...data, [key]: value });
  return (
    <Panel title="Interview details">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Interview title *" className="sm:col-span-2">
          <TextInput
            required
            maxLength={160}
            placeholder="e.g. Junior backend interview"
            value={data.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">
            Company
          </span>
          <ResourcePicker
            kind="companies"
            selected={data.companyName}
            onSelect={(item) =>
              onChange({ ...data, companyId: item._id, companyName: item.name })
            }
          />
          {data.companyId && (
            <button
              type="button"
              className="mt-1 text-xs text-slate-500 underline"
              onClick={() =>
                onChange({ ...data, companyId: "", companyName: "" })
              }
            >
              Use general practice instead
            </button>
          )}
        </div>
        <Field label="Job role">
          <TextInput
            maxLength={120}
            placeholder="e.g. Backend developer"
            value={data.role}
            onChange={(e) => set("role", e.target.value)}
          />
        </Field>
        <Field label="Experience level">
          <Select
            value={data.experience}
            options={[
              { value: "", label: "Select experience" },
              { value: "fresher", label: "Fresher" },
              { value: "junior", label: "Junior" },
              { value: "mid", label: "Mid-level" },
              { value: "senior", label: "Senior" },
            ]}
            onChange={(e) => set("experience", e.target.value)}
          />
        </Field>
        <Field label="Default question difficulty">
          <Select
            value={data.difficulty}
            options={difficultyOptions}
            onChange={(e) => set("difficulty", e.target.value)}
          />
        </Field>
        <Field label="Description / job context" className="sm:col-span-2">
          <TextArea
            maxLength={12000}
            placeholder="What should this interview assess?"
            value={data.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
      </div>
    </Panel>
  );
}
export function InterviewerEditor({ data, onChange }) {
  const select = (p) =>
    onChange({
      ...data,
      interviewer: { ...p.data, profileId: p._id, profileRevision: p.revision },
    });
  return (
    <Panel title="Interviewer profile">
      <div className="space-y-5">
        <div className="max-w-md">
          <ResourcePicker
            kind="profiles"
            selected={data.interviewer?.name}
            onSelect={select}
          />
        </div>
        {data.interviewer ? (
          <div className="rounded-xl border border-slate-200 p-5 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <Avatar size={56} variant={data.interviewer.avatar} />
              <div>
                <h3 className="font-semibold">
                  {data.interviewer.displayName}
                </h3>
                <p className="text-xs text-slate-500">
                  {data.interviewer.language} · {data.interviewer.tone}
                </p>
              </div>
              <Badge>Static preview</Badge>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1 text-xs font-semibold text-slate-500">
                  INTRODUCTION
                </h4>
                <p className="whitespace-pre-wrap text-sm">
                  {data.interviewer.introduction || "No introduction set."}
                </p>
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold text-slate-500">
                  CLOSING
                </h4>
                <p className="whitespace-pre-wrap text-sm">
                  {data.interviewer.closing || "No closing message set."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Choose an interviewer"
            detail="Select or create a reusable profile to set the avatar and introduction."
          />
        )}
        <p className="text-xs text-slate-500">
          A profile snapshot is saved with this interview. Reselect the profile
          to apply its latest version. Voice and animated video are not
          connected.
        </p>
      </div>
    </Panel>
  );
}
export function TimingFields({ value = {}, onChange, overrides = false }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        ["preparationSeconds", "Preparation time", 600],
        ["responseSeconds", "Response limit", 1800],
        ["minimumSeconds", "Minimum response time", 1800],
        ["replays", "Question replays", 7],
      ].map(([key, label, max]) => (
        <Field
          key={key}
          label={`${label}${key === "replays" ? "" : " (seconds)"}`}
        >
          <div className="flex gap-2">
            {overrides && (
              <select
                aria-label={`${label} override`}
                className="w-28 rounded-lg border border-slate-200 bg-transparent px-2 text-xs"
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
export function RulesEditor({ data, onChange }) {
  const setRules = (rules) => onChange({ ...data, rules });
  return (
    <div className="space-y-4">
      <Panel title="Timing defaults">
        <TimingFields value={data.rules} onChange={setRules} />
        <p className="mt-3 text-xs text-slate-500">
          These defaults apply unless a section, group or question overrides
          them. A minimum of 0 does not impose a minimum response length.
        </p>
      </Panel>
      <Panel title="Interview behavior">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            [
              "mode",
              "Mode",
              [
                { value: "mock", label: "Mock — no hints" },
                { value: "guided", label: "Guided practice" },
              ],
            ],
            ["language", "Language", ["English", "Hindi", "Hinglish"]],
            [
              "resume",
              "Resume policy",
              [
                { value: "none", label: "Not required" },
                { value: "optional", label: "Optional" },
                { value: "required", label: "Required" },
              ],
            ],
            [
              "documents",
              "Reference documents",
              [
                { value: "none", label: "Not required" },
                { value: "optional", label: "Optional" },
                { value: "required", label: "Required" },
              ],
            ],
          ].map(([key, label, options]) => (
            <Field key={key} label={label}>
              <Select
                options={options}
                value={data.rules[key]}
                onChange={(e) =>
                  setRules({ ...data.rules, [key]: e.target.value })
                }
              />
            </Field>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Delivery preferences only. Candidate uploads, hints and recording are
          not active.
        </p>
      </Panel>
      <Panel
        title="Evaluation rubric"
        action={
          <span
            className={`text-xs ${Math.abs(data.rubric.reduce((n, r) => n + r.weight, 0) - 100) > 0.001 ? "text-amber-600" : "text-emerald-600"}`}
          >
            Total: {data.rubric.reduce((n, r) => n + r.weight, 0).toFixed(2)}%
          </span>
        }
      >
        <div className="space-y-3">
          {data.rubric.map((r, index) => (
            <div key={r.id} className="grid grid-cols-[1fr_80px_36px] gap-2">
              <TextInput
                aria-label={`Criterion ${index + 1}`}
                placeholder="Criterion"
                value={r.name}
                maxLength={120}
                onChange={(e) =>
                  onChange({
                    ...data,
                    rubric: data.rubric.map((x) =>
                      x.id === r.id ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
              <TextInput
                aria-label={`Weight for ${r.name}`}
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={r.weight}
                onChange={(e) =>
                  onChange({
                    ...data,
                    rubric: data.rubric.map((x) =>
                      x.id === r.id
                        ? { ...x, weight: Number(e.target.value) }
                        : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                aria-label={`Remove ${r.name}`}
                className={secondaryClass}
                onClick={() =>
                  onChange({
                    ...data,
                    rubric: data.rubric.filter((x) => x.id !== r.id),
                  })
                }
              >
                <Trash2 size={14} />
              </button>
              <div className="col-span-3">
                <TextInput
                  aria-label={`Guidance for ${r.name}`}
                  placeholder="What evidence should this criterion assess?"
                  value={r.description}
                  maxLength={2000}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      rubric: data.rubric.map((x) =>
                        x.id === r.id
                          ? { ...x, description: e.target.value }
                          : x,
                      ),
                    })
                  }
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            className={secondaryClass}
            disabled={data.rubric.length >= 12}
            onClick={() =>
              onChange({
                ...data,
                rubric: [
                  ...data.rubric,
                  { id: uid(), name: "", description: "", weight: 0 },
                ],
              })
            }
          >
            <Plus size={14} />
            Add criterion
          </button>
          <p className="text-xs text-slate-500">
            Configuration only. No AI scoring or answer-length penalties are
            applied.
          </p>
        </div>
      </Panel>
    </div>
  );
}
function LibraryPicker({ onAdd, onClose }) {
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
                className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"
              >
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={Boolean(selected[q._id])}
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
            {Object.keys(selected).length} selected across pages
          </span>
          <button
            type="button"
            disabled={!Object.keys(selected).length}
            className={primaryClass}
            onClick={() => {
              onAdd(
                Object.values(selected).map((q) => ({
                  ...newQuestion(),
                  prompt: q.questionText,
                  tags: q.tags || [],
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
export function GroupEditor({ group, onChange, limits }) {
  const [library, setLibrary] = useState(false),
    [switchTo, setSwitchTo] = useState(null);
  const set = (key, value) => onChange({ ...group, [key]: value });
  const changeQuestion = (q) =>
    set(
      "questions",
      group.questions.map((x) => (x.id === q.id ? q : x)),
    );
  const moveQuestion = (index, delta) => {
    const next = [...group.questions];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    set("questions", next);
  };
  const switchSource = (source) => {
    if (source === group.source) return;
    setSwitchTo(source);
  };
  return (
    <div className="space-y-4">
      <Panel title="Question group">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Group name">
            <TextInput
              value={group.name}
              maxLength={120}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Difficulty">
            <Select
              options={[
                { value: "", label: "Use interview default" },
                ...difficultyOptions.slice(1),
              ]}
              value={group.difficulty}
              onChange={(e) => set("difficulty", e.target.value)}
            />
          </Field>
        </div>
        <div
          role="group"
          aria-label="Question source"
          className="mt-4 flex gap-2"
        >
          {[
            ["manual", "Manual questions"],
            ["annu", "ANNU specification"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={group.source === value}
              className={group.source === value ? primaryClass : secondaryClass}
              onClick={() => switchSource(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </Panel>
      {group.source === "annu" ? (
        <Panel title="ANNU requirements">
          <div className="space-y-4">
            <Notice>
              Specification only. ANNU question generation is not connected.
            </Notice>
            <Field label="What should ANNU assess? *">
              <TextArea
                rows={6}
                maxLength={12000}
                value={group.annu.requirements}
                placeholder="Describe the role, topics, scenarios and expected depth…"
                onChange={(e) =>
                  set("annu", { ...group.annu, requirements: e.target.value })
                }
              />
            </Field>
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
            <Field label="Exclude topics">
              <TextArea
                maxLength={2000}
                value={group.annu.exclusions}
                onChange={(e) =>
                  set("annu", { ...group.annu, exclusions: e.target.value })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Planned main questions">
                <TextInput
                  type="number"
                  min={1}
                  max={50}
                  value={group.annu.targetCount}
                  onChange={(e) =>
                    set("annu", {
                      ...group.annu,
                      targetCount: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Maximum follow-ups per question">
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
          </div>
        </Panel>
      ) : (
        <Panel
          title={`${group.questions.length} manual questions`}
          action={
            <div className="flex gap-2">
              <button
                type="button"
                className={secondaryClass}
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
                  set("questions", [...group.questions, newQuestion()])
                }
              >
                <Plus size={14} />
                Question
              </button>
            </div>
          }
        >
          {!group.questions.length ? (
            <EmptyState
              title="Add your first question"
              detail="Write a question or select compatible content from your Library."
            />
          ) : (
            <div className="space-y-3">
              {group.questions.map((q, index) => (
                <QuestionDisclosure
                  key={q.id}
                  initiallyOpen={!q.prompt}
                  className="rounded-lg border border-slate-200 dark:border-gray-700"
                >
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                    {index + 1}.{" "}
                    {q.prompt ? q.prompt.slice(0, 110) : "Untitled question"}
                  </summary>
                  <div className="space-y-3 border-t border-slate-100 p-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        aria-label="Move question up"
                        disabled={index === 0}
                        className={secondaryClass}
                        onClick={() => moveQuestion(index, -1)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Move question down"
                        disabled={index === group.questions.length - 1}
                        className={secondaryClass}
                        onClick={() => moveQuestion(index, 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className={secondaryClass}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Remove this question and its follow-ups?",
                            )
                          )
                            set(
                              "questions",
                              group.questions.filter((x) => x.id !== q.id),
                            );
                        }}
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                    <Field label="Main question *">
                      <TextArea
                        value={q.prompt}
                        maxLength={12000}
                        onChange={(e) =>
                          changeQuestion({ ...q, prompt: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Scenario / context">
                      <TextArea
                        value={q.context}
                        maxLength={12000}
                        onChange={(e) =>
                          changeQuestion({ ...q, context: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Expected answer / evaluation guidance (admin only)">
                      <TextArea
                        value={q.expectedAnswer}
                        maxLength={12000}
                        onChange={(e) =>
                          changeQuestion({
                            ...q,
                            expectedAnswer: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Difficulty">
                      <Select
                        options={[
                          { value: "", label: "Inherit difficulty" },
                          ...difficultyOptions.slice(1),
                        ]}
                        value={q.difficulty}
                        onChange={(e) =>
                          changeQuestion({ ...q, difficulty: e.target.value })
                        }
                      />
                    </Field>
                    {[
                      ["subquestions", "Required subquestions", 10],
                      ["followUps", "Sequential follow-ups", limits.followUps],
                    ].map(([key, label, max]) => (
                      <div key={key}>
                        <h4 className="mb-2 text-xs font-semibold text-slate-500">
                          {label}
                        </h4>
                        {q[key].map((sub, i) => (
                          <div key={sub.id} className="mb-2 flex gap-2">
                            <TextInput
                              aria-label={`${label} ${i + 1}`}
                              value={sub.prompt}
                              maxLength={12000}
                              onChange={(e) =>
                                changeQuestion({
                                  ...q,
                                  [key]: q[key].map((x) =>
                                    x.id === sub.id
                                      ? { ...x, prompt: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            />
                            <button
                              type="button"
                              aria-label={`Remove ${label} ${i + 1}`}
                              className={secondaryClass}
                              onClick={() =>
                                changeQuestion({
                                  ...q,
                                  [key]: q[key].filter((x) => x.id !== sub.id),
                                })
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="text-xs font-medium text-sky-700"
                          disabled={q[key].length >= max}
                          onClick={() =>
                            changeQuestion({
                              ...q,
                              [key]: [
                                ...q[key],
                                {
                                  id: uid(),
                                  prompt: "",
                                  ...(key === "followUps"
                                    ? { expectedAnswer: "", ruleOverrides: {} }
                                    : {}),
                                },
                              ],
                            })
                          }
                        >
                          + Add{" "}
                          {key === "subquestions" ? "subquestion" : "follow-up"}
                        </button>
                      </div>
                    ))}
                    <details>
                      <summary className="cursor-pointer text-xs font-medium text-slate-500">
                        Timing overrides
                      </summary>
                      <div className="mt-3">
                        <TimingFields
                          overrides
                          value={q.ruleOverrides}
                          onChange={(value) =>
                            changeQuestion({ ...q, ruleOverrides: value })
                          }
                        />
                      </div>
                    </details>
                  </div>
                </QuestionDisclosure>
              ))}
            </div>
          )}
          <label className="mt-4 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={group.shuffle}
              onChange={(e) => set("shuffle", e.target.checked)}
            />
            Shuffle main questions (subquestions stay with their parent)
          </label>
        </Panel>
      )}
      <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <summary className="cursor-pointer text-sm font-medium">
          Group timing overrides
        </summary>
        <div className="mt-4">
          <TimingFields
            overrides
            value={group.ruleOverrides}
            onChange={(value) => set("ruleOverrides", value)}
          />
        </div>
      </details>
      {library && (
        <LibraryPicker
          onClose={() => setLibrary(false)}
          onAdd={(items) => set("questions", [...group.questions, ...items])}
        />
      )}
      {switchTo && (
        <Dialog
          title="Change question source?"
          onClose={() => setSwitchTo(null)}
        >
          <p className="text-sm text-slate-600">
            This replaces the current group’s questions or ANNU requirements.
            Cancel to keep them, or duplicate the group first.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              className={secondaryClass}
              onClick={() => setSwitchTo(null)}
            >
              Cancel
            </button>
            <button
              className={primaryClass}
              onClick={() => {
                const { questions: _questions, annu: _annu, ...rest } = group;
                onChange({
                  ...rest,
                  source: switchTo,
                  ...(switchTo === "manual"
                    ? { questions: [] }
                    : {
                        annu: {
                          requirements: "",
                          skills: [],
                          exclusions: "",
                          targetCount: 3,
                          maxFollowUps: 0,
                        },
                      }),
                });
                setSwitchTo(null);
              }}
            >
              Replace source
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
