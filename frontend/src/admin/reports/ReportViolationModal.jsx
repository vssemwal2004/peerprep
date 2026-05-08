import { X, ShieldAlert, Clock, Camera, Monitor, Copy, MousePointer } from 'lucide-react';
import { formatDateTime } from './ReportComponents';

const violationIcons = {
  tab_switch: Monitor,
  fullscreen_exit: Monitor,
  camera_off: Camera,
  copy_paste: Copy,
  multiple_faces: Camera,
  unknown_face: Camera,
  mouse_leave: MousePointer,
  default: ShieldAlert,
};

export default function ReportViolationModal({ report, loading, onClose }) {
  if (!report) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Violation Report</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
              {report?.submission?.studentName || 'Unknown'} · {report?.submission?.studentRollNo || '—'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading violations...</div>
          ) : (
            <>
              {/* Counters */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Tab Switches', report?.counters?.tabSwitches || 0, 'tab_switch'],
                  ['Fullscreen Exits', report?.counters?.fullscreenExits || 0, 'fullscreen_exit'],
                  ['Camera Flags', report?.counters?.cameraFlags || 0, 'camera_off'],
                  ['Copy Blocks', report?.counters?.copyPasteCount || 0, 'copy_paste'],
                ].map(([label, value, key]) => {
                  const Icon = violationIcons[key] || violationIcons.default;
                  return (
                    <div key={key} className={`rounded-xl border px-3 py-3 ${value > 0 ? 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/10' : 'border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800'}`}>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500 flex items-center gap-1">
                        <Icon className="h-3 w-3" />{label}
                      </div>
                      <div className={`mt-1 text-xl font-bold ${value > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-white'}`}>{value}</div>
                    </div>
                  );
                })}
              </div>

              {/* Location */}
              {report?.securitySetup?.location && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500">Captured Location</div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-slate-600 dark:text-gray-300 sm:grid-cols-4">
                    <div>Lat: {Number(report.securitySetup.location.latitude || 0).toFixed(6)}</div>
                    <div>Long: {Number(report.securitySetup.location.longitude || 0).toFixed(6)}</div>
                    <div>Accuracy: {Math.round(Number(report.securitySetup.location.accuracy || 0))}m</div>
                    <div>{formatDateTime(report.securitySetup.location.capturedAt)}</div>
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="mt-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <Clock className="h-4 w-4 text-sky-600" />Violation Timeline
                </h3>
                {(report?.timeline || []).length === 0 ? (
                  <div className="rounded-xl border border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400">
                    No violation timeline recorded.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[320px] overflow-y-auto rounded-xl border border-slate-200 dark:border-gray-700">
                    {report.timeline.map((item, index) => {
                      const Icon = violationIcons[item.type] || violationIcons.default;
                      return (
                        <div key={`${item.type}-${item.at}-${index}`} className="flex gap-3 border-b border-slate-100 px-4 py-3 last:border-0 dark:border-gray-800">
                          <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-900/10 dark:text-rose-300">
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">{String(item.type || '').replace(/_/g, ' ')}</span>
                              <span className="flex-shrink-0 text-[11px] text-slate-400 dark:text-gray-500">{formatDateTime(item.at)}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">{item.message || 'Violation recorded.'}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
