import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronDown,
  Copy,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  ROOT,
  categories,
  equalWeights,
  newGroup,
  newSection,
  rekeySection,
  summarize,
} from "./definition";
import { GroupEditor, TimingFields } from "./Editors";
import { AnnuBrand } from "./AnnuBrand";
import { useStagedDraft } from "./useStagedDraft";
import {
  Drawer,
  EmptyState,
  Field,
  Notice,
  Panel,
  Select,
  TextArea,
  TextInput,
  primaryClass,
  secondaryClass,
} from "./ui";

const move = (items, index, delta) => {
  const next = [...items];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
};
const countSection = (section) =>
  section.groups.reduce(
    (sum, group) =>
      sum +
      (group.source === "manual"
        ? group.questions.length
        : group.annu.targetCount),
    0,
  );

function RecoveryNotice({ recovered, stale, restore, discardRecovery }) {
  if (!recovered && !stale) return null;
  return (
    <Notice>
      {stale
        ? "This topic or section changed since your unsaved edit. Restore it only if you want to replace the current content."
        : "Your unsaved changes from this tab have been restored. Save to keep them."}
      <span className="mt-2 flex gap-3">
        {stale && (
          <button type="button" className="underline" onClick={restore}>
            Restore unsaved edit
          </button>
        )}
        <button type="button" className="underline" onClick={discardRecovery}>
          {stale ? "Discard unsaved edit" : "Start from saved content"}
        </button>
      </span>
    </Notice>
  );
}

function SectionDrawer({
  cacheKey,
  initial,
  isNew,
  onClose,
  onSave,
  readOnly,
}) {
  const staged = useStagedDraft({ cacheKey, initial, isNew, onClose });
  const { draft, setDraft, close, commit } = staged;
  return (
    <Drawer
      title={isNew ? "Add section" : "Section settings"}
      description="A section is a round, such as Technical or Communication."
      onClose={close}
      footer={
        <>
          <button className={secondaryClass} onClick={close}>
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button
              className={primaryClass}
              disabled={staged.stale || !draft.name.trim()}
              onClick={() => {
                commit();
                onSave(draft);
              }}
            >
              {isNew ? "Add section" : "Save section"}
            </button>
          )}
        </>
      }
    >
      {!readOnly && <RecoveryNotice {...staged} />}
      <Panel>
        <fieldset disabled={readOnly} className="space-y-4">
          <Field label="Section name *">
            <TextInput
              autoFocus
              maxLength={120}
              value={draft.name}
              placeholder="e.g. Technical round"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Section type">
            <Select
              options={categories}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            />
          </Field>
          <Field label="Candidate instructions (optional)">
            <TextArea
              value={draft.instructions}
              maxLength={12000}
              placeholder="What should the candidate know before this round?"
              onChange={(e) =>
                setDraft({ ...draft, instructions: e.target.value })
              }
            />
          </Field>
        </fieldset>
      </Panel>
      <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <summary className="cursor-pointer text-sm font-medium">
          Advanced timing
        </summary>
        <fieldset disabled={readOnly} className="mt-4">
          <TimingFields
            overrides
            value={draft.ruleOverrides}
            onChange={(value) => setDraft({ ...draft, ruleOverrides: value })}
          />
        </fieldset>
      </details>
    </Drawer>
  );
}

function TopicDrawer({
  cacheKey,
  initial,
  isNew,
  sectionName,
  onClose,
  onSave,
  limits,
  readOnly,
}) {
  const staged = useStagedDraft({ cacheKey, initial, isNew, onClose });
  const { draft, setDraft, close, commit } = staged;
  const [chosen, setChosen] = useState(
    !isNew || staged.recovered || staged.stale,
  );
  const [error, setError] = useState("");
  const save = () => {
    const count =
      draft.source === "manual"
        ? draft.questions.length
        : draft.annu.targetCount;
    if (
      draft.source === "annu" &&
      (!Number.isInteger(count) ||
        count < 1 ||
        count > (limits.plannedQuestionsPerGroup ?? 50) ||
        !Number.isInteger(draft.annu.maxFollowUps) ||
        draft.annu.maxFollowUps < 0 ||
        draft.annu.maxFollowUps > limits.followUps)
    ) {
      setError(
        `Choose 1–${Math.min(limits.plannedQuestionsPerGroup ?? 50, limits.questions)} main questions and 0–${limits.followUps} cross-questions per answer.`,
      );
      return;
    }
    if (count > limits.questions) {
      setError(
        `This topic can contain at most ${limits.questions} main questions within the interview limit.`,
      );
      return;
    }
    commit();
    onSave(draft);
  };
  return (
    <Drawer
      title={
        chosen
          ? readOnly
            ? "View topic"
            : isNew
              ? "Add topic"
              : "Edit topic"
          : "How would you like to add questions?"
      }
      description={`${sectionName} · A topic keeps related questions together.`}
      onClose={close}
      footer={
        <>
          <button className={secondaryClass} onClick={close}>
            {readOnly ? "Close" : "Cancel"}
          </button>
          {chosen && !readOnly && (
            <button
              className={primaryClass}
              disabled={staged.stale || !draft.name.trim()}
              onClick={save}
            >
              Save topic
            </button>
          )}
        </>
      }
    >
      {!readOnly && <RecoveryNotice {...staged} />}
      {chosen && !readOnly && (
        <p
          role="status"
          className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200"
        >
          {staged.dirty ? "Unsaved topic changes. " : ""}Use Save topic to add
          these changes to the interview draft.
        </p>
      )}
      {error && <Notice error>{error}</Notice>}
      {chosen ? (
        <GroupEditor
          group={draft}
          recoveryKey={cacheKey}
          limits={limits}
          readOnly={readOnly}
          onChange={(value) => {
            setError("");
            setDraft(value);
          }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              source: "manual",
              label: "Manual questions",
              Icon: Pencil,
              detail:
                "Write your questions and add cross-questions, or choose from your Library.",
            },
            {
              source: "annu",
              label: "ANNU AI",
              Icon: Bot,
              detail:
                "Describe what to ask. Save instructions for future AI-led questioning.",
            },
          ].map(({ source, label, Icon, detail }) => (
            <button
              type="button"
              key={source}
              disabled={readOnly}
              className={`rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${source === "annu" ? "border-indigo-200 bg-gradient-to-br from-sky-50 to-indigo-50/60 hover:border-indigo-400 dark:border-indigo-800 dark:from-sky-950/40 dark:to-indigo-950/40" : "border-slate-200 bg-white hover:border-sky-400 hover:bg-sky-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-sky-950"}`}
              onClick={() => {
                setDraft(
                  source === "manual"
                    ? draft
                    : {
                        ...draft,
                        source,
                        questions: undefined,
                        annu: {
                          requirements: "",
                          skills: [],
                          exclusions: "",
                          targetCount: Math.max(
                            1,
                            Math.min(3, limits.questions),
                          ),
                          maxFollowUps: 0,
                        },
                      },
                );
                setChosen(true);
              }}
            >
              {source === "annu" ? (
                <AnnuBrand />
              ) : (
                <span className="inline-flex min-h-8 items-center gap-2 text-sm font-semibold">
                  <Icon size={20} className="text-sky-600" />
                  {label}
                </span>
              )}
              <span className="mt-2 block text-xs leading-relaxed text-slate-500">
                {detail}
              </span>
            </button>
          ))}
        </div>
      )}
    </Drawer>
  );
}

function SectionCard({
  section,
  index,
  total,
  active,
  base,
  readOnly,
  onSettings,
  onTopic,
  onMove,
  onDuplicate,
  onRemove,
  onUpdate,
  limits,
  remaining,
}) {
  const [open, setOpen] = useState(active || total === 1);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);
  const contentId = `section-topics-${section.id}`;
  const counts = summarize({ sections: [section] });
  const questionSummary =
    [
      counts.manual > 0 && `${counts.manual} written`,
      counts.planned > 0 && `${counts.planned} planned`,
    ]
      .filter(Boolean)
      .join(" · ") || "No questions";
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          data-platform-disclosure="authoring"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sm font-semibold text-sky-700 dark:bg-sky-950">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">
              {section.name || "Untitled section"}
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              {section.category} · {section.groups.length} topics ·{" "}
              {questionSummary}
            </span>
          </span>
          <ChevronDown
            size={16}
            className={`ml-2 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          className={secondaryClass}
          onClick={onSettings}
          aria-label={`Settings for ${section.name}`}
        >
          <Pencil size={14} />
          <span className="hidden sm:inline">Edit section</span>
        </button>
        <button
          type="button"
          className={primaryClass}
          disabled={
            readOnly || section.groups.length >= limits.groups || remaining <= 0
          }
          onClick={onTopic}
        >
          <Plus size={14} />
          Add topic
        </button>
      </div>
      <div
        id={contentId}
        hidden={!open}
        className="border-t border-slate-100 p-4 dark:border-gray-800"
      >
        {section.groups.length ? (
          <div className="space-y-2">
            {section.groups.map((group) => (
              <Link
                key={group.id}
                to={`${base}/${section.id}/groups/${group.id}`}
                className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-3 transition hover:border-sky-300 hover:bg-sky-50 dark:border-gray-800 dark:hover:bg-sky-950"
              >
                {group.source === "manual" ? (
                  <Pencil size={17} className="shrink-0 text-slate-500" />
                ) : (
                  <Bot size={17} className="shrink-0 text-sky-600" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {group.name || "Untitled topic"}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
                    {group.source === "manual" ? (
                      `${group.questions.length} questions · Manual`
                    ) : (
                      <>
                        <AnnuBrand compact icon={false} />
                        <span aria-hidden="true">·</span>
                        <span>{group.annu.targetCount} planned questions</span>
                      </>
                    )}
                  </span>
                </span>
                <span className="text-xs font-medium text-sky-700">
                  {readOnly ? "View" : "Edit"}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="What should this section cover?"
            detail="Add a topic, then choose manual questions or ANNU AI instructions."
            action={
              <button
                type="button"
                className={secondaryClass}
                disabled={readOnly || remaining <= 0}
                onClick={onTopic}
              >
                <Plus size={14} />
                Add first topic
              </button>
            }
          />
        )}
        <details className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-gray-800">
          <summary className="cursor-pointer font-medium">
            Organization & weights
          </summary>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                disabled={readOnly || index === 0}
                className={secondaryClass}
                onClick={() => onMove(-1)}
                aria-label={`Move ${section.name} up`}
              >
                <ArrowUp size={14} />
              </button>
              <button
                disabled={readOnly || index === total - 1}
                className={secondaryClass}
                onClick={() => onMove(1)}
                aria-label={`Move ${section.name} down`}
              >
                <ArrowDown size={14} />
              </button>
              <button
                disabled={
                  readOnly ||
                  total >= limits.sections ||
                  countSection(section) > remaining
                }
                className={secondaryClass}
                onClick={onDuplicate}
              >
                <Copy size={14} />
                Duplicate section
              </button>
              <button
                disabled={readOnly}
                className={secondaryClass}
                onClick={onRemove}
              >
                <Trash2 size={14} />
                Remove section
              </button>
            </div>
            {section.groups.map((group, groupIndex) => (
              <div key={group.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-24 flex-1 truncate">{group.name}</span>
                <TextInput
                  aria-label={`Weight for ${group.name}`}
                  className="!w-20"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={group.weight}
                  disabled={readOnly}
                  onChange={(e) =>
                    onUpdate({
                      ...section,
                      groups: section.groups.map((g) =>
                        g.id === group.id
                          ? { ...g, weight: Number(e.target.value) }
                          : g,
                      ),
                    })
                  }
                />
                <span>%</span>
                <button
                  className={secondaryClass}
                  disabled={readOnly || groupIndex === 0}
                  aria-label={`Move ${group.name} up`}
                  onClick={() =>
                    onUpdate({
                      ...section,
                      groups: move(section.groups, groupIndex, -1),
                    })
                  }
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  className={secondaryClass}
                  disabled={
                    readOnly || groupIndex === section.groups.length - 1
                  }
                  aria-label={`Move ${group.name} down`}
                  onClick={() =>
                    onUpdate({
                      ...section,
                      groups: move(section.groups, groupIndex, 1),
                    })
                  }
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  className={secondaryClass}
                  disabled={
                    readOnly ||
                    section.groups.length >= limits.groups ||
                    (group.source === "manual"
                      ? group.questions.length
                      : group.annu.targetCount) > remaining
                  }
                  aria-label={`Duplicate ${group.name}`}
                  onClick={() => {
                    const copy = rekeySection({ ...section, groups: [group] })
                      .groups[0];
                    copy.name = `${group.name} (copy)`;
                    onUpdate({
                      ...section,
                      groups: equalWeights([...section.groups, copy]),
                    });
                  }}
                >
                  <Copy size={13} />
                </button>
                <button
                  className={secondaryClass}
                  disabled={readOnly}
                  aria-label={`Remove ${group.name}`}
                  onClick={() => {
                    if (window.confirm("Remove this topic and its questions?"))
                      onUpdate({
                        ...section,
                        groups: equalWeights(
                          section.groups.filter((g) => g.id !== group.id),
                        ),
                      });
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {section.groups.length > 0 && (
              <div className="flex justify-between">
                <span>
                  Topic weight:{" "}
                  {section.groups
                    .reduce((sum, group) => sum + group.weight, 0)
                    .toFixed(2)}
                  %
                </span>
                <button
                  disabled={readOnly}
                  onClick={() =>
                    onUpdate({
                      ...section,
                      groups: equalWeights(section.groups),
                    })
                  }
                  className="text-sky-700"
                >
                  Use equal topic weights
                </button>
              </div>
            )}
          </div>
        </details>
      </div>
    </section>
  );
}

export default function Sections({
  interviewId,
  data,
  onChange,
  sectionId,
  groupId,
  limits,
  readOnly = false,
}) {
  const navigate = useNavigate();
  const [editingSection, setEditingSection] = useState(null),
    [addingTopicTo, setAddingTopicTo] = useState(null);
  const base = `${ROOT}/${interviewId}/sections`;
  const section = data.sections.find((s) => s.id === sectionId),
    group = section?.groups.find((g) => g.id === groupId);
  const counts = summarize(data),
    remaining = limits.questions - counts.manual - counts.planned;
  const setSections = (sections) => {
    if (!readOnly) onChange({ ...data, sections });
  };
  const update = (value) =>
    setSections(data.sections.map((s) => (s.id === value.id ? value : s)));
  const closeTopic = () => {
    setAddingTopicTo(null);
    if (groupId) navigate(`${base}/${sectionId}`);
  };
  const topicSection = addingTopicTo
    ? data.sections.find((s) => s.id === addingTopicTo.id)
    : group
      ? section
      : null;
  const topic = addingTopicTo ? addingTopicTo.draft : group;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Questions & topics</h2>
          <p className="mt-1 text-xs text-slate-500">
            Section → Topic → Questions. Choose how to prepare each topic.
          </p>
        </div>
        <button
          type="button"
          className={primaryClass}
          disabled={readOnly || data.sections.length >= limits.sections}
          onClick={() =>
            setEditingSection({
              initial: { ...newSection(), name: "" },
              isNew: true,
            })
          }
        >
          <Plus size={15} />
          Add section
        </button>
      </div>
      {sectionId && (!section || (groupId && !group)) && (
        <Notice error>
          This {groupId ? "topic" : "section"} is no longer in the draft.{" "}
          <Link className="underline" to={base}>
            Back to sections
          </Link>
        </Notice>
      )}
      {data.sections.length ? (
        data.sections.map((s, index) => (
          <SectionCard
            key={s.id}
            section={s}
            index={index}
            total={data.sections.length}
            active={sectionId === s.id}
            base={base}
            readOnly={readOnly}
            limits={limits}
            remaining={remaining}
            onSettings={() => setEditingSection({ initial: s, isNew: false })}
            onTopic={() =>
              setAddingTopicTo({ id: s.id, draft: { ...newGroup(), name: "" } })
            }
            onUpdate={update}
            onMove={(delta) => setSections(move(data.sections, index, delta))}
            onDuplicate={() =>
              setSections(equalWeights([...data.sections, rekeySection(s)]))
            }
            onRemove={() => {
              if (window.confirm("Remove this section and all its topics?"))
                setSections(
                  equalWeights(data.sections.filter((x) => x.id !== s.id)),
                );
            }}
          />
        ))
      ) : (
        <Panel>
          <EmptyState
            title="Start with your first section"
            detail="Choose a round, then add topics with manual questions or ANNU AI instructions."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {categories.slice(0, 3).map((category) => (
                  <button
                    key={category}
                    disabled={readOnly}
                    className={secondaryClass}
                    onClick={() => setSections([newSection(category)])}
                  >
                    <Plus size={14} />
                    {category}
                  </button>
                ))}
              </div>
            }
          />
        </Panel>
      )}
      {data.sections.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">
            Section weights{" "}
            <span className="ml-2">
              {data.sections.reduce((sum, s) => sum + s.weight, 0).toFixed(2)}%
            </span>
          </summary>
          <div className="mt-3 flex flex-wrap gap-3">
            {data.sections.map((s) => (
              <Field key={s.id} label={`${s.name} (%)`}>
                <TextInput
                  type="number"
                  disabled={readOnly}
                  min={0}
                  max={100}
                  step="0.01"
                  className="!w-24"
                  value={s.weight}
                  onChange={(e) =>
                    update({ ...s, weight: Number(e.target.value) })
                  }
                />
              </Field>
            ))}
          </div>
          <button
            disabled={readOnly}
            className="mt-3 text-xs text-sky-700"
            onClick={() => setSections(equalWeights(data.sections))}
          >
            Use equal section weights
          </button>
          <p className="mt-2 text-xs text-slate-500">
            Adding, duplicating or removing sections/topics resets their sibling
            weights equally.
          </p>
        </details>
      )}
      {editingSection && (
        <SectionDrawer
          key={editingSection.initial.id}
          cacheKey={`section:${interviewId}:${editingSection.isNew ? "new" : editingSection.initial.id}:${readOnly ? "view" : "edit"}`}
          {...editingSection}
          readOnly={readOnly}
          onClose={() => setEditingSection(null)}
          onSave={(value) => {
            if (editingSection.isNew)
              setSections(equalWeights([...data.sections, value]));
            else update(value);
            setEditingSection(null);
          }}
        />
      )}
      {topicSection && topic && (
        <TopicDrawer
          key={topic.id}
          cacheKey={`topic:${interviewId}:${topicSection.id}:${addingTopicTo ? "new" : topic.id}:${readOnly ? "view" : "edit"}`}
          initial={topic}
          isNew={Boolean(addingTopicTo)}
          sectionName={topicSection.name}
          readOnly={readOnly}
          onClose={closeTopic}
          limits={{
            ...limits,
            questions: Math.max(
              0,
              remaining +
                (addingTopicTo
                  ? 0
                  : topic.source === "manual"
                    ? topic.questions.length
                    : topic.annu.targetCount),
            ),
          }}
          onSave={(value) => {
            update({
              ...topicSection,
              groups: addingTopicTo
                ? equalWeights([...topicSection.groups, value])
                : topicSection.groups.map((g) =>
                    g.id === value.id ? value : g,
                  ),
            });
            closeTopic();
          }}
        />
      )}
      {remaining <= 0 && (
        <Notice>
          The interview has reached its limit of {limits.questions} main
          questions. Remove questions before adding more.
        </Notice>
      )}
    </div>
  );
}
