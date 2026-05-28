// AI Proctoring placeholder - implementation will be added in later steps.
const STATUS_TEXT = Object.freeze({
  camera: {
    unknown: 'Camera Checking',
    ok: 'Camera OK',
    blocked: 'Camera Blocked',
    error: 'Camera Error',
  },
  face: {
    unknown: 'Face Checking',
    ok: 'Face OK',
    missing: 'No Face',
    out_of_frame: 'Face Out',
    multiple: 'Multiple Faces',
  },
  eye: {
    unknown: 'Eye Checking',
    ok: 'Eye OK',
    looking_away: 'Looking Away',
  },
  mobile: {
    unknown: 'Mobile Checking',
    ok: 'No Mobile',
    detected: 'Mobile Detected',
  },
  person: {
    unknown: 'Person Checking',
    ok: 'Single Person',
    multiple: 'Multiple Persons',
    missing: 'Person Missing',
  },
});

const LABEL_TEXT = Object.freeze({
  camera: 'Camera',
  face: 'Face',
  eye: 'Eye',
  mobile: 'Mobile',
  person: 'Person',
});

function getTone(item, state) {
  if (!state || state === 'unknown') return 'unknown';
  if (state === 'ok') return 'ok';
  if (item === 'camera' && (state === 'blocked' || state === 'error')) return 'issue';
  if (item === 'face' && ['missing', 'out_of_frame', 'multiple'].includes(state)) return 'issue';
  if (item === 'eye' && state === 'looking_away') return 'issue';
  if (item === 'mobile' && state === 'detected') return 'issue';
  if (item === 'person' && ['multiple', 'missing'].includes(state)) return 'issue';
  return 'unknown';
}

function getToneClasses(tone) {
  if (tone === 'ok') {
    return {
      badge: 'border-white/35 bg-white/20 text-white',
      dot: 'bg-white',
    };
  }

  if (tone === 'issue') {
    return {
      badge: 'border-white/45 bg-white text-rose-700',
      dot: 'bg-rose-600',
    };
  }

  return {
    badge: 'border-white/30 bg-white/15 text-white',
    dot: 'bg-white/80',
  };
}

export function getProctoringStatusText(item, state) {
  return STATUS_TEXT[item]?.[state] || STATUS_TEXT[item]?.unknown || 'Checking';
}

export default function ProctoringStatusBadge({
  item,
  state,
  label,
  value,
  statusType,
  compact = false,
}) {
  const resolvedItem = item || statusType || 'camera';
  const resolvedState = state || value || 'unknown';
  const text = getProctoringStatusText(resolvedItem, resolvedState);
  const displayLabel = label || LABEL_TEXT[resolvedItem] || 'Status';
  const tone = getTone(resolvedItem, resolvedState);
  const classes = getToneClasses(tone);

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-bold ${classes.badge} ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'}`}
      title={`${displayLabel}: ${text}`}
      aria-label={`${displayLabel}: ${text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} aria-hidden="true" />
      <span className="whitespace-nowrap">{text}</span>
    </span>
  );
}
