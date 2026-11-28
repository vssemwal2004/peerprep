// Prep Analysis period control (presets or custom dates), refresh and the report download.
import { useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown, Download, FileSpreadsheet, FileText, Loader2, RefreshCw } from "lucide-react";
import { PERIODS } from "../insightModel";
import { buttonClass, focusRing, primaryButtonClass, Segmented } from "./ui";
import { dayKey } from "../../../components/dateRange/dateRangeModel";

// The student's local calendar day (toISOString is UTC and blocked "today" in IST before 05:30).
const todayKey = () => dayKey();

function DownloadMenu({ onDownload }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const run = async (format) => {
    setBusy(format);
    try { await onDownload(format); setOpen(false); } finally { setBusy(""); }
  };
  return (
    <div ref={ref} className="relative" data-guide="an-download">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={buttonClass}>
        <Download className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">Report</span><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1.5 w-52 overflow-hidden rounded-xl border border-[#e4e7ec] bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#26262a]">
          {[["xlsx", "Excel workbook", FileSpreadsheet], ["pdf", "PDF report", FileText]].map(([format, label, Icon]) => (
            <button key={format} type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => run(format)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:text-zinc-200 dark:hover:bg-white/[0.05] ${focusRing}`}>
              {busy === format ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />}{label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Period (presets or custom dates), refresh and the report download. */
export function PeriodControls({ range, onRange, refreshing, onRefresh, onDownload, updatedAt }) {
  const [custom, setCustom] = useState({ from: range.from || "", to: range.to || "" });
  const [showCustom, setShowCustom] = useState(false);
  const options = [...PERIODS, { id: "custom", label: "Custom", short: "Custom", icon: CalendarRange }];
  const choose = (id) => {
    if (id === "custom") { setShowCustom(true); return; }
    setShowCustom(false);
    onRange({ period: id });
  };
  const validCustom = custom.from && custom.to && custom.from <= custom.to;
  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <Segmented label="Period" options={options} value={showCustom ? "custom" : range.period} onChange={choose} size="sm" />
      <button type="button" onClick={onRefresh} disabled={refreshing} className={buttonClass} aria-label="Refresh" title={updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "Refresh"}>
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
      </button>
      <DownloadMenu onDownload={onDownload} />
      {showCustom && (
        <form className="absolute right-0 top-full z-40 mt-2 flex flex-wrap items-end gap-2 rounded-2xl border border-[#e9eaee] bg-white p-3 shadow-xl dark:border-white/[0.07] dark:bg-[#26262a]"
          onSubmit={(event) => { event.preventDefault(); if (validCustom) { onRange({ period: "custom", from: custom.from, to: custom.to }); setShowCustom(false); } }}>
          {[["from", "From"], ["to", "To"]].map(([field, label]) => (
            <label key={field} className="text-[11.5px] font-medium text-slate-500 dark:text-zinc-400">{label}
              <input type="date" value={custom[field]} max={todayKey()} onChange={(event) => setCustom((value) => ({ ...value, [field]: event.target.value }))}
                className="mt-1 block h-8 rounded-lg border border-[#e4e7ec] bg-white px-2 text-[12.5px] text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:[color-scheme:dark]" />
            </label>
          ))}
          <button type="submit" disabled={!validCustom} className={primaryButtonClass}>Apply</button>
          <button type="button" onClick={() => setShowCustom(false)} className={buttonClass}>Cancel</button>
        </form>
      )}
    </div>
  );
}
