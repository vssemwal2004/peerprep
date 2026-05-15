import {
  Activity, AlertTriangle, Camera, Clipboard, Clock, Copy, Eye, Mic, Monitor,
  MousePointer, ShieldAlert, Smartphone, Volume2, Wifi, X,
} from 'lucide-react';
import { formatDateTime, formatDuration } from './ReportComponents';
import { Heatmap, HorizontalProgress } from './ReportCharts';

const violationIcons = {
  tab_switch: Monitor,
  fullscreen_exit: Monitor,
  camera_off: Camera,
  camera_loss: Camera,
  camera_no_face: Camera,
  multiple_faces: Camera,
  unknown_face: Camera,
  face_out_of_frame: Camera,
  mobile_detection: Smartphone,
  audio_violation: Mic,
  copy_paste: Copy,
  context_menu: MousePointer,
  browser_activity: Activity,
  plagiarism: Clipboard,
  heartbeat_failure: Wifi,
  default: ShieldAlert,
};

function severityStyle(severity = 'medium') {
  const normalized = String(severity).toLowerCase();
  if (normalized === 'critical' || normalized === 'high') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/15 dark:text-rose-300';
  if (normalized === 'low') return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/15 dark:text-amber-300';
}

const toneClassMap = {
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300',
};

export default function ReportViolationModal({ report, loading, onClose }) {
  if (!report) return null;

  const counters = report?.counters || {};
  const totalViolations = Number(counters.totalViolations || 0);
  const startedAt = report?.submission?.startedAt;
  const submittedAt = report?.submission?.submittedAt;
  const timeline = report?.timeline || [];
  const heatmapRows = [
    { label: 'Tab', values: timeline.slice(0, 7).map((item) => item.type === 'tab_switch' ? 1 : 0) },
    { label: 'Camera', values: timeline.slice(0, 7).map((item) => String(item.type || '').includes('camera') || String(item.type || '').includes('face') ? 1 : 0) },
    { label: 'Browser', values: timeline.slice(0, 7).map((item) => ['fullscreen_exit', 'context_menu', 'copy_paste'].includes(item.type) ? 1 : 0) },
    { label: 'Audio', values: timeline.slice(0, 7).map((item) => String(item.type || '').includes('audio') ? 1 : 0) },
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 px-6 py-5 text-white dark:border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100">
                <ShieldAlert className="h-3.5 w-3.5" />
                Proctoring analytics
              </div>
              <h2 className="mt-3 text-xl font-bold">{report?.submission?.studentName || 'Unknown Student'}</h2>
              <p className="mt-1 text-xs text-slate-300">
                {report?.submission?.studentRollNo || '-'} - {report?.submission?.assessmentTitle || 'Assessment session'}
              </p>
            </div>
            <button onClick={onClose} className="rounded-xl border border-white/15 bg-white/10 p-2 text-white transition-colors hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-500 dark:text-gray-400">Loading proctoring timeline...</div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Total Warnings', totalViolations, ShieldAlert, 'rose'],
                  ['Tab Switches', counters.tabSwitches || 0, Monitor, 'sky'],
                  ['Camera Flags', counters.cameraFlags || 0, Camera, 'amber'],
                  ['Copy/Paste', counters.copyPasteCount || 0, Copy, 'emerald'],
                ].map(([label, value, Icon, tone]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClassMap[tone] || toneClassMap.sky}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
                    <div className="text-xs font-medium text-slate-500 dark:text-gray-400">{label}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <Clock className="h-4 w-4 text-sky-600" />
                      Monitoring window
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                      {startedAt && submittedAt ? formatDuration(Math.round((new Date(submittedAt) - new Date(startedAt)) / 1000)) : 'Live / pending'}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-gray-800">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">Started</div>
                      <div className="mt-1 text-xs font-semibold text-slate-700 dark:text-gray-200">{formatDateTime(startedAt)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-gray-800">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">Submitted</div>
                      <div className="mt-1 text-xs font-semibold text-slate-700 dark:text-gray-200">{formatDateTime(submittedAt)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-gray-800">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">Violation score</div>
                      <div className="mt-1 text-xs font-semibold text-slate-700 dark:text-gray-200">{counters.violationScore || 0}</div>
                      <div className="mt-2"><HorizontalProgress value={Math.min(100, counters.violationScore || 0)} max={100} height={4} color="#ef4444" /></div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                    <Activity className="h-4 w-4 text-sky-600" />
                    Violation heatmap
                  </h3>
                  <div className="mt-4">
                    <Heatmap rows={heatmapRows} max={1} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <Eye className="h-4 w-4 text-sky-600" />
                      Device and permissions
                    </h3>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      {[
                        ['Webcam', report?.securitySetup?.cameraAt ? 'Verified' : 'Not verified', Camera],
                        ['Microphone', report?.assessment?.settings?.audioMonitoring ? 'Monitoring on' : 'Not required', Volume2],
                        ['Browser', report?.device?.browser || 'Unknown', Monitor],
                        ['OS', report?.device?.os || 'Unknown', Smartphone],
                      ].map(([label, value, Icon]) => (
                        <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-gray-800">
                          <Icon className="h-4 w-4 text-slate-400" />
                          <div className="mt-2 font-semibold text-slate-800 dark:text-gray-100">{value}</div>
                          <div className="text-[10px] text-slate-400">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {report?.securitySetup?.location && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Captured location</h3>
                      <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-gray-300">
                        <div>Latitude: {Number(report.securitySetup.location.latitude || 0).toFixed(6)}</div>
                        <div>Longitude: {Number(report.securitySetup.location.longitude || 0).toFixed(6)}</div>
                        <div>Accuracy: {Math.round(Number(report.securitySetup.location.accuracy || 0))}m</div>
                        <div>{formatDateTime(report.securitySetup.location.capturedAt)}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-gray-700">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <AlertTriangle className="h-4 w-4 text-rose-600" />
                      Suspicious activity timeline
                    </h3>
                    <span className="text-[11px] text-slate-400">{timeline.length} events</span>
                  </div>
                  {timeline.length === 0 ? (
                    <div className="px-5 py-12 text-center text-sm text-slate-500 dark:text-gray-400">No violation timeline recorded for this session.</div>
                  ) : (
                    <div className="max-h-[420px] overflow-y-auto px-5 py-4">
                      <div className="relative space-y-3 before:absolute before:left-4 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-slate-200 dark:before:bg-gray-700">
                        {timeline.map((item, index) => {
                          const Icon = violationIcons[item.type] || violationIcons.default;
                          return (
                            <div key={`${item.type}-${item.at}-${index}`} className="relative flex gap-3">
                              <div className="z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white text-rose-600 ring-4 ring-rose-50 dark:bg-gray-900 dark:text-rose-300 dark:ring-rose-900/20">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className={`flex-1 rounded-xl border px-4 py-3 ${severityStyle(item.severity)}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-bold uppercase tracking-wider">{String(item.type || 'event').replace(/_/g, ' ')}</span>
                                  <span className="text-[11px] opacity-75">{formatDateTime(item.at)}</span>
                                </div>
                                <p className="mt-1 text-xs opacity-90">{item.message || 'Violation recorded.'}</p>
                                {item.source && <p className="mt-2 text-[10px] uppercase tracking-wider opacity-60">Source: {item.source}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
