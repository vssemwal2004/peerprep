import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnalysisApi } from "../analysisScope";
import TourOverlay from "../../../guide/engine/TourOverlay";
import GlossaryText from "./GlossaryText";
import { CHAPTERS, TourContext, onMilestone } from "./tourContext";
import { buildPageTour } from "./content/page";

const EMPTY = { completed: [], milestones: [], welcomeDismissed: false, checklistDismissed: false };

/**
 * Runs the Prep Analysis guides and keeps the admin's progress (on their account): finished
 * guides, the getting-started steps done, and whether they closed the welcome card or checklist.
 */
export default function TourProvider({ children }) {
  const api = useAnalysisApi();
  const [progress, setProgress] = useState({ ...EMPTY, loaded: false });
  const [active, setActive] = useState(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    const controller = new AbortController();
    api.guides.progress(controller.signal)
      .then((data) => setProgress({ ...EMPTY, ...data, loaded: true }))
      .catch((error) => { if (error.name !== "AbortError") setProgress((current) => ({ ...current, loaded: true })); });
    return () => controller.abort();
  }, [api]);

  // Changes show at once and are saved in the background (a failed save is tried on the next change).
  const save = useCallback((patch) => {
    setProgress((current) => ({
      ...current,
      completed: [...new Set([...current.completed, ...(patch.completed || [])])],
      milestones: [...new Set([...current.milestones, ...(patch.milestones || [])])],
      ...(typeof patch.welcomeDismissed === "boolean" ? { welcomeDismissed: patch.welcomeDismissed } : {}),
      ...(typeof patch.checklistDismissed === "boolean" ? { checklistDismissed: patch.checklistDismissed } : {}),
    }));
    api.guides.update(patch).catch(() => {});
  }, [api]);

  const milestone = useCallback((key) => {
    if (!key || progressRef.current.milestones.includes(key)) return;
    save({ milestones: [key] });
  }, [save]);
  useEffect(() => onMilestone(milestone), [milestone]);

  const activeRef = useRef(null);
  const start = useCallback((guide) => {
    if (!guide?.steps?.length) return;
    // Prep Analysis guides speak its own chapter names and underline its glossary words.
    const ready = { chapters: CHAPTERS, Text: GlossaryText, ...guide };
    activeRef.current = ready;
    setActive(ready);
  }, []);
  const finish = useCallback((completed) => {
    const current = activeRef.current;
    activeRef.current = null;
    setActive(null);
    if (completed && current) save({ completed: [current.id, ...(current.alsoCompletes || [])], milestones: current.milestone ? [current.milestone] : [] });
  }, [save]);

  // The platform's ⓘ beside the page title (and Guides) hands over to this page's own tour.
  useEffect(() => {
    const onStart = () => { if (!activeRef.current) start(buildPageTour()); };
    window.addEventListener("prep-analysis:start-page-tour", onStart);
    return () => window.removeEventListener("prep-analysis:start-page-tour", onStart);
  }, [start]);

  const value = useMemo(() => ({
    progress, start, running: Boolean(active), milestone,
    isDone: (id) => progress.completed.includes(id),
    dismissWelcome: () => save({ welcomeDismissed: true }),
    dismissChecklist: (value = true) => save({ checklistDismissed: value }),
  }), [active, milestone, progress, save, start]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && <TourOverlay key={active.key || active.id} guide={active} onFinish={finish} />}
    </TourContext.Provider>
  );
}
