import {
  equalWeights,
  newGroup,
  newSection,
  questionSlots,
  uid,
} from "../definition.js";
import {
  DEFAULT_LIVE_COUNT,
  DEFAULT_TOPIC_PRIORITY,
  liveTopicCounts,
  liveTotalOf,
} from "./livetopics/counts.js";

// The wizard shows one flat question list. Underneath, the definition keeps the
// section -> group -> question shape the server validates. A "simple" interview is
// one section holding at most one manual group (the fixed questions) plus any number
// of live topics (ANVI-prompt groups); anything richer is shown grouped by section
// and edited in the section editor.
export const SIMPLE_SECTION_NAME = "Interview";
export const SIMPLE_GROUP_NAME = "Questions";

const sectionsOf = (data) => data?.sections || [];
const isLive = (group) => group.source === "annu";

export function isSimple(data) {
  const sections = sectionsOf(data);
  if (sections.length > 1) return false;
  const groups = sections[0]?.groups || [];
  return groups.filter((group) => !isLive(group)).length <= 1;
}

// Every manual question in interview order, with where it lives.
export function questionEntries(data) {
  const entries = [];
  for (const section of sectionsOf(data))
    for (const group of section.groups || []) {
      if (isLive(group)) continue;
      (group.questions || []).forEach((question, index) =>
        entries.push({
          question,
          index,
          number: entries.length + 1,
          sectionId: section.id,
          sectionName: section.name,
          groupId: group.id,
          groupName: group.name,
          groupSize: group.questions.length,
        }),
      );
    }
  return entries;
}

export const liveGroups = (data) =>
  sectionsOf(data).flatMap((section) =>
    (section.groups || []).filter(isLive).map((group) => ({ section, group })),
  );

// The live topic the wizard points at first (step checks and server issues use it):
// the first topic of the first section still missing its requirements, else the first topic.
export const primaryLive = (data) => {
  const topics = (sectionsOf(data)[0]?.groups || []).filter(isLive);
  return topics.find((group) => !group.annu?.requirements?.trim()) || topics[0] || null;
};

const simpleSection = () => ({
  ...newSection("Technical"),
  name: SIMPLE_SECTION_NAME,
  weight: 100,
});
const simpleGroup = () => ({
  ...newGroup(),
  name: SIMPLE_GROUP_NAME,
  weight: 100,
});

const withSection = (data, sectionId, update) => ({
  ...data,
  sections: sectionsOf(data).map((section) =>
    section.id === sectionId ? update(section) : section,
  ),
});
const withGroup = (data, groupId, update) => ({
  ...data,
  sections: sectionsOf(data).map((section) =>
    section.groups.some((group) => group.id === groupId)
      ? {
          ...section,
          groups: section.groups.map((group) =>
            group.id === groupId ? update(group) : group,
          ),
        }
      : section,
  ),
});
const findGroup = (data, groupId) => {
  for (const section of sectionsOf(data)) {
    const group = section.groups.find((g) => g.id === groupId);
    if (group) return { section, group };
  }
  return null;
};

// The manual group that new questions go to: the first one in interview order,
// created in the first section (with sibling weights reset equally) when missing.
export function ensureTargetGroup(data) {
  for (const section of sectionsOf(data)) {
    const group = section.groups.find((g) => !isLive(g));
    if (group) return { data, groupId: group.id };
  }
  const group = simpleGroup();
  if (!sectionsOf(data).length) {
    const section = { ...simpleSection(), groups: [group] };
    return { data: { ...data, sections: [section] }, groupId: group.id };
  }
  const first = sectionsOf(data)[0];
  return {
    data: withSection(data, first.id, (section) => ({
      ...section,
      groups: equalWeights([group, ...section.groups]),
    })),
    groupId: group.id,
  };
}

export const targetGroupId = (data) =>
  sectionsOf(data)
    .flatMap((section) => section.groups)
    .find((group) => !isLive(group))?.id || null;

export function addQuestions(data, questions) {
  const target = ensureTargetGroup(data);
  return {
    groupId: target.groupId,
    data: withGroup(target.data, target.groupId, (group) => ({
      ...group,
      questions: [...group.questions, ...questions],
    })),
  };
}

export const updateQuestion = (data, groupId, question) =>
  withGroup(data, groupId, (group) => ({
    ...group,
    questions: group.questions.map((q) => (q.id === question.id ? question : q)),
  }));

// A simple interview drops an emptied manual group when a live group remains, so a
// live-only interview never fails "Add at least one question" for a hidden group.
function tidy(data) {
  if (!isSimple(data)) return data;
  const section = sectionsOf(data)[0];
  if (!section) return data;
  const kept = section.groups.filter(
    (group) =>
      isLive(group) || group.questions.length || section.groups.length === 1,
  );
  if (kept.length === section.groups.length) return data;
  return withSection(data, section.id, (s) => ({
    ...s,
    groups: equalWeights(kept),
  }));
}

export function removeQuestion(data, groupId, questionId) {
  const found = findGroup(data, groupId);
  const index = found?.group.questions.findIndex((q) => q.id === questionId);
  if (!found || index < 0) return { data, removed: null };
  const removed = { groupId, index, question: found.group.questions[index] };
  const next = withGroup(data, groupId, (group) => ({
    ...group,
    questions: group.questions.filter((q) => q.id !== questionId),
  }));
  return { data: tidy(next), removed };
}

export function restoreQuestion(data, removed) {
  const found = findGroup(data, removed.groupId);
  if (!found) return addQuestions(data, [removed.question]).data;
  return withGroup(data, removed.groupId, (group) => {
    const questions = [...group.questions];
    questions.splice(
      Math.min(removed.index, questions.length),
      0,
      removed.question,
    );
    return { ...group, questions };
  });
}

export function moveQuestion(data, groupId, index, delta) {
  return withGroup(data, groupId, (group) => {
    const target = index + delta;
    if (target < 0 || target >= group.questions.length) return group;
    const questions = [...group.questions];
    [questions[index], questions[target]] = [questions[target], questions[index]];
    return { ...group, questions };
  });
}

export function duplicateQuestion(data, groupId, questionId) {
  return withGroup(data, groupId, (group) => {
    const index = group.questions.findIndex((q) => q.id === questionId);
    if (index < 0) return group;
    const copy = structuredClone(group.questions[index]);
    copy.id = uid();
    copy.subquestions = (copy.subquestions || []).map((part) => ({
      ...part,
      id: uid(),
    }));
    copy.followUps = (copy.followUps || []).map((part) => ({
      ...part,
      id: uid(),
    }));
    const questions = [...group.questions];
    questions.splice(index + 1, 0, copy);
    return { ...group, questions };
  });
}

// ---- Live topics ------------------------------------------------------------
// Each topic is one live group: ANVI writes its questions for every student at
// interview time, so it never carries a questions list. Topics without their own
// `annu.targetCount` share the interview pool `anvi.liveQuestionCount` by priority.
export const NEW_POOL_SIZE = 5;

export const newLiveTopic = ({ annu, ...extra } = {}) => {
  const { questions: _questions, ...base } = newGroup();
  return {
    ...base,
    name: "",
    source: "annu",
    priority: DEFAULT_TOPIC_PRIORITY,
    ...extra,
    annu: {
      requirements: "",
      skills: [],
      exclusions: "",
      targetCount: null,
      maxFollowUps: 1,
      ...annu,
    },
  };
};

export const setLiveQuestionCount = (data, liveQuestionCount) => ({
  ...data,
  anvi: { ...(data.anvi || {}), liveQuestionCount },
});

// New topics join the section that already holds topics, else the first section.
export function liveTopicSection(data) {
  const sections = sectionsOf(data);
  return sections.find((section) => section.groups.some(isLive)) || sections[0] || null;
}

// A pooled topic needs a pool; without one the server would fix its count at 3.
const ensurePool = (data, size) =>
  liveTotalOf(data) === null ? setLiveQuestionCount(data, size) : data;

export function addLiveTopic(data, extra = {}, poolSize) {
  const topic = newLiveTopic(extra);
  const hadTopics = liveGroups(data).length > 0;
  let next;
  const target = liveTopicSection(data);
  if (!target)
    next = {
      ...data,
      sections: [{ ...simpleSection(), groups: [{ ...topic, weight: 100 }] }],
    };
  else
    next = tidy(
      withSection(data, target.id, (section) => ({
        ...section,
        groups: equalWeights([...section.groups, topic]),
      })),
    );
  if (topic.annu.targetCount === null)
    next = ensurePool(next, poolSize ?? (hadTopics ? DEFAULT_LIVE_COUNT : NEW_POOL_SIZE));
  return { data: next, groupId: topic.id };
}

// patch: group fields (name, priority, difficulty) and/or `annu` fields to merge.
export const updateLiveTopic = (data, groupId, { annu, ...patch }) =>
  withGroup(data, groupId, (group) => ({
    ...group,
    ...patch,
    ...(annu ? { annu: { ...group.annu, ...annu } } : {}),
  }));

// count: an exact number for this topic, or null to share the pool by priority.
export function setTopicCount(data, groupId, count, poolSize) {
  const next = updateLiveTopic(data, groupId, { annu: { targetCount: count } });
  if (count !== null) return next;
  const previous = findGroup(data, groupId)?.group.annu?.targetCount;
  return ensurePool(next, poolSize ?? (Number.isInteger(previous) ? previous : DEFAULT_LIVE_COUNT));
}

export function removeLiveTopic(data, groupId) {
  const found = findGroup(data, groupId);
  if (!found || !isLive(found.group)) return data;
  let next = withSection(data, found.section.id, (section) => ({
    ...section,
    groups: equalWeights(section.groups.filter((g) => g.id !== groupId)),
  }));
  if (!liveGroups(next).length && data.anvi?.liveQuestionCount != null)
    next = setLiveQuestionCount(next, null);
  return tidy(next);
}

// Inline checks for one topic: { name?, requirements? }.
export function topicIssues(group) {
  const issues = {};
  if (!group.name?.trim()) issues.name = "Give this topic a name.";
  if (!group.annu?.requirements?.trim())
    issues.requirements = "Describe what ANVI should ask about this topic.";
  return issues;
}

// Mirrors the server summary: counts, marks and the maximum time budget.
export function estimate(data) {
  const result = {
    questions: 0,
    live: 0,
    total: 0,
    marks: 0,
    followUps: 0,
    seconds: 0,
    minutes: 0,
    unlimited: false,
  };
  const rules = data?.rules || {};
  const liveCounts = liveTopicCounts(data);
  const budget = (r, times) => {
    if (!times) return;
    if (r.preparationSeconds === null || r.responseSeconds === null)
      result.unlimited = true;
    else
      result.seconds +=
        ((r.preparationSeconds ?? 15) + (r.responseSeconds ?? 120)) * times;
  };
  for (const section of sectionsOf(data)) {
    const sectionRules = { ...rules, ...section.ruleOverrides };
    for (const group of section.groups || []) {
      const groupRules = { ...sectionRules, ...group.ruleOverrides };
      if (isLive(group)) {
        const count = liveCounts[group.id] || 0;
        const followUps = count * (group.annu?.maxFollowUps || 0);
        result.live += count;
        result.marks += count * 10;
        result.followUps += followUps;
        budget(groupRules, count + followUps);
        continue;
      }
      for (const question of group.questions || []) {
        const slots = questionSlots(question);
        const questionRules = { ...groupRules, ...question.ruleOverrides };
        result.questions += slots;
        result.marks += (Number(question.marks) || 10) * slots;
        result.followUps +=
          ((question.followUps || []).length + (question.maxFollowUps || 0)) *
          slots;
        budget(questionRules, slots * (1 + (question.maxFollowUps || 0)));
        for (const followUp of question.followUps || [])
          budget({ ...questionRules, ...followUp.ruleOverrides }, slots);
      }
    }
  }
  result.total = result.questions + result.live;
  result.minutes = Math.ceil(result.seconds / 60);
  return result;
}
