// Admin guides: assessments (list, builder, reports, feedback, library picker).
// Coordinators use the same pages on /coordinator/assessment*; coordinator/*.js reuses these steps.

export const assessmentListSteps = [
  {
    id: "as-title", target: "as-title", chapter: "overview",
    title: "All assessments",
    body: "Every assessment of your university in one list: drafts, scheduled, live and finished tests. Open one to view it, edit it or read its report.",
  },
  {
    id: "as-rail", target: "as-rail", chapter: "layout", quick: true,
    title: "Status and filters",
    body: "Hover this rail to open it. Pick a status (All, Ongoing, Completed, Drafts, Archived) with its count, then narrow by creation date or assessment type.",
  },
  {
    id: "as-search", target: "as-search", chapter: "parts", quick: true,
    title: "Search",
    body: "Find an assessment by its name, its ID or its type. The list updates as you type.",
  },
  {
    id: "as-sort", target: "as-sort", chapter: "parts",
    title: "Count, sort and refresh",
    body: "How many assessments match, the sort order (recently updated, oldest created, start time or name) and a refresh button to load the latest numbers.",
  },
  {
    id: "as-columns", target: "as-columns", chapter: "parts",
    title: "Columns",
    body: "Name, date, time and duration, questions and marks, completion, visibility and status. Click a heading to sort by it.",
  },
  {
    id: "as-list", target: "as-list", chapter: "parts", quick: true,
    title: "The assessment list",
    body: "Each row shows the schedule, size, how many students have completed it, whether students can see it and its status. Click a row to open it; finished tests open their report.",
  },
  {
    id: "as-row-menu", target: "as-list", chapter: "actions",
    title: "Row actions",
    body: "The three-dot menu on each row: preview, view the report, copy, edit, change the password, see or add students and sets, email eligible students, archive or restore, reset submissions, mark as complete, release answers, or delete. Risky actions ask you to confirm.",
  },
  {
    id: "as-pager", target: "as-pager", chapter: "parts",
    title: "Pages",
    body: "Move between pages of assessments and choose how many to show at once.",
  },
  {
    id: "as-create", target: "as-create", chapter: "actions", quick: true,
    title: "Create an assessment",
    body: "Opens the assessment builder. You only see this button if you are allowed to create assessments.",
  },
];

export const assessmentEditorSteps = [
  {
    id: "ae-status", target: "ae-status", chapter: "overview", quick: true,
    title: "Save status",
    body: "Under the title you see whether your changes are saved, and whether the assessment is still a draft or already published.",
  },
  {
    id: "ae-progress", target: "ae-progress", chapter: "layout", quick: true,
    title: "Six phases",
    body: "Basics, Question set, Schedule, Candidates, Settings, then Review. While creating, a phase opens once the one before it is complete; a tick marks a finished phase. When editing, you can jump to any phase.",
  },
  {
    id: "ae-details", target: "ae-details", chapter: "parts", quick: true,
    title: "Assessment details",
    body: "The name and type (required) and an optional short internal description. The assessment ID above is created for you.",
  },
  {
    id: "ae-role", target: "ae-role", chapter: "parts",
    title: "Mock role",
    body: "Prep Mocks only: the job role this mock is for, such as SDE 1 or Data Analyst. Roles students reported for the chosen company come first. Type a new role and choose Add to save it for next time. A mock needs a role before it can be published.",
  },
  {
    id: "ae-mock-pattern", target: "ae-mock-pattern", chapter: "parts",
    title: "Exam pattern",
    body: "Prep Mocks only: the exam paper students see before they start (S.No, Section, Type, Questions, Duration, Marks and a Total), written once for each company and role, with the month and year the company used it. Pick an existing version or create one; editing a pattern updates every mock that uses it, or save it as a new version. Publishing needs a pattern.",
  },
  {
    id: "ae-mock-pattern-check", target: "ae-mock-pattern-check", chapter: "parts",
    title: "Pattern check",
    body: "Prep Mocks only: compares the written pattern with your real sections and the test length. Differences are shown as warnings; the pattern is shown to students as written and publishing is not blocked.",
  },
  {
    id: "ae-mock-schedule", target: "ae-mock-schedule", chapter: "parts",
    title: "Test length",
    body: "Prep Mocks only: how long one attempt lasts. Prep Mocks have no dates: a published mock is open to every university with an active Prep Mock package until you unpublish it.",
  },
  {
    id: "ae-instructions", target: "ae-instructions", chapter: "parts",
    title: "Candidate instructions",
    body: "The platform's standard instructions are always included; open them to read what students see. Add your own instructions below; they are listed after the standard ones.",
  },
  {
    id: "ae-sets", target: "ae-sets", chapter: "parts",
    title: "Question sets",
    body: "Choose how many papers (sets) you need, then build each one. Each set card shows its questions and marks. With more than one set, all sets must carry the same total marks before you can publish.",
  },
  {
    id: "ae-add-questions", target: "ae-add-questions", chapter: "actions",
    title: "Add questions",
    body: "Create questions writes new ones (multiple choice, passage sets, short answer or coding). Add from library opens the question library to pick published questions.",
  },
  {
    id: "ae-sections", target: "ae-sections", chapter: "parts",
    title: "Sections",
    body: "Questions are grouped into sections by type. For each section set the name, marks per question and negative marks; coding marks come from each problem's hidden tests. Multiple-choice and written sections can also be filled from an Excel template.",
  },
  {
    id: "ae-pool", target: "ae-pool", chapter: "parts",
    title: "Question pool shuffle",
    body: "Optional. Upload a bigger pool and set, per question type, how many each student is shown and how many they must answer. Choose whether every student gets the same subset or their own random one; it stays fixed after refresh or resume.",
  },
  {
    id: "ae-schedule", target: "ae-schedule", chapter: "parts",
    title: "Schedule",
    body: "The start and end of the window in which students can take the test, and the duration of one attempt in minutes. You can also allow late submission after the window closes.",
  },
  {
    id: "ae-students", target: "ae-students", chapter: "parts",
    title: "Candidates",
    body: "Add students one by one, upload a CSV and review every row, or pick existing students from a saved list. Only the students you select get access to this assessment.",
  },
  {
    id: "ae-settings-tabs", target: "ae-settings-tabs", chapter: "layout",
    title: "Settings groups",
    body: "Settings come in five groups: Access, Set allocation, Proctoring, Behavior and Results. Work through them in order; the count beside Assessment controls shows how many key controls are on.",
  },
  {
    id: "ae-access", target: "ae-access", chapter: "parts",
    title: "Access",
    body: "An optional password students must enter to start, how new assessment-only accounts get their first password, and whether the test is visible to students on their dashboard.",
  },
  {
    id: "ae-allocation", target: "ae-allocation", chapter: "parts",
    title: "Set allocation",
    body: "With several sets, students are sorted and given sets in rotation. Choose the sort and starting set, allocate by semester, or override a student's set by hand. Allocations are frozen when you publish.",
  },
  {
    id: "ae-proctoring", target: "ae-proctoring", chapter: "parts",
    title: "Proctoring",
    body: "Integrity controls: environment and location checks, fullscreen, tab-switch limits, copy-paste and screenshot blocking, watermarks, question and option shuffling, camera, AI and audio monitoring. Turn on only what this test needs.",
  },
  {
    id: "ae-behavior", target: "ae-behavior", chapter: "parts",
    title: "Behavior",
    body: "How the test runs: a timer per multiple-choice question, auto-submit when time ends, security recheck time, blocking multiple tabs, locking backward navigation, section time locks and idle detection.",
  },
  {
    id: "ae-results", target: "ae-results", chapter: "parts",
    title: "Results",
    body: "Show results right after submission, or hold them until you release them from Assessment Reports. Choose what students see (correct answers, section breakdown, percentile) and whether retakes are allowed.",
  },
  {
    id: "ae-review", target: "ae-review", chapter: "parts",
    title: "Review",
    body: "A preview of the paper as students will see it. Check the questions, marks and instructions before publishing.",
  },
  {
    id: "ae-readiness", target: "ae-readiness", chapter: "parts",
    title: "Ready to publish?",
    body: "Totals for questions, candidates and duration, plus a checklist of every phase. Any phase marked Review still needs attention before you can publish.",
  },
  {
    id: "ae-actions", target: "ae-actions", chapter: "actions", quick: true,
    title: "Preview, save and publish",
    body: "Preview opens the student view. Save Draft keeps your work without publishing. Publish Assessment is enabled once every required phase is complete; it shows a final summary first, including how many coding questions are validated.",
  },
  {
    id: "ae-footer", target: "ae-footer", chapter: "actions",
    title: "Previous and Continue",
    body: "Move between phases. Continue checks the current phase and tells you what is missing. On the last phase this becomes Publish Assessment, or Save Changes for a published test.",
  },
];

export const assessmentReportSteps = [
  {
    id: "ar-title", target: "ar-title", chapter: "overview", quick: true,
    title: "Assessment reports",
    body: "Results, progress and integrity for one assessment at a time. The line under the title shows the selected assessment and its number of candidates.",
  },
  {
    id: "ar-tabs", target: "ar-tabs", chapter: "layout", quick: true,
    title: "Report sections",
    body: "Overview for the headline picture, Candidates for the full roster, Analysis for detailed charts of this assessment, and Violations for proctoring flags.",
  },
  {
    id: "ar-rail", target: "ar-rail", chapter: "layout", quick: true,
    title: "Pick an assessment",
    body: "Hover this rail to search and choose an assessment. A coloured dot shows whether it is live, scheduled or completed, with how many students attempted it.",
  },
  {
    id: "ar-pick", target: "ar-pick", chapter: "parts",
    title: "Nothing selected yet",
    body: "Choose an assessment from the list on the left (or the menu at the top on small screens) to load its report.",
  },
  {
    id: "ar-summary", target: "ar-summary", chapter: "parts",
    title: "Assessment summary",
    body: "Status, type, window, duration, questions, marks and pass mark. Full analysis jumps to the Analysis section.",
  },
  {
    id: "ar-tiles", target: "ar-tiles", chapter: "parts", quick: true,
    title: "Headline numbers",
    body: "Candidates, attempted, in progress, finished, not started, average score, pass rate and flagged sessions. The small badge shows the change since the last update. Click a tile to see those candidates.",
  },
  {
    id: "ar-completion", target: "ar-completion", chapter: "parts",
    title: "Completion",
    body: "One bar split by outcome: passed, failed, evaluating, in progress and not started. Click a label to list those candidates.",
  },
  {
    id: "ar-panels", target: "ar-panels", chapter: "parts",
    title: "Scores, top performers, integrity",
    body: "Score distribution, top performers, integrity events, candidates who need attention and live activity during the test. Use the links in each panel to open the matching list.",
  },
  {
    id: "ar-integrity", target: "ar-integrity", chapter: "parts",
    title: "Integrity summary",
    body: "On the Violations tab: total integrity events, flagged sessions, events by type and the most flagged candidate.",
  },
  {
    id: "ar-table", target: "ar-table", chapter: "parts", quick: true,
    title: "Candidate performance",
    body: "Every candidate with status, progress, score, time and flags. Search by name, roll number, email or ID, sort or filter by any column, and open a row for the full attempt.",
  },
  {
    id: "ar-views", target: "ar-views", chapter: "parts",
    title: "Quick views",
    body: "Switch between All, In progress, Finished, Not started and Flagged, each with its count.",
  },
  {
    id: "ar-table-tools", target: "ar-table-tools", chapter: "actions",
    title: "Filters, Excel and columns",
    body: "Filters narrows the roster (status, evaluation, score range, flags and student groups). Excel exports the candidate sheet. Columns chooses what the table shows.",
  },
  {
    id: "ar-release", target: "ar-release", chapter: "actions",
    title: "Release results",
    body: "If the assessment holds results, students see nothing until you choose Release results. You can withdraw a release later. If results are shown after submission, this simply says so.",
  },
  {
    id: "ar-tools", target: "ar-tools", chapter: "actions",
    title: "Live updates and downloads",
    body: "The live control shows when the data last updated and how often it refreshes (or refresh now). The report menu downloads a performance report as PDF, Excel or CSV, and Export builds a detailed workbook.",
  },
];

export const assessmentFeedbackSteps = [
  {
    id: "af-header", target: "af-header", chapter: "overview", quick: true,
    title: "Assessment feedback",
    body: "What students said about their test experience. Start from the list of assessments, then open one to read each student's response.",
  },
  {
    id: "af-summary", target: "af-summary", chapter: "parts", quick: true,
    title: "Totals",
    body: "Assessments in the list, completed attempts, feedback received and responses still pending, for the current search and dates.",
  },
  {
    id: "af-filters", target: "af-filters", chapter: "parts",
    title: "Search and dates",
    body: "Search by assessment name or limit the list to a date range. Clear resets both.",
  },
  {
    id: "af-list", target: "af-list", chapter: "parts", quick: true,
    title: "Assessments",
    body: "Each row shows the date, whether it is open or completed, completed students, feedback count, average rating and pending feedback. Click a row to open its feedback.",
  },
  {
    id: "af-detail-title", target: "af-detail-title", chapter: "overview", quick: true,
    title: "One assessment's feedback",
    body: "You are looking at one assessment. All assessments at the top takes you back to the list.",
  },
  {
    id: "af-detail-summary", target: "af-detail-summary", chapter: "parts",
    title: "Response summary",
    body: "Completed students, feedback received, feedback still pending and the average rating out of 5.",
  },
  {
    id: "af-detail-filters", target: "af-detail-filters", chapter: "parts",
    title: "Find a student",
    body: "Search by name, email or student ID, or limit to feedback sent between two dates.",
  },
  {
    id: "af-students", target: "af-students", chapter: "parts", quick: true,
    title: "Student feedback",
    body: "Every student who completed the test: score, submission time, feedback status with rating, and their comment. Click a row to read the complete response.",
  },
];

export const selectProblemSteps = [
  {
    id: "sp-header", target: "sel-header", chapter: "overview", quick: true,
    title: "Add questions from the library",
    body: "Pick published questions for the assessment you are building. The arrow goes back to the assessment without adding anything.",
  },
  {
    id: "sp-selection", target: "lib-selection", chapter: "parts", quick: true,
    title: "What you are adding to",
    body: "The assessment you are filling and a running count by question type. Questions already in it are marked Added and cannot be chosen again.",
  },
  {
    id: "sp-categories", target: "sel-categories", chapter: "parts",
    title: "Question types",
    body: "Switch between question types, each with its count. Some flows lock you to one type so sections stay clean.",
  },
  {
    id: "sp-search", target: "lib-search", chapter: "parts",
    title: "Search",
    body: "Type a title or number. Separate several with commas to find them all at once.",
  },
  {
    id: "sp-filters", target: "lib-filters", chapter: "parts",
    title: "Filters",
    body: "Narrow by difficulty, status, visibility, topics and tags to find the right questions faster.",
  },
  {
    id: "sp-table", target: "lib-table", chapter: "actions", quick: true,
    title: "Tick and add",
    body: "Tick the questions you want, then choose Add Selected at the top. They are added to the assessment, grouped by type.",
  },
];

export const mockCompaniesSteps = [
  {
    id: "pmc-header", target: "pmc-header", chapter: "overview", quick: true,
    title: "Companies and roles",
    body: "Every company a Prep Mock can be for: the companies students see on Prep Coding plus any company that already has mocks. Here you manage each company's logo and the job roles its mocks can be for.",
  },
  {
    id: "pmc-stats", target: "pmc-stats", chapter: "parts", quick: true,
    title: "Logo coverage",
    body: "How many companies there are, how many have a logo, how many still show only their initial (and how many of those have a known website), and how many companies already have mocks.",
  },
  {
    id: "pmc-find-logos", target: "pmc-find-logos", chapter: "actions", quick: true,
    title: "Find missing logos",
    body: "Looks up the logo on the website of every company that has none yet but whose website is known. It works in small batches and shows its progress; you can stop it at any time.",
  },
  {
    id: "pmc-run", target: "pmc-run", chapter: "parts",
    title: "Logo search result",
    body: "How many logos were saved, how many websites offered no usable logo, and how many companies have no known website. For those, type the website or upload a logo on the company card.",
  },
  {
    id: "pmc-toolbar", target: "pmc-toolbar", chapter: "parts",
    title: "Search, filter and sort",
    body: "Search by company name or website. Show all companies, only those with or without a logo, or only those with mocks, and sort by mocks, questions, name or missing logo first.",
  },
  {
    id: "pmc-list", target: "pmc-list", chapter: "parts", quick: true,
    title: "Company cards",
    body: "Each card shows the logo students see, the website, where the logo came from (built-in, from website or uploaded), the practice questions tagged with the company and its mocks.",
  },
  {
    id: "pmc-logo-actions", target: "pmc-logo-actions", chapter: "actions",
    title: "Logo actions",
    body: "The three-dot menu finds the logo from a website you type, uploads an image (PNG, JPEG or WebP, at least 64×64, up to 2 MB), opens the website or removes the logo. A change also updates the company's existing mocks.",
  },
  {
    id: "pmc-roles-open", target: "pmc-roles-open", chapter: "actions",
    title: "Roles of a company",
    body: "Opens the company's roles: the ones students reported after interviews there, the roles of its mocks and roles added by admins, each with its counts. Add a role to offer it when creating a mock.",
  },
];

export default [
  {
    id: "admin.prep-mock-companies",
    paths: ["/admin/prepmock/companies"],
    area: "Assessments",
    title: "Prep Mock companies & roles",
    icon: "building",
    summary: "The companies a Prep Mock can be for, their logos, and the job roles each mock can be for.",
    intro: "Students choose a company, then a role, then its mocks.\nUse this page to give every company a clean logo and to check or add the roles admins can pick when creating a mock.",
    tips: [
      "Run Find missing logos after new companies appear on Prep Coding.",
      "If a website offers no usable logo, upload a square image instead.",
      "Roles you add here appear first for that company in the mock's Role list.",
    ],
    terms: [
      { term: "Built-in logo", text: "A logo shipped with PeerPrep for well-known companies. You can replace or remove it." },
      { term: "Reported role", text: "A job title students entered when they shared an interview with this company." },
    ],
    steps: mockCompaniesSteps,
  },
  {
    id: "admin.assessments",
    paths: ["/admin/assessment"],
    area: "Assessments",
    title: "Assessments",
    icon: "clipboard",
    summary: "All assessments in one list: find, filter and open them, and manage each one from its menu.",
    intro: "This is the home of every assessment.\nFilter by status, date or type, open a test to view or edit it, and use each row's menu for students, passwords, results and more.",
    next: "admin.assessment-editor",
    tips: [
      "Finished assessments open straight into their report.",
      "Use Copy Assessment to reuse a test as the starting point for a new one.",
      "Archive hides a test from students without deleting it; Restore brings it back.",
    ],
    steps: assessmentListSteps,
  },
  {
    id: "admin.assessment-editor",
    paths: ["/admin/assessment/create", "/admin/assessment/:id", "/admin/assessment/:id/edit"],
    area: "Assessments",
    title: "Assessment builder",
    icon: "clipboard",
    summary: "Create, view or edit an assessment in six phases: basics, questions, schedule, candidates, settings and review.",
    intro: "Build an assessment step by step: name it, add questions, set the window, choose candidates, configure access, proctoring and results, then review and publish.\nYou can save a draft at any time and come back later.",
    next: "admin.assessment-reports",
    tips: [
      "Save Draft often; publishing only happens when you choose Publish Assessment.",
      "Use Preview to check the paper exactly as students see it.",
      "Coding questions must be validated before the assessment can be published.",
      "Hold results in Settings if you want to release them later from the report.",
    ],
    terms: [
      { term: "Question set", text: "One version of the paper. With several sets, each student gets one set." },
      { term: "Pool shuffle", text: "Each student gets a subset of a larger question pool instead of every question." },
    ],
    steps: assessmentEditorSteps,
  },
  {
    id: "admin.assessment-reports",
    paths: ["/admin/assessment/reports"],
    area: "Assessments",
    title: "Assessment reports",
    icon: "chart",
    summary: "Live results, candidate progress, analysis and integrity flags for one assessment, with downloads and result release.",
    intro: "Pick an assessment to see how it went, or how it is going while it is live.\nThe Overview gives the headline numbers; Candidates, Analysis and Violations go deeper.",
    next: "admin.assessment-feedback",
    tips: [
      "Click any headline tile to jump to the matching candidates.",
      "During a live test, keep the auto-refresh on to watch progress.",
      "Release results here when the assessment holds them.",
    ],
    terms: [
      { term: "Flagged session", text: "An attempt with one or more proctoring or integrity events." },
      { term: "Pass rate", text: "Graded candidates who reached the pass mark, as a share of all graded candidates." },
    ],
    steps: assessmentReportSteps,
  },
  {
    id: "admin.assessment-feedback",
    paths: ["/admin/assessment-feedback"],
    area: "Assessments",
    title: "Assessment feedback",
    icon: "feedback",
    summary: "Ratings and comments students left after their assessments, per assessment and per student.",
    intro: "Students can rate their assessment experience and leave a comment.\nUse this page to see which tests got feedback, and read every response.",
    next: "admin.assessments",
    tips: [
      "Pending feedback counts students who finished the test but have not responded yet.",
      "Filter by dates to review feedback for one placement drive.",
    ],
    steps: assessmentFeedbackSteps,
  },
  {
    id: "admin.assessment-select-problem",
    paths: ["/admin/assessment/select-problem"],
    area: "Assessments",
    title: "Add questions from library",
    icon: "library",
    summary: "Pick published library questions for the assessment you are building.",
    intro: "This picker is part of the assessment builder.\nFind questions, tick them, and add them to the assessment in one step.",
    hidden: true,
    nudge: false,
    steps: selectProblemSteps,
  },
];
