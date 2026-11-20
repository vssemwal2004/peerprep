// Admin guides: the question library (LibraryWorkspace) and its editors and coding preview.
// Coordinators use the same pages on /coordinator/library/*; coordinator/*.js reuses these steps.
// `coordinatorCodingAnalytics` is the coordinator-only coding analytics view of the same workspace;
// it is exported by name (not in the admin list) for the coordinator guides.

export const libraryListSteps = [
  {
    id: "lib-rail", target: "lib-rail", chapter: "layout", quick: true,
    title: "Library sections",
    body: "Hover this rail to open it. The question bank lists each format (coding, multiple choice, short answer, one word) with its count, plus Drafts for unfinished work. Pick a format to show only those questions.",
  },
  {
    id: "lib-header", target: "lib-header", chapter: "overview",
    title: "The question library",
    body: "One bank of reusable questions for assessments and Quick Prep. The title changes with what you are doing, for example Draft questions, or Add questions to assessment when you came here to pick questions.",
  },
  {
    id: "lib-drafts", target: "lib-drafts", chapter: "parts",
    title: "Draft questions",
    body: "Drafts are saved but not ready for use. From here you can preview them, continue editing, publish them or delete them. Students and assessments only get published questions.",
  },
  {
    id: "lib-selection", target: "lib-selection", chapter: "parts",
    title: "Picking for an assessment",
    body: "You opened the library from an assessment. Tick the questions you want and choose Add selected. Questions already in the assessment are marked Added and cannot be picked again.",
  },
  {
    id: "lib-quickprep", target: "lib-quickprep", chapter: "parts",
    title: "Picking for Quick Prep",
    body: "You opened the library from a Quick Prep sheet. Tick coding questions on any page, then choose Add to QuickPrep. Only published, public questions with a runnable problem can be added.",
  },
  {
    id: "lib-search", target: "lib-search", chapter: "parts", quick: true,
    title: "Search by name or number",
    body: "Type a title or a question number. Separate several with commas (for example 1, 15, two sum) to find them all at once; terms that match nothing are listed under the box.",
  },
  {
    id: "lib-number-kind", target: "lib-number-kind", chapter: "parts",
    title: "Which number you mean",
    body: "A typed number can be a PeerPrep number (PrepCode) or the original source number (CodeLe). This switch decides which one a plain number means. Writing \"pp 2\" or \"lc 2\" always works, whatever the switch says.",
  },
  {
    id: "lib-filters", target: "lib-filters", chapter: "parts", quick: true,
    title: "Filters",
    body: "Opens the filter panel: difficulty, status, visibility and the assessment a question came from. On the coding page you can also filter by topics and tags, and show results as topic or tag folders. The badge counts the active filters.",
  },
  {
    id: "lib-active-filters", target: "lib-active-filters", chapter: "parts",
    title: "Active filters",
    body: "Every filter in use, with the number of results. Click a chip to remove that filter, or Clear all to start again.",
  },
  {
    id: "lib-columns", target: "lib-columns", chapter: "parts",
    title: "Choose columns",
    body: "Show or hide difficulty, tags and topics, where a question is used and when it was last updated. Your choice is saved in this browser; Restore defaults brings back the standard set.",
  },
  {
    id: "lib-sort", target: "lib-sort", chapter: "parts",
    title: "Sort the list",
    body: "Order by recently updated, recently created, question A to Z or difficulty. Coding questions can also follow the question sequence. You can sort by clicking a column heading too.",
  },
  {
    id: "lib-table", target: "lib-table", chapter: "parts", quick: true,
    title: "The question list",
    body: "Each row shows the number, title, status, who added it, type, difficulty, tags and the assessments it is used in. Click a row or the eye to preview it as a candidate sees it (coding questions open the solving preview). The three-dot menu edits, publishes, hides, changes visibility or deletes.",
  },
  {
    id: "lib-pager", target: "lib-pager", chapter: "parts",
    title: "Pages",
    body: "Move between pages of results and change how many rows a page shows. Filters and search apply to every page.",
  },
  {
    id: "lib-create", target: "lib-create", chapter: "actions", quick: true,
    title: "Create a question",
    body: "Choose a format: multiple choice, short answer, one word or a coding problem. The editor opens over the list. You only see the formats you are allowed to create.",
  },
  {
    id: "lib-select", target: "lib-select", chapter: "actions",
    title: "Bulk actions",
    body: "Select turns on checkboxes. Pick questions on this page or all matches, then use the menu beside it to publish, move to draft, make public or private, hide or delete them in one go. Each bulk action asks you to confirm first.",
  },
  {
    id: "lib-shared-tip", chapter: "tips",
    title: "Shared questions",
    body: "Rows marked Shared come from the platform's shared bank. You can preview and use them but not edit them directly. Where the row menu offers Make local copy, it creates your own editable draft.",
  },
];

export const questionEditorSteps = [
  {
    id: "qe-header", target: "lib-editor-header", chapter: "overview", quick: true,
    title: "Question editor",
    body: "The editor opens as a panel over the library. The title shows the format you are creating or editing. Close it with the X; if you have unsaved work, you are asked whether to save it as a draft first.",
  },
  {
    id: "qe-summary", target: "qe-summary", chapter: "layout",
    title: "What you are building",
    body: "The format and a running count: how many questions are in this set and how many are ready. For multiple choice it also counts independent questions and passage sets.",
  },
  {
    id: "qe-tools", target: "qe-tools", chapter: "actions",
    title: "Import and preview",
    body: "Import adds many questions at once from a CSV or Excel sheet. Preview shows the questions exactly as a candidate sees them; answers you click there are not saved.",
  },
  {
    id: "qe-library-copy", target: "qe-library-copy", chapter: "parts",
    title: "Keep a library copy",
    body: "Shown when you create questions from an assessment. On: a reusable copy stays in the library even if the assessment is deleted. Off: the questions belong to this assessment only.",
  },
  {
    id: "qe-steps", target: "qe-steps", chapter: "layout", quick: true,
    title: "Three steps",
    body: "Question content, Answer setup, then Scoring & settings. Click a step to jump to it, or use Next and Previous at the bottom. A tick shows a finished step.",
  },
  {
    id: "qe-passage", target: "qe-passage", chapter: "parts",
    title: "Shared passage",
    body: "For a passage set: one paragraph, data set or case study (with an optional image) shown once, with several multiple-choice questions under it. Add question to this passage keeps them together.",
  },
  {
    id: "qe-import", target: "qe-import", chapter: "parts",
    title: "Bulk import",
    body: "Download the simple CSV, fill one question per row, then upload it. You see a review of every row first: ready rows can be imported, and rows with problems can be downloaded as an error sheet to fix.",
  },
  {
    id: "qe-navigator", target: "qe-navigator", chapter: "parts",
    title: "Questions in this set",
    body: "Every question you are writing in this session. Click one to edit it; the menu duplicates, moves or deletes it. A green tick means the question is complete. Use Add to start another.",
  },
  {
    id: "qe-builder", target: "qe-builder", chapter: "parts", quick: true,
    title: "Write the question",
    body: "The fields for the current step: the statement and an optional image; then the answer (options and the correct ones, a model answer and keywords, or the exact one-word answer); then marks, negative marks, difficulty, an optional time limit and tags.",
  },
  {
    id: "qe-settings", target: "qe-settings", chapter: "parts",
    title: "Library settings",
    body: "Visibility decides who can find the question (public or private). Status decides whether it is ready: Published, Draft, Hidden or Archived.",
  },
  {
    id: "qe-footer", target: "qe-footer", chapter: "actions", quick: true,
    title: "Save or publish",
    body: "Move between steps here. Save draft keeps unfinished work. On the last step the main button publishes, saves your changes, or adds the questions to the assessment. Publishing checks that every question is complete.",
  },
  {
    id: "qe-autosave-tip", chapter: "tips",
    title: "Your work is kept",
    body: "While you create new questions, the editor keeps a copy in this browser as you type, so an accidental close or refresh does not lose your work.",
  },
];

export const codingEditorSteps = [
  {
    id: "ce-header", target: "lib-editor-header", chapter: "overview", quick: true,
    title: "Coding problem editor",
    body: "Build a judge-ready coding or SQL problem: the statement, test cases, languages and an optional editorial. It opens as a panel over the library; the X closes it and offers to save your work.",
  },
  {
    id: "ce-summary", target: "ce-summary", chapter: "layout",
    title: "Problem at a glance",
    body: "Whether the problem is a draft or published, and how many sample cases, hidden cases and languages it has so far.",
  },
  {
    id: "ce-steps", target: "ce-steps", chapter: "layout", quick: true,
    title: "Four steps",
    body: "Description, Solution & test cases, Languages, then Editorial. Click a step to open it, or use Next at the bottom. Each step only shows its own sections.",
  },
  {
    id: "ce-status", target: "ce-status", chapter: "parts",
    title: "Readiness",
    body: "Sample, hidden and language counts, and whether the preview has been validated. A problem can only be published after validation.",
  },
  {
    id: "ce-type", target: "ce-type", chapter: "parts",
    title: "Programming or SQL",
    body: "Programming problems run code with input and output in the languages you allow. SQL problems run a student's query on a fresh SQLite database built from your schema and data.",
  },
  {
    id: "ce-details", target: "ce-details", chapter: "parts", quick: true,
    title: "Question details",
    body: "The problem name, the statement (with formatting and images), difficulty, topics and tags, and optional company tags. Students see the name and statement; topics and tags drive filters and analysis.",
  },
  {
    id: "ce-io", target: "ce-io", chapter: "parts",
    title: "Input, output and constraints",
    body: "The public contract: input format, output format and constraints. For SQL problems these become schema notes, the required result and query rules.",
  },
  {
    id: "ce-limits", target: "ce-limits", chapter: "parts",
    title: "Execution limits",
    body: "The time limit (seconds) and memory limit (MB) the judge applies to every run and submission.",
  },
  {
    id: "ce-samples", target: "ce-samples", chapter: "parts",
    title: "Sample test cases",
    body: "Visible examples shown with the statement, each with input, expected output and an optional explanation or image. At least one complete sample is required.",
  },
  {
    id: "ce-hidden", target: "ce-hidden", chapter: "parts",
    title: "Hidden test cases",
    body: "Private cases that decide whether a submission is accepted. Type them in, upload input/output file pairs, or use one inputs file and one outputs file. The question's total marks are spread across these cases.",
  },
  {
    id: "ce-validation", target: "ce-validation", chapter: "parts",
    title: "Validation preview",
    body: "A check of what the judge will receive: the parsed samples and hidden cases, so you can spot an empty or mismatched case before saving.",
  },
  {
    id: "ce-languages", target: "ce-languages", chapter: "parts",
    title: "Languages",
    body: "Choose the languages students may use. Below it you set the execution style (function only or full program), the function signature, the starter code per language and the private runner.",
  },
  {
    id: "ce-templates", target: "ce-templates", chapter: "parts",
    title: "Starter code",
    body: "The code each student starts with, per language. In function mode give only the signature to complete; you can also import a template from a file.",
  },
  {
    id: "ce-editorial", target: "ce-editorial", chapter: "parts",
    title: "Editorial, approaches and FAQ",
    body: "An optional explanation of the intended solution for reviewers, approved approaches that AnvI can reveal to students, and FAQs shown on the student problem page.",
  },
  {
    id: "ce-actions", target: "ce-actions", chapter: "actions",
    title: "Save, visibility and delete",
    body: "On the last step: switch the problem between public and private, save a draft, or delete the problem. Publishing stays off until the solving preview has accepted a solution.",
  },
  {
    id: "ce-solve-preview", target: "ce-solve-preview", chapter: "actions", quick: true,
    title: "Solve preview",
    body: "Opens the problem in the student code editor so you can solve it yourself. An accepted solution there validates the problem, which unlocks publishing.",
  },
  {
    id: "ce-footer", target: "ce-footer", chapter: "actions", quick: true,
    title: "Next and publish",
    body: "Move through the steps here. On the last step the main button publishes the problem (or updates it, or publishes and adds it to an assessment). It stays disabled until the preview is validated.",
  },
];

export const codingPreviewSteps = [
  {
    id: "cp-header", target: "cp-header", chapter: "overview", quick: true,
    title: "Validate a coding problem",
    body: "You solve the problem here exactly as a student would. A solution that passes every test case proves the problem is correct before students see it.",
  },
  {
    id: "cp-status", target: "cp-status", chapter: "parts",
    title: "Validation status",
    body: "The last verdict, or how many languages are validated so far. All Languages Passed means the problem is ready to publish.",
  },
  {
    id: "cp-description", target: "cp-description", chapter: "parts",
    title: "What students read",
    body: "The statement, examples, constraints, approaches and FAQs as they appear to students. Check the wording and formatting here.",
  },
  {
    id: "cp-editor", target: "cp-editor", chapter: "parts", quick: true,
    title: "Code, run and submit",
    body: "Write a solution in the editor. Run checks it against the sample or your own input; Submit checks it against every hidden test case and gives a verdict.",
  },
  {
    id: "cp-language", target: "cp-language", chapter: "actions",
    title: "Switch language",
    body: "Each allowed language is validated separately. Pick a language, solve it and validate it, then move to the next.",
  },
  {
    id: "cp-publish", target: "cp-publish", chapter: "actions", quick: true,
    title: "Validate and publish",
    body: "After an accepted submission, this button saves your solution as the reference for that language. When every language has passed it publishes the problem. Until then it shows what is still pending.",
  },
  {
    id: "cp-shared-tip", chapter: "tips",
    title: "Shared problems",
    body: "A shared problem belongs to the platform's shared bank. You can run and submit to try it but not edit it. Where Make local copy is offered in the header, it creates your own editable copy.",
  },
];

export const codingAnalyticsSteps = [
  {
    id: "ca-header", target: "ca-header", chapter: "overview", quick: true,
    title: "Coding analysis",
    body: "How your students are doing in coding practice: which topics they know, which problems they attempt and solve, success by difficulty, verdicts and languages.",
  },
  {
    id: "ca-active-filters", target: "ca-active-filters", chapter: "parts",
    title: "Active filters",
    body: "The groups and limits currently applied. Every number and chart on the page follows them. Clear all goes back to every eligible student.",
  },
  {
    id: "ca-summary", target: "ca-summary", chapter: "parts", quick: true,
    title: "Totals",
    body: "Students in the selection, their total attempts, and how many topics and problems the data covers.",
  },
  {
    id: "ca-topics", target: "ca-topics", chapter: "parts", quick: true,
    title: "Students who know each topic",
    body: "The share of students who solved at least one problem in each topic. Short bars show topics to teach or practise next. The scale adjusts to the tallest bar.",
  },
  {
    id: "ca-charts", target: "ca-charts", chapter: "parts",
    title: "Problems, difficulty, verdicts, languages",
    body: "Problem conversion shows where students attempt but do not solve (View all lists every problem). The other charts show success rate by difficulty, the mix of submission outcomes, and success rate per language.",
  },
  {
    id: "ca-filters", target: "ca-filters", chapter: "actions", quick: true,
    title: "Customize the analysis",
    body: "Choose eligible students (individual students, semesters and other groups), an assessment and date range, the question scope (topics, difficulty, problem status, exact problems) and the graph interval. Apply updates every chart.",
  },
  {
    id: "ca-export", target: "ca-export", chapter: "actions",
    title: "Export",
    body: "Build a download of the analysis: pick the report rows and columns, then save it as CSV or Excel.",
  },
];

export const coordinatorCodingAnalytics = {
  id: "coordinator.coding-analytics",
  paths: ["/coordinator/library/coding/analytics", "/coordinator/compiler/analytics"],
  area: "Question library",
  title: "Coding analytics",
  icon: "chart",
  summary: "Coding progress of your students by topic, problem, difficulty, verdict and language, with filters and export.",
  intro: "Coding analytics shows how your students are doing in coding practice.\nUse the filters to focus on a group, an assessment or a set of problems, then export what you need.",
  permission: "coordinator.compiler.analytics",
  tips: [
    "Start with the topic chart: the shortest bars are the topics to practise next.",
    "Use View all under Problem conversion to find problems many students try but few solve.",
    "Filters apply to every chart on the page at once.",
  ],
  terms: [
    { term: "Problem conversion", text: "For each problem: how many students attempted it and how many solved it." },
  ],
  steps: codingAnalyticsSteps,
};

export default [
  {
    id: "admin.library",
    paths: ["/admin/library"],
    area: "Question library",
    title: "Question library",
    icon: "library",
    summary: "Find, create and manage the coding, multiple-choice and written questions used in assessments and Quick Prep.",
    intro: "The question library is your bank of reusable questions.\nSearch and filter it, preview any question as a candidate sees it, create new ones, and manage status and visibility in bulk.",
    next: "admin.library-question-editor",
    tips: [
      "Search several questions at once by separating names or numbers with commas.",
      "Use Drafts in the side rail to finish questions you saved earlier.",
      "On the coding page, Filters can group results into topic or tag folders.",
      "Hidden questions stay in the library but are kept out of normal use.",
    ],
    terms: [
      { term: "Drafts", text: "Saved questions that are not published yet. Only published questions are used by students." },
    ],
    steps: libraryListSteps,
  },
  {
    id: "admin.library-question-editor",
    paths: ["/admin/library/create", "/admin/library/add-question", "/admin/library/question/:id/edit"],
    area: "Question library",
    title: "Question editor",
    icon: "file",
    summary: "Create or edit multiple-choice, short-answer and one-word questions, one by one or by bulk import.",
    intro: "Write questions in three steps: content, answer, then scoring and settings.\nYou can write several questions in one go, group multiple-choice questions under a shared passage, or import a whole sheet.",
    next: "admin.library-coding-editor",
    tips: [
      "Preview before publishing to see exactly what a candidate sees.",
      "Save a draft when a question is not finished; it waits under Drafts.",
      "For many questions, Import with the simple CSV is faster than typing.",
    ],
    terms: [
      { term: "Passage set", text: "Several multiple-choice questions that share one passage, shown once above them." },
      { term: "Negative marks", text: "Marks taken away for a wrong answer." },
    ],
    steps: questionEditorSteps,
  },
  {
    id: "admin.library-coding-editor",
    paths: ["/admin/library/coding/create", "/admin/library/coding/:id/edit", "/admin/compiler/create", "/admin/compiler/:id/edit"],
    area: "Question library",
    title: "Coding problem editor",
    icon: "code",
    summary: "Create or edit coding and SQL problems: statement, test cases, languages, starter code and editorial.",
    intro: "Build a coding problem in four steps: description, test cases, languages and editorial.\nThen solve it once in the preview: an accepted solution validates the problem so it can be published.",
    next: "admin.library-coding-preview",
    tips: [
      "Add at least one sample and one hidden test case before you preview.",
      "Validate every allowed language in the preview; publishing waits for all of them.",
      "Topics and tags you set here drive library filters and coding analysis.",
    ],
    terms: [
      { term: "Hidden test case", text: "A private test case students never see. Submissions are judged on these." },
      { term: "Runner", text: "Private code that reads the test input, calls the student's function and prints the result." },
    ],
    steps: codingEditorSteps,
  },
  {
    id: "admin.library-coding-preview",
    paths: ["/admin/library/coding/:id/preview", "/admin/library/coding/shared/:id/preview", "/admin/compiler/:id/preview"],
    area: "Question library",
    title: "Coding preview",
    icon: "code",
    summary: "Solve a coding problem as a student would, validate each language and publish it.",
    intro: "This is the student coding screen, for checking a problem before it goes live.\nSubmit an accepted solution in every allowed language to validate and publish it.",
    openFrom: "admin.library",
    next: "admin.library",
    tips: [
      "Run only checks sample or custom input; only Submit can validate a language.",
      "Use Edit question to fix a test case, then come back and submit again.",
    ],
    steps: codingPreviewSteps,
  },
];
