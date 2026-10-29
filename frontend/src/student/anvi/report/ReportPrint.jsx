import { createPortal } from "react-dom";
import { PRINT_CSS, PRINT_TONES } from "./print";
import {
  AI_COUNTS, BLOCKED_COUNTS, ON_LIMIT_LABELS, PROCTOR_COUNTS, PROCTOR_EVENTS, VERDICTS, confidenceLabel, istClock, istDateTime, isAiDetection, marks,
  proctorEventLabel, proctoringRules, secondsLabel,
} from "./reportModel";

function Bars({ rows }) {
  return <table data-no-serial className="apr-bars"><tbody>
    {rows.map((row) => <tr key={row.key}>
      <td style={{ width: "38%", paddingRight: "8pt" }}>{row.name}</td>
      <td><div className="apr-bar"><span style={{ width: `${row.percent}%` }} /></div></td>
      <td style={{ width: "22%", textAlign: "right", whiteSpace: "nowrap", paddingLeft: "6pt" }} className="apr-value">{row.detail ? <span className="apr-muted apr-small">{row.detail} · </span> : null}{row.percent}%</td>
    </tr>)}
  </tbody></table>;
}

function Row({ className = "", children }) {
  return <tr className={className}><td><div className="apr-block">{children}</div></td></tr>;
}

const srOnly = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" };

function ResponseBlock({ response, student }) {
  return <div className="apr-q">
    <div className="apr-q-head">
      <div>
        {(response.section || response.competency) ? <p className="apr-eyebrow">{[response.section, response.competency].filter(Boolean).join(" · ")}</p> : null}
        <p className="apr-q-text">{response.label}. {response.question}</p>
      </div>
      {(response.marks || response.percent !== null) && <p className="apr-value" style={{ whiteSpace: "nowrap", margin: 0 }}>
        {response.marks ? `${marks(response.marks.score)} / ${marks(response.marks.max)}` : ""}{response.marks && response.percent !== null ? " · " : ""}{response.percent !== null ? `${response.percent}%` : ""}
      </p>}
    </div>
    {response.flags.length > 0 && <p style={{ margin: "3pt 0 0" }}>{response.flags.map((flag) => <span key={flag.key} className="apr-chip apr-flag">{flag.label}</span>)}</p>}
    <p className="apr-sub">{student ? "Your answer" : "Answer"}</p>
    <p className={`apr-answer${response.answered ? "" : " apr-muted"}`}>{response.answered ? response.answer : response.statusLabel}</p>
    {(response.metrics.length > 0 || response.time) && <p className="apr-small apr-muted" style={{ margin: "2pt 0 0" }}>{[response.time && `Time ${response.time}`, ...response.metrics.map((metric) => metric.label), response.pace?.label].filter(Boolean).join(" · ")}</p>}
    {(response.functional !== null || response.nonFunctional !== null || response.dimensions.length > 0) && <p className="apr-small" style={{ margin: "2pt 0 0" }}>
      {[response.functional !== null && `Functional ${response.functional}%`, response.nonFunctional !== null && `Non-functional ${response.nonFunctional}%`, ...response.dimensions.map((dimension) => `${dimension.label} ${dimension.percent}%`)].filter(Boolean).join(" · ")}
    </p>}
    {response.keyPoints.length > 0 && <>
      <p className="apr-sub">Key points</p>
      <p style={{ margin: "2pt 0 0" }}>{response.keyPoints.map((point) => <span key={point.text} className={`apr-chip apr-${point.verdict}`}>
        {VERDICTS[point.verdict].symbol} {point.text}<span style={srOnly}> ({VERDICTS[point.verdict].label})</span>
      </span>)}</p>
    </>}
    {response.feedback && <p className="apr-feedback"><strong>ANVI feedback: </strong>{response.feedback}</p>}
    {response.strengths.length > 0 && <p className="apr-small" style={{ margin: "3pt 0 0" }}><strong>What went well: </strong>{response.strengths.join("; ")}</p>}
    {response.improvements.length > 0 && <p className="apr-small" style={{ margin: "2pt 0 0" }}><strong>To improve: </strong>{response.improvements.join("; ")}</p>}
    {response.expectedAnswer && <><p className="apr-sub">Expected answer (admin copy)</p><p className="apr-answer">{response.expectedAnswer}</p></>}
  </div>;
}

function Integrity({ proctoring, full }) {
  const { counts, blocked, events, pauses, violations, maxViolations, onLimit, limitReached, endedForViolations, settings, ai } = proctoring;
  const rules = full ? proctoringRules(settings) : [];
  const browserEvents = events ? events.filter((event) => !isAiDetection(event.type)) : null;
  return <>
    <h2 className="apr-h2">Integrity</h2>
    {endedForViolations && <p className="apr-alert apr-alert-rose">The interview was ended because the violation limit was reached.</p>}
    {!endedForViolations && limitReached && maxViolations > 0 && <p className="apr-alert apr-alert-amber">The violation limit was reached{onLimit === "flag" ? "; the interview continued and this report is flagged." : "."}</p>}
    <table data-no-serial className="apr-kpis"><tbody><tr>
      <td><span className="apr-label">Violations{maxViolations ? ` (limit ${maxViolations})` : ""}</span><span className="apr-value">{violations ?? "—"}</span></td>
      {PROCTOR_COUNTS.map(({ key, label }) => <td key={key}><span className="apr-label">{label}</span><span className="apr-value">{counts[key] ?? 0}</span></td>)}
    </tr></tbody></table>
    {(proctoring.blockedTotal > 0 || settings?.blockRightClick || settings?.blockCopyPaste || settings?.blockShortcuts) && <table data-no-serial className="apr-kpis"><tbody><tr>
      <td><span className="apr-label">Blocked actions</span><span className="apr-small apr-muted">not violations</span></td>
      {BLOCKED_COUNTS.map(({ key, label }) => <td key={key}><span className="apr-label">{label}</span><span className="apr-value">{blocked?.[key] ?? 0}</span></td>)}
    </tr></tbody></table>}
    {full && rules.length > 0 && <p className="apr-small" style={{ margin: "5pt 0 0" }}><strong>Rules: </strong>{rules.join(" · ")}{maxViolations ? ` · At the limit: ${ON_LIMIT_LABELS[onLimit]}` : ""}</p>}
    {full && pauses && pauses.length > 0 && <>
      <p className="apr-sub">Pauses</p>
      <table data-no-serial className="apr-table"><thead><tr><th>From (IST)</th><th>To</th><th>Length</th></tr></thead><tbody>
        {pauses.map((pause, index) => <tr key={`${pause.from}-${index}`}><td>{istClock(pause.from) || "—"}</td><td>{pause.to ? istClock(pause.to) : "Not resumed"}</td><td>{pause.seconds !== null ? secondsLabel(pause.seconds) : "—"}</td></tr>)}
      </tbody></table>
    </>}
    {ai && <>
      <p className="apr-sub">Camera AI checks · {ai.total} detection{ai.total === 1 ? "" : "s"} · no video is recorded</p>
      <table data-no-serial className="apr-kpis"><tbody><tr>
        {AI_COUNTS.map(({ key, label }) => <td key={key} style={{ width: "auto" }}><span className="apr-label">{label}</span><span className="apr-value">{ai.counts[key] ?? 0}</span></td>)}
      </tr></tbody></table>
      {full && ai.events?.length > 0 && <table data-no-serial className="apr-table" style={{ marginTop: "4pt" }}><thead><tr><th>Time (IST)</th><th>Detection</th><th>Severity</th><th>Confidence</th></tr></thead><tbody>
        {ai.events.map((event, index) => <tr key={`${event.at}-${index}`}><td>{istClock(event.at) || "—"}</td><td>{proctorEventLabel(event.type)}</td><td style={{ textTransform: "capitalize" }}>{event.severity || "—"}</td><td>{confidenceLabel(event.confidence) || "—"}</td></tr>)}
      </tbody></table>}
    </>}
    {full && browserEvents && browserEvents.length > 0 && <>
      <p className="apr-sub">Browser event timeline</p>
      <table data-no-serial className="apr-table"><thead><tr><th>Time (IST)</th><th>Event</th><th>Type</th></tr></thead><tbody>
        {browserEvents.map((event, index) => {
          const kind = PROCTOR_EVENTS[event.type];
          return <tr key={`${event.at}-${index}`}><td>{istClock(event.at) || "—"}</td><td>{proctorEventLabel(event.type)}</td><td>{kind?.violation ? "Violation" : kind?.blocked ? "Blocked" : "Info"}</td></tr>;
        })}
      </tbody></table>
    </>}
    <p className="apr-small apr-muted" style={{ margin: "5pt 0 0" }}>Scores are never reduced automatically because of these events.</p>
  </>;
}

/**
 * The print fallback of "Download PDF" (and what the browser's own print shows): rendered into <body>,
 * hidden on screen, the only thing printed. Always light and self-contained (plain CSS), with a running
 * header and footer. It renders the same content model as the screen and the PDF. Every table here is
 * layout, so each opts out of the app's automatic "S.No." column (`data-no-serial`).
 */
export default function ReportPrint({ model, printedAt }) {
  if (typeof document === "undefined") return null;
  const { score } = model;
  const student = model.audience === "student";
  const name = model.candidate?.name || "";
  return createPortal(<div className="anvi-print-root" data-anvi-print>
    <style>{PRINT_CSS}</style>
    <table data-no-serial className="apr-frame">
      <thead><tr><td><div className="apr-run"><span>PeerPrep · AI Interview Report{name ? ` · ${name}` : ""} · {model.title}</span><span>{model.when}</span></div></td></tr></thead>
      <tfoot><tr><td><div className="apr-run apr-foot"><span>{model.footer}</span><span>Printed {istDateTime(printedAt || new Date())}</span></div></td></tr></tfoot>
      <tbody>
        <Row className="apr-keep">
          <div className="apr-cover">
            <div>
              <p className="apr-eyebrow">PeerPrep · AI Interview Report · {model.kind}</p>
              <h1 className="apr-h1">{model.title}</h1>
              {model.subtitle && <p className="apr-muted" style={{ margin: 0 }}>{model.subtitle}</p>}
              {score && <p style={{ margin: "6pt 0 0" }}>{score.summary}</p>}
              {model.partial && <p className="apr-small" style={{ margin: "3pt 0 0", color: "#92400e" }}>The interview ended early, so only saved responses were evaluated.</p>}
            </div>
            {score && <div className="apr-score">
              <div className="apr-score-big" style={{ color: PRINT_TONES[score.tone] || PRINT_TONES.neutral }}>{score.percent}%</div>
              {score.marks && <div className="apr-small apr-muted" style={{ marginTop: "3pt" }}>{marks(score.marks.score)} / {marks(score.marks.max)} marks</div>}
              {score.band && <span className="apr-band" style={{ color: PRINT_TONES[score.tone] || PRINT_TONES.neutral }}>{score.band}</span>}
            </div>}
          </div>
          <table data-no-serial className="apr-meta"><tbody><tr>
            {model.meta.map((item) => <td key={item.key}><span className="apr-label">{item.label}</span><span className="apr-value">{item.value}</span>{item.detail ? <span className="apr-small apr-muted" style={{ display: "block" }}>{item.detail}</span> : null}</td>)}
          </tr></tbody></table>
          {model.kpis.length > 0 && <table data-no-serial className="apr-kpis"><tbody><tr>
            {model.kpis.map((kpi) => <td key={kpi.key}><span className="apr-label">{kpi.label}</span><span className="apr-value">{kpi.value}</span>{kpi.detail ? <span className="apr-small apr-muted" style={{ display: "block" }}>{kpi.detail}</span> : null}</td>)}
          </tr></tbody></table>}
        </Row>
        {(model.narrative || model.split) && <Row className="apr-keep">
          <h2 className="apr-h2">Overall performance</h2>
          {model.narrative && <p style={{ margin: 0 }}>{model.narrative}</p>}
          {model.split && <p className="apr-small" style={{ margin: "4pt 0 0" }}>
            {[model.split.functional !== null && `Functional ${model.split.functional}%${model.split.cohortFunctional !== null ? ` (cohort ${model.split.cohortFunctional}%)` : ""}`,
              model.split.nonFunctional !== null && `Non-functional ${model.split.nonFunctional}%${model.split.cohortNonFunctional !== null ? ` (cohort ${model.split.cohortNonFunctional}%)` : ""}`].filter(Boolean).join(" · ")}
          </p>}
        </Row>}
        {model.metrics.length > 0 && <Row className="apr-keep">
          <h2 className="apr-h2">Success metrics</h2>
          <Bars rows={model.metrics.map((metric) => ({ key: metric.key, name: metric.label, percent: metric.percent, detail: [metric.band, metric.cohort !== null ? `cohort ${metric.cohort}%` : ""].filter(Boolean).join(" · ") }))} />
          <p className="apr-small apr-muted" style={{ margin: "3pt 0 0" }}>Judged by ANVI from the transcript; fluency also uses the measured pace and fillers.</p>
        </Row>}
        {model.skills.length > 0 && <Row className="apr-keep">
          <h2 className="apr-h2">Skills</h2>
          <Bars rows={model.skills.map((skill) => ({ key: skill.key, name: skill.name, percent: skill.percent, detail: `${"★".repeat(Math.floor(skill.stars))}${skill.stars % 1 ? "½" : ""} ${skill.stars}/5` }))} />
        </Row>}
        {(model.sections.length > 0 || (model.competencies.length > 0 && !model.skills.length)) && <Row className="apr-keep">
          <div className="apr-cols">
            {model.sections.length > 0 && <div><h2 className="apr-h2">Section scores</h2><Bars rows={model.sections} /></div>}
            {model.competencies.length > 0 && !model.skills.length && <div><h2 className="apr-h2">Competencies</h2><Bars rows={model.competencies} /></div>}
          </div>
        </Row>}
        {model.criteria.length > 0 && <Row className="apr-keep"><h2 className="apr-h2">Evaluation criteria</h2><Bars rows={model.criteria} /></Row>}
        {(model.strengths.length > 0 || model.improvements.length > 0) && <Row className="apr-keep">
          <div className="apr-cols">
            <div><h2 className="apr-h2">Strengths</h2>{model.strengths.length ? <ul className="apr-list">{model.strengths.map((text) => <li key={text}>{text}</li>)}</ul> : <p className="apr-muted">None noted.</p>}</div>
            <div><h2 className="apr-h2">Areas to improve</h2>{model.improvements.length ? <ul className="apr-list">{model.improvements.map((text) => <li key={text}>{text}</li>)}</ul> : <p className="apr-muted">Nothing major.</p>}</div>
          </div>
        </Row>}
        {model.actions.length > 0 && <Row className="apr-keep">
          <h2 className="apr-h2">Action plan</h2>
          <ol className="apr-list">{model.actions.map((text) => <li key={text}>{text}</li>)}</ol>
        </Row>}
        <Row className="apr-break">
          <h2 className="apr-h2">Question-wise feedback</h2>
          <p className="apr-small apr-muted" style={{ margin: 0 }}>Key points: ✓ covered · ~ partly covered · ✗ missed</p>
        </Row>
        {model.responses.length ? model.responses.map((response) => <tr key={response.key} className="apr-keep"><td><ResponseBlock response={response} student={student} /></td></tr>)
          : <Row><p className="apr-muted">No interview responses were saved in this attempt.</p></Row>}
        {model.integrity && <Row><Integrity proctoring={model.integrity} full={model.integrityFull} /></Row>}
        {(model.setup.length > 0 || model.warmup) && <Row className="apr-keep">
          <h2 className="apr-h2">Interview setup</h2>
          {model.setup.length > 0 && <table data-no-serial className="apr-meta"><tbody><tr>{model.setup.map((row) => <td key={row.key}><span className="apr-label">{row.label}</span><span className="apr-value">{row.value}</span></td>)}</tr></tbody></table>}
          {model.warmup && <><p className="apr-sub">Warm-up conversation (not scored)</p><p className="apr-answer apr-small">{model.warmup}</p></>}
        </Row>}
        <Row>
          <p className="apr-disclaimer">{model.disclaimer}{model.scoredAt ? ` Scored ${model.scoredAt}.` : ""}</p>
        </Row>
      </tbody>
    </table>
  </div>, document.body);
}
