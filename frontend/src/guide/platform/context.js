import { createContext, useContext } from "react";

// The platform guide controller (PlatformGuideProvider.jsx): the ⓘ page tours on every student,
// coordinator and admin page. Null outside the provider (public pages), where the guide
// buttons simply do not show.
export const PlatformGuideContext = createContext(null);
export const usePlatformGuide = () => useContext(PlatformGuideContext);

// Chapter names, in tour order.
export const PLATFORM_CHAPTERS = Object.freeze({
  overview: "Overview",
  layout: "Find your way",
  parts: "Key parts",
  actions: "How to use it",
  tips: "Tips",
  next: "What next",
});
export const CHAPTER_ORDER = Object.freeze(Object.keys(PLATFORM_CHAPTERS));

/** Element marked data-guide="name" that is actually drawn (phone and desktop copies can both exist). */
export function guideElement(name) {
  if (typeof document === "undefined" || !name) return null;
  const all = document.querySelectorAll(`[data-guide="${CSS.escape(name)}"]`);
  for (const element of all) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}
