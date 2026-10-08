// Client-side mirror of the progression config contract and normalization formula.
// The backend catalog (backend/src/progression/catalog.js) is authoritative; this file
// only powers the editor's live preview and pre-save validation.

export const PROGRESSION_MODES = [
  { value: 'off', label: 'Off', description: 'Nothing is computed. Students keep the current level UI.' },
  { value: 'shadow', label: 'Shadow', description: 'XP and levels are computed and stored so admins can review them. Students see no change and get no new celebrations.' },
  { value: 'live', label: 'Live', description: 'Students see the new levels, XP and awards. Switch only after reviewing shadow data.' },
];

// pace = expected raw XP per week for an active student (E_m in the spec).
export const PROGRESSION_SOURCES = [
  { key: 'coding', label: 'Coding practice', permission: 'coding', pace: 350, activity: true, example: { label: 'Solve a new Medium problem', xp: 40 } },
  { key: 'learning', label: 'Learning', permission: 'learning', pace: 180, activity: true, example: { label: 'Complete a topic', xp: 6 } },
  { key: 'assessments', label: 'Assessments', permission: 'assessments', pace: 110, activity: true, example: { label: 'Submit an assessment', xp: 60 } },
  { key: 'questions', label: 'Question practice', permission: 'questions', pace: 100, activity: true, example: { label: 'Answer a new question correctly', xp: 4 } },
  { key: 'events', label: 'Peer mock interviews', permission: 'events', pace: 90, activity: true, example: { label: 'Complete a peer mock interview', xp: 60 } },
  { key: 'interviews', label: 'AI interviews', permission: 'interviews', pace: 90, activity: true, unavailable: 'Unavailable until interview data is connected' },
  { key: 'resumes', label: 'Resumes', permission: 'resumes', pace: 0, example: { label: 'Create a resume', xp: 50 } },
  { key: 'consistency', label: 'Consistency', permission: null, pace: 60, example: { label: 'Active day', xp: 10 } },
];

// Locked-off sources are excluded so an all-modules university gets N = 1.00 (890, not the
// spec's 980). Must match the backend catalog once it exists.
export const REFERENCE_PACE = PROGRESSION_SOURCES.filter((source) => !source.unavailable).reduce((sum, source) => sum + source.pace, 0);
export const MIN_FACTOR = 0.25;
export const LIMITS = {
  weight: [0, 3],
  base: [20, 200],
  exponent: [1.5, 2.3],
  maxFactor: [1, 8],
  level60: [40000, 400000],
};
export const CURVE_SAMPLE_LEVELS = [10, 20, 30, 40, 50, 60];

export const PROGRESSION_DEFAULTS = {
  mode: 'shadow',
  sources: Object.fromEntries(PROGRESSION_SOURCES.map((source) => [source.key, { enabled: !source.unavailable, weight: 1 }])),
  curve: { base: 50, exponent: 1.9 },
  normalization: { mode: 'auto', maxFactor: 5 },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Number(value) : fallback);

// Existing documents predate the `coding` permission; until the backfill runs it mirrors `questions`.
export function permissionOn(permissions, key) {
  if (!key) return true;
  if (key === 'coding' && permissions?.coding === undefined) return permissions?.questions !== false;
  return permissions?.[key] !== false;
}

// Merges a stored (possibly partial or missing) progression block over the defaults.
export function normalizeProgression(stored) {
  const source = stored || {};
  const mode = PROGRESSION_MODES.some((item) => item.value === source.mode)
    ? source.mode
    : source.enabled === false ? 'off' : PROGRESSION_DEFAULTS.mode;
  return {
    mode,
    sources: Object.fromEntries(PROGRESSION_SOURCES.map(({ key, unavailable }) => {
      const row = source.sources?.[key] || {};
      return [key, {
        enabled: unavailable ? false : typeof row.enabled === 'boolean' ? row.enabled : true,
        weight: finite(row.weight, 1),
      }];
    })),
    curve: {
      base: finite(source.curve?.base, PROGRESSION_DEFAULTS.curve.base),
      exponent: finite(source.curve?.exponent, PROGRESSION_DEFAULTS.curve.exponent),
    },
    normalization: {
      mode: source.normalization?.mode === 'off' ? 'off' : 'auto',
      maxFactor: finite(source.normalization?.maxFactor, PROGRESSION_DEFAULTS.normalization.maxFactor),
    },
    // Not edited here, but carried through so a save or copy never wipes them.
    ...(source.ruleOverrides !== undefined ? { ruleOverrides: source.ruleOverrides } : {}),
    ...(source.disabledAwardIds !== undefined ? { disabledAwardIds: source.disabledAwardIds } : {}),
  };
}

// C(n) = round10(base * (n - 1)^exponent): cumulative XP needed to reach level n.
export function levelXp(level, { base, exponent }) {
  return Math.round((Number(base) * (level - 1) ** Number(exponent)) / 10) * 10;
}

export function computePreview(draft, permissions) {
  const effective = PROGRESSION_SOURCES.filter((source) => !source.unavailable
    && source.key !== 'consistency'
    && draft.sources[source.key]?.enabled
    && permissionOn(permissions, source.permission));
  const hasActivity = effective.some((source) => source.activity);
  if (hasActivity && draft.sources.consistency?.enabled) effective.push(PROGRESSION_SOURCES.find((source) => source.key === 'consistency'));

  const weighted = effective.map((source) => ({ ...source, weight: Number(draft.sources[source.key].weight) || 0 }));
  const paceSum = weighted.reduce((sum, source) => sum + source.weight * source.pace, 0);
  const autoFactor = paceSum > 0 ? REFERENCE_PACE / paceSum : null;
  const factor = draft.normalization.mode === 'off'
    ? 1
    : autoFactor === null ? null : clamp(autoFactor, MIN_FACTOR, Number(draft.normalization.maxFactor) || 5);
  const weeklyXp = factor === null ? 0 : factor * paceSum;

  return {
    effectiveKeys: weighted.map((source) => source.key),
    paceSum,
    autoFactor,
    factor,
    clamped: draft.normalization.mode !== 'off' && autoFactor !== null && factor !== autoFactor,
    weeklyXp,
    shares: Object.fromEntries(weighted.map((source) => [source.key, paceSum > 0 ? (source.weight * source.pace / paceSum) * 100 : 0])),
    examples: weighted.filter((source) => source.example && source.weight > 0).map((source) => ({
      key: source.key,
      label: source.example.label,
      xp: Math.round((factor ?? 0) * source.weight * source.example.xp),
    })),
    curve: CURVE_SAMPLE_LEVELS.map((level) => {
      const xp = levelXp(level, draft.curve);
      return { level, xp, weeks: weeklyXp > 0 ? xp / weeklyXp : null };
    }),
  };
}

// Empty inputs are invalid rather than silently 0.
const inRange = (raw, [min, max]) => {
  const value = raw === '' || raw === null ? NaN : Number(raw);
  return Number.isFinite(value) && value >= min && value <= max;
};

// Mirrors validateProgression's bounds. Keys are field paths relative to `progression`.
export function validateProgression(draft, permissions) {
  const errors = {};
  const warnings = [];
  PROGRESSION_SOURCES.forEach(({ key, label, unavailable }) => {
    if (unavailable) return;
    const row = draft.sources[key];
    if (!inRange(row.weight, LIMITS.weight)) errors[`sources.${key}.weight`] = 'Weight must be between 0 and 3.';
    else if (row.enabled && Number(row.weight) === 0) warnings.push(`${label} is enabled with weight 0, so it earns no XP. Consider turning it off instead.`);
  });

  if (!inRange(draft.curve.base, LIMITS.base)) errors['curve.base'] = 'Base must be between 20 and 200.';
  if (!inRange(draft.curve.exponent, LIMITS.exponent)) errors['curve.exponent'] = 'Exponent must be between 1.5 and 2.3.';
  if (!errors['curve.base'] && !errors['curve.exponent'] && !inRange(levelXp(60, draft.curve), LIMITS.level60)) {
    errors.curve = 'Level 60 must need between 40,000 and 400,000 XP. Adjust the base or exponent.';
  }
  if (!inRange(draft.normalization.maxFactor, LIMITS.maxFactor)) errors['normalization.maxFactor'] = 'Max factor must be between 1 and 8.';

  if (draft.mode !== 'off') {
    const paced = PROGRESSION_SOURCES.filter((source) => source.activity && !source.unavailable && draft.sources[source.key].enabled);
    if (!paced.length) errors.sources = 'Enable at least one activity source, or set the mode to Off.';
    else if (!paced.some((source) => Number(draft.sources[source.key].weight) > 0)) errors.sources = 'At least one enabled activity source needs a weight above 0.';
    else if (permissions && !computePreview(draft, permissions).effectiveKeys.some((key) => PROGRESSION_SOURCES.find((source) => source.key === key)?.activity)) {
      warnings.push('With the current module permissions, no enabled source would earn XP. Students will see progression as unavailable.');
    }
  }
  return { errors, warnings };
}

// Request body for PUT /admin/defaults and PATCH /admin/universities/:id. AI interviews are
// omitted because that source cannot be enabled yet; server-managed keys are never sent.
export function buildProgressionPayload(draft, expectedVersion) {
  const payload = {
    mode: draft.mode,
    sources: Object.fromEntries(PROGRESSION_SOURCES.filter((source) => !source.unavailable).map(({ key }) => [key, {
      enabled: Boolean(draft.sources[key].enabled),
      weight: Math.round(Number(draft.sources[key].weight) * 10) / 10,
    }])),
    curve: { base: Number(draft.curve.base), exponent: Number(draft.curve.exponent) },
    normalization: { mode: draft.normalization.mode, maxFactor: Number(draft.normalization.maxFactor) },
  };
  if (draft.ruleOverrides !== undefined) payload.ruleOverrides = draft.ruleOverrides;
  if (draft.disabledAwardIds !== undefined) payload.disabledAwardIds = draft.disabledAwardIds;
  if (Number.isInteger(expectedVersion)) payload.expectedVersion = expectedVersion;
  return payload;
}
