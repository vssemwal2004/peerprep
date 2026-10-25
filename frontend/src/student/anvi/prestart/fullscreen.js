// Fullscreen helpers for proctored interviews (with the WebKit prefix older Safari still needs).
// `requestAppFullscreen` must be called inside a click: browsers refuse it outside a user gesture.

const doc = () => (typeof document === "undefined" ? null : document);

export function fullscreenSupported() {
  const root = doc()?.documentElement;
  if (!root) return false;
  if (doc().fullscreenEnabled === false && !doc().webkitFullscreenEnabled) return false;
  return typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
}

export const isFullscreen = () => Boolean(doc()?.fullscreenElement || doc()?.webkitFullscreenElement);

/** Resolves true once the page is fullscreen, false when the browser refused or cannot do it. */
export async function requestAppFullscreen() {
  if (isFullscreen()) return true;
  const root = doc()?.documentElement;
  const request = root?.requestFullscreen || root?.webkitRequestFullscreen;
  if (typeof request !== "function") return false;
  try {
    // The prefixed call returns nothing and switches a moment later; no throw means it was allowed.
    await request.call(root, { navigationUI: "hide" });
    return true;
  } catch {
    return false;
  }
}

/** Leaves fullscreen when the page is in it (never throws). */
export async function exitAppFullscreen() {
  if (!isFullscreen()) return;
  const target = doc();
  const exit = target?.exitFullscreen || target?.webkitExitFullscreen;
  try { await exit?.call(target); } catch { /* Already left. */ }
}

/** Calls `listener` whenever fullscreen is entered or left; returns the unsubscribe. */
export function onFullscreenChange(listener) {
  const target = doc();
  if (!target) return () => {};
  target.addEventListener("fullscreenchange", listener);
  target.addEventListener("webkitfullscreenchange", listener);
  return () => {
    target.removeEventListener("fullscreenchange", listener);
    target.removeEventListener("webkitfullscreenchange", listener);
  };
}

/** What to do when the browser refuses fullscreen. */
export const FULLSCREEN_HELP = "Allow fullscreen when your browser asks, then press Join again. If nothing happens, use a recent Chrome, Edge or Firefox on a computer and make sure no extension blocks fullscreen.";
