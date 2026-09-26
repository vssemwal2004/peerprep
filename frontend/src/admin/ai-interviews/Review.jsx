import { CheckCircle2, Circle, ChevronRight, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { ROOT, summarize } from "./definition";
import { getAuthoringProgress } from "./authoringProgress";
import { AnnuBrand } from "./AnnuBrand";
import { Avatar, Badge, Notice, Panel } from "./ui";

const editClass =
  "inline-flex shrink-0 items-center gap-1 rounded px-1 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-400";

function QuestionPreview({ data, preview }) {
  return (
    <div className="space-y-4">
      {data.sections.map((section) => (
        <Panel
          key={section.id}
          title={section.name || "Untitled section"}
          action={<Badge>{section.weight}% weight</Badge>}
        >
          {section.instructions && (
            <p className="mb-4 text-sm text-slate-500">
              {section.instructions}
            </p>
          )}
          <div className="space-y-5">
            {section.groups.map((group) => (
              <div key={group.id}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">
                    {group.name || "Untitled topic"}
                  </h3>
                  {group.source === "annu" ? (
                    <>
                      <AnnuBrand compact icon={false} />
                      <Badge>Planned</Badge>
                    </>
                  ) : (
                    <Badge>Manual</Badge>
                  )}
                </div>
                {group.source === "annu" ? (
                  <div className="space-y-2 text-sm text-slate-500">
                    <p>
                      {group.annu.targetCount} questions planned. Generation is
                      not connected.
                    </p>
                    {!preview && (
                      <p className="whitespace-pre-wrap">
                        {group.annu.requirements || "Requirements not set."}
                      </p>
                    )}
                  </div>
                ) : (
                  <ol className="list-inside list-decimal space-y-4 text-sm">
                    {group.questions.map((question) => (
                      <li key={question.id}>
                        <span className="whitespace-pre-wrap font-medium">
                          {question.prompt || "Empty question"}
                        </span>
                        {question.context && (
                          <p className="mt-1 pl-4 text-slate-500">
                            {question.context}
                          </p>
                        )}
                        {question.subquestions.length > 0 && (
                          <div className="mt-2 pl-4">
                            <p className="text-xs font-medium text-slate-500">
                              Sub-questions
                            </p>
                            <ul className="ml-4 mt-1 list-disc space-y-1 text-slate-600 dark:text-gray-300">
                              {question.subquestions.map((sub) => (
                                <li key={sub.id}>
                                  {sub.prompt || "Empty sub-question"}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {question.followUps.length > 0 && (
                          <div className="mt-2 pl-4">
                            <p className="text-xs font-medium text-slate-500">
                              Cross-questions
                            </p>
                            <ol className="ml-4 mt-1 list-decimal space-y-1 text-slate-600 dark:text-gray-300">
                              {question.followUps.map((followUp) => (
                                <li key={followUp.id}>
                                  {followUp.prompt || "Empty cross-question"}
                                  {!preview && followUp.expectedAnswer && (
                                    <p className="mt-1 text-xs text-slate-500">
                                      Answer guidance: {followUp.expectedAnswer}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                        {!preview && question.expectedAnswer && (
                          <details className="mt-2 pl-4 text-xs text-slate-500">
                            <summary className="cursor-pointer">
                              Admin answer guidance
                            </summary>
                            <p className="mt-1 whitespace-pre-wrap">
                              {question.expectedAnswer}
                            </p>
                          </details>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </Panel>
      ))}
      {!data.sections.length && (
        <p className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
          No sections or questions added yet.
        </p>
      )}
    </div>
  );
}

export default function Review({ doc, data, preview = false }) {
  const counts = summarize(data);
  const progress = getAuthoringProgress(data);
  const saved = JSON.stringify(data) === JSON.stringify(doc.data);
  const validated = saved && doc.validation?.complete;
  const issues =
    saved && doc.validation?.issues?.length
      ? doc.validation.issues
      : progress.issues;
  const editTo = (path) => `${ROOT}/${doc._id}/${path}`;
  const settingsReady = !progress.issues.some((issue) =>
    ["rules", "interviewer"].includes(issue.path),
  );
  const checklist = [
    {
      title: "Interview details",
      path: "basics",
      ready: progress.steps[0].ready,
      detail: [
        data.companyName || "General practice",
        data.role || "Add a job role",
        data.experience,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      title: "Sections & questions",
      path: "sections",
      ready: progress.steps[1].ready,
      detail: `${data.sections.length} sections · ${counts.manual} written questions${counts.planned ? ` · ${counts.planned} ANNU questions planned` : ""}`,
    },
    {
      title: "Interviewer & settings",
      path: "interviewer",
      ready: settingsReady,
      detail: `${data.interviewer?.displayName || "Choose an interviewer"} · ${data.rules.language} · ${data.rules.mode === "guided" ? "Guided practice" : "Mock interview"}`,
    },
  ];
  const renderIssues = (items, start = 0) =>
    items.map((issue, index) => (
      <li
        key={`${issue.path}-${start + index}`}
        className="flex items-start justify-between gap-3 py-2 text-sm"
      >
        <span>{issue.message}</span>
        <Link
          className={editClass}
          to={editTo(issue.path)}
          aria-label={`Fix: ${issue.message}`}
        >
          Fix <ChevronRight size={13} />
        </Link>
      </li>
    ));

  return (
    <div className="space-y-4">
      <Notice>
        {preview
          ? "Configuration preview only — this is not a live interview."
          : validated
            ? "Setup is complete. This interview is not published to students."
            : "Check your setup below, then choose Finish setup. This saves and checks your draft without publishing to students."}
      </Notice>

      <Panel
        title={preview ? "Interview overview" : "Ready to finish?"}
        action={
          !preview && (
            <Badge complete={validated}>
              {validated
                ? "Setup complete"
                : progress.ready
                  ? "Ready to finish"
                  : "Needs attention"}
            </Badge>
          )
        }
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-semibold text-slate-900 dark:text-white">
              {data.title || "Untitled interview"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {data.difficulty
                ? `${data.difficulty.charAt(0).toUpperCase()}${data.difficulty.slice(1)} difficulty`
                : "Difficulty not selected"}
              {" · "}
              {!saved
                ? "Unsaved changes"
                : doc.summary?.unlimited
                  ? "Unlimited timing configured"
                  : doc.summary?.budgetSeconds
                    ? `${Math.ceil(doc.summary.budgetSeconds / 60)} min configured response budget`
                    : "Timing summary available after saving questions"}
            </p>
          </div>
          {data.interviewer && (
            <div className="flex shrink-0 items-center gap-2">
              <Avatar variant={data.interviewer.avatar} size={32} />
              <span className="text-xs font-medium">
                {data.interviewer.displayName}
              </span>
            </div>
          )}
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-gray-800">
          {checklist.map((item) => {
            const Icon = item.ready ? CheckCircle2 : Circle;
            return (
              <li key={item.path} className="flex items-start gap-3 py-3">
                <Icon
                  size={18}
                  aria-hidden="true"
                  className={`mt-0.5 shrink-0 ${item.ready ? "text-emerald-600" : "text-slate-400"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {item.title}
                    <span className="sr-only">
                      {item.ready ? ": fields filled" : ": needs attention"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                </div>
                {!preview && (
                  <Link className={editClass} to={editTo(item.path)}>
                    Edit <span className="sr-only">{item.title}</span>
                    <ChevronRight size={13} />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        {!preview && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-gray-800">
            <span>{counts.followUps} maximum cross-questions configured</span>
            <Link className={editClass} to={editTo("rules")}>
              <Settings2 size={13} /> Timing & evaluation settings
            </Link>
          </div>
        )}
        {counts.planned > 0 && (
          <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:bg-violet-950/30 dark:text-violet-200">
            ANNU AI instructions are saved for future use. The {counts.planned}{" "}
            planned questions have not been generated; no LLM or live interview
            is connected.
          </p>
        )}
      </Panel>

      {!preview && issues.length > 0 && (
        <Panel
          title={`${issues.length} ${issues.length === 1 ? "item" : "items"} to finish`}
        >
          <ul className="divide-y divide-slate-100 dark:divide-gray-800">
            {renderIssues(issues.slice(0, 5))}
          </ul>
          {issues.length > 5 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-sky-700">
                Show {issues.length - 5} more checks
              </summary>
              <ul className="mt-2 divide-y divide-slate-100 dark:divide-gray-800">
                {renderIssues(issues.slice(5), 5)}
              </ul>
            </details>
          )}
        </Panel>
      )}

      {preview ? (
        <QuestionPreview data={data} preview />
      ) : (
        <details className="rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">
            Review all questions{" "}
            <span className="ml-2 text-xs font-normal text-slate-500">
              {counts.manual} written · {counts.planned} planned
            </span>
          </summary>
          <div className="space-y-4 border-t border-slate-100 p-4 dark:border-gray-800">
            <QuestionPreview data={data} preview={false} />
          </div>
        </details>
      )}

      {data.interviewer && (
        <details className="rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">
            Interviewer introduction & closing
          </summary>
          <div className="space-y-3 border-t border-slate-100 p-5 text-sm dark:border-gray-800">
            <p className="text-xs text-slate-500">
              {data.interviewer.tone} tone · {data.interviewer.language} ·
              Static profile
            </p>
            <p className="whitespace-pre-wrap text-slate-600 dark:text-gray-300">
              {data.interviewer.introduction || "No introduction configured."}
            </p>
            {data.interviewer.closing && (
              <p className="whitespace-pre-wrap text-slate-600 dark:text-gray-300">
                {data.interviewer.closing}
              </p>
            )}
            {!preview && (
              <Link className={editClass} to={editTo("interviewer")}>
                Edit interviewer <ChevronRight size={13} />
              </Link>
            )}
          </div>
        </details>
      )}

      {!preview && (
        <details className="rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">
            Recent changes
          </summary>
          <div className="border-t border-slate-100 px-5 pb-3 dark:border-gray-800">
            <p className="py-3 text-xs text-slate-500">
              Latest 100 configuration actions. The last successful validation
              snapshot is retained on the server.
            </p>
            <ul className="divide-y divide-slate-100 dark:divide-gray-800">
              {[...(doc.history || [])].reverse().map((entry, index) => (
                <li
                  key={index}
                  className="flex justify-between gap-3 py-2 text-xs"
                >
                  <span className="capitalize">
                    {entry.action} · revision {entry.revision}
                  </span>
                  <time className="text-slate-500">
                    {new Date(entry.at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
            {!doc.history?.length && (
              <p className="py-2 text-xs text-slate-500">
                No changes recorded yet.
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
