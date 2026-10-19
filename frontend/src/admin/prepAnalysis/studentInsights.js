// "What stands out" for one student, from their own profile only (never
// compared with other students). Each line: { tone: "good" | "warn" | "tip", text }.

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

function codingLines(coding) {
  const lines = [];
  const { solved } = coding;
  if (coding.practiceStatus === "never") return [{ tone: "warn", text: "Has not submitted any code yet." }];
  if (coding.practiceStatus === "inactive") lines.push({ tone: "warn", text: `No coding practice for ${coding.daysSinceActive} days.` });
  else if (coding.daysSinceActive === 0) lines.push({ tone: "good", text: "Practised today." });
  else if (coding.daysSinceActive !== null && coding.daysSinceActive <= 3) lines.push({ tone: "good", text: `Practised ${plural(coding.daysSinceActive, "day")} ago.` });

  if (solved.total > 0) {
    if (!solved.Hard && solved.Medium >= 10) {
      lines.push({ tone: "tip", text: `Ready for Hard problems: ${plural(solved.Medium, "Medium")} solved, no Hard yet.` });
    } else if (solved.total >= 10 && solved.Easy / solved.total >= 0.7) {
      lines.push({ tone: "tip", text: `Mostly Easy problems (${Math.round((solved.Easy / solved.total) * 100)}%). Medium and Hard problems raise Prep Coding more.` });
    }
  }

  if (coding.submissions >= 10 && coding.accuracy < 40) {
    const failures = (coding.verdicts || []).filter((verdict) => verdict.key !== "AC").sort((left, right) => right.value - left.value);
    lines.push({ tone: "warn", text: `Low accuracy: ${coding.accuracy}% of submissions accepted${failures[0] ? `; most failures are “${failures[0].name}”` : ""}.` });
  }

  const topics = coding.topics || [];
  const strongest = [...topics].sort((left, right) => right.solved - left.solved)[0];
  if (strongest?.solved) lines.push({ tone: "good", text: `Strongest topic: ${strongest.name} (${plural(strongest.solved, "problem")} solved).` });
  const struggling = topics.filter((topic) => topic.attempted >= 3 && topic.solved / topic.attempted < 0.5 && topic.name !== strongest?.name)
    .sort((left, right) => left.solved / left.attempted - right.solved / right.attempted)[0];
  if (struggling) lines.push({ tone: "warn", text: `Finding ${struggling.name} hard: ${struggling.solved} of ${struggling.attempted} tried problems solved.` });
  return lines;
}

function quickPrepLines(quickprep) {
  if (!quickprep) return [];
  if (quickprep.status === "none") {
    return quickprep.notStarted?.length ? [{ tone: "warn", text: `Has not started a Quick Prep sheet (${plural(quickprep.notStarted.length, "sheet")} open to them).` }] : [];
  }
  const lines = [];
  if (quickprep.finished) lines.push({ tone: "good", text: `Finished ${plural(quickprep.finished, "Quick Prep sheet")}.` });
  const stuck = (quickprep.sheets || []).filter((sheet) => !sheet.finished && sheet.progress < 30).sort((left, right) => left.progress - right.progress)[0];
  if (stuck) lines.push({ tone: "warn", text: `Stuck in “${stuck.title}”: ${stuck.solved} of ${stuck.total} questions solved.` });
  return lines;
}

function learningLines(learning) {
  if (!learning) return [];
  if (learning.status === "never") return [{ tone: "warn", text: "Has not started the course yet." }];
  const lines = [];
  if (learning.status === "inactive") lines.push({ tone: "warn", text: `No lessons for ${learning.daysSinceActive} days.` });
  if (learning.progress < 25) lines.push({ tone: "warn", text: `Behind in the course: ${learning.progress}% of the topics open to them completed.` });
  else if (learning.progress >= 75) lines.push({ tone: "good", text: `Well through the course: ${learning.progress}% completed.` });
  const finished = (learning.subjects || []).filter((subject) => subject.total && subject.completed >= subject.total);
  if (finished.length) lines.push({ tone: "good", text: `Finished ${finished.length === 1 ? finished[0].name : plural(finished.length, "subject")}.` });
  return lines;
}

function interviewLines(interview) {
  if (!interview) return [];
  if (interview.status === "never") {
    return [{ tone: "warn", text: interview.scheduled ? `No interview done yet; ${plural(interview.scheduled, "mock interview")} scheduled.` : "Has not done a mock or AI interview yet." }];
  }
  const lines = [];
  if (interview.status === "inactive") lines.push({ tone: "warn", text: `No interview for ${interview.daysSinceActive} days.` });
  if (interview.mockDone && interview.mockScore < 50) lines.push({ tone: "warn", text: `Mock interview score is ${interview.mockScore}% on average.` });
  else if (interview.mockDone && interview.mockScore >= 75) lines.push({ tone: "good", text: `Strong in mock interviews: ${interview.mockScore}% on average.` });
  const rated = (interview.ratings || []).filter((rating) => rating.value);
  if (rated.length > 1) {
    const weakest = [...rated].sort((left, right) => left.value - right.value)[0];
    if (weakest.value < 3) lines.push({ tone: "tip", text: `Interviewers rate ${weakest.label.toLowerCase()} lowest (${weakest.value} of 5).` });
  }
  if (interview.mockDone && !interview.aiCompleted && interview.aiStarted === 0) lines.push({ tone: "tip", text: "Has not tried an AI interview yet." });
  return lines;
}

function assessmentLines(assessment) {
  if (!assessment) return [];
  const lines = [];
  if (assessment.missed) lines.push({ tone: "warn", text: `Missed ${plural(assessment.missed, "test")} meant for them.` });
  if (assessment.status === "never") return [...lines, { tone: "warn", text: "Has not taken a test yet." }];
  if (assessment.failed) lines.push({ tone: "warn", text: `Below the ${assessment.passPercent}% pass mark in ${plural(assessment.failed, "test")}.` });
  else if (assessment.taken) lines.push({ tone: "good", text: `Passed every test taken (${assessment.taken}).` });
  return lines;
}

/** Up to `limit` lines, problems first, then tips, then good news. */
export function studentHighlights(profile, limit = 7) {
  if (!profile) return [];
  const lines = [
    ...(profile.coding ? codingLines(profile.coding) : []),
    ...quickPrepLines(profile.quickprep),
    ...learningLines(profile.learning),
    ...interviewLines(profile.interview),
    ...assessmentLines(profile.assessment),
  ];
  const order = { warn: 0, tip: 1, good: 2 };
  return lines.map((line, index) => ({ ...line, index })).sort((left, right) => order[left.tone] - order[right.tone] || left.index - right.index)
    .slice(0, limit).map(({ tone, text }) => ({ tone, text }));
}

/** "Today", "Yesterday", "5 days ago" or "Never". */
export const lastSeenText = (days) => (days === null || days === undefined ? "Never" : days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`);
