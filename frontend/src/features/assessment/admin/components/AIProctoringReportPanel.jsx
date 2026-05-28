import { Activity, Clock, ShieldAlert } from 'lucide-react';

const DEFAULT_SUMMARY = {
  totalViolations: 0,
  noFace: 0,
  faceOutOfFrame: 0,
  multipleFaces: 0,
  multiplePersons: 0,
  mobileDetected: 0,
  lookingAway: 0,
  cameraBlocked: 0,
  riskLevel: 'clean',
  lastViolationAt: null,
};

const AI_LABELS = {
  ai_no_face: 'No Face Detected',
  ai_face_out_of_frame: 'Face Out of Frame',
  ai_multiple_faces: 'Multiple Faces',
  ai_multiple_persons: 'Multiple Persons',
  ai_mobile_detected: 'Mobile Phone Detected',
  ai_looking_away: 'Looking Away',
  ai_camera_blocked: 'Camera Blocked',
};

const RISK_STYLES = {
  clean: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/15 dark:text-emerald-300',
  low: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/15 dark:text-sky-300',
  medium: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/15 dark:text-amber-300',
  high: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/15 dark:text-orange-300',
  critical: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/15 dark:text-rose-300',
};

const SEVERITY_STYLES = {
  low: 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-900/15 dark:text-amber-300',
  high: 'bg-orange-50 text-orange-700 dark:bg-orange-900/15 dark:text-orange-300',
  critical: 'bg-rose-50 text-rose-700 dark:bg-rose-900/15 dark:text-rose-300',
};

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString();
}

function formatDuration(ms) {
  const value = Number(ms || 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}s`;
}

function normalizeSummary(summary) {
  const source = summary && typeof summary === 'object' ? summary : {};
  return {
    ...DEFAULT_SUMMARY,
    ...source,
    totalViolations: Number(source.totalViolations || 0),
    noFace: Number(source.noFace || 0),
    faceOutOfFrame: Number(source.faceOutOfFrame || 0),
    multipleFaces: Number(source.multipleFaces || 0),
    multiplePersons: Number(source.multiplePersons || 0),
    mobileDetected: Number(source.mobileDetected || 0),
    lookingAway: Number(source.lookingAway || 0),
    cameraBlocked: Number(source.cameraBlocked || 0),
    riskLevel: RISK_STYLES[source.riskLevel] ? source.riskLevel : DEFAULT_SUMMARY.riskLevel,
  };
}

function normalizeAiViolations(violations = []) {
  if (!Array.isArray(violations)) return [];
  return violations
    .filter((item) => String(item?.type || '').startsWith('ai_'))
    .map((item) => {
      const metadata = item.metadata || item.meta || item.details || {};
      const severity = item.severity || metadata.severity || 'medium';
      return {
        ...item,
        label: AI_LABELS[item.type] || String(item.type || 'AI event').replace(/_/g, ' '),
        at: item.at || item.timestamp || item.createdAt || metadata.lastSeenAt || null,
        severity,
        confidence: item.confidence ?? metadata.confidence,
        metadata,
      };
    })
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
}

export default function AIProctoringReportPanel({
  aiProctoringSummary,
  violations = [],
  className = '',
}) {
  const summary = normalizeSummary(aiProctoringSummary);
  const aiViolations = normalizeAiViolations(violations);
  const hasAiData = summary.totalViolations > 0 || aiViolations.length > 0;
  const riskClass = RISK_STYLES[summary.riskLevel] || RISK_STYLES.clean;
  const metrics = [
    ['Total AI Violations', summary.totalViolations],
    ['Mobile Detected', summary.mobileDetected],
    ['Multiple Persons', summary.multiplePersons],
    ['Multiple Faces', summary.multipleFaces],
    ['No Face', summary.noFace],
    ['Face Out of Frame', summary.faceOutOfFrame],
    ['Looking Away', summary.lookingAway],
    ['Camera Blocked', summary.cameraBlocked],
  ];

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <ShieldAlert className="h-4 w-4 text-sky-600" />
          AI Proctoring Review
        </h3>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize ${riskClass}`}>
          {summary.riskLevel === 'clean' ? 'Clean' : `${summary.riskLevel} Risk`}
        </span>
      </div>

      {!hasAiData ? (
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:bg-gray-800 dark:text-gray-400">
          AI Proctoring was not enabled for this assessment or no AI violations were recorded.
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metrics.map(([label, value]) => (
              <div key={label} className={`rounded-lg px-3 py-2 text-center ${value > 0 ? 'bg-rose-50 dark:bg-rose-900/10' : 'bg-slate-50 dark:bg-gray-800'}`}>
                <div className={`text-lg font-bold ${value > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-gray-300'}`}>{value}</div>
                <div className="text-[10px] text-slate-400 dark:text-gray-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-gray-800 dark:text-gray-300">
            <Clock className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
            Last AI violation: {formatDateTime(summary.lastViolationAt || aiViolations[0]?.at)}
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                <Activity className="h-3.5 w-3.5" />
                AI violation timeline
              </h4>
              <span className="text-[11px] text-slate-400">{aiViolations.length} events</span>
            </div>

            {aiViolations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500 dark:border-gray-700 dark:text-gray-400">
                No AI violation timeline entries are available.
              </div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {aiViolations.map((item, index) => {
                  const confidence = Number(item.confidence);
                  const duration = formatDuration(item.metadata?.durationMs);
                  const count = Number(item.metadata?.count || 0);

                  return (
                    <div key={`${item.type}-${item.at}-${index}`} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-gray-700">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-gray-100">{item.label}</span>
                        <span className="text-[11px] text-slate-400 dark:text-gray-500">{formatDateTime(item.at)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.medium}`}>
                          {item.severity}
                        </span>
                        {Number.isFinite(confidence) && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                            Confidence {(confidence * 100).toFixed(0)}%
                          </span>
                        )}
                        {count > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                            Count {count}
                          </span>
                        )}
                        {duration && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                            Duration {duration}
                          </span>
                        )}
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
  );
}
