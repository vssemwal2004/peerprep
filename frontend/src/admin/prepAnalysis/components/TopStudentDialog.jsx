import { PanelRightOpen } from "lucide-react";
import { rangeLabel } from "../../../components/dateRange/dateRangeModel";
import { formatScore } from "../../../student/prepScore/formatScore";
import { DIFFICULTY_COLORS } from "../charts/chartTheme";
import { StudentIdentity, StudentProfileLink } from "./StudentIdentity";
import { Button, Dialog } from "./ui";

const DIFFICULTIES = ["Easy", "Medium", "Hard"];

export default function TopStudentDialog({ item, range, onClose, onDetails }) {
  return (
    <Dialog open onClose={onClose} title={item.name} subtitle={`Rank ${item.position} in Top Students`} size="max-w-xl"
      footer={<>
        <Button autoFocus onClick={() => onDetails(item.id)}>
          <PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" />View details
        </Button>
        <StudentProfileLink studentId={item.id} />
      </>}>
      <div className="space-y-5 p-4 sm:p-5">
        <section aria-label="Coding performance">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Problems solved</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{rangeLabel(range)}</p>
            </div>
            <div className="shrink-0 rounded-lg bg-sky-50 px-3 py-1.5 text-right dark:bg-sky-500/10">
              <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">Prep Score</p>
              <p className="text-lg font-bold leading-6 tabular-nums text-slate-900 dark:text-white">{formatScore(item.score)}</p>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((level) => (
              <div key={level} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 sm:px-3 dark:border-gray-800 dark:bg-white/[0.03]">
                <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DIFFICULTY_COLORS[level] }} aria-hidden="true" />{level}
                </dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-white">{(item.solved?.[level] ?? 0).toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="border-t border-slate-200 pt-4 dark:border-gray-800">
          <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Student information</h3>
          <StudentIdentity student={item.student} />
        </section>
      </div>
    </Dialog>
  );
}
