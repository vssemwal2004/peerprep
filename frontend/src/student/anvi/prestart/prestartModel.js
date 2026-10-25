// The phases a student passes before a NEW ANVI attempt starts, and what gates each one. Pure, so the
// order, the skipping and the gating copy are tested without rendering.

export const PHASES = {
  background: { title: "Background", blurb: "Interview details and resume" },
  system: { title: "System check", blurb: "Microphone, browser, network" },
  proctoring: { title: "Proctoring", blurb: "Monitoring rules" },
  instructions: { title: "Review & join", blurb: "Ground rules, consent and final checks" },
  // Kept for older saved analytics/events. New attempts merge this into instructions.
  ready: { title: "Ready", blurb: "Review and join" },
};

/** The phase ids that apply to this start, in order. Proctoring only when it watches something. */
export function phasesOf(setup) {
  return ["background", "system", ...(setup?.proctoring?.active ? ["proctoring"] : []), "instructions"];
}

/**
 * What still blocks leaving phase `id`, as one short sentence ("" when nothing does).
 * `state`: { resumeProvided, resumeUploading, support, micReady, micError, online, cameraOn, cameraReady,
 * cameraError, fullscreenSupported, proctoringAck, termsAccepted, consent }.
 */
export function phaseBlockerOf(id, setup, state = {}) {
  if (id === "background") {
    if (setup?.resume?.mode === "required" && !state.resumeProvided && !state.resumeUploading) return "Add your resume to continue.";
    return "";
  }
  if (id === "system") {
    if (state.support && !state.support.ok) return state.support.reason || "This browser can't run a voice interview.";
    if (state.online === false) return "You're offline. Reconnect to continue.";
    if (!state.micReady) return state.micError ? "Allow your microphone, then test it again." : "Test your microphone to continue.";
    if (setup?.proctoring?.active && setup.proctoring.ai?.enabled && !state.cameraReady) {
      if (state.cameraError) return "Allow your camera, then try again.";
      if (!state.cameraOn) return "Turn on your camera to continue.";
      return "Sit facing the camera so ANVI can see your face.";
    }
    return "";
  }
  if (id === "proctoring") {
    if (setup?.proctoring?.fullscreen === "required" && state.fullscreenSupported === false) return "This browser can't go fullscreen, which this interview needs. Use Chrome, Edge or Firefox on a computer.";
    if (!state.proctoringAck) return "Confirm the proctoring rules to continue.";
    return "";
  }
  if (id === "instructions") {
    if (setup?.terms?.required && !state.termsAccepted) return "Accept the interview terms to continue.";
    if (!state.consent) return "Tick the consent box to continue.";
    return "";
  }
  return "";
}

/** The first earlier phase that still blocks Join: { index, id, blocker } or null. */
export function joinBlockOf(phases, setup, state) {
  for (let index = 0; index < phases.length; index += 1) {
    const blocker = phaseBlockerOf(phases[index], setup, state);
    if (blocker) return { index, id: phases[index], blocker };
  }
  return null;
}

/**
 * The rail state of each phase: "current", "done" (passed, nothing blocks it), "attention" (passed but
 * something now blocks it, such as a failed upload) or "upcoming".
 */
export function phaseStatusesOf(phases, { index, reached }, setup, state) {
  return phases.map((id, at) => {
    if (at === index) return "current";
    if (at > reached) return "upcoming";
    if (phaseBlockerOf(id, setup, state)) return "attention";
    return at < reached || at < index ? "done" : "upcoming";
  });
}

export const CAMERA_PRIVACY = "Camera checks run on your device; no video is recorded or uploaded.";

/** The enabled camera AI checks in plain words: [{ id, text }] (empty when camera AI is off). */
export function aiChecksOf(proctoring) {
  const ai = proctoring?.active ? proctoring.ai : null;
  if (!ai?.enabled) return [];
  return [
    ai.detectNoFace && { id: "noFace", text: "Keep your face visible to the camera." },
    ai.detectFaceOutOfFrame && { id: "outOfFrame", text: `Stay centred in the frame (a short ${ai.faceOutOfFrameGraceSec} s grace applies).` },
    ai.detectMultiplePersons && { id: "multiplePersons", text: "Only you should be in view." },
    ai.detectMobile && { id: "mobile", text: "Keep phones out of view." },
    ai.detectLookingAway && { id: "lookingAway", text: "Keep your eyes on the screen." },
  ].filter(Boolean);
}

/** Plain-language rules for the Proctoring phase: [{ id, title, text }]. */
export function proctoringRulesOf(proctoring) {
  if (!proctoring?.active) return [];
  const rules = [];
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (proctoring.fullscreen === "required") {
    rules.push({ id: "fullscreen", title: "Fullscreen required", text: proctoring.pauseOutsideFullscreen
      ? "The interview opens in fullscreen when you join. If you leave fullscreen or hide this tab, the interview pauses until you return, and the timer keeps running. Each exit is recorded."
      : "The interview opens in fullscreen when you join. Each time you leave fullscreen, it is recorded." });
  }
  if (proctoring.tabSwitch === "warn") rules.push({ id: "tabSwitch", title: "Stay on this tab", text: "Switching to another tab or window is recorded, and you'll see a warning each time." });
  if (proctoring.tabSwitch === "record") rules.push({ id: "tabSwitch", title: "Stay on this tab", text: "Switching to another tab or window is recorded." });
  if (proctoring.refresh === "record") rules.push({ id: "refresh", title: "Don't refresh or leave", text: "Refreshing the page, or leaving and rejoining the interview, is recorded." });
  const blocked = [proctoring.blockRightClick && "right-click", proctoring.blockCopyPaste && "copy and paste", proctoring.blockShortcuts && "keyboard shortcuts"].filter(Boolean);
  if (blocked.length) {
    const list = blocked.length > 1 ? `${blocked.slice(0, -1).join(", ")} and ${blocked.at(-1)}` : blocked[0];
    rules.push({ id: "blocked", title: "Some actions are blocked", text: `${list[0].toUpperCase()}${list.slice(1)} ${blocked.length > 1 ? "are" : "is"} turned off during the interview. Attempts are noted in the report but don't count as violations.` });
  }
  const counted = proctoring.fullscreen === "required" || proctoring.tabSwitch !== "off" || proctoring.refresh === "record";
  if (counted && proctoring.warnings > 0) rules.push({ id: "warnings", title: `You get ${plural(proctoring.warnings, "warning")}`, text: `Your first ${plural(proctoring.warnings, "violation")} each show a warning on screen (Warning 1 of ${proctoring.warnings}, and so on).` });
  if (counted && proctoring.maxViolations > 0) {
    const n = plural(proctoring.maxViolations, "violation");
    rules.push(proctoring.onLimit === "flag"
      ? { id: "limit", title: `Flagged after ${n}`, text: `After ${n}, your interview is flagged for review. It carries on and your score is not changed automatically.` }
      : { id: "limit", title: `Ends after ${n}`, text: `The interview ends after ${n}. Your answers up to then are saved.` });
  }
  return rules;
}
