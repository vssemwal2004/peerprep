// Palette and type scale of the ANVI report PDF: PeerPrep blue (the logo's #00A1DB) as the one primary,
// slate greys, and green / amber / red only for values that mean something. Same roles as the screen (styles.js).
export const C = Object.freeze({
  brand: "#00A1DB",
  brand600: "#0089BD",
  brand700: "#006E99",
  brand50: "#EAF6FC",
  brand100: "#D3ECF8",
  cover: "#082F49",
  coverText: "#E0F2FE",
  coverMuted: "#93C5E4",
  ink: "#0F172A",
  body: "#334155",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E2E8F0",
  hairline: "#EEF2F6",
  surface: "#F8FAFC",
  track: "#E9EEF4",
  white: "#FFFFFF",
});

export const TONE = Object.freeze({
  brand: { fg: C.brand700, bg: C.brand50, border: C.brand100, solid: C.brand },
  positive: { fg: "#047857", bg: "#ECFDF5", border: "#A7F3D0", solid: "#059669" },
  caution: { fg: "#B45309", bg: "#FFFBEB", border: "#FDE68A", solid: "#D97706" },
  critical: { fg: "#BE123C", bg: "#FFF1F2", border: "#FECDD3", solid: "#E11D48" },
  neutral: { fg: "#475569", bg: "#F1F5F9", border: "#E2E8F0", solid: "#94A3B8" },
});
export const toneOf = (tone) => TONE[tone] || TONE.neutral;

export const VERDICT_TONE = Object.freeze({ matched: TONE.positive, partial: TONE.caution, missed: TONE.critical });

export const FONT = "PeerPrep Inter";

// A4 in points; side margins and the room kept for the running header and footer.
export const PAGE = Object.freeze({ width: 595.28, height: 841.89, side: 40, top: 62, bottom: 58 });
