import { FOLLOW_UP_LIMIT, MARKS_LIMIT, divisions } from "./definition.js";

// Local guidance only: the server validates the saved revision before setup
// can be marked complete. These checks never replace that validation.
export function getAuthoringProgress(data = {}) {
  const issues = [];
  const add = (path, message) => issues.push({ path, message });
  const filled = (value) =>
    typeof value === "string" && value.trim().length > 0;
  const sections = data.sections || [];
  const weights = (items, path, label) => {
    if (
      items.length &&
      (items.some((item) => !Number.isFinite(item.weight)) ||
        Math.abs(items.reduce((sum, item) => sum + item.weight, 0) - 100) >
          0.001)
    ) {
      add(path, `${label} weights must total 100%.`);
    }
  };
  const timing = (rules, path, label) => {
    if (
      rules.responseSeconds !== null &&
      (!Number.isFinite(rules.responseSeconds) ||
        rules.responseSeconds < 1 ||
        rules.minimumSeconds > rules.responseSeconds)
    ) {
      add(
        path,
        `${label}: response time must be positive and at least the minimum response time.`,
      );
    }
  };
  if (!filled(data.title)) add("basics", "Add an interview title.");
  if (!filled(data.role)) add("basics", "Add a job role.");
  if (!data.experience) add("basics", "Select an experience level.");
  if (!data.difficulty) add("basics", "Select the default difficulty.");
  if (!sections.length) add("sections", "Add at least one section.");
  weights(sections, "sections", "Section");
  const defaultRules = data.rules || {};
  timing(defaultRules, "rules", "Interview settings");
  sections.forEach((section, sectionIndex) => {
    const path = `sections/${section.id}`;
    const name = section.name || `Section ${sectionIndex + 1}`;
    const groups = section.groups || [];
    if (!filled(section.name)) add(path, `Name section ${sectionIndex + 1}.`);
    if (!groups.length) add(path, `Add a topic to ${name}.`);
    weights(groups, path, `${name}: topic`);
    const sectionRules = { ...defaultRules, ...section.ruleOverrides };
    timing(sectionRules, path, name);
    groups.forEach((group, groupIndex) => {
      const groupPath = `${path}/groups/${group.id}`;
      const topic = group.name || `Topic ${groupIndex + 1}`;
      if (!filled(group.name))
        add(groupPath, `Name topic ${groupIndex + 1} in ${name}.`);
      const rules = { ...sectionRules, ...group.ruleOverrides };
      timing(rules, groupPath, topic);
      if (group.source === "annu") {
        if (!filled(group.annu?.requirements))
          add(groupPath, `Tell ANVI what to ask in ${topic}.`);
      } else {
        const questions = group.questions || [];
        if (!questions.length) add(groupPath, `Add a question to ${topic}.`);
        questions.forEach((question, questionIndex) => {
          const label = `${topic}, question ${questionIndex + 1}`;
          if (question.kind !== "resume" && !filled(question.prompt)) add(groupPath, `Write ${label}.`);
          if (question.kind === "resume" && (!Number.isInteger(question.resumeCount) || question.resumeCount < 1 || question.resumeCount > 50)) add(groupPath, `Choose 1–50 resume questions in ${label}.`);
          const aiFollowUps = question.maxFollowUps ?? 0;
          if (!Number.isInteger(aiFollowUps) || aiFollowUps < 0 || aiFollowUps > FOLLOW_UP_LIMIT)
            add(groupPath, `Choose 0–${FOLLOW_UP_LIMIT} AI follow-ups in ${label}.`);
          else if ((question.followUps || []).length + aiFollowUps > FOLLOW_UP_LIMIT)
            add(groupPath, `Use at most ${FOLLOW_UP_LIMIT} follow-ups in total in ${label}.`);
          const marks = question.marks ?? 10;
          if (!Number.isInteger(marks) || marks < 1 || marks > MARKS_LIMIT)
            add(groupPath, `Give ${label} 1–${MARKS_LIMIT} marks.`);
          if ((question.subquestions || []).some((sub) => !filled(sub.prompt)))
            add(
              groupPath,
              `Fill or remove the empty sub-question in ${label}.`,
            );
          if (
            (question.followUps || []).some(
              (followUp) => !filled(followUp.prompt),
            )
          )
            add(
              groupPath,
              `Fill or remove the empty cross-question in ${label}.`,
            );
          const questionRules = { ...rules, ...question.ruleOverrides };
          timing(questionRules, groupPath, label);
          (question.followUps || []).forEach((followUp, index) => {
            timing(
              { ...questionRules, ...followUp.ruleOverrides },
              groupPath,
              `${label}, cross-question ${index + 1}`,
            );
          });
        });
      }
    });
  });
  if (!filled(data.interviewer?.displayName))
    add("interviewer", "Choose an interviewer profile.");
  const rubric = data.rubric || [];
  if (!rubric.length) add("rules", "Add evaluation criteria.");
  if (rubric.some((criterion) => !filled(criterion.name)))
    add("rules", "Name each evaluation criterion.");
  weights(rubric, "rules", "Evaluation");
  const ready = issues.length === 0;
  // One entry per wizard step, in the same order as `divisions`. The ANVI
  // settings step owns both the interviewer and the rules/rubric checks.
  const stepReady = {
    basics: !issues.some((issue) => issue.path === "basics"),
    questions: !issues.some((issue) => issue.path.startsWith("sections")),
    anvi: !issues.some(
      (issue) => issue.path === "interviewer" || issue.path === "rules",
    ),
    review: ready,
  };
  return {
    steps: divisions.map(({ id, label }) => ({
      id,
      label,
      ready: stepReady[id],
    })),
    issues,
    ready,
  };
}
