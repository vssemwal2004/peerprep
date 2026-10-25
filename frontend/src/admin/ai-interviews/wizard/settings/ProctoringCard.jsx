import { useState } from "react";
import { Info, Lock, ScanEye } from "lucide-react";
import AIProctoringSettings from "../../../../features/assessment/admin/components/AIProctoringSettings";
import { Toggle } from "../../ui";
import { Alert, Card, NumberField, Segmented } from "../controls";
import { StudentSees } from "./parts";
import {
  AI_PROCTORING_RANGES, FULLSCREEN_MODES, ON_LIMIT_ACTIONS, PROCTORING_LIMITS, REFRESH_MODES, TAB_SWITCH_MODES, aiRangeIssues, proctoringIsEmpty,
  readProctoring, writeProctoring,
} from "./model";

const detailOf = (options, value) => options.find((option) => option.value === value)?.detail;
const LIMIT_MODES = [
  { value: "none", label: "No limit" },
  { value: "limit", label: "Set a limit" },
];
const DEFAULT_LIMIT = 5;

/** "AI proctoring": browser-based monitoring settings, written to data.anvi.proctoring. */
export default function ProctoringCard({ data, onChange, readOnly }) {
  const settings = readProctoring(data);
  const set = (patch) => onChange(writeProctoring(data, patch));
  const limited = settings.maxViolations > 0;
  // The stored camera block is always in range. While a number field has focus the editor shows the
  // text as typed (so "1" on the way to "1000" is not replaced by 500); on blur it shows what is saved.
  const [typedAi, setTypedAi] = useState(null);
  const shownAi = typedAi ? { ...settings.ai, ...typedAi } : settings.ai;
  const rangeIssues = aiRangeIssues(shownAi);
  const editAi = (ai) => {
    setTypedAi(Object.fromEntries(Object.keys(AI_PROCTORING_RANGES).map((key) => [key, ai[key]])));
    set({ ai: { ...ai, enabled: true } });
  };
  return (
    <Card
      data-field="proctoring"
      icon={ScanEye}
      title="AI proctoring"
      description="Browser checks, and optional camera checks, while students take the interview."
    >
      <fieldset disabled={readOnly} className="min-w-0 space-y-6 xl:grid xl:grid-cols-2 xl:items-start xl:gap-x-10 xl:gap-y-6 xl:space-y-0 [&>legend+*]:!mt-0">
        <legend className="sr-only">AI proctoring</legend>
        <div className="xl:col-span-2">
        <Toggle
          label="Enable AI proctoring"
          description={
            settings.enabled
              ? "Students see the rules before they join, and every event is listed in the attempt report."
              : "Off: nothing is monitored or blocked."
          }
          checked={settings.enabled}
          onChange={(enabled) => set({ enabled })}
          disabled={readOnly}
        />
        </div>
        {settings.enabled && (
          <>
            <div className="space-y-4">
              <Segmented
                label="Fullscreen"
                options={FULLSCREEN_MODES}
                value={settings.fullscreen}
                disabled={readOnly}
                hint={detailOf(FULLSCREEN_MODES, settings.fullscreen)}
                onChange={(fullscreen) => set({ fullscreen })}
              />
              {settings.fullscreen === "required" && (
                <Toggle
                  label="Pause the interview when the student leaves fullscreen or switches tab"
                  description="ANVI waits silently until they return. The interview timer keeps running while paused."
                  checked={settings.pauseOutsideFullscreen}
                  onChange={(pauseOutsideFullscreen) => set({ pauseOutsideFullscreen })}
                  disabled={readOnly}
                />
              )}
            </div>
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
              <Segmented
                label="Tab switches"
                options={TAB_SWITCH_MODES}
                value={settings.tabSwitch}
                disabled={readOnly}
                hint={detailOf(TAB_SWITCH_MODES, settings.tabSwitch)}
                onChange={(tabSwitch) => set({ tabSwitch })}
              />
              <Segmented
                label="Refresh & rejoin"
                options={REFRESH_MODES}
                value={settings.refresh}
                disabled={readOnly}
                hint={detailOf(REFRESH_MODES, settings.refresh)}
                onChange={(refresh) => set({ refresh })}
              />
            </div>
            <div className="space-y-4 border-t border-slate-100 pt-5 dark:border-gray-800">
              <Toggle
                label="Block right-click"
                description="The context menu is disabled in the interview room. Attempts are logged, not counted as violations."
                checked={settings.blockRightClick}
                onChange={(blockRightClick) => set({ blockRightClick })}
                disabled={readOnly}
              />
              <Toggle
                label="Block copy & paste"
                description="Copy, cut, paste and text selection are disabled in the interview room. Attempts are logged."
                checked={settings.blockCopyPaste}
                onChange={(blockCopyPaste) => set({ blockCopyPaste })}
                disabled={readOnly}
              />
              <Toggle
                label="Block keyboard shortcuts"
                description="Best effort: common shortcuts such as Ctrl+C, Ctrl+P and F12 are intercepted. Browsers never let a page block Esc."
                checked={settings.blockShortcuts}
                onChange={(blockShortcuts) => set({ blockShortcuts })}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-4 border-t border-slate-100 pt-5 dark:border-gray-800" data-proctoring-camera>
              <Toggle
                label="Enable camera AI checks"
                description="Uses the student's camera to spot a phone, another person, no face or looking away. Detection runs in the browser; no video is recorded or uploaded."
                checked={settings.ai.enabled}
                onChange={(enabled) => set({ ai: { ...settings.ai, enabled } })}
                disabled={readOnly}
              />
              {settings.ai.enabled && (
                // On phones the embedded Assessment editor's grace-period row stacks (its text column
                // would otherwise shrink to one word per line next to the number field).
                <div className="rounded-xl border border-slate-200 p-3 dark:border-gray-700 sm:p-4 max-sm:[&_.items-start.justify-between]:flex-col max-sm:[&_.items-start.justify-between]:gap-2" onBlur={() => setTypedAi(null)}>
                  <AIProctoringSettings value={shownAi} disabled={readOnly} onChange={editAi} />
                  {rangeIssues.length > 0 && (
                    <p role="alert" className="mt-3 text-xs text-amber-800 dark:text-amber-300">
                      Out of range, so the nearest allowed value is saved: {rangeIssues.join(" · ")}.
                    </p>
                  )}
                  <p className="mt-3 text-xs text-slate-500 dark:text-gray-400">
                    Confirmed camera detections count as violations, like leaving fullscreen. Students need a working camera to join.
                  </p>
                </div>
              )}
              <p className="flex items-start gap-2.5 rounded-xl bg-emerald-50/70 px-4 py-3 text-[13px] leading-relaxed text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
                <Lock size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>No video is recorded. Only the event type, time, question number and confidence are kept.</span>
              </p>
            </div>
            <div className="grid gap-6 border-t border-slate-100 pt-5 dark:border-gray-800 sm:grid-cols-2">
              <NumberField
                label="Warnings before the limit"
                stepper
                min={0}
                max={PROCTORING_LIMITS.warnings}
                value={settings.warnings}
                hint={settings.warnings ? `The first ${settings.warnings} violation${settings.warnings === 1 ? "" : "s"} show the student “Warning 1 of ${settings.warnings}”.` : "Violations are recorded without warning the student."}
                onChange={(warnings) => set({ warnings })}
              />
              <div className="min-w-0 space-y-3">
                <Segmented
                  label="Limit"
                  options={LIMIT_MODES}
                  value={limited ? "limit" : "none"}
                  disabled={readOnly}
                  hint={limited ? undefined : "Violations are only reported; the interview always continues."}
                  onChange={(mode) => set({ maxViolations: mode === "limit" ? settings.maxViolations || DEFAULT_LIMIT : 0 })}
                />
                {limited && (
                  <NumberField
                    label="Violations allowed"
                    stepper
                    min={1}
                    max={PROCTORING_LIMITS.maxViolations}
                    value={settings.maxViolations}
                    hint={`The limit applies at violation ${settings.maxViolations}. Up to ${PROCTORING_LIMITS.maxViolations}.`}
                    onChange={(maxViolations) => set({ maxViolations })}
                  />
                )}
              </div>
            </div>
            {limited && (
              <Segmented
                label="At the limit"
                variant="cards"
                options={ON_LIMIT_ACTIONS}
                value={settings.onLimit}
                disabled={readOnly}
                onChange={(onLimit) => set({ onLimit })}
              />
            )}
            {proctoringIsEmpty(settings) && (
              <div className="xl:col-span-2">
                <Alert tone="warning">Every check is off, so nothing will be monitored. Turn on at least one, or disable AI proctoring.</Alert>
              </div>
            )}
            <div className="xl:col-span-2">
            <StudentSees>
              Students enter fullscreen only at the last step, when they join.
              {settings.warnings > 0
                ? ` A “Proctored” badge shows the violation count, with a warning for each of the first ${settings.warnings}.`
                : " A “Proctored” badge shows the violation count."}
            </StudentSees>
            </div>
          </>
        )}
        <p className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600 dark:bg-gray-800/60 dark:text-gray-300 xl:col-span-2">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" />
          <span>Scores are never reduced automatically. Proctoring events appear as flags in the attempt report for you to review.</span>
        </p>
      </fieldset>
    </Card>
  );
}
