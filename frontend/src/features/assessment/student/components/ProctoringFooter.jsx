// AI Proctoring placeholder - implementation will be added in later steps.
import ProctoringStatusBadge from './ProctoringStatusBadge';

const DEFAULT_STATUS = Object.freeze({
  running: false,
  camera: 'unknown',
  faceModel: 'unknown',
  objectModel: 'unknown',
  face: 'unknown',
  eye: 'unknown',
  mobile: 'unknown',
  person: 'unknown',
  lastUpdatedAt: null,
  error: null,
});

const STATUS_ITEMS = Object.freeze([
  { key: 'faceModel', label: 'Face AI' },
  { key: 'objectModel', label: 'Object AI' },
  { key: 'camera', label: 'Camera' },
  { key: 'face', label: 'Face' },
  { key: 'eye', label: 'Eye' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'person', label: 'Person' },
]);

const ISSUE_STATES = Object.freeze({
  faceModel: ['unavailable'],
  objectModel: ['unavailable'],
  camera: ['blocked', 'error'],
  face: ['missing', 'out_of_frame', 'multiple'],
  eye: ['looking_away'],
  mobile: ['detected'],
  person: ['multiple', 'missing'],
});

function getIssueItems(status) {
  return STATUS_ITEMS.filter((item) => ISSUE_STATES[item.key]?.includes(status[item.key]));
}

export default function ProctoringFooter({
  status,
  enabled = false,
  compact = false,
  className = '',
}) {
  if (!enabled) return null;

  const currentStatus = {
    ...DEFAULT_STATUS,
    ...(status && typeof status === 'object' ? status : {}),
  };
  const issueItems = getIssueItems(currentStatus);
  const hasIssue = issueItems.length > 0 || Boolean(currentStatus.error);

  return (
    <div
      className={`pointer-events-none inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border shadow-sm ${
        hasIssue
          ? 'border-white/40 bg-rose-950/35 text-white'
          : 'border-white/35 bg-emerald-950/25 text-white'
      } ${compact ? 'px-2 py-1' : 'px-2.5 py-1.5'} ${className}`}
      aria-label="AI Proctoring status"
      title={currentStatus.error || 'AI Proctoring status'}
    >
      <span className={`inline-flex shrink-0 items-center gap-1.5 font-bold ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${hasIssue ? 'bg-white animate-pulse' : 'bg-white'}`} />
        {hasIssue ? 'AI attention' : 'Secure'}
      </span>
      {issueItems.map((item) => (
        <ProctoringStatusBadge
          key={item.key}
          item={item.key}
          label={item.label}
          state={currentStatus[item.key]}
          compact={compact}
        />
      ))}
    </div>
  );
}

export { DEFAULT_STATUS as DEFAULT_PROCTORING_FOOTER_STATUS };
