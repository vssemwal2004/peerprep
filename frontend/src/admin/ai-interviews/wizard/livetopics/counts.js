// Live (ANVI-generated) topics: how many questions each one asks per student.
// Mirrors backend services/aiInterviewDefinition.js (priorityCounts, liveTopicCounts)
// so the wizard can preview the split instantly; the server summary is the record.
export const PRIORITY_SHARES = Object.freeze({ high: 3, medium: 2, low: 1 });
export const TOPIC_PRIORITIES = Object.freeze(["high", "medium", "low"]);
export const DEFAULT_TOPIC_PRIORITY = "medium";
// A topic asks this many when neither its own count nor an interview pool says otherwise.
export const DEFAULT_LIVE_COUNT = 3;
// Mirrors backend LIMITS.plannedQuestionsPerGroup and LIMITS.questions.
export const TOPIC_COUNT_LIMIT = 50;
export const POOL_LIMIT = 200;

export const PRIORITY_OPTIONS = Object.freeze([
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
]);
export const priorityOf = (value) =>
  TOPIC_PRIORITIES.includes(value) ? value : DEFAULT_TOPIC_PRIORITY;
export const priorityLabel = (value) =>
  PRIORITY_OPTIONS.find((option) => option.value === priorityOf(value)).label;

/**
 * Splits `total` questions over topics by their priority shares (largest remainder,
 * ties to the higher priority, then the earlier topic). With at least as many
 * questions as topics every topic gets one; otherwise the lowest-priority topics get none.
 */
export function priorityCounts(priorities, total) {
  const shares = (Array.isArray(priorities) ? priorities : []).map(
    (p) => PRIORITY_SHARES[priorityOf(p)],
  );
  const pool = Math.max(0, Math.floor(Number(total) || 0));
  if (!shares.length || !pool) return shares.map(() => 0);
  const sum = shares.reduce((n, s) => n + s, 0);
  const quotas = shares.map((s) => (pool * s) / sum);
  const counts = quotas.map(Math.floor);
  const byRemainder = shares
    .map((_, i) => i)
    .sort(
      (a, b) =>
        quotas[b] - counts[b] - (quotas[a] - counts[a]) ||
        shares[b] - shares[a] ||
        a - b,
    );
  for (
    let left = pool - counts.reduce((n, c) => n + c, 0), k = 0;
    left > 0;
    left -= 1, k += 1
  )
    counts[byRemainder[k % byRemainder.length]] += 1;
  if (pool >= shares.length) {
    for (let i = 0; i < counts.length; i += 1) {
      if (counts[i]) continue;
      // Take one from the topic furthest above its quota (ties: lower priority, then later topic).
      let donor = -1;
      for (let j = 0; j < counts.length; j += 1) {
        if (counts[j] < 2) continue;
        if (donor < 0) {
          donor = j;
          continue;
        }
        const over = counts[j] - quotas[j] - (counts[donor] - quotas[donor]);
        if (
          over > 1e-9 ||
          (Math.abs(over) <= 1e-9 &&
            (shares[j] < shares[donor] ||
              (shares[j] === shares[donor] && j > donor)))
        )
          donor = j;
      }
      if (donor < 0) break;
      counts[donor] -= 1;
      counts[i] = 1;
    }
  }
  return counts;
}

// A topic's own count (1..50), or null when it shares the interview pool.
export const explicitCount = (value) =>
  Number.isInteger(value) && value >= 1 ? Math.min(value, TOPIC_COUNT_LIMIT) : null;

// The interview's live pool (`anvi.liveQuestionCount`), or null.
export const liveTotalOf = (data) => {
  const value = data?.anvi?.liveQuestionCount;
  return Number.isInteger(value) && value >= 1 ? Math.min(value, POOL_LIMIT) : null;
};

const liveGroupsOf = (data) =>
  (data?.sections || []).flatMap((section) =>
    (section?.groups || []).filter((group) => group?.source === "annu"),
  );

// Questions per live topic, { [groupId]: count }, in definition order.
export function liveTopicCounts(data) {
  const total = liveTotalOf(data);
  const out = {};
  const pooled = [];
  for (const group of liveGroupsOf(data)) {
    const own = explicitCount(group.annu?.targetCount);
    if (own !== null) out[group.id] = own;
    else if (total !== null) pooled.push(group);
    else out[group.id] = DEFAULT_LIVE_COUNT;
  }
  const counts = priorityCounts(
    pooled.map((group) => group.priority),
    total,
  );
  pooled.forEach((group, i) => {
    out[group.id] = counts[i];
  });
  return out;
}

/**
 * Everything the admin UI shows about live topics. `summary` is the server's
 * save/inspect summary; its counts win when it covers every current topic, so pass
 * it only while it matches the data on screen (not while edits are unsaved).
 */
export function livePlan(data, summary) {
  const groups = liveGroupsOf(data);
  const local = liveTopicCounts(data);
  const server = summary?.liveTopicCounts;
  const useServer = Boolean(
    server && groups.length && groups.every((group) => Number.isInteger(server[group.id])),
  );
  const counts = useServer ? server : local;
  const topics = groups.map((group) => {
    const explicit = explicitCount(group.annu?.targetCount);
    return {
      id: group.id,
      name: group.name?.trim() || "Untitled topic",
      priority: priorityOf(group.priority),
      count: counts[group.id] || 0,
      explicit,
      maxFollowUps: group.annu?.maxFollowUps || 0,
      group,
    };
  });
  const pooled = topics.filter((topic) => topic.explicit === null);
  return {
    topics,
    total: topics.reduce((n, topic) => n + topic.count, 0),
    pool: liveTotalOf(data),
    pooled: pooled.length,
    starved: topics.filter((topic) => !topic.count),
    fromServer: useServer,
  };
}

// "React ×3 (High), DBMS ×2 (Medium)"
export const topicBreakdown = (topics) =>
  topics
    .map((topic) => `${topic.name} ×${topic.count} (${priorityLabel(topic.priority)})`)
    .join(", ");

// "Each student gets 5 questions from ANVI: React ×3 (High), DBMS ×2 (Medium)."
export function planSentence(plan) {
  if (!plan.topics.length) return "";
  return `Each student gets ${plan.total} question${plan.total === 1 ? "" : "s"} from ANVI: ${topicBreakdown(plan.topics)}.`;
}

// Chip tones (theme TONES keys) per priority.
export const PRIORITY_TONES = Object.freeze({ high: "violet", medium: "sky", low: "slate" });
