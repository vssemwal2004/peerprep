// Admin guides: the Overview (home) and Prep Analysis (which runs its own, deeper guides).
// Coordinators share the Overview page; coordinator/pages.js reuses these steps.

export const overviewSteps = [
  {
    id: "ov-menu", target: "app-nav", chapter: "layout", quick: true,
    title: "Your menu",
    body: "Every area of PeerPrep lives here: students, assessments, the question library, Quick Prep, interviews, learning, analysis and settings. Hover the rail to open it, or pin it with the round button on its edge.",
  },
  {
    id: "ov-title", target: "ov-title", chapter: "overview",
    title: "Your home page",
    body: "The Overview answers one question: how are your students doing right now, and what needs you? It refreshes by itself every few minutes.",
  },
  {
    id: "ov-search", target: "ov-search", chapter: "actions", quick: true,
    title: "Find any student fast",
    body: "Type a name, roll number or email to jump straight to that student's profile, without opening the student list first.",
  },
  {
    id: "ov-period", target: "ov-period", chapter: "actions",
    title: "Choose the period",
    body: "The trend chart, module panels and their totals follow this period (last 30 days by default). Pick 7 days to see this week, or a custom range.",
  },
  {
    id: "ov-create", target: "ov-create", chapter: "actions", quick: true,
    title: "Create",
    body: "Start the common jobs from one button: add students, a new assessment, an interview event, an AI interview or an announcement. You only see what you are allowed to create.",
  },
  {
    id: "ov-stats", target: "ov-stats", chapter: "parts",
    title: "The four numbers that matter today",
    body: "Open items waiting on you, what is coming up, students active today and new students. Click one to jump to the matching list or section.",
  },
  {
    id: "ov-shortcuts", target: "ov-shortcuts", chapter: "layout",
    title: "Shortcuts",
    body: "The pages you open most, one click away: students, Prep Analysis, reports, the library, interviews, learning and more.",
  },
  {
    id: "ov-kpis", target: "ov-kpis", chapter: "parts", quick: true,
    title: "Headline cards",
    body: "Students, how many were active this week, average Prep Score, coding acceptance, assessment average, interviews and topics completed. The small line shows the trend; the arrow compares with the previous week. Click a card for the detail page.",
  },
  {
    id: "ov-trend", target: "ov-trend", chapter: "parts",
    title: "Engagement trend",
    body: "Daily student actions per module over the period. A drop on one line tells you which module lost attention. Hover a day for exact numbers.",
  },
  {
    id: "ov-today", target: "ov-today", chapter: "parts",
    title: "Today at a glance",
    body: "Today's activity in each module and student sign-ins, compared with yesterday, so you notice a quiet day early.",
  },
  {
    id: "ov-attention", target: "ov-attention", chapter: "parts", quick: true,
    title: "Needs attention",
    body: "Open items you can act on, like feedback to review or tests waiting for results. Each row opens the page where you can deal with it. Green means nothing is waiting.",
  },
  {
    id: "ov-modules", target: "ov-modules", chapter: "parts",
    title: "Module panels",
    body: "A short summary per module (coding, assessments, interviews, learning) for the period, each with a link into its full page.",
  },
  {
    id: "ov-upcoming", target: "ov-upcoming", chapter: "parts",
    title: "Upcoming schedule",
    body: "Assessments and interview events that are about to start or are live now, soonest first. Click one to open it.",
  },
  {
    id: "ov-top", target: "ov-top", chapter: "parts",
    title: "Top students",
    body: "The students with the highest Prep Score right now. Prep Analysis has the full picture, with filters and student lists.",
  },
  {
    id: "ov-recent", target: "ov-recent", chapter: "parts",
    title: "Recent activity",
    body: "The latest changes made on the platform (students added, tests created, settings changed), with who made them and when. All activity opens the full log.",
  },
  {
    id: "ov-guides", target: "app-guides", chapter: "tips", quick: true,
    title: "Guides for every page",
    body: "Every page has an ⓘ next to its title with a quick look and a full tour. Guides lists them all, grouped like the menu, with what you have explored.",
  },
];

export default [
  {
    id: "admin.overview",
    paths: ["/admin", "/admin/overview", "/admin/dashboard"],
    area: "Get started",
    title: "Overview",
    icon: "dashboard",
    summary: "Your university at a glance: activity, headline numbers, what needs you, what is coming up and recent changes.",
    intro: "Welcome to PeerPrep! The Overview is your home page.\nIt shows how students are doing across every module, what is waiting on you, and the fastest way to the common jobs.",
    next: "admin.students",
    deployment: "university",
    tips: [
      "Click any headline card to open the page behind its number.",
      "Use the search box to open a student's profile in one step.",
      "Prep Analysis (in the menu) goes much deeper, with filters, charts and student lists you can email or download.",
    ],
    steps: overviewSteps,
  },
  {
    id: "admin.prep-analysis",
    paths: ["/admin/analysis"],
    area: "Analysis & reports",
    title: "Prep Analysis",
    icon: "chart",
    summary: "Deep analysis of coding, Quick Prep, learning, interviews and assessments, with filters, charts, student lists, email and downloads.",
    intro: "Prep Analysis has its own detailed guides: a page tour, a guide on every chart's ⓘ, and a getting-started checklist in its header.",
    delegate: "prepAnalysis",
    nudge: false,
  },
];
