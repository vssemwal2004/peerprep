// The page tour: Prep Analysis as a whole, for an admin's first visit. Targets are "#name"
// (data-tour on the page) or the first chart card on the page.
import { findElement } from "../targets.js";

const firstCard = () => document.querySelector("[data-chart-id]");
const firstGuideButton = () => firstCard()?.querySelector('[aria-label^="Guide:"]') || null;

export const PAGE_TOUR_ID = "page:tour";

export const pageTourSteps = () => [
  { id: "welcome", chapter: "page", target: null, quick: true, title: "Welcome to Prep Analysis",
    body: "One page to see how your students prepare: coding, Quick Prep sheets, learning, interviews and tests.\nThis 2-minute tour shows where everything is. Use Next or the → key; Esc closes it any time." },
  { id: "areas", chapter: "page", target: "#areas", title: "Pick a feature",
    body: "Each tab is one part of PeerPrep. “All” shows a summary of every feature; the others show that feature's full set of charts." },
  { id: "period", chapter: "page", target: "#period", title: "Choose the period",
    body: "Every number on the page follows this period: this week, last 30 days, this semester, all time, or your own dates." },
  { id: "filters", chapter: "page", target: "#filters", title: "Filter the students",
    body: "Narrow the page to a semester, branch, section, group or any condition (e.g. “Prep Score under 10”). The count shows how many students are in view." },
  { id: "kpis", chapter: "page", target: "#kpis", title: "Headline numbers",
    body: "The key counts for this feature. Click a number to show only those students (click again to undo). Hover ⓘ on a card to see exactly how it is counted." },
  { id: "card", chapter: "page", target: firstCard, title: "Every chart answers one question",
    body: "Its title says what it shows, the blue line under it says what stands out, and the number at the bottom says how many students it is about." },
  { id: "guide", chapter: "page", target: firstGuideButton, title: "Every chart has a guide",
    body: "Click ⓘ on any chart for a Quick look (about a minute) or a Deep dive that lights up each part and explains it. A blue dot means you have not taken it yet; “New” means the chart changed." },
  { id: "click", chapter: "page", target: () => firstCard()?.querySelector('[data-tour="body"]') || null, title: "Click anything to see who",
    body: "Click a bar, slice, bubble, row or gap: a list opens with exactly those students, ready to download, email or use as a filter for the whole page." },
  { id: "compare", chapter: "page", target: "#compare", title: "Compare groups",
    body: "Put two groups side by side (e.g. CSE vs ECE, or Semester 5 vs 7): every chart and headline number shows both." },
  { id: "views", chapter: "page", target: "#views-menu", title: "Save your view",
    body: "Saves the current filters, period and charts under a name, for you or shared with other admins." },
  { id: "charts", chapter: "page", target: "#charts-button", title: "Choose the charts",
    body: "Add, remove, reorder and resize charts. Your layout is remembered." },
  { id: "download", chapter: "page", target: "#page-download", title: "Download a report",
    body: "Download the students in view as Excel, CSV or PDF with the columns you pick. Each chart's ⋯ menu also downloads its own students." },
  { id: "table", chapter: "page", target: "#student-table", title: "Every student, one table",
    body: "At the bottom: every student in view, sortable and searchable. Click a name for their full profile; tick students to email them." },
  { id: "help", chapter: "page", target: "#help", title: "Help is always here",
    body: "The Guide button lists this tour, every chart's guide and your getting-started checklist." },
];

/** The page tour, with only the steps whose part is on this page right now. */
export function buildPageTour() {
  const steps = pageTourSteps().filter((step) => {
    if (!step.target) return true;
    if (typeof step.target === "string") return Boolean(findElement(step.target, null));
    try { return Boolean(step.target()); } catch { return false; }
  });
  return { id: PAGE_TOUR_ID, key: `page:${Date.now()}`, title: "Prep Analysis · Page tour", milestone: "pageTour", steps, ctx: { root: null } };
}
