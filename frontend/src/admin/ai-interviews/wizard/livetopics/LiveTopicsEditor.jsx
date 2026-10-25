import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, FileText, Plus, Shuffle, Trash2 } from "lucide-react";
import { FOLLOW_UP_LIMIT, ROOT } from "../../definition";
import { Toggle } from "../../ui";
import { DIFFICULTY, labelOf } from "../steps";
import {
  NEW_POOL_SIZE,
  addLiveTopic,
  estimate,
  liveTopicSection,
  primaryLive,
  removeLiveTopic,
  setLiveQuestionCount,
  setTopicCount,
  topicIssues,
  updateLiveTopic,
} from "../structure";
import {
  Alert,
  Card,
  Chip,
  ChipInput,
  NumberField,
  Segmented,
  SelectField,
  TextField,
  buttonPrimary,
  buttonSecondary,
  iconButton,
} from "../controls";
import {
  DEFAULT_LIVE_COUNT,
  POOL_LIMIT,
  PRIORITY_OPTIONS,
  TOPIC_COUNT_LIMIT,
  livePlan,
  planSentence,
} from "./counts";
import { PriorityChip, PrivacyNote } from "./LiveTopicsSummary";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const names = (topics) => topics.map((t) => `“${t.name}”`).join(", ");

function TopicRow({
  topic,
  expanded,
  onToggle,
  onPatch,
  onCount,
  onRemove,
  issues,
  showIssues,
  field,
  maxExact,
  defaultDifficulty,
  readOnly,
}) {
  const bodyId = useId();
  const { group } = topic;
  const annu = group.annu || {};
  const exact = topic.explicit !== null;
  const name = group.name?.trim() || "Untitled topic";
  const flagged = Object.keys(issues).length > 0;
  const countTone = topic.count ? "text-slate-600 dark:text-gray-300" : "font-medium text-rose-600 dark:text-rose-400";
  return (
    <li
      data-live-topic={group.id}
      className={`rounded-xl border bg-white dark:bg-gray-900 ${flagged && showIssues ? "border-rose-300 dark:border-rose-500/50" : "border-slate-200 dark:border-gray-800"}`}
    >
      <div className="flex items-center gap-2 py-2 pl-2 pr-3">
        <button
          type="button"
          data-topic-toggle
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-slate-400 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          />
          <span className="min-w-0">
            <span className="block break-words text-sm font-semibold text-slate-900 dark:text-white sm:truncate">{name}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <PriorityChip priority={topic.priority} />
              {exact && <Chip>Exact number</Chip>}
              {flagged && <Chip tone="rose">Needs details</Chip>}
              {/* Phones: the count sits with the chips so it never collides with them. */}
              <span className={`text-[13px] tabular-nums sm:hidden ${countTone}`}>{plural(topic.count, "question")}</span>
            </span>
          </span>
        </button>
        <span className={`hidden shrink-0 text-sm tabular-nums sm:inline ${countTone}`}>
          {plural(topic.count, "question")}
        </span>
        <button
          type="button"
          className={iconButton}
          aria-label={`Remove topic ${name}`}
          disabled={readOnly}
          onClick={onRemove}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
      <div id={bodyId} hidden={!expanded} className="space-y-5 border-t border-slate-100 px-4 py-4 dark:border-gray-800">
        {expanded && (
          <>
            {/* Read-only interviews can still open a topic to read it. */}
            <fieldset disabled={readOnly} className="min-w-0 space-y-5">
              <TextField
                label="Topic name"
                required
                maxLength={120}
                value={group.name}
                error={showIssues ? issues.name : undefined}
                placeholder="e.g. React, DBMS, Operating systems"
                onChange={(value) => onPatch({ name: value })}
              />
              <TextField
                label="What should ANVI ask about this topic?"
                required
                multiline
                rows={3}
                maxLength={4000}
                field={field}
                value={annu.requirements}
                error={showIssues ? issues.requirements : undefined}
                placeholder="e.g. Hooks and state for a fresher, with one practical debugging scenario."
                hint="ANVI also uses the job role, level and difficulty from Basics."
                onChange={(requirements) => onPatch({ annu: { requirements } })}
              />
              <ChipInput
                label="Skills to cover"
                values={annu.skills || []}
                onChange={(skills) => onPatch({ annu: { skills } })}
                placeholder="Type a skill and press Enter"
              />
              <div className="grid gap-5 lg:grid-cols-3">
                <Segmented
                  label="Priority"
                  value={topic.priority}
                  options={PRIORITY_OPTIONS}
                  onChange={(priority) => onPatch({ priority })}
                  hint={exact ? "Not used while this topic has an exact number." : undefined}
                />
                <SelectField
                  label="Difficulty"
                  value={group.difficulty || ""}
                  onChange={(difficulty) => onPatch({ difficulty })}
                  options={[
                    { value: "", label: `Default (${defaultDifficulty})` },
                    ...DIFFICULTY,
                  ]}
                />
                <NumberField
                  label="Follow-ups per question"
                  stepper
                  min={0}
                  max={FOLLOW_UP_LIMIT}
                  value={annu.maxFollowUps ?? 0}
                  onChange={(maxFollowUps) => onPatch({ annu: { maxFollowUps } })}
                />
              </div>
              <div className="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-gray-950/50">
                <Toggle
                  label="Set an exact number of questions"
                  description={
                    exact
                      ? "This topic always gets this many, added on top of the shared total."
                      : `Now ${plural(topic.count, "question")} from the shared total, by priority.`
                  }
                  checked={exact}
                  onChange={(on) =>
                    onCount(on ? Math.max(1, Math.min(topic.count || DEFAULT_LIVE_COUNT, maxExact)) : null)
                  }
                />
                {exact && (
                  <NumberField
                    label="Exact number of questions"
                    stepper
                    min={1}
                    max={maxExact}
                    value={annu.targetCount}
                    onChange={(count) => onCount(count)}
                    className="max-w-56"
                  />
                )}
              </div>
            </fieldset>
            <div className="flex justify-end">
              <button type="button" className={buttonSecondary} onClick={onToggle}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function ResumeHint({ data, interviewId }) {
  const mode = data.anvi?.resume?.mode;
  const on = Boolean(mode && mode !== "none");
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-slate-600 dark:text-gray-300">
      <FileText size={15} aria-hidden="true" className="shrink-0 text-slate-400" />
      {on
        ? "Questions also use the student's resume."
        : "Want questions about each student's resume too?"}
      {interviewId ? (
        <Link
          to={`${ROOT}/${interviewId}/anvi`}
          className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
        >
          {on ? "Set in ANVI settings" : "Turn it on in ANVI settings"}
        </Link>
      ) : (
        <span>Set it in ANVI settings.</span>
      )}
    </p>
  );
}

/**
 * The main way to build an interview: topics ANVI turns into fresh questions for
 * every student at interview time. Each topic is one live (`annu`) group; the
 * questions themselves are never shown to the admin.
 */
export default function LiveTopicsEditor({
  data,
  onChange,
  interviewId,
  limits,
  readOnly,
  errors = {},
  reveal,
  summary,
}) {
  const plan = livePlan(data, summary);
  const counts = estimate(data);
  const room = Math.max(0, limits.questions - counts.total);
  const poolInUse = plan.pooled && plan.pool ? plan.pool : 0;
  const poolMax = Math.max(1, Math.min(POOL_LIMIT, room + poolInUse));
  const section = liveTopicSection(data);
  const sectionFull = Boolean(section && section.groups.length >= limits.groups);
  // A new topic shares the pool; it costs questions only when the pool is not counted yet.
  const newPool =
    plan.pool === null ? Math.min(plan.topics.length ? DEFAULT_LIVE_COUNT : NEW_POOL_SIZE, room) : plan.pool;
  const addCost = plan.pooled ? 0 : newPool;
  const canAdd = !readOnly && !sectionFull && newPool >= 1 && addCost <= room;
  const primary = primaryLive(data);
  const showAll = Object.keys(errors).length > 0;

  const [expanded, setExpanded] = useState(
    () => new Set(plan.topics.filter((t) => Object.keys(topicIssues(t.group)).length).map((t) => t.id)),
  );
  const [visited, setVisited] = useState(() => new Set());
  const [seenReveal, setSeenReveal] = useState(null);
  const focusNew = useRef(null);
  if (reveal && reveal.nonce !== seenReveal) {
    setSeenReveal(reveal.nonce);
    if ((reveal.fields || []).includes("live") && primary && !expanded.has(primary.id))
      setExpanded(new Set([...expanded, primary.id]));
  }
  useEffect(() => {
    if (!focusNew.current) return;
    const input = document.querySelector(`[data-live-topic="${focusNew.current}"] input`);
    focusNew.current = null;
    input?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    input?.focus({ preventScroll: true });
    input?.select?.();
  });

  const toggle = (id) => {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
      setVisited(new Set([...visited, id]));
    } else next.add(id);
    setExpanded(next);
  };
  const add = () => {
    if (!canAdd) return;
    const { data: next, groupId } = addLiveTopic(
      data,
      { name: `Topic ${plan.topics.length + 1}` },
      plan.pool === null ? newPool : undefined,
    );
    onChange(next);
    setExpanded(new Set([...expanded, groupId]));
    focusNew.current = groupId;
  };
  const remove = (topic) => {
    if (
      topic.group.annu?.requirements?.trim() &&
      !window.confirm(`Remove the topic “${topic.name}”? What you wrote for ANVI will be deleted.`)
    )
      return;
    onChange(removeLiveTopic(data, topic.id));
  };
  const starved = plan.starved.filter((t) => t.explicit === null);
  const exactExtra = plan.topics.filter((t) => t.explicit !== null).reduce((n, t) => n + t.count, 0);
  const defaultDifficulty = labelOf(DIFFICULTY, data.difficulty, "not set");

  return (
    <Card
      data-field="questions"
      tone="ai"
      icon={Shuffle}
      title="ANVI asks different questions to every student"
      description="Add the topics to cover and how important each one is. When a student starts, ANVI writes fresh questions for them from these topics."
      action={<Chip tone="ai">Recommended</Chip>}
    >
      <div className="min-w-0 space-y-5">
        {!plan.topics.length ? (
          <div className="flex flex-col items-center px-2 py-4 text-center">
            <h4 className="text-base font-semibold text-slate-900 dark:text-white">No topics yet</h4>
            <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-gray-400">
              For example React (High), DBMS (Medium) and Operating systems (Low). With 50 students, each one gets
              their own set of questions.
            </p>
            {errors.questions && (
              <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">
                Add at least one topic for ANVI, or add fixed questions below.
              </p>
            )}
            <button
              type="button"
              data-add-topic
              className={`${buttonPrimary} mt-4 !bg-violet-600 hover:!bg-violet-700`}
              disabled={!canAdd}
              onClick={add}
            >
              <Plus size={16} aria-hidden="true" />
              Add a topic
            </button>
          </div>
        ) : (
          <>
            <fieldset disabled={readOnly} className="grid min-w-0 gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
              <NumberField
                label="Questions per student"
                field="livePool"
                stepper
                min={1}
                max={poolMax}
                value={plan.pool ?? ""}
                onChange={(value) => onChange(setLiveQuestionCount(data, value))}
                hint={
                  plan.pooled
                    ? "Shared across topics by priority: High gets 3 parts, Medium 2, Low 1."
                    : "Every topic has an exact number, so this total isn't used."
                }
              />
              <div
                role="status"
                aria-live="polite"
                data-live-preview
                className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 dark:border-indigo-500/20 dark:bg-indigo-500/10"
              >
                <p className="text-sm font-medium text-indigo-950 dark:text-indigo-100">{planSentence(plan)}</p>
                {exactExtra > 0 && plan.pooled > 0 && (
                  <p className="mt-1 text-xs text-indigo-900/80 dark:text-indigo-200/80">
                    Includes {plural(exactExtra, "question")} from topics with an exact number, on top of the shared{" "}
                    {plan.pool}.
                  </p>
                )}
                <PrivacyNote className="mt-2" />
              </div>
            </fieldset>
            {starved.length > 0 && (
              <Alert
                tone="warning"
                title={`${plural(plan.pool || 0, "question")} can't cover ${plural(plan.pooled, "topic")}`}
                action={
                  plan.pooled <= poolMax ? (
                    <button
                      type="button"
                      className={`${buttonSecondary} min-h-8 px-3 py-1 text-xs`}
                      disabled={readOnly}
                      onClick={() => onChange(setLiveQuestionCount(data, plan.pooled))}
                    >
                      Use {plan.pooled}
                    </button>
                  ) : null
                }
              >
                {names(starved)} {starved.length === 1 ? "gets" : "get"} no questions. Raise questions per student to at
                least {plan.pooled}, or remove a topic.
              </Alert>
            )}
            <ol className="space-y-2" aria-label="ANVI topics">
              {plan.topics.map((topic) => (
                <TopicRow
                  key={topic.id}
                  topic={topic}
                  expanded={expanded.has(topic.id)}
                  onToggle={() => toggle(topic.id)}
                  onPatch={(patch) => onChange(updateLiveTopic(data, topic.id, patch))}
                  onCount={(count) =>
                    onChange(setTopicCount(data, topic.id, count, plan.pool === null ? Math.max(1, Math.min(topic.count || DEFAULT_LIVE_COUNT, poolMax)) : undefined))
                  }
                  onRemove={() => remove(topic)}
                  issues={topicIssues(topic.group)}
                  showIssues={showAll || visited.has(topic.id)}
                  field={errors.live && primary?.id === topic.id ? "live" : undefined}
                  maxExact={Math.max(1, Math.min(TOPIC_COUNT_LIMIT, room + topic.count))}
                  defaultDifficulty={defaultDifficulty}
                  readOnly={readOnly}
                />
              ))}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" data-add-topic className={buttonSecondary} disabled={!canAdd} onClick={add}>
                <Plus size={15} aria-hidden="true" />
                Add topic
              </button>
              {sectionFull && (
                <span className="text-xs text-slate-500 dark:text-gray-400">
                  A section holds up to {limits.groups} topics and question groups.
                </span>
              )}
            </div>
          </>
        )}
        <div className="border-t border-slate-100 pt-4 dark:border-gray-800">
          <ResumeHint data={data} interviewId={interviewId} />
        </div>
      </div>
    </Card>
  );
}
