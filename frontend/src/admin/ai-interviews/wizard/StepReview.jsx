import { Link } from "react-router-dom";
import {
  AlertTriangle,
  AudioLines,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock,
  Eye,
  FileUser,
  ListChecks,
  Loader2,
  MessagesSquare,
  RefreshCw,
  ScanEye,
  Send,
  Trophy,
  UserPlus,
  Briefcase,
  MessageSquareMore,
} from "lucide-react";
import { ROOT, anviSettings } from "../definition";
import { AnviTile, ToneChip, surfaceClass } from "../ui";
import { ICON_TONES } from "../theme";
import { renderScript } from "./defaults";
import { estimate, isSimple, questionEntries } from "./structure";
import { livePlan, priorityLabel } from "./livetopics/counts";
import LiveTopicsSummary from "./livetopics/LiveTopicsSummary";
import { readConduct, readProctoring, readResume, readWarmup, RESUME_SOURCES } from "./settings/model";
import {
  DIFFICULTY,
  EXPERIENCE,
  MODES,
  PACES,
  STEPS,
  TONES,
  answerTimeLabel,
  labelOf,
  rubricTotal,
  voiceSummary,
} from "./steps";
import { Alert, buttonGhost, buttonPrimary, buttonSecondary } from "./controls";

const join = (items, empty = "None") => (items.filter(Boolean).length ? items.filter(Boolean).join(" · ") : empty);

// A progress ring for the hero: the share of the setup checklist that is done.
function ReadinessRing({ percent, tone }) {
  const radius = 34;
  const length = 2 * Math.PI * radius;
  const stroke = { emerald: "stroke-emerald-500", amber: "stroke-amber-500", sky: "stroke-sky-500" }[tone];
  return (
    <div data-readiness-ring className="relative h-24 w-24 shrink-0" role="img" aria-label={`Setup ${percent}% complete`}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="7" className="stroke-slate-100 dark:stroke-gray-800" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - percent / 100)}
          className={`${stroke} transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none`}
        />
      </svg>
      <span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{percent}%</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-gray-400">ready</span>
      </span>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, detail, tone = "sky" }) {
  return (
    <div className={`${surfaceClass} flex items-start gap-3 p-4`}>
      <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ICON_TONES[tone]}`}>
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-gray-400">{label}</p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums leading-7 text-slate-900 dark:text-white">{value}</p>
        {detail && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-gray-400">{detail}</p>}
      </div>
    </div>
  );
}

function SummaryCard({ title, icon: Icon, onEdit, rows, className = "", columns = false }) {
  return (
    <section className={`${surfaceClass} flex flex-col p-5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-slate-900 dark:text-white">
          {Icon && (
            <span aria-hidden="true" className={`flex h-7 w-7 items-center justify-center rounded-lg ${ICON_TONES.slate}`}>
              <Icon size={15} />
            </span>
          )}
          {title}
        </h3>
        <button type="button" className={`${buttonGhost} -mr-2 text-xs`} onClick={onEdit}>
          Edit <span className="sr-only">{title}</span>
        </button>
      </div>
      <dl className={`mt-4 grid gap-x-8 gap-y-3 ${columns ? "sm:grid-cols-2" : ""}`}>
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-slate-500 dark:text-gray-400">{label}</dt>
            <dd className="mt-0.5 break-words text-sm font-medium text-slate-900 dark:text-gray-100">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// A live topic in the student preview: what ANVI will cover, never the questions themselves.
function LiveTopicLine({ topic }) {
  const count = topic?.count || 0;
  return (
    <li
      data-live-preview-topic
      className="rounded-xl border border-dashed border-indigo-200 px-4 py-3 text-sm text-slate-600 dark:border-indigo-500/30 dark:text-gray-300"
    >
      ANVI asks {count} question{count === 1 ? "" : "s"} about {topic?.name || "this topic"}, written for this student (
      {priorityLabel(topic?.priority)} priority)
      {topic?.maxFollowUps
        ? `, with up to ${topic.maxFollowUps} follow-up${topic.maxFollowUps === 1 ? "" : "s"} each`
        : ""}
      .
    </li>
  );
}

function StudentPreview({ data, plan }) {
  const persona = anviSettings(data.anvi).persona;
  const grouped = !isSimple(data);
  const entries = questionEntries(data);
  let number = 0;
  const defaultTime = data.rules?.responseSeconds;
  const meta = (question) => {
    const time = question.ruleOverrides?.responseSeconds ?? defaultTime;
    const parts = [time === null ? "No time limit" : `Up to ${answerTimeLabel(time ?? 120)} to answer`];
    const followUps = (question.followUps || []).length + (question.maxFollowUps || 0);
    if (followUps) parts.push(`ANVI may ask up to ${followUps} follow-up${followUps === 1 ? "" : "s"}`);
    if (question.skippable === false) parts.push("Can't be skipped");
    return parts.join(" · ");
  };
  return (
    <section
      id="student-preview"
      data-field="preview"
      aria-labelledby="student-preview-heading"
      className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 dark:border-gray-800">
        <h3 id="student-preview-heading" className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
          <Eye size={17} aria-hidden="true" className="text-sky-600" />
          Preview as student
        </h3>
        <span className="text-xs text-slate-500 dark:text-gray-400">Expected answers stay hidden from students.</span>
      </header>
      <div className="space-y-5 p-5">
        <div className="flex gap-3">
          <AnviTile size="sm" />
          <p className="rounded-2xl rounded-tl-sm bg-violet-50 px-4 py-2.5 text-sm text-violet-950 dark:bg-violet-500/10 dark:text-violet-100">
            {persona.introduction.trim()
              ? renderScript(persona.introduction, data)
              : `Hi Priya, I'm ANVI. Let's begin your ${data.role || "practice"} interview.`}
          </p>
        </div>
        {data.sections.map((section) => (
          <div key={section.id} className="space-y-3">
            {grouped && (
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
                {section.name}
              </h4>
            )}
            {grouped && section.instructions && (
              <p className="text-sm text-slate-600 dark:text-gray-300">{section.instructions}</p>
            )}
            <ol className="space-y-3">
              {section.groups.flatMap((group) =>
                group.source === "annu"
                  ? [<LiveTopicLine key={group.id} topic={plan.topics.find((t) => t.id === group.id)} />]
                  : group.questions.map((question) => {
                      number += 1;
                      return (
                        <li key={question.id} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-gray-800">
                          <p className="text-xs font-semibold text-slate-500 dark:text-gray-400">Question {number}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-900 dark:text-white">
                            {question.kind === "resume"
                              ? `${question.resumeCount || 1} question${(question.resumeCount || 1) === 1 ? "" : "s"} about your resume`
                              : question.kind === "topic"
                                ? `ANVI asks about: ${question.prompt || "—"}`
                                : question.prompt || "—"}
                          </p>
                          {question.subquestions?.length > 0 && (
                            <ul className="ml-4 mt-1 list-disc text-sm text-slate-600 dark:text-gray-300">
                              {question.subquestions.map((part) => (
                                <li key={part.id}>{part.prompt}</li>
                              ))}
                            </ul>
                          )}
                          <p className="mt-1.5 text-xs text-slate-500 dark:text-gray-400">{meta(question)}</p>
                        </li>
                      );
                    }),
              )}
            </ol>
          </div>
        ))}
        {!entries.length && !data.sections.some((s) => s.groups.some((g) => g.source === "annu")) && (
          <p className="text-sm text-slate-500">No questions yet.</p>
        )}
        <div className="flex gap-3">
          <AnviTile size="sm" />
          <p className="rounded-2xl rounded-tl-sm bg-violet-50 px-4 py-2.5 text-sm text-violet-950 dark:bg-violet-500/10 dark:text-violet-100">
            {persona.closing.trim()
              ? renderScript(persona.closing, data)
              : "Thank you, Priya. Your report will be ready shortly."}
          </p>
        </div>
      </div>
    </section>
  );
}

const TAB_SWITCH = { off: "", record: "Tab switches recorded", warn: "Tab switches recorded and warned" };

export default function StepReview({
  data,
  issues,
  checking,
  checked,
  onFix,
  onRecheck,
  onEdit,
  publishError,
  published,
  justPublished,
  readOnly,
  interviewId,
  summary,
  status,
  stepReady = {},
  onPublish,
  publishing = false,
  canAssign = false,
}) {
  const counts = estimate(data);
  const plan = livePlan(data, summary);
  const live = plan.topics.length ? plan.total : counts.live;
  const anvi = anviSettings(data.anvi);
  const ready = checked && !issues.length;
  const conduct = readConduct(data);
  const warmup = readWarmup(data);
  const resume = readResume(data);
  const proctoring = readProctoring(data);
  const rubric = data.rubric || [];

  // The setup checklist (it used to sit in the side summary): the three editing steps, the server
  // check and publishing. The hero ring shows how much of it is done.
  const checklist = [
    ...STEPS.filter((step) => step.id !== "review").map((step) => ({ id: step.id, label: step.label, done: Boolean(stepReady[step.id]) })),
    { id: "check", label: "Passes the readiness check", done: ready || Boolean(published) },
    { id: "published", label: "Published to students", done: Boolean(published) },
  ];
  const done = checklist.filter((item) => item.done).length;
  const percent = Math.round((done / checklist.length) * 100);
  const ringTone = percent === 100 ? "emerald" : issues.length ? "amber" : "sky";
  const headline = published
    ? "Live for students. Edits you make here need publishing again."
    : checking
      ? "Checking your interview…"
      : ready
        ? "Everything checks out. Publish to make it available under AI Interviews."
        : issues.length
          ? `${issues.length} thing${issues.length === 1 ? "" : "s"} to fix before you can publish.`
          : "The setup is checked on the server when you publish.";

  const perStudent = live
    ? counts.questions
      ? `${counts.questions + live} (${counts.questions} fixed + ${live} by ANVI)`
      : `${live}, all different per student`
    : String(counts.questions);
  const limitText = proctoring.maxViolations
    ? `${proctoring.onLimit === "end" ? "Ends" : "Flagged"} at ${proctoring.maxViolations} violation${proctoring.maxViolations === 1 ? "" : "s"}`
    : "No limit";
  const termsText = conduct.termsText.trim()
    ? conduct.requireTermsAcceptance
      ? "Shown, students must accept"
      : "Shown for information"
    : "None";

  return (
    <div className="space-y-8">
      <section data-review-hero aria-labelledby="review-heading" className={`${surfaceClass} overflow-hidden`}>
        <div className="flex flex-col gap-6 bg-gradient-to-br from-sky-50/70 via-white to-white p-6 dark:from-sky-500/5 dark:via-gray-900 dark:to-gray-900 sm:flex-row sm:items-center">
          <ReadinessRing percent={percent} tone={ringTone} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Review and publish</p>
            <h2 id="review-heading" className="mt-1 break-words text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {data.title?.trim() || "Untitled interview"}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-500 dark:text-gray-400">
              {status && <ToneChip tone={status.tone}>{status.label}</ToneChip>}
              <span>{join([data.role?.trim() || "Role not set", data.companyName?.trim()], "")}</span>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-gray-300">{headline}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch lg:flex-row lg:items-center">
            {onPublish && !published && (
              <button type="button" data-hero-publish className={buttonPrimary} disabled={readOnly || publishing} onClick={onPublish}>
                {publishing ? (
                  <Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <Send size={16} aria-hidden="true" />
                )}
                {publishing ? "Publishing…" : status?.label?.startsWith("Published") ? "Publish changes" : "Publish interview"}
              </button>
            )}
            {interviewId && canAssign ? (
              <Link to={`${ROOT}/schedules/new?interviewId=${interviewId}`} className={buttonSecondary}>
                <UserPlus size={15} aria-hidden="true" />
                Assign to students
              </Link>
            ) : (
              <span aria-disabled="true" title="Publish the interview first" className={`${buttonSecondary} cursor-not-allowed opacity-50`}>
                <UserPlus size={15} aria-hidden="true" />
                Assign to students
              </span>
            )}
          </div>
        </div>
      </section>

      {justPublished && (
        <section
          role="status"
          data-publish-success
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/40"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 size={24} aria-hidden="true" className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-emerald-950 dark:text-emerald-100">Interview published</h3>
              <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-200">
                Students can now find it under AI Interviews.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={ROOT} className={buttonPrimary}>
                  View in directory
                </Link>
                {interviewId && (
                  <Link to={`${ROOT}/schedules/new?interviewId=${interviewId}`} className={buttonSecondary}>
                    <UserPlus size={15} aria-hidden="true" />
                    Assign to students
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
      {publishError && (
        <Alert tone="error" title="Couldn't publish">
          {publishError}
        </Alert>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="readiness-heading" data-readiness className={`${surfaceClass} flex flex-col`}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-gray-800">
            <h3 id="readiness-heading" className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-white">
              <AlertTriangle size={16} aria-hidden="true" className={issues.length ? "text-amber-500" : "text-slate-400"} />
              Needs attention
            </h3>
            {!readOnly && (
              <button type="button" className={buttonGhost} disabled={checking} onClick={onRecheck}>
                <RefreshCw size={14} aria-hidden="true" className={checking ? "animate-spin motion-reduce:animate-none" : ""} />
                Check again
              </button>
            )}
          </header>
          <div className="flex-1 px-5 py-4" aria-live="polite">
            {checking ? (
              <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-300">
                <Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                Checking your interview…
              </p>
            ) : ready ? (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 py-6 text-center">
                <span aria-hidden="true" className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <CheckCircle2 size={22} />
                </span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Nothing needs attention</p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  {published ? "Everything checks out." : "Everything looks good. Ready to publish."}
                </p>
              </div>
            ) : issues.length ? (
              <>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  {issues.length} thing{issues.length === 1 ? "" : "s"} to fix before publishing
                </p>
                <ul className="mt-2 divide-y divide-slate-100 dark:divide-gray-800">
                  {issues.map((issue, index) => (
                    <li key={`${issue.field}-${index}`} className="flex items-center justify-between gap-4 py-3">
                      <span className="flex min-w-0 items-start gap-2.5 text-sm text-slate-800 dark:text-gray-200">
                        <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        <span>
                          {issue.message}
                          <span className="ml-2 text-xs text-slate-400 dark:text-gray-500">{STEPS.find((step) => step.id === issue.step && step.id !== "review")?.label}</span>
                        </span>
                      </span>
                      {!readOnly && issue.step !== "review" && (
                        <button
                          type="button"
                          className={`${buttonSecondary} min-h-8 shrink-0 px-3 py-1 text-xs`}
                          aria-label={`Fix: ${issue.message}`}
                          onClick={() => onFix(issue)}
                        >
                          Fix <ChevronRight size={13} aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-slate-500 dark:text-gray-400">The setup is checked on the server when you publish.</p>
            )}
          </div>
        </section>
        <section aria-labelledby="checklist-heading" data-review-checklist className={`${surfaceClass} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <h3 id="checklist-heading" className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-white">
              <ListChecks size={16} aria-hidden="true" className="text-sky-600 dark:text-sky-400" />
              Setup checklist
            </h3>
            <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-gray-400">
              {done} of {checklist.length}
            </span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {checklist.map((item) => {
              const Icon = item.done ? CheckCircle2 : Circle;
              return (
                <li key={item.id} data-summary-step={item.id} className="flex items-center gap-2.5 text-sm">
                  <Icon size={17} aria-hidden="true" className={item.done ? "text-emerald-600 dark:text-emerald-400" : "text-slate-300 dark:text-gray-600"} />
                  <span className={item.done ? "text-slate-800 dark:text-gray-100" : "text-slate-500 dark:text-gray-400"}>{item.label}</span>
                  <span className="sr-only">{item.done ? ": done" : ": not done"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section aria-label="Interview at a glance" data-review-kpis className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Kpi icon={ListChecks} label="Questions per student" value={live ? counts.questions + live : counts.questions} detail={live ? `${counts.questions} fixed + ${live} by ANVI` : "Same for every student"} />
        <Kpi icon={Clock} label="Estimated time" value={counts.unlimited ? "Untimed" : counts.total ? `${counts.minutes} min` : "—"} detail="If every answer uses its full time" tone="violet" />
        <Kpi icon={Trophy} label="Total marks" value={counts.total ? counts.marks : "—"} detail={`${rubric.length} scoring criteria`} tone="amber" />
        <Kpi icon={MessageSquareMore} label="Follow-ups" value={`Up to ${counts.followUps}`} detail="Asked by ANVI when useful" tone="emerald" />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          title="Basics"
          icon={Briefcase}
          onEdit={() => onEdit("basics")}
          rows={[
            ["Role", data.role || "—"],
            ["Company", data.companyName || "General"],
            ["Level", `${labelOf(EXPERIENCE, data.experience, "—")} · ${labelOf(DIFFICULTY, data.difficulty, "—")}`],
            ["Type", labelOf(MODES, data.rules?.mode, "Mock interview")],
            ["Language", "English"],
          ]}
        />
        <SummaryCard
          title="Questions"
          icon={ListChecks}
          className="xl:col-span-2"
          columns
          onEdit={() => onEdit("questions")}
          rows={[
            ["Questions per student", perStudent],
            ["Default answer time", answerTimeLabel(data.rules?.responseSeconds === undefined ? 120 : data.rules.responseSeconds)],
            ...(plan.topics.length
              ? [["ANVI topics", plan.topics.map((t) => `${t.name} ×${t.count} (${priorityLabel(t.priority)})`).join(" · ")]]
              : []),
            ["Follow-ups", `Up to ${counts.followUps}`],
          ]}
        />
        <SummaryCard
          title="Voice & personality"
          icon={AudioLines}
          onEdit={() => onEdit("anvi", "voice")}
          rows={[
            ["Voice", voiceSummary(data)],
            ["Personality", `${labelOf(TONES, anvi.persona.tone)} · ${labelOf(PACES, anvi.persona.pace)} pace`],
            ["Scripts", anvi.persona.introduction || anvi.persona.closing ? "Custom" : "Standard"],
            ["Video avatar", anvi.avatar?.enabled ? "On" : "Off"],
          ]}
        />
        <SummaryCard
          title="Conversation"
          icon={MessagesSquare}
          onEdit={() => onEdit("anvi", "turns")}
          rows={[
            ["Replies after", `${anvi.turns.silenceSeconds} s silence`],
            ["Nudges", anvi.turns.maxNudges ? `Up to ${anvi.turns.maxNudges} after ${anvi.turns.nudgeSeconds} s` : "None"],
            ["Warm-up", warmup.enabled ? `On · ${warmup.icebreakers} icebreaker${warmup.icebreakers === 1 ? "" : "s"}${warmup.tellMeAboutYourself ? " + about yourself" : ""}` : "Off"],
            ["Ground rules", join([conduct.finishAllQuestions && "Finish all questions", conduct.endByVoice && "End by voice", conduct.noPersonalQuestions && "No personal questions"])],
          ]}
        />
        <SummaryCard
          title="Candidate setup"
          icon={FileUser}
          onEdit={() => onEdit("anvi", "resume")}
          rows={[
            [
              "Resume",
              resume.mode === "none"
                ? "Not asked"
                : `${resume.mode === "required" ? "Required" : "Optional"} · ${resume.questionCount} question${resume.questionCount === 1 ? "" : "s"}`,
            ],
            ...(resume.mode === "none"
              ? []
              : [["Shared from", resume.sources.map((s) => (s === "builder" ? "Resume Builder" : RESUME_SOURCES.find((r) => r.value === s)?.label.split(" (")[0] || s)).join(" or ")]]),
            ["Terms", termsText],
          ]}
        />
        <SummaryCard
          title="Proctoring"
          icon={ScanEye}
          onEdit={() => onEdit("anvi", "proctoring")}
          rows={
            proctoring.enabled
              ? [
                  ["Status", "On"],
                  ["Rules", join([proctoring.fullscreen === "required" && "Fullscreen required", TAB_SWITCH[proctoring.tabSwitch], proctoring.refresh === "record" && "Reloads recorded"])],
                  ["Camera AI checks", proctoring.ai.enabled ? "On" : "Off"],
                  ["Limit", `${proctoring.warnings} warning${proctoring.warnings === 1 ? "" : "s"} · ${limitText}`],
                ]
              : [["Status", "Off"], ["Camera AI checks", "Off"]]
          }
        />
        <SummaryCard
          title="Scoring"
          icon={ClipboardCheck}
          className="md:col-span-2"
          columns
          onEdit={() => onEdit("anvi", "rubric")}
          rows={[
            ["Criteria", rubric.length ? rubric.map((r) => `${r.name || "Unnamed"} ${r.weight}%`).join(" · ") : "None yet"],
            ["Weights", `Total ${rubricTotal(rubric)}%`],
          ]}
        />
      </div>

      <LiveTopicsSummary
        plan={plan}
        fixedCount={counts.questions}
        onEdit={
          <button type="button" className={`${buttonGhost} -mr-2 text-xs`} onClick={() => onEdit("questions")}>
            Edit <span className="sr-only">ANVI topics</span>
          </button>
        }
      />
      <StudentPreview data={data} plan={plan} />
    </div>
  );
}
