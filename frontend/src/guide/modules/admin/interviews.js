// Admin guides: one-to-one interviews (create, the lists and one interview's detail), interview
// feedback and the AI interview workspace (ANVI). Coordinators reuse Create interview
// (EventManagement); coordinator/pages.js builds their guides from these modules, so that text
// stays role-neutral. Step ids are stable: coordinator guides reuse them.

// The interview workspace frame (title, Create interview, section menu) shared by the
// one-to-one pages. Its parts are marked in components/interviews/InterviewWorkspaceNav.jsx.
export const workspaceTitleStep = {
  id: "iw-title", target: "iw-title", chapter: "overview", quick: true,
  title: "One-to-one interviews",
  body: "Mock interviews between students: one is the mentor, the other the candidate, and both give feedback afterwards. The title shows which part of the interview workspace you are in.",
};
export const workspaceSidebarStep = {
  id: "iw-sidebar", target: "iw-sidebar", chapter: "layout",
  title: "Interview menu",
  body: "Move between all, active, scheduled and past interviews, feedback, and creating an interview. Below the menu you can search your recent interviews and open one directly. On a small screen this menu folds into a dropdown.",
};

export const eventCreateSteps = [
  { ...workspaceTitleStep, title: "Create an interview", body: "Set up a one-to-one interview round in three steps: interview setup, add students, then review and create. Nothing is published until the last step." },
  {
    id: "ev-steps", target: "ev-steps", chapter: "layout", quick: true,
    title: "Three steps",
    body: "Interview setup, Add students, Review & create. A tick marks a finished step; click a finished step to go back and change it.",
  },
  {
    id: "ev-type", target: "ev-type", chapter: "parts", quick: true,
    title: "Regular or Special",
    body: "Regular is open to all eligible students, or to a roster you choose. Special is a dedicated round for a verified roster of registered students, whose records are checked before the interview is created.",
  },
  {
    id: "ev-details", target: "ev-details", chapter: "parts",
    title: "Name and instructions",
    body: "Give the round a clear name and tell students what it focuses on and how to prepare. Both are required and students see them.",
  },
  {
    id: "ev-window", target: "ev-window", chapter: "parts",
    title: "Interview window",
    body: "When the round opens and closes, in your time zone. This is how long the round is available, not how long each pair's interview lasts.",
  },
  {
    id: "ev-template", target: "ev-template", chapter: "parts",
    title: "Template (optional)",
    body: "Attach shared questions or preparation material, up to 10 MB. You can replace or remove it before you create the interview.",
  },
  {
    id: "ev-audience", target: "ev-audience", chapter: "parts", quick: true,
    title: "Who can participate",
    body: "In step 2, choose All eligible students (the usual eligibility rules apply) or Selected students for a fixed roster. Special interviews always use a selected roster.",
  },
  {
    id: "ev-entry", target: "ev-entry", chapter: "actions",
    title: "Build the roster",
    body: "Add individual students by email or ID, upload a CSV and correct it, or pick existing students using filters and saved lists. Only registered students can be added.",
  },
  {
    id: "ev-selected", target: "ev-selected", chapter: "parts",
    title: "Selected students",
    body: "Everyone on the roster so far, with a button to remove each one. Up to 1,000 students; the same student is never added twice. Clear selection empties the list.",
  },
  {
    id: "ev-review", target: "ev-review", chapter: "parts",
    title: "Review",
    body: "Step 3 shows the name, type, window, instructions, template and audience together. Edit setup and Edit students take you back to change anything.",
  },
  {
    id: "ev-after", target: "ev-after", chapter: "tips",
    title: "After you create",
    body: "The interview is published and invitation emails are queued automatically. You then manage participants, pairs, scheduling and feedback from the interview's detail page.",
  },
  {
    id: "ev-footer", target: "ev-footer", chapter: "actions", quick: true,
    title: "Continue and create",
    body: "Continue checks the current step before moving on; any problem is shown above this bar. On the last step, Create interview publishes the round.",
  },
  workspaceSidebarStep,
];

export const interviewsSteps = [
  workspaceTitleStep,
  {
    id: "iw-create", target: "iw-create", chapter: "actions", quick: true,
    title: "Create interview",
    body: "Starts a new one-to-one interview round. Shown when you are allowed to create interviews.",
  },
  workspaceSidebarStep,
  {
    id: "iv-list", target: "iv-list", chapter: "parts", quick: true,
    title: "Interview list",
    body: "Every interview round with its date, time, students, access and status. Search by name, and filter by period (all, active, scheduled, past), type, status, and sort order. Click an interview to open it.",
  },
  {
    id: "iv-row-actions", chapter: "actions",
    title: "Actions on an interview",
    body: "Each interview's menu offers what you are allowed to do: view it, edit details and schedule, export joined students, copy its management link, send invitations, publish, mark complete, cancel or delete. Changes that affect students ask you to confirm first.",
  },
  {
    id: "ivd-header", target: "ivd-header", chapter: "overview", quick: true,
    title: "This interview",
    body: "The interview's name, status, start and end, and the instructions students see.",
  },
  {
    id: "ivd-back", target: "ivd-back", chapter: "layout",
    title: "Back to interviews",
    body: "Returns to the interview list you came from.",
  },
  {
    id: "ivd-actions", target: "ivd-actions", chapter: "actions",
    title: "Interview controls",
    body: "Export CSV downloads the participants. The status menu moves the interview through draft, scheduled, published, live, completed or cancelled. Refresh reloads the numbers. Delete removes the interview after you confirm, and cancellation mail is sent to eligible students.",
  },
  {
    id: "ivd-analytics", target: "ivd-analytics", chapter: "parts", quick: true,
    title: "Interview analytics",
    body: "Students assigned, joined, pairs formed, interviews scheduled, feedback submitted and the average score, so you can see at a glance how far the round has got.",
  },
  {
    id: "ivd-views", target: "ivd-views", chapter: "layout",
    title: "Students or pairs",
    body: "Switch between the assigned students and the interview pairs. The badge on each shows how many there are.",
    tryIt: "Click Interview Pairs to see the pairs",
  },
  {
    id: "ivd-students", target: "ivd-students", chapter: "parts",
    title: "Assigned students",
    body: "Each student's details, academic details, group, invitation mail status and whether they joined. The ⋮ menus send or resend invitations (to one, the selected, or all) and remove a student from the interview.",
  },
  {
    id: "ivd-pairs", target: "ivd-pairs", chapter: "parts",
    title: "Interview pairs",
    body: "Who interviews whom: the mentor, the candidate, the pair's status, scheduled time, and the meeting link when there is one.",
  },
];

export const feedbackSteps = [
  { ...workspaceTitleStep, title: "Interview feedback", body: "All feedback given after one-to-one interviews: who gave it, to whom, the marks and the comments. Use it to see how candidates are doing and to spot weak areas." },
  workspaceSidebarStep,
  {
    id: "fb-selector", target: "fb-selector", chapter: "actions", quick: true,
    title: "Choose an interview",
    body: "Show feedback from every interview, or pick one interview round to see only its feedback.",
  },
  {
    id: "fb-heading", target: "fb-heading", chapter: "overview",
    title: "What you are viewing",
    body: "All Feedback, or the name of the interview you picked.",
  },
  {
    id: "fb-stats", target: "fb-stats", chapter: "parts", quick: true,
    title: "Totals",
    body: "How many feedback records match, their average score out of 25, and how many candidate colleges they come from.",
  },
  {
    id: "fb-college", target: "fb-college", chapter: "actions",
    title: "Filter by college",
    body: "Type a college name to see feedback for candidates from that college.",
  },
  {
    id: "fb-actions", target: "fb-actions", chapter: "actions",
    title: "Clear, refresh, download",
    body: "Clear Filters shows everything again, Refresh reloads the list, and Download CSV exports the feedback that matches your current filters.",
  },
  {
    id: "fb-table", target: "fb-table", chapter: "parts", quick: true,
    title: "Feedback records",
    body: "Each record shows the interview, mentor, candidate, college, marks, comments and date. Click the marks to see how they were given, or a comment to read it in full. Click a column header to sort.",
  },
];

export const aiInterviewSteps = [
  {
    id: "ai-header", target: "ai-header", chapter: "overview", quick: true,
    title: "AI interviews",
    body: "Voice interviews run by ANVI, PeerPrep's AI interviewer. You create an interview, add questions, publish it, then schedule it for students and read the AI-scored reports. The header shows where you are, with a back arrow and breadcrumbs.",
  },
  {
    id: "ai-nav", target: "ai-nav", chapter: "layout", quick: true,
    title: "Workspace menu",
    body: "Interviews (your interview list), Schedules (who takes which interview, and when), Reports (attempts and AI usage), Avatars (the interviewer's look and voice) and Companies.",
  },
  {
    id: "ai-create", target: "ai-create", chapter: "actions", quick: true,
    title: "Create interview",
    body: "Opens the four-step builder: basics, questions, ANVI settings, then review and publish.",
  },
  {
    id: "ai-status", target: "ai-status", chapter: "parts",
    title: "Filter by status",
    body: "All, Drafts, Ready & published, Completed or Archived.",
  },
  {
    id: "ai-search", target: "ai-search", chapter: "actions",
    title: "Search and sort",
    body: "Search by interview name, company or role, and sort by last edited, oldest edited or name. Column headers sort too.",
  },
  {
    id: "ai-list", target: "ai-list", chapter: "parts", quick: true,
    title: "Your AI interviews",
    body: "Each interview with its role and company, number of questions, time limit, status and when it was last edited. Click a name to open it in the builder.",
  },
  {
    id: "ai-row-actions", chapter: "actions",
    title: "Actions on an interview",
    body: "The ⋮ menu lets you edit or view, preview as a student, assign it to students, view its schedules and assigned students, duplicate it as a draft, copy its link, mark it complete or reopen it, archive or restore it, and delete a draft. The options depend on the interview's status.",
  },
  {
    id: "ai-wizard-steps", target: "ai-wizard-steps", chapter: "layout", quick: true,
    title: "Builder steps",
    body: "Basics, Questions, ANVI settings, and Review & publish. A tick marks a step that is ready. On a new interview, the later steps open once the draft is created.",
  },
  {
    id: "ai-wizard-footer", target: "ai-wizard-footer", chapter: "actions",
    title: "Move through the builder",
    body: "Go back or continue to the next step. The interview is published from the last step, Review & publish.",
  },
  {
    id: "ai-new-schedule", target: "ai-new-schedule", chapter: "actions",
    title: "New schedule",
    body: "Assign a published interview to a group of students, with a window in IST and optional bookable slots.",
  },
  {
    id: "ai-schedules", target: "ai-schedules", chapter: "parts",
    title: "Schedules",
    body: "Every schedule with its status, window (IST), timing and how many students completed it. Filter by status, open a schedule, or use ⋮ to view its students, edit it or export the roster.",
  },
  {
    id: "ai-report-tabs", target: "ai-report-tabs", chapter: "layout",
    title: "Attempts or usage",
    body: "Attempts lists every student attempt with its AI-scored report. Usage and cost shows how much ANVI was used and its estimated cost.",
  },
  {
    id: "ai-reports", target: "ai-reports", chapter: "parts",
    title: "Reports",
    body: "Filter attempts by interview, status and start date, then open one to read its transcript, scores and evaluation history.",
  },
  {
    id: "ai-avatar-tools", target: "ai-avatar-tools", chapter: "actions",
    title: "Find or create avatars",
    body: "Search avatars, show active, archived or all, and create a new one with an identity, introduction and voice.",
  },
  {
    id: "ai-avatars", target: "ai-avatars", chapter: "parts",
    title: "Avatar library",
    body: "Each avatar with its preview, role and languages. Click one to watch its introduction, or use its buttons to edit or archive it.",
  },
  {
    id: "ai-resource-tools", target: "ai-resource-tools", chapter: "actions",
    title: "Companies",
    body: "Search the companies you can attach to interviews, or add a new one with Add company. Each company in the list has an Edit button.",
  },
];

export default [
  {
    id: "admin.event-create",
    paths: ["/admin/event", "/admin/event/create"],
    area: "Interviews",
    title: "Create interview",
    icon: "calendar",
    summary: "Set up a one-to-one interview round: type, details, window, students, then review and create.",
    intro: "Create a one-to-one mock interview round in three steps.\nChoose the type and window, decide which students can take part, then review everything before it is published.",
    next: "admin.interviews",
    tips: [
      "Nothing is published until you press Create interview on the last step.",
      "Use Special for a fixed, verified roster; use Regular for an open round.",
      "Invitation emails are queued automatically when the interview is created.",
    ],
    steps: eventCreateSteps,
  },
  {
    id: "admin.interviews",
    paths: [
      "/admin/interviews/one-to-one",
      "/admin/interviews/one-to-one/scheduled",
      "/admin/interviews/one-to-one/past",
      "/admin/interviews/scheduled",
      "/admin/interviews/past",
      "/admin/event/:id",
      "/admin/interviews/:id",
      "/admin/interviews/one-to-one/:id",
      "/admin/interviews/one-to-one/scheduled/:id",
      "/admin/interviews/one-to-one/past/:id",
      "/admin/interviews/scheduled/:id",
      "/admin/interviews/past/:id",
    ],
    area: "Interviews",
    title: "One-to-one interviews",
    icon: "handshake",
    summary: "Every one-to-one interview round, and for each one its students, pairs, invitations and results.",
    intro: "This is where you run one-to-one mock interviews.\nThe list shows every round; open one to see who is assigned, how pairs are formed, invitation status and the round's analytics.",
    next: "admin.interview-feedback",
    tips: [
      "Use the period filter or the menu to jump to active, scheduled or past rounds.",
      "Resend invitations from an interview's student list when a student did not get the email.",
      "Feedback from all rounds is under Feedback in the interview menu.",
    ],
    steps: interviewsSteps,
  },
  {
    id: "admin.interview-feedback",
    paths: ["/admin/feedback"],
    area: "Interviews",
    title: "Interview feedback",
    icon: "feedback",
    summary: "Feedback from one-to-one interviews, filterable by interview and college, with marks, comments and CSV export.",
    intro: "Every feedback record from one-to-one interviews in one place.\nPick an interview or a college to narrow the list, open marks and comments, and download what you see.",
    next: "admin.ai-interviews",
    steps: feedbackSteps,
  },
  {
    id: "admin.ai-interviews",
    paths: ["/admin/ai-interviews/*"],
    area: "Interviews",
    title: "AI interviews",
    icon: "bot",
    summary: "Build AI voice interviews run by ANVI, schedule them for students, and read the AI-scored reports.",
    intro: "The AI interview workspace.\nCreate interviews for ANVI to run, schedule them for groups of students, and review every attempt's report. The same guide covers Schedules, Reports, Avatars and Companies; it shows the parts of the page you are on.",
    next: "admin.interviews",
    tips: [
      "An interview must be published before you can schedule it for students.",
      "Preview as student (in an interview's ⋮ menu) shows exactly what students will see.",
      "Times on Schedules and Reports are in IST.",
    ],
    steps: aiInterviewSteps,
  },
];
