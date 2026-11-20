// Turns a guide module (registry.js) into a runnable tour for the shared TourOverlay: an intro
// card, the page's steps (only those whose part is on the page now), and a closing card that
// suggests the next tour.

import { PLATFORM_CHAPTERS, guideElement } from "./context.js";

const SECONDS_PER_STEP = 12;

export const tourId = (module, mode) => (mode === "quick" ? `${module.id}:quick` : module.id);
export const minutesFor = (count) => Math.max(1, Math.round((count * SECONDS_PER_STEP) / 60));

/** The module's own steps for a mode (quick = the steps marked quick). */
export const modeSteps = (module, mode) => (module?.steps || []).filter((step) => mode !== "quick" || step.quick);

/** Step counts as the ⓘ panel shows them (intro and closing cards included). */
export function tourLengths(module) {
  return { quick: modeSteps(module, "quick").length + 2, full: modeSteps(module, "full").length + 2 };
}

/** How many of a mode's parts are on the page right now. */
export function presentTargets(module, mode, find = guideElement) {
  const targeted = modeSteps(module, mode).filter((step) => step.target);
  return { present: targeted.filter((step) => find(step.target)).length, total: targeted.length };
}

/**
 * options: { mode: "quick" | "full", at: step id to open on, find: name => Element,
 *            modules: all modules (for the closing suggestion), startModule: (id) => void }
 */
export function buildPageGuide(module, { mode = "full", at = null, find = guideElement, modules = [], startModule = null } = {}) {
  const steps = [{
    id: "intro",
    chapter: "overview",
    title: module.title,
    body: module.intro || module.summary,
  }];
  for (const step of modeSteps(module, mode)) {
    if (step.target && !find(step.target)) continue;
    steps.push({
      id: step.id,
      chapter: step.chapter,
      title: step.title,
      body: step.body,
      tryIt: step.tryIt || undefined,
      target: step.target ? () => find(step.target) : undefined,
    });
  }
  const next = module.next ? modules.find((other) => other.id === module.next) : null;
  steps.push({
    id: "done",
    chapter: "next",
    title: mode === "quick" ? "That's the quick look" : "You're all set",
    body: [
      mode === "quick" && modeSteps(module, "full").length > modeSteps(module, "quick").length
        ? `The full tour of ${module.title} has ${modeSteps(module, "full").length} steps, with every part of the page.`
        : `That's ${module.title}.`,
      "Open the ⓘ next to the page title any time to see this again, or Guides in the menu for every page.",
    ].join("\n"),
    action: next && startModule ? () => ({ label: `Next: tour ${next.title}`, run: () => startModule(next.id) }) : undefined,
  });
  const startAt = at ? Math.max(0, steps.findIndex((step) => step.id === at)) : 0;
  return {
    id: tourId(module, mode),
    moduleId: module.id,
    mode,
    title: mode === "quick" ? `${module.title} · quick look` : `${module.title} · tour`,
    chapters: PLATFORM_CHAPTERS,
    steps,
    startAt,
    ctx: { module },
  };
}
