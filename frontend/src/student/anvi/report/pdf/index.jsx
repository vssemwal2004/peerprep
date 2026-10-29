// Entry of the lazily loaded PDF chunk (report/download.js imports it on "Download PDF").
import { pdf } from "@react-pdf/renderer";
import logoLight from "../assets/peerprep-logo-light.png";
import logoDark from "../assets/peerprep-logo-dark.png";
import { INTER_SOURCES } from "./fonts";
import { ReportPdfDocument } from "./ReportPdf";
import { registerReportFonts } from "./registerFonts";

// Asset URLs are root-relative; react-pdf fetches them, so make them absolute against the page.
const absolute = (src) => (typeof window !== "undefined" && typeof src === "string" && src.startsWith("/") ? new URL(src, window.location.href).href : src);

/** The report content model (buildReportModel) as an A4 PDF Blob. */
export async function buildReportPdf(model) {
  registerReportFonts(Object.fromEntries(Object.entries(INTER_SOURCES).map(([key, src]) => [key, absolute(src)])));
  return pdf(<ReportPdfDocument model={model} logo={{ light: absolute(logoLight), dark: absolute(logoDark) }} />).toBlob();
}
