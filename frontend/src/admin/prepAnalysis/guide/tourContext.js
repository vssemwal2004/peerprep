import { createContext, useContext } from "react";

// The guide controller (TourProvider.jsx): start a guide, the admin's progress, and the
// getting-started milestones. Null outside a provider (e.g. an embedded report), where the
// guide buttons simply do not show.
export const TourContext = createContext(null);
export const useTour = () => useContext(TourContext);

const MILESTONE_EVENT = "prep-analysis:milestone";

/** Records a getting-started step ("filter", "studentList", "email", "download", "savedView"…). */
export function emitMilestone(key) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(MILESTONE_EVENT, { detail: key }));
}
export const onMilestone = (handler) => {
  const listener = (event) => handler(event.detail);
  window.addEventListener(MILESTONE_EVENT, listener);
  return () => window.removeEventListener(MILESTONE_EVENT, listener);
};

// Chapter names, in guide order.
export const CHAPTERS = Object.freeze({
  intro: "Overview",
  read: "Reading the chart",
  meaning: "What it means",
  explore: "Click and explore",
  actions: "Actions",
  next: "What to do next",
  new: "What's new",
  page: "Page tour",
});
