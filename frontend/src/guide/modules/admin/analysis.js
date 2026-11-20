// Admin guides: the analysis workspace (/admin/analysis/assessments) and Company Insights
// (benchmarks). Coordinators reuse the Company Insights pages; their text stays role-neutral.
// Prep Analysis (/admin/analysis) lives in home.js.

export const assessmentAnalysisSteps = [
  {
    id: "aa-title", target: "aa-title", chapter: "overview", quick: true,
    title: "Analysis workspace",
    body: "One page for evidence-based analysis of coding, assessments and learning. The title shows the current analysis type (Overview, Coding, Assessments, Learning or Students), when the data was last updated and how many students are in scope.",
  },
  {
    id: "aa-filters", target: "aa-filters", chapter: "actions", quick: true,
    title: "Choose what to analyse",
    body: "Filters opens a four-step panel: the analysis type, the students (all, selected, top or bottom performers, or cohort filters), the evidence and date window, and an optional group comparison. Before you apply, it shows how many students will be analysed.",
    tryIt: "Click Filters",
  },
  {
    id: "aa-refresh", target: "aa-refresh", chapter: "actions",
    title: "Refresh",
    body: "Reloads the analysis with the current filters, for example after students finish a test.",
  },
  {
    id: "aa-download", target: "aa-download", chapter: "actions",
    title: "Download a report",
    body: "Builds a report from exactly what you see: pick its purpose (executive summary, student, topic, assessment, learning, coding or full), Excel or PDF, the table columns and sort order, and whether to include the summary page and charts.",
  },
  {
    id: "aa-scope", target: "aa-scope", chapter: "parts", quick: true,
    title: "Active scope",
    body: "Every filter in force, including the date window, as chips. Click a chip to remove that filter, or Clear all to go back to the defaults for the current analysis type. The number on the right is how many evidence rows the analysis uses.",
  },
  {
    id: "aa-summary", target: "aa-summary", chapter: "parts", quick: true,
    title: "Executive snapshot",
    body: "The headline outcomes for the selected students and evidence, one card per measure with a short note on what it counts.",
  },
  {
    id: "aa-notes", target: "aa-notes", chapter: "parts",
    title: "Evidence notes",
    body: "Warnings about the data behind this view, such as limited evidence. If a refresh fails, the last good result stays on screen and this note says so.",
  },
  {
    id: "aa-insights", target: "aa-insights", chapter: "parts",
    title: "Actionable insights",
    body: "Up to three priorities drawn from the evidence in the current filters, each with how much evidence supports it and a confidence label. View all lists every insight, the areas needing attention and the supporting measures.",
  },
  {
    id: "aa-graphs", target: "aa-graphs", chapter: "parts", quick: true,
    title: "Recommended charts",
    body: "Up to four charts chosen automatically for the analysis type and filters. Each card states the question it answers and a one-line insight. Use the info button to learn how to read it, and the expand button for the full chart, a breakdown, the detailed data table and the method.",
  },
  {
    id: "aa-empty", target: "aa-empty", chapter: "parts",
    title: "No charts for this scope",
    body: "No chart has enough evidence for the current filters. Missing data is not shown as zero on purpose. Widen the date range or choose another source with Adjust filters.",
  },
  {
    id: "aa-tip-scope", chapter: "tips",
    title: "Start broad, then narrow",
    body: "Begin with all students and a wide date window, read the snapshot and insights, then use Filters to focus on a batch, an assessment or students who need support.",
  },
];

export const companyInsightsSteps = [
  {
    id: "ci-title", target: "ci-title", chapter: "overview", quick: true,
    title: "Company benchmarks",
    body: "A benchmark describes what one company expects: DSA accuracy, key topics, a practice streak and an interview score. Benchmarks are used for readiness analytics, so students can be compared with each company's bar.",
  },
  {
    id: "ci-add", target: "ci-add", chapter: "actions", quick: true,
    title: "Add benchmarks",
    body: "Opens the Add Benchmark page, where you can upload many companies from a CSV file or add one company with a form.",
  },
  {
    id: "ci-refresh", target: "ci-refresh", chapter: "actions",
    title: "Refresh",
    body: "Reloads the list, for example after a bulk upload in another tab.",
  },
  {
    id: "ci-search", target: "ci-search", chapter: "parts",
    title: "Find a company",
    body: "Type part of a company name to filter the table. The total above the table counts the companies that match.",
  },
  {
    id: "ci-table", target: "ci-table", chapter: "parts", quick: true,
    title: "Benchmark table",
    body: "One row per company: required DSA accuracy, the first key topics, minimum streak days and interview score, with the minimum question attempts under the name. Click a column header to sort.\nThe ⋮ button on a row edits the benchmark or deletes it after you confirm.",
  },
  {
    id: "ci-pager", target: "ci-pager", chapter: "parts",
    title: "Pages",
    body: "Move between pages of companies and choose how many rows to show at once.",
  },
];

export const benchmarkAddSteps = [
  {
    id: "cb-title", target: "cb-title", chapter: "overview", quick: true,
    title: "Two ways to add",
    body: "Upload many companies at once from a CSV file on the left, or fill in the form on the right to add one company.",
  },
  {
    id: "cb-upload", target: "cb-upload", chapter: "parts", quick: true,
    title: "Bulk upload",
    body: "Drag a CSV file onto the box or click Select CSV. The upload starts straight away; afterwards you see how many rows were imported or skipped, with the problem for each skipped row.",
  },
  {
    id: "cb-template", target: "cb-template", chapter: "actions",
    title: "Start from the template",
    body: "Downloads a CSV with the right columns. Fill one company per row and upload it, so the file matches what the importer expects.",
  },
  {
    id: "cb-upload-result", target: "cb-upload-result", chapter: "parts",
    title: "Upload result",
    body: "Imported and skipped row counts for the last file, and the row number, company and issues for each row that was skipped. Fix those rows and upload them again.",
  },
  {
    id: "cb-validation", target: "cb-validation", chapter: "parts",
    title: "Weight check",
    body: "The total of the three weights in the form. Keep it close to 1.00 so the readiness score stays balanced.",
  },
  {
    id: "cb-basic", target: "cb-basic", chapter: "parts",
    title: "Company name",
    body: "The company this benchmark is for. It is required.",
  },
  {
    id: "cb-dsa", target: "cb-dsa", chapter: "parts", quick: true,
    title: "DSA requirements",
    body: "Minimum accuracy (0 to 100 percent), minimum question attempts, and the required topics. Pick topics from the list or type your own and press Add Topic; at least one topic is required.",
  },
  {
    id: "cb-consistency", target: "cb-consistency", chapter: "parts",
    title: "Consistency and interview",
    body: "Minimum streak days sets how regularly students should practise. The Interview card below it sets the minimum interview score, from 0 to 100.",
  },
  {
    id: "cb-weights", target: "cb-weights", chapter: "parts",
    title: "Weights",
    body: "How much DSA, consistency and interview each count, from 0 to 1. The total turns amber when it is far from 1.00; you can still save, but check the balance.",
  },
  {
    id: "cb-actions", target: "cb-actions", chapter: "actions", quick: true,
    title: "Save or reset",
    body: "Save Benchmark checks the form, highlights any field that needs fixing, and saves the company. The form then clears for the next one. Reset Form clears it without saving.",
  },
];

export default [
  {
    id: "admin.assessment-analysis",
    paths: ["/admin/analysis/assessments"],
    area: "Analysis & reports",
    title: "Analysis workspace",
    icon: "chart",
    summary: "Evidence-based analysis of coding, assessments and learning, with filters, insights, charts and downloadable reports.",
    intro: "This workspace answers questions about your students from recorded evidence: practice, assessments and learning.\nChoose the analysis and the students with Filters, read the snapshot and insights, open any chart for its data, and download a report.",
    next: "admin.company-insights",
    tips: [
      "Remove a filter by clicking its chip in the Active scope bar.",
      "Each chart's info button explains how to read it.",
      "Downloads use the same filters as the page, so set the scope first.",
    ],
    terms: [
      { term: "Evidence", text: "Recorded student activity (submissions, assessment attempts, learning progress) that an analysis is built from." },
    ],
    steps: assessmentAnalysisSteps,
  },
  {
    id: "admin.company-insights",
    paths: ["/admin/company-insights"],
    area: "Analysis & reports",
    title: "View Benchmarks",
    icon: "building",
    summary: "Search, sort, edit and delete the company benchmarks used for readiness analytics.",
    intro: "Company Insights keeps one benchmark per company: what it expects in DSA accuracy, topics, consistency and interviews.\nUse this list to keep benchmarks up to date; add new ones from Add Benchmark.",
    next: "admin.company-benchmark-add",
    tips: [
      "Sort by DSA Accuracy to see the most demanding companies first.",
      "Edit opens the same form as Add Benchmark, filled in.",
      "Deleting a benchmark cannot be undone.",
    ],
    terms: [
      { term: "Benchmark", text: "A company's expected levels for DSA accuracy, topics, practice streak and interview score, with weights for each." },
    ],
    steps: companyInsightsSteps,
  },
  {
    id: "admin.company-benchmark-add",
    paths: ["/admin/company-insights/add"],
    area: "Analysis & reports",
    title: "Add Benchmark",
    icon: "building",
    summary: "Add company benchmarks one by one or in bulk from a CSV file.",
    intro: "Add the companies your students prepare for, with the levels each one expects.\nUse the CSV upload for many companies at once, or the form for a single company.",
    next: "admin.company-insights",
    tips: [
      "Download the template before your first bulk upload.",
      "Keep the three weights adding up to about 1.00.",
      "Skipped rows are listed with their row number, so you can fix and re-upload only those.",
    ],
    steps: benchmarkAddSteps,
  },
];
