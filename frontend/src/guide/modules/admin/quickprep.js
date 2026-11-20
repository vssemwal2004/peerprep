// Quick Prep guides: the list of all QuickPreps, the three-step builder and the detail page.
// See src/guide/platform/registry.js for the module format.

export const quickPrepListSteps = [
  {
    id: "qpl-header", target: "qpl-header", chapter: "overview", quick: true,
    title: "What QuickPrep is",
    body: "A QuickPrep is a curated set of library questions for focused practice: a company set, a topic track, a study plan or a difficulty ladder. Students earn its XP and badge when they solve every question in it.",
  },
  {
    id: "qpl-create", target: "qpl-create", chapter: "actions", quick: true,
    title: "Create a QuickPrep",
    body: "Opens the builder: describe the set, add questions from the library, then choose the audience and publish. Nothing is shown to students until you publish.",
  },
  {
    id: "qpl-analysis", target: "qpl-analysis", chapter: "actions",
    title: "Analysis",
    body: "Opens the Quick Prep view of Prep Analysis, where you compare how students are progressing across all QuickPreps with filters and charts.",
  },
  {
    id: "qpl-stats", target: "qpl-stats", chapter: "parts",
    title: "Counts at a glance",
    body: "How many QuickPreps you have (archived ones are counted separately), how many are published and visible to students, how many are still drafts, and how many students have started one, with total completions.",
  },
  {
    id: "qpl-filters", target: "qpl-filters", chapter: "parts", quick: true,
    title: "Find a QuickPrep",
    body: "Switch between All, Published, Draft and Archived (All hides archived sets), pick a type, or search by name, company or topic. The table updates as you type.",
    tryIt: "Click a status, such as Draft",
  },
  {
    id: "qpl-table", target: "qpl-table", chapter: "parts", quick: true,
    title: "All QuickPreps",
    body: "Each row shows the type, companies and topics, question count, audience, how many students started and finished, average progress, status and start/end window. Click a row to open its detail page; More shows a quick summary.\nThe ⋮ menu at the end of a row edits, adds questions, publishes or unpublishes, duplicates, archives or removes it.",
  },
  {
    id: "qpl-remove", chapter: "tips",
    title: "Remove keeps progress",
    body: "Removing a QuickPrep that students have already started archives it instead of deleting it, so their progress is kept. Only a draft nobody has started is deleted for good.",
  },
];

export const quickPrepWizardSteps = [
  {
    id: "qpw-header", target: "qpw-header", chapter: "overview",
    title: "Build a QuickPrep",
    body: "Three short steps: describe the set, add and order its questions, then choose who sees it and publish. When editing, the status pill on the right shows whether it is live.",
  },
  {
    id: "qpw-steps", target: "qpw-steps", chapter: "layout", quick: true,
    title: "The three steps",
    body: "Details, Questions, and Audience & publish. A new QuickPrep is created as a draft when you finish Details; after that you can jump between steps. A green tick marks a finished step.",
  },
  {
    id: "qpw-details", target: "qpw-details", chapter: "parts", quick: true,
    title: "Details",
    body: "Give it a clear name (at least 3 characters) and a short description of what students practise. Students see the name, description, companies and topics on the QuickPrep card.",
  },
  {
    id: "qpw-tags", target: "qpw-tags", chapter: "parts",
    title: "Type, companies, topics, difficulty",
    body: "The type says what kind of set it is (company, topic, study plan or difficulty). Companies and topics come from published library questions and describe the set; leave them empty for all. Difficulty focus is shown to students as the level to expect.",
  },
  {
    id: "qpw-colour", target: "qpw-colour", chapter: "parts",
    title: "Card colour",
    body: "Pick the colour of the card students see, so related sets are easy to tell apart.",
  },
  {
    id: "qpw-preview", target: "qpw-preview", chapter: "parts",
    title: "Student preview",
    body: "A live preview of the card as it appears on the student QuickPrep page and dashboard. It updates as you type.",
  },
  {
    id: "qpw-summary", target: "qpw-summary", chapter: "parts",
    title: "What the set covers",
    body: "Question count, the Easy/Medium/Hard mix, and the topics and companies covered by the questions you added. Questions unpublished in the library are counted as unavailable.",
  },
  {
    id: "qpw-questions", target: "qpw-questions", chapter: "parts", quick: true,
    title: "Questions and their order",
    body: "Students solve the questions in this order. Use the arrows to move a question, the × to remove it, and the Section box to group questions, for example by week. Tick several to set a section or remove them together.",
  },
  {
    id: "qpw-library", target: "qpw-library", chapter: "actions",
    title: "Add from the library",
    body: "Saves your changes and opens the question library in picking mode. Tick coding questions there and choose Add to QuickPrep; you come back here with a note of how many were added.",
  },
  {
    id: "qpw-order", target: "qpw-order", chapter: "parts",
    title: "Sorting is only a view",
    body: "Click a column header to sort the table for checking. Reordering works on the real student order, so clear the column sort before using the arrows.",
  },
  {
    id: "qpw-audience", target: "qpw-audience", chapter: "parts", quick: true,
    title: "Audience",
    body: "Choose which semesters see this QuickPrep, or All semesters. Students outside the chosen semesters do not see it at all.",
  },
  {
    id: "qpw-window", target: "qpw-window", chapter: "parts",
    title: "Start and end time",
    body: "Optional, in your local time. Students can start the set only inside this window, and solves after the end do not count. Clear removes the window.",
  },
  {
    id: "qpw-reward", target: "qpw-reward", chapter: "parts",
    title: "Completion reward",
    body: "XP given when a student solves every question, plus an optional badge name. The XP counts toward the student's level and rank, and the badge joins their profile.",
  },
  {
    id: "qpw-checks", target: "qpw-checks", chapter: "parts",
    title: "Ready to publish?",
    body: "A checklist of what must be right before publishing: a name, at least one available question and a valid time window. Amber items are warnings, such as questions hidden because they are unpublished in the library.",
  },
  {
    id: "qpw-footer", target: "qpw-footer", chapter: "actions",
    title: "Save and move on",
    body: "Details and Questions save your changes before moving on. On the last step, Save as draft keeps it hidden, Publish makes it live for the chosen audience, and Unpublish turns a live set back into a draft.",
  },
];

export const quickPrepViewSteps = [
  {
    id: "qpv-hero", target: "qpv-hero", chapter: "overview", quick: true,
    title: "This QuickPrep",
    body: "Its type, status and start/end window, with the name and description students see.",
  },
  {
    id: "qpv-actions", target: "qpv-actions", chapter: "actions", quick: true,
    title: "Manage it",
    body: "Edit opens the builder, Add questions opens the library in picking mode, and Publish or Unpublish changes whether students see it. The ⋮ menu also duplicates, archives or removes it.",
  },
  {
    id: "qpv-report", target: "qpv-report", chapter: "actions",
    title: "Performance report",
    body: "Download a performance report for this QuickPrep as PDF, Excel or CSV.",
  },
  {
    id: "qpv-setup", target: "qpv-setup", chapter: "parts",
    title: "Setup",
    body: "Companies, topics, audience, reward, created and published dates, the start/end window, the student link and the difficulty mix, all in one place.",
  },
  {
    id: "qpv-visibility", target: "qpv-visibility", chapter: "parts", quick: true,
    title: "Can students see it?",
    body: "Says in plain words whether the set is live and how many students can see it. If not, it lists why: still a draft or archived, no available questions, or no students in the chosen semesters.",
  },
  {
    id: "qpv-stats", target: "qpv-stats", chapter: "parts", quick: true,
    title: "Reach and progress",
    body: "Questions, audience, how many started (and what share of the audience that is), how many completed, average progress and the XP awarded so far.",
  },
  {
    id: "qpv-tabs", target: "qpv-tabs", chapter: "parts",
    title: "Questions or students",
    body: "Questions shows each question in student order with how many solved it, how many are still attempting it and its solve rate. Students shows everyone who started.",
    tryIt: "Click Students",
  },
  {
    id: "qpv-details", target: "qpv-details", chapter: "parts",
    title: "Find the hard questions",
    body: "A low solve rate points to a question where students get stuck. Questions struck through are unpublished in the library and hidden from students.",
  },
  {
    id: "qpv-students-tools", target: "qpv-students-tools", chapter: "actions",
    title: "Follow up with students",
    body: "Search by name, email or student ID, filter to In progress or Completed, and export the current list as CSV, with progress, solved and attempted counts and dates.",
  },
];

export default [
  {
    id: "admin.quickprep",
    paths: ["/admin/quickprep"],
    area: "Quick Prep",
    title: "QuickPrep",
    icon: "zap",
    summary: "Every QuickPrep set in one table, with its reach, progress and status, and the actions to manage it.",
    intro: "QuickPreps are curated question sets students work through at their own pace.\nThis page lists them all, shows how far students have got, and is where you create, publish and archive them.",
    next: "admin.quickprep-wizard",
    tips: [
      "Duplicate a successful QuickPrep to make a variation quickly; the copy starts as a draft.",
      "A QuickPrep with no available questions cannot be published.",
      "Use Analysis for cross-set trends, and a QuickPrep's own page for per-question detail.",
    ],
    steps: quickPrepListSteps,
  },
  {
    id: "admin.quickprep-wizard",
    paths: ["/admin/quickprep/new", "/admin/quickprep/:id/edit"],
    area: "Quick Prep",
    title: "Create or edit a QuickPrep",
    icon: "sparkles",
    summary: "The three-step builder: details, questions from the library, then audience, window, reward and publishing.",
    intro: "Build a QuickPrep in three steps.\nDescribe it, add and order questions from the library, then choose who sees it, when, and what they earn for finishing.",
    next: "admin.library",
    tips: [
      "Use sections such as Week 1, Week 2 to turn a long set into a paced plan.",
      "Save as draft until the checklist is green, then publish.",
      "Questions unpublished in the library stay in the set but are hidden from students.",
    ],
    steps: quickPrepWizardSteps,
  },
  {
    id: "admin.quickprep-view",
    paths: ["/admin/quickprep/:id"],
    area: "Quick Prep",
    title: "QuickPrep details",
    icon: "chart",
    summary: "One QuickPrep's setup, whether students can see it, and how every question and student is doing.",
    intro: "Everything about one QuickPrep.\nCheck that it is live, see how far students have got, find the questions they get stuck on, and follow up with individual students.",
    openFrom: "admin.quickprep",
    next: "admin.quickprep",
    tips: [
      "If the amber notice is showing, students cannot see this set yet; it says what to fix.",
      "Export the Students list to follow up with those still in progress.",
    ],
    steps: quickPrepViewSteps,
  },
];
