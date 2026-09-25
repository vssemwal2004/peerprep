import { Link } from "react-router-dom";
import { ROOT, summarize } from "./definition";
import { Avatar, Badge, Notice, Panel } from "./ui";

export default function Review({ doc, data, preview = false }) {
  const counts = summarize(data);
  return (
    <div className="space-y-4">
      <Notice>
        {preview
          ? "Configuration preview only — this is not a live interview."
          : "Validate the latest saved configuration. Completing setup does not publish to students."}
      </Notice>
      {!preview && doc.validation?.issues?.length > 0 && (
        <Panel title="Needs attention">
          <ul className="space-y-2">
            {doc.validation.issues.map((issue, i) => (
              <li key={i} className="flex justify-between gap-3 text-sm">
                <span>{issue.message}</span>
                <Link
                  className="shrink-0 font-medium text-sky-700"
                  to={`${ROOT}/${doc._id}/${issue.path}`}
                >
                  Fix →
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title={preview ? "Interview overview" : "Configuration summary"}>
        <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          {[
            ["Title", data.title],
            ["Company", data.companyName || "General practice"],
            ["Role", data.role || "Not set"],
            [
              "Experience / difficulty",
              `${data.experience || "Not set"} / ${data.difficulty || "Not set"}`,
            ],
            [
              "Content",
              `${data.sections.length} sections · ${counts.manual} manual · ${counts.planned} planned`,
            ],
            ["Maximum follow-ups", counts.followUps],
            ["Language / mode", `${data.rules.language} / ${data.rules.mode}`],
            [
              "Configured time budget",
              JSON.stringify(data) !== JSON.stringify(doc.data)
                ? "Save changes to update the timing summary"
                : doc.summary?.unlimited
                  ? "Unlimited timing configured"
                  : `${Math.ceil((doc.summary?.budgetSeconds || 0) / 60)} min, including maximum follow-ups`,
            ],
          ].map(([key, value]) => (
            <div key={key}>
              <dt className="mb-1 text-xs text-slate-500">{key}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {counts.planned > 0 && (
          <p className="mt-4 text-xs text-slate-500">
            ANNU counts and timings are planned, not generated. Replay playback
            and transitions are not included in the configured response budget.
          </p>
        )}
      </Panel>
      {data.interviewer && (
        <Panel title="Interviewer">
          <div className="flex items-center gap-3">
            <Avatar variant={data.interviewer.avatar} />
            <span className="font-medium">{data.interviewer.displayName}</span>
            <Badge>Static profile</Badge>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-gray-300">
            {data.interviewer.introduction}
          </p>
        </Panel>
      )}
      {data.sections.map((s) => (
        <Panel
          key={s.id}
          title={s.name}
          action={<Badge>{s.weight}% weight</Badge>}
        >
          {s.instructions && (
            <p className="mb-4 text-sm text-slate-500">{s.instructions}</p>
          )}
          <div className="space-y-4">
            {s.groups.map((g) => (
              <div key={g.id}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-sm font-medium">{g.name}</h3>
                  <Badge>
                    {g.source === "annu" ? "ANNU · specification" : "Manual"}
                  </Badge>
                </div>
                {g.source === "annu" ? (
                  <p className="text-sm text-slate-500">
                    {preview
                      ? `${g.annu.targetCount} questions planned. Generation is not connected.`
                      : g.annu.requirements || "Requirements not set."}
                  </p>
                ) : (
                  <ol className="list-inside list-decimal space-y-2 text-sm">
                    {g.questions.map((q) => (
                      <li key={q.id}>
                        <span className="whitespace-pre-wrap">
                          {q.prompt || "Empty question"}
                        </span>
                        {q.context && (
                          <p className="mt-1 pl-4 text-slate-500">
                            {q.context}
                          </p>
                        )}
                        {q.subquestions.length > 0 && (
                          <ul className="ml-6 mt-1 list-disc text-slate-500">
                            {q.subquestions.map((sub) => (
                              <li key={sub.id}>{sub.prompt}</li>
                            ))}
                          </ul>
                        )}
                        {q.followUps.length > 0 && (
                          <p className="mt-1 pl-4 text-xs text-slate-500">
                            {q.followUps.length} follow-up prompts configured
                          </p>
                        )}
                        {!preview && q.expectedAnswer && (
                          <details className="mt-1 pl-4 text-xs text-slate-500">
                            <summary className="cursor-pointer">
                              Admin answer guidance
                            </summary>
                            <p className="mt-1 whitespace-pre-wrap">
                              {q.expectedAnswer}
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
      {!preview && (
        <Panel title="Recent changes">
          <p className="mb-3 text-xs text-slate-500">
            Latest 100 configuration actions. The last successful validation
            snapshot is retained on the server.
          </p>
          <ul className="divide-y divide-slate-100 dark:divide-gray-800">
            {[...(doc.history || [])].reverse().map((h, i) => (
              <li key={i} className="flex justify-between gap-3 py-2 text-xs">
                <span className="capitalize">
                  {h.action} · revision {h.revision}
                </span>
                <time className="text-slate-500">
                  {new Date(h.at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
