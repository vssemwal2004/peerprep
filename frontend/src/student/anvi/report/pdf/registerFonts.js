import { Font } from "@react-pdf/renderer";
import { FONT } from "./theme";

let registered = "";
/**
 * Registers Inter for the report PDF under its own family name (the resume PDF's fonts are untouched).
 * `sources`: { regular, medium, semibold, bold } as URLs (app) or file paths / buffers (Node).
 */
export function registerReportFonts(sources) {
  const key = JSON.stringify(sources);
  if (registered === key) return;
  Font.register({
    family: FONT,
    fonts: [
      { src: sources.regular, fontWeight: 400 },
      { src: sources.medium, fontWeight: 500 },
      { src: sources.semibold, fontWeight: 600 },
      { src: sources.bold, fontWeight: 700 },
    ],
  });
  registered = key;
}
