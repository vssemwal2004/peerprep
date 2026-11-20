// The platform guides: one guide module per page (or page family), per role. Content lives in
// src/guide/modules/<role>/*.js and is loaded only for the signed-in person's role.
//
// A guide module (plain data; every string is shown to people, so write it for them):
// {
//   id:       "student.quickprep"            role + "." + page, lower-case (progress is saved by id)
//   paths:    ["/student/quickprep"]         route patterns; ":param" matches one segment, "*" the rest
//   area:     "Practice"                     a group from AREAS[role] (the Guides list is grouped by it)
//   title:    "Quick Prep"                   the page's name as people see it in the menu
//   icon:     "zap"                          a key of guide/platform/icons.js
//   summary:  "One sentence: what this page is for."
//   intro:    "2–3 sentences for the tour's first card (\n starts a new paragraph)."
//   steps:    [{
//     id:      "qp-filters"                   unique in the module; also used by <GuideInfo step="…" />
//     target:  "qp-filters"                   the element marked data-guide="qp-filters" (omit = centred card)
//     chapter: "parts"                        overview | layout | parts | actions | tips | next
//     title:   "Filter the sheets"
//     body:    "What it is, why it matters, what to do. 1–3 short sentences (\n = new paragraph)."
//     quick:   true                           also part of the Quick tour (aim for 3–6 quick steps)
//     tryIt:   "Click a sheet to open it"     optional: waits for a click on the target
//   }],
//   terms:    [{ term: "Mastery", text: "…" }]   optional extra glossary words for this page
//   tips:     ["Short tip", …]                optional, shown in the page's ⓘ panel (max 4)
//   next:     "student.problems"              optional: the tour to suggest when this one ends
//   hidden:   true                            optional: not listed in the Guides list (sub-pages)
//   openFrom: "admin.students"                optional: for pages that need an id (students/:id)
//   feature:  "quickprep"                     student feature key (default: from the path)
//   permission: "coordinator.students.view"   coordinator permission needed
//   deployment: "university" | "control"      admin pages that exist on one deployment only
//   nudge:    false                           never show the "new here?" tip for this page
//   delegate: "prepAnalysis"                  the page runs its own guides; ⓘ starts those instead
// }
// Steps whose element is not on the page (no permission, empty state, another tab) are skipped.

export const AREAS = Object.freeze({
  student: ["Get started", "Practice", "Assessments", "Interviews", "Learning", "Progress & rewards", "Community", "Account"],
  coordinator: ["Get started", "Students", "Assessments", "Question library", "Interviews", "Learning", "Communication", "Settings", "Account"],
  admin: ["Get started", "Students", "Coordinators", "Assessments", "Question library", "Quick Prep", "Interviews", "Learning", "Analysis & reports", "Prep Coins", "Communication", "Settings", "Universities", "Account"],
});

export const ROLES = Object.freeze(["student", "coordinator", "admin"]);

/** The person's guide role: student, coordinator or admin (null when signed out). */
export function roleOf(user) {
  if (!user?.role) return null;
  return user.role === "student" || user.role === "coordinator" ? user.role : "admin";
}

/** How well a route pattern fits a path: -1 = no match; more fixed segments = better. */
export function matchScore(pattern, pathname) {
  const want = String(pattern || "").split("/").filter(Boolean);
  const have = String(pathname || "").split("?")[0].split("/").filter(Boolean);
  let score = 0;
  for (let index = 0; index < want.length; index += 1) {
    const part = want[index];
    if (part === "*") return score + 1;
    const value = have[index];
    if (value === undefined) return -1;
    if (part.startsWith(":")) score += 2;
    else if (part === value) score += 3;
    else return -1;
  }
  return have.length === want.length ? score + 1 : -1;
}

/** The module for a page (the best-fitting pattern wins), or null. */
export function findModule(modules, pathname) {
  let best = null;
  let bestScore = -1;
  for (const module of modules || []) {
    for (const pattern of module.paths || []) {
      const score = matchScore(pattern, pathname);
      if (score > bestScore) { best = module; bestScore = score; }
    }
  }
  return best;
}

/** A path people can open directly (no ":id"), or null. */
export const openPath = (module) => (module?.paths || []).find((path) => !path.includes(":") && !path.includes("*")) || null;

/**
 * Whether a module is listed for this person. env: { role, user, allowsPath, hasFeature,
 * hasPermission, deployment }. Unknown checks pass (the page itself still guards access).
 */
export function moduleAvailable(module, env = {}) {
  const path = openPath(module) || module.paths?.[0] || "";
  if (env.allowsPath && path && !path.includes(":") && !env.allowsPath(path, env.role)) return false;
  if (env.role === "student" && env.hasFeature) {
    const feature = module.feature === undefined ? env.featureForPath?.(path) : module.feature;
    if (feature && !env.hasFeature(feature)) return false;
  }
  if (module.permission && env.hasPermission && !env.hasPermission(module.permission)) return false;
  if (module.deployment && env.deployment && module.deployment !== env.deployment) return false;
  return true;
}

const GUIDE_ID = /^(student|coordinator|admin)\.[a-z0-9.-]+$/;
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const CHAPTERS = new Set(["overview", "layout", "parts", "actions", "tips", "next"]);

/** Content problems in one role's modules (used by the tests): [] when all is well. */
export function moduleProblems(modules, role, iconKeys = null) {
  const problems = [];
  const ids = new Set();
  const say = (module, message) => problems.push(`${module?.id || "?"}: ${message}`);
  for (const module of modules) {
    if (!GUIDE_ID.test(module.id || "") || !module.id.startsWith(`${role}.`)) say(module, "id must look like role.page");
    if (ids.has(module.id)) say(module, "duplicate id");
    ids.add(module.id);
    if (!module.paths?.length || module.paths.some((path) => !String(path).startsWith("/"))) say(module, "paths must start with /");
    if (!AREAS[role].includes(module.area)) say(module, `area "${module.area}" is not one of ${AREAS[role].join(", ")}`);
    for (const key of ["title", "summary", "intro"]) if (typeof module[key] !== "string" || module[key].trim().length < (key === "title" ? 2 : 20)) say(module, `${key} is missing or too short`);
    if (iconKeys && !iconKeys.includes(module.icon)) say(module, `icon "${module.icon}" is not in icons.js`);
    if (module.delegate) continue;
    const steps = module.steps || [];
    if (steps.length < 4) say(module, "needs at least 4 steps");
    if (steps.filter((step) => step.quick).length < 2) say(module, "needs at least 2 quick steps");
    const stepIds = new Set();
    for (const step of steps) {
      if (!NAME.test(step.id || "")) say(module, `step id "${step.id}" must be kebab-case`);
      if (stepIds.has(step.id)) say(module, `duplicate step id ${step.id}`);
      stepIds.add(step.id);
      if (step.target !== undefined && !NAME.test(step.target)) say(module, `step ${step.id}: target "${step.target}" must be a data-guide name`);
      if (!CHAPTERS.has(step.chapter)) say(module, `step ${step.id}: chapter "${step.chapter}"`);
      if (typeof step.title !== "string" || step.title.length < 3) say(module, `step ${step.id}: title`);
      if (typeof step.body !== "string" || step.body.length < 30 || step.body.length > 480) say(module, `step ${step.id}: body must be 30–480 characters (${step.body?.length})`);
      if (/undefined|TODO|lorem/i.test(`${step.title} ${step.body}`)) say(module, `step ${step.id}: placeholder text`);
      if (step.tryIt && !step.target) say(module, `step ${step.id}: tryIt needs a target`);
    }
    if (module.next && !modules.some((other) => other.id === module.next)) say(module, `next "${module.next}" does not exist`);
    if (module.openFrom && !modules.some((other) => other.id === module.openFrom)) say(module, `openFrom "${module.openFrom}" does not exist`);
    if (module.tips && (!Array.isArray(module.tips) || module.tips.length > 4)) say(module, "tips: up to 4");
  }
  return problems;
}
