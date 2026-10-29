import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AuthContext } from "../../context/AuthContext";
import { AiDisclaimer, BandChip, Icon, ScoreRing } from "./report/parts";
import { focusRing, muted, reportFont } from "./report/styles";
import { ReportHeader } from "./report/ReportHeader";
import { ReportFooter } from "./report/ReportSections";
import { SummaryTab } from "./report/SummaryTab";
import { QuestionTab } from "./report/QuestionTab";
import { AnalysisTab } from "./report/AnalysisTab";
import { ActionItemsTab } from "./report/ActionItemsTab";
import { ProctoringDrawer } from "./report/ProctoringDrawer";
import ReportPrint from "./report/ReportPrint";
import { printReport } from "./report/print";
import { downloadReportPdf, loadReportPdf } from "./report/download";
import { buildReportModel, reportFileName, reportPdfFileName, reportTabs } from "./report/reportModel";

// Shared primitives, kept importable from here for existing callers.
export { AiDisclaimer, BandChip, ScoreRing };

/**
 * The scored ANVI report: a header card (score ring, interview, candidate, Download PDF, Proctoring details),
 * then Summary · Question-wise feedback · Analysis · Action items, and an AI disclaimer. Students and admins
 * share it; `readOnly` (admins) adds the full proctoring record, flags, candidate ids and the warm-up, and
 * `showExpectedAnswer` the authored answer. "Download PDF" builds a branded A4 PDF from the same content
 * model (lazy-loaded); if that fails, the print layout opens instead. `pdfLoader` replaces the PDF module
 * and `actionStorage` the "Mark done" storage (tests).
 */
export default function AnviReport({ attempt, readOnly = false, showExpectedAnswer = false, studentName = "", headingLevel, pdfLoader = loadReportPdf, actionStorage }) {
  const auth = useContext(AuthContext);
  const id = useId();
  const tabRefs = useRef({});
  const [tab, setTab] = useState("summary");
  const [question, setQuestion] = useState(0);
  const [proctoringOpen, setProctoringOpen] = useState(false);
  // The admin copy names the attempt's student; a student's own copy names the signed-in user.
  const name = attempt.student?.name || studentName || (readOnly ? "" : auth?.user?.name || "");
  const model = useMemo(() => buildReportModel(attempt, { audience: readOnly ? "admin" : "student", studentName: name, showExpectedAnswer }),
    [attempt, readOnly, name, showExpectedAnswer]);
  const tabs = reportTabs(model);
  const active = tabs.some((entry) => entry.id === tab) ? tab : "summary";

  // The print fallback's "Printed" time: set just before printing (fallback or the browser's own print),
  // committed synchronously so the printed page shows it.
  const [printedAt, setPrintedAt] = useState(() => new Date());
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const stamp = () => flushSync(() => setPrintedAt(new Date()));
    window.addEventListener("beforeprint", stamp);
    return () => window.removeEventListener("beforeprint", stamp);
  }, []);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const download = async () => {
    if (busy.current) return;
    busy.current = true;
    setDownloading(true);
    setNotice("");
    const result = await downloadReportPdf({ model, fileName: reportPdfFileName(attempt, model.candidate?.name), load: pdfLoader });
    busy.current = false;
    setDownloading(false);
    if (result.ok) return;
    // Fallback: the browser's print dialog on the print layout ("Save as PDF").
    flushSync(() => setPrintedAt(new Date()));
    const printed = printReport(reportFileName(attempt, model.candidate?.name || ""));
    setNotice(printed ? "The PDF could not be created here, so the print view opened instead. Choose “Save as PDF” to keep a copy."
      : "The PDF could not be created. Please try again.");
  };

  const select = (next) => { setTab(next); tabRefs.current[next]?.focus(); };
  // A chart bar (or point) opens that question in the Question-wise feedback tab.
  const openQuestion = (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= model.responses.length) return;
    setQuestion(index);
    setTab("questions");
    tabRefs.current.questions?.scrollIntoView?.({ block: "nearest" });
  };
  // Arrow keys move between tabs (roving tabindex); Home and End jump to the ends.
  const onKeyDown = (event) => {
    const index = tabs.findIndex((entry) => entry.id === active);
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(tabs[(moves[event.key] + tabs.length) % tabs.length].id);
  };

  return <div className={`space-y-4 ${reportFont}`} data-anvi-report>
    <ReportHeader model={model} headingLevel={headingLevel ?? (readOnly ? 2 : 1)} onDownload={download} downloading={downloading} onProctoring={() => setProctoringOpen(true)} />
    {notice && <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/[0.08] dark:text-amber-100" data-report-notice>
      <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />{notice}
    </p>}
    <div role="tablist" aria-label="Report sections" onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/70 p-1 dark:border-white/[0.08] dark:bg-white/[0.03]">
      {tabs.map(({ id: key, label, short, icon, count }) => {
        const selected = active === key;
        return <button key={key} type="button" role="tab" id={`${id}-tab-${key}`} aria-selected={selected} aria-controls={`${id}-panel-${key}`} tabIndex={selected ? 0 : -1}
          ref={(node) => { tabRefs.current[key] = node; }} onClick={() => setTab(key)} data-tab={key}
          className={`inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 text-xs font-semibold transition sm:gap-2 sm:px-3 sm:text-sm ${focusRing} ${selected ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 dark:bg-[#2e2e2e] dark:text-zinc-50 dark:ring-white/10" : `${muted} hover:text-slate-900 dark:hover:text-zinc-100`}`}>
          <Icon name={icon} className={`hidden h-4 w-4 sm:block ${selected ? "text-sky-600 dark:text-sky-300" : ""}`} />
          {/* Phones get a shorter label so all tabs fit. */}
          {short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></> : label}
          {count > 0 && <span aria-hidden="true" className={`hidden rounded-full px-1.5 text-[11px] tabular-nums sm:inline ${selected ? "bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200" : "bg-slate-200/70 dark:bg-white/[0.08]"}`}>{count}</span>}
        </button>;
      })}
    </div>
    <div role="tabpanel" id={`${id}-panel-${active}`} aria-labelledby={`${id}-tab-${active}`} tabIndex={0} className="focus-visible:outline-none">
      {active === "summary" && <SummaryTab model={model} onProctoring={() => setProctoringOpen(true)} />}
      {active === "questions" && <QuestionTab model={model} index={question} onSelect={setQuestion} />}
      {active === "analysis" && <AnalysisTab model={model} onSelectQuestion={openQuestion} />}
      {active === "actions" && <ActionItemsTab model={model} {...(actionStorage !== undefined ? { storage: actionStorage } : {})} />}
    </div>
    <ReportFooter model={model} />
    <ProctoringDrawer model={model} open={proctoringOpen} onClose={() => setProctoringOpen(false)} />
    <ReportPrint model={model} printedAt={printedAt} />
  </div>;
}
