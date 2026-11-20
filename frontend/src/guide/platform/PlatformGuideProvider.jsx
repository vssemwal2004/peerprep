import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useUniversityPolicy } from "../../platform/UniversityPolicyContext";
import { isControlDeployment } from "../../platform/universityPermissions";
import { hasPermission } from "../../admin/coordinatorPermissions";
import { featureForStudentPath, hasStudentFeature } from "../../student/studentFeatureAccess";
import { canUsePeers } from "../../student/peers/peerNetwork";
import GlossaryText from "../engine/GlossaryText";
import { PlatformGuideContext, guideElement } from "./context";
import { glossaryFor } from "./glossary";
import { findModule, moduleAvailable, openPath, roleOf } from "./registry";
import { buildPageGuide, presentTargets } from "./buildPageGuide";
import { guideProgressApi } from "./api";

const TourOverlay = lazy(() => import("../engine/TourOverlay"));
const GuideCenter = lazy(() => import("./GuideCenter"));
const GuideNudge = lazy(() => import("./GuideNudge"));

const LOADERS = {
  student: () => import("../modules/student/index.js"),
  coordinator: () => import("../modules/coordinator/index.js"),
  admin: () => import("../modules/admin/index.js"),
};
const EMPTY = { completed: [], dismissed: [], nudgesOff: false };
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
// Pages where a tour would get in the way (a live test or interview).
const QUIET = [/^\/student\/assessment\/[^/]+$/, /^\/student\/ai-interviews\/room\//, /\/assessment\/preview\//];

/** Waits (up to ~4s) until the tour's parts have rendered, so a loading page still gets a full tour. */
async function settle(module, mode, cancelled) {
  let last = -1;
  let steady = 0;
  for (let tick = 0; tick < 27; tick += 1) {
    if (cancelled()) return;
    const { present, total } = presentTargets(module, mode);
    if (present === total) return;
    steady = present === last && present > 0 ? steady + 1 : 0;
    if (steady >= 3) return;
    last = present;
    await wait(150);
  }
}

/**
 * The ⓘ page tours for the whole platform: loads the signed-in person's guide modules and
 * progress, knows the current page's module, runs tours (shared TourOverlay), and shows the
 * Guides list and the one-time "new here?" tip.
 */
export default function PlatformGuideProvider({ children }) {
  const { user } = useAuth();
  const { allowsPath } = useUniversityPolicy();
  const location = useLocation();
  const navigate = useNavigate();
  const role = roleOf(user);
  const userId = String(user?._id || user?.id || "");
  const [loaded, setLoaded] = useState({ role: null, modules: [] });
  const [progress, setProgress] = useState({ ...EMPTY, loaded: false });
  const [active, setActive] = useState(null);
  const [centerOpen, setCenterOpen] = useState(false);
  const [nudge, setNudge] = useState(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const activeRef = useRef(null);
  const pending = useRef(null);

  // Content for this role only (each role's guides are their own chunk).
  useEffect(() => {
    if (!role) return undefined;
    let live = true;
    LOADERS[role]().then((mod) => { if (live) setLoaded({ role, modules: mod.default || [] }); }).catch(() => {});
    return () => { live = false; };
  }, [role]);

  useEffect(() => {
    setProgress({ ...EMPTY, loaded: false });
    if (!userId) return undefined;
    const controller = new AbortController();
    guideProgressApi.load(controller.signal)
      .then((data) => setProgress({ ...EMPTY, ...data, loaded: true }))
      .catch((error) => { if (error.name !== "AbortError") setProgress((current) => ({ ...current, loaded: true })); });
    return () => controller.abort();
  }, [userId]);

  // Shows at once, saved in the background.
  const save = useCallback((patch) => {
    setProgress((current) => ({
      ...current,
      completed: [...new Set([...current.completed, ...(patch.completed || [])])],
      dismissed: [...new Set([...current.dismissed, ...(patch.dismissed || [])])],
      ...(typeof patch.nudgesOff === "boolean" ? { nudgesOff: patch.nudgesOff } : {}),
    }));
    guideProgressApi.save(patch).catch(() => {});
  }, []);

  const env = useMemo(() => ({
    role,
    user,
    allowsPath,
    featureForPath: featureForStudentPath,
    hasFeature: (feature) => (feature === "peers" ? canUsePeers(user) : hasStudentFeature(user, feature)),
    hasPermission: role === "coordinator" ? (key) => hasPermission(user, key) : null,
    deployment: isControlDeployment ? "control" : "university",
  }), [allowsPath, role, user]);

  const allModules = useMemo(() => (loaded.role === role ? loaded.modules : []), [loaded, role]);
  const modules = useMemo(() => allModules.filter((module) => moduleAvailable(module, env)), [allModules, env]);
  const quiet = QUIET.some((pattern) => pattern.test(location.pathname));
  const current = useMemo(() => (quiet ? null : findModule(modules, location.pathname)), [modules, location.pathname, quiet]);
  const isExplored = useCallback((id) => progress.completed.includes(id) || progress.completed.includes(`${id}:quick`), [progress.completed]);

  const finish = useCallback((completed) => {
    const tour = activeRef.current;
    activeRef.current = null;
    setActive(null);
    if (!tour) return;
    if (completed) save({ completed: [tour.id] });
    else save({ dismissed: [tour.moduleId] });
  }, [save]);

  const startModuleRef = useRef(null);
  const run = useCallback(async (module, { mode = "full", at = null } = {}) => {
    setNudge(null);
    setCenterOpen(false);
    const token = {};
    pending.current = token;
    if (module.delegate === "prepAnalysis") {
      // The page loads lazily: wait for its own guide parts before handing over.
      for (let tick = 0; tick < 30 && !document.querySelector('[data-tour="areas"]'); tick += 1) await wait(150);
      if (pending.current !== token) return;
      pending.current = null;
      window.dispatchEvent(new CustomEvent("prep-analysis:start-page-tour"));
      save({ completed: [module.id] });
      return;
    }
    await settle(module, mode, () => pending.current !== token);
    if (pending.current !== token) return;
    pending.current = null;
    const tour = buildPageGuide(module, { mode, at, modules, startModule: (id) => startModuleRef.current?.(id) });
    const glossary = glossaryFor(module);
    const ready = { ...tour, Text: ({ text }) => <GlossaryText text={text} glossary={glossary} /> };
    activeRef.current = ready;
    setActive(ready);
  }, [modules, save]);

  /** Starts a page's tour; from another page it opens that page first. */
  const startModule = useCallback((id, options = {}) => {
    const module = modules.find((entry) => entry.id === id);
    if (!module) return;
    if (current?.id === module.id) { run(module, options); return; }
    const path = openPath(module);
    if (!path) return;
    pending.current = { waitFor: module.id, options };
    setCenterOpen(false);
    navigate(path);
  }, [current, modules, navigate, run]);
  startModuleRef.current = startModule;

  // After navigating for a tour: start it once the page is there.
  useEffect(() => {
    const want = pending.current;
    if (!want?.waitFor || current?.id !== want.waitFor) return;
    pending.current = null;
    run(current, want.options);
  }, [current, run]);

  // A tour ends when its page is left.
  useEffect(() => {
    if (activeRef.current && activeRef.current.moduleId !== current?.id) { activeRef.current = null; setActive(null); }
  }, [current]);

  // "New here?": once per page, after the page settles, unless done, closed, or switched off.
  useEffect(() => {
    setNudge(null);
    if (!current || !progress.loaded || progress.nudgesOff || current.nudge === false || current.delegate) return undefined;
    if (isExplored(current.id) || progress.dismissed.includes(current.id)) return undefined;
    const timer = setTimeout(() => {
      if (activeRef.current) return;
      const { present, total } = presentTargets(current, "quick");
      if (total && present < Math.min(2, total)) return; // the page is not ready (or empty): no tip
      setNudge(current.id);
    }, 2200);
    return () => clearTimeout(timer);
  }, [current, isExplored, progress.dismissed, progress.loaded, progress.nudgesOff]);

  const value = useMemo(() => ({
    ready: Boolean(role && progress.loaded && loaded.role === role),
    role,
    modules,
    current,
    progress,
    running: Boolean(active),
    isExplored,
    startModule,
    openCenter: () => { setNudge(null); setCenterOpen(true); },
    hideNudge: () => setNudge(null),
    closeCenter: () => setCenterOpen(false),
    setNudgesOff: (off) => save({ nudgesOff: Boolean(off) }),
    findElement: guideElement,
  }), [active, current, isExplored, loaded.role, modules, progress, role, save, startModule]);

  const nudgeModule = nudge && current?.id === nudge && !active ? current : null;
  return (
    <PlatformGuideContext.Provider value={value}>
      {children}
      {active && <Suspense fallback={null}><TourOverlay key={`${active.id}:${active.startAt}`} guide={active} onFinish={finish} /></Suspense>}
      {centerOpen && <Suspense fallback={null}><GuideCenter onClose={() => setCenterOpen(false)} /></Suspense>}
      {nudgeModule && (
        <Suspense fallback={null}>
          <GuideNudge module={nudgeModule}
            onStart={() => { setNudge(null); run(nudgeModule, { mode: "quick" }); }}
            onLater={() => { setNudge(null); save({ dismissed: [nudgeModule.id] }); }}
            onTurnOff={() => { setNudge(null); save({ nudgesOff: true, dismissed: [nudgeModule.id] }); }} />
        </Suspense>
      )}
    </PlatformGuideContext.Provider>
  );
}
