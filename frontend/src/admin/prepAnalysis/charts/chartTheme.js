import { DIFFICULTY_THEME } from "../../../utils/difficultyTheme.js";

// Prep Analysis charts use the app's own colours: sky for the main series,
// slate for "nothing yet", emerald / rose / amber only where they carry a
// meaning (passed, failed, warning), and the platform's difficulty colours.
export const DIFFICULTY_COLORS = Object.freeze({
  Easy: DIFFICULTY_THEME.Easy.color,
  Medium: DIFFICULTY_THEME.Medium.color,
  Hard: DIFFICULTY_THEME.Hard.color,
  Accuracy: "#0284c7",
  Other: "#94a3b8",
});

// Sky shades first, then slate, so categories stay within the theme.
export const CATEGORICAL = Object.freeze(["#0284c7", "#38bdf8", "#0c4a6e", "#7dd3fc", "#0369a1", "#64748b", "#bae6fd", "#94a3b8", "#075985", "#cbd5e1"]);

export const OUTCOME_COLORS = Object.freeze({
  Solved: "#10b981", "Not solved": "#f43f5e",
  Finished: "#10b981", "In progress": "#0284c7", "Not started": "#cbd5e1",
  Passed: "#10b981", Failed: "#f43f5e", Missed: "#cbd5e1",
  "Below 40%": "#f43f5e", "40–60%": "#7dd3fc", "60–80%": "#0ea5e9", "80–100%": "#0369a1",
  Mock: "#0284c7", AI: "#38bdf8",
  "Rated 1": "#e0f2fe", "Rated 2": "#bae6fd", "Rated 3": "#7dd3fc", "Rated 4": "#0ea5e9", "Rated 5": "#0369a1",
  AC: "#10b981", WA: "#f43f5e", TLE: "#f59e0b", RE: "#64748b", CE: "#94a3b8",
});

// One accent for every feature: the app's primary sky.
const SKY = "#0284c7";
export const SECTION_ACCENTS = Object.freeze({ coding: SKY, learning: SKY, interview: SKY, assessment: SKY });

/** `color` (#rgb, #rrggbb, rgb() or rgba()) with its opacity multiplied by `opacity`. */
export function alpha(color, opacity) {
  const text = String(color || "");
  let red; let green; let blue; let current = 1;
  if (text.startsWith("#")) {
    let hex = text.slice(1);
    if (hex.length === 3) hex = hex.split("").map((char) => char + char).join("");
    [red, green, blue] = [0, 2, 4].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
    if (hex.length === 8) current = Number.parseInt(hex.slice(6, 8), 16) / 255;
  } else {
    const parts = text.match(/[\d.]+/g);
    if (!parts || parts.length < 3) return text;
    [red, green, blue] = parts.map(Number);
    if (parts[3] !== undefined) current = Number(parts[3]);
  }
  if ([red, green, blue].some((value) => !Number.isFinite(value))) return text;
  return `rgba(${red},${green},${blue},${Math.round(current * opacity * 1000) / 1000})`;
}

export function chartTheme(dark) {
  return dark
    ? {
      dark: true, text: "#cbd5e1", strong: "#f1f5f9", muted: "#64748b", grid: "rgba(148,163,184,0.14)",
      axis: "rgba(148,163,184,0.28)", surface: "#111827", border: "#374151",
      sequential: ["#0c4a6e", "#075985", "#0369a1", "#0ea5e9", "#7dd3fc"], empty: "#1f2937",
    }
    : {
      dark: false, text: "#475569", strong: "#0f172a", muted: "#94a3b8", grid: "rgba(148,163,184,0.2)",
      axis: "rgba(148,163,184,0.45)", surface: "#ffffff", border: "#e2e8f0",
      sequential: ["#f0f9ff", "#bae6fd", "#38bdf8", "#0284c7", "#0c4a6e"], empty: "#f1f5f9",
    };
}

export const isDarkMode = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
