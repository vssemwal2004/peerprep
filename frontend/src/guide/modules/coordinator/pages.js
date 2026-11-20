// Coordinator guides. Two kinds of pages:
// 1) coordinator-only pages (their own components, marked in src/coordinator/*), written here;
// 2) admin pages coordinators also use (same components): built from the admin modules with fromAdmin(),
//    with coordinator paths, permissions and menu areas. next/openFrom are mapped to coordinator ids.
import admin from "../admin/index.js";
import * as libraryGuides from "../admin/library.js";
import { overviewSteps } from "../admin/home.js";

// ── Overview (shared OverviewDashboard, role="coordinator") ────────────────────────────────────────
const overviewWording = {
  "ov-menu": {
    body: "Everything you can work on is here: your students, interviews, learning modules, assessments, the question library, announcements and settings. You only see the features your admin has enabled for you. Hover the rail to open it, or pin it with the round button on its edge.",
  },
  "ov-title": {
    body: "The Overview answers one question: how are your students doing right now, and what needs you? The figures cover the students you work with, and the page refreshes by itself every few minutes.",
  },
  "ov-search": {
    body: "Type a student's name, roll number or email to open the matching entry in your student list, without browsing the list first.",
  },
  "ov-create": {
    body: "Start common jobs from one button: add students, a new assessment, a new interview event or an announcement. The menu only lists what your admin allows you to create.",
  },
  "ov-shortcuts": {
    body: "The pages you open most, one click away: your students, assessment reports, the question library, interviews, learning, announcements and your activity. Only pages you have access to appear.",
  },
  "ov-kpis": {
    body: "Your students, how many were active this week, average Prep Score, coding acceptance, assessment average, interviews and topics completed. The small line shows the trend; the arrow compares with the previous week. Cards with a link open the page behind the number.",
  },
  "ov-top": {
    body: "Your students with the highest Prep Score right now, with their roll numbers. Use it to spot who is ready for harder practice or could help classmates.",
  },
  "ov-recent": {
    body: "Your latest changes on the platform (students added, tests created, content edited), newest first. All activity opens your full activity log.",
  },
};

const coordinatorOverviewSteps = overviewSteps.map((step) => ({ ...step, ...(overviewWording[step.id] || {}) }));

// ── Coordinator-only pages ──────────────────────────────────────────────────────────────────────────
const own = [
  {
    id: "coordinator.overview",
    paths: ["/coordinator/overview"],
    permission: "coordinator.dashboard.overview",
    area: "Get started",
    title: "Overview",
    icon: "dashboard",
    summary: "Your students at a glance: activity, headline numbers, what needs you, what is coming up and your recent changes.",
    intro: "Welcome to PeerPrep! The Overview is your home page as a coordinator.\nIt shows how your students are doing across every module you can see, what is waiting on you, and the fastest way to your common jobs.",
    next: "coordinator.students",
    tips: [
      "Click a headline card that has a link to open the page behind its number.",
      "Use the search box to find one of your students in one step.",
      "If a module you expect is missing, ask your admin to enable it for your account.",
    ],
    steps: coordinatorOverviewSteps,
  },
  {
    id: "coordinator.students",
    paths: ["/coordinator/students"],
    permission: "coordinator.students.view",
    area: "Students",
    title: "Student List",
    icon: "users",
    summary: "The students assigned to you: search, sort, download the list and open any student's profile.",
    intro: "This is your student list: every student assigned to you, with course, branch, semester, section, group and college.\nSearch it, sort it, download it, or click a student to open their full profile.",
    next: "coordinator.student-profile",
    tips: [
      "Your last search is kept in this browser tab, so Back from a profile returns to the same results.",
      "Opened from a bulk list, the page shows only that list's students and its name as the title.",
      "Download All saves the whole list, not only the rows on screen.",
    ],
    terms: [
      { term: "Coordinator Assigned", text: "The teacher ID of the coordinator a student is assigned to." },
    ],
    steps: [
      {
        id: "cs-title", target: "cs-title", chapter: "overview",
        title: "Your students",
        body: "The students assigned to you. When you open this page from a bulk student list, the title shows that list's name and only its students are listed.",
      },
      {
        id: "cs-search", target: "cs-search", chapter: "actions", quick: true,
        title: "Search the list",
        body: "Type part of a name, student ID, email, branch, course or college. The search is forgiving about spaces, dots and dashes, and the list filters as you type. The x clears it.",
      },
      {
        id: "cs-download", target: "cs-download", chapter: "actions", quick: true,
        title: "Download All",
        body: "Saves every student on this list as a CSV file: name, student ID, email, course, branch, college, semester, section, group and assigned coordinator. Use it for attendance sheets or offline follow-up.",
      },
      {
        id: "cs-total", target: "cs-total", chapter: "parts",
        title: "How many students",
        body: "Total Students counts everyone on this list. While you search, Showing tells you how many match.",
      },
      {
        id: "cs-table", target: "cs-table", chapter: "parts", quick: true,
        title: "The student table",
        body: "One row per student with email, branch, course, semester, section, group, college and assigned coordinator. Use the pager below the table to move between pages or change rows per page.",
      },
      {
        id: "cs-columns", target: "cs-columns", chapter: "actions",
        title: "Sort by any column",
        body: "Click a column heading to sort by it; click again to reverse the order. With no column sort, search results stay in best-match order.",
      },
      {
        id: "cs-rows", target: "cs-rows", chapter: "actions", quick: true,
        title: "Open a student",
        body: "Click a row or a student's name to open their profile: progress, Prep Score, practice, assessments, interviews and resume.",
      },
    ],
  },
  {
    id: "coordinator.interviews",
    paths: [
      "/coordinator/interviews/one-to-one",
      "/coordinator/interviews/:id",
      "/coordinator/interviews/one-to-one/:id",
      "/coordinator/interviews/one-to-one/scheduled",
      "/coordinator/interviews/one-to-one/scheduled/:id",
      "/coordinator/interviews/one-to-one/past",
      "/coordinator/interviews/one-to-one/past/:id",
      "/coordinator/interviews/scheduled",
      "/coordinator/interviews/scheduled/:id",
      "/coordinator/interviews/past",
      "/coordinator/interviews/past/:id",
      "/coordinator/event/:id",
    ],
    permission: "coordinator.interviews.view",
    area: "Interviews",
    title: "One-to-One Interviews",
    icon: "calendar",
    summary: "Every one-to-one mock interview round: find a round, manage it, and open its pairs and results.",
    intro: "One-to-one interviews pair students for mock interviews, with feedback afterwards.\nThis workspace lists every round you can see. Open one to view who joined, the pairs, their schedule and the average feedback score.",
    next: "coordinator.feedback",
    tips: [
      "Actions on a round depend on your permissions and on whether you created it.",
      "Export CSV on a round downloads the students who joined it.",
      "Feedback in the workspace menu shows the scores and comments for your students.",
    ],
    steps: [
      {
        id: "ci-workspace", chapter: "layout",
        title: "The interview workspace",
        body: "The panel on the left (a drop-down on small screens) switches between All interviews, Active, Scheduled, Past interviews, Feedback and Create interview. Below it, Recent interviews lets you find and open a round by name.",
      },
      {
        id: "ci-directory", target: "ci-directory", chapter: "parts", quick: true,
        title: "Find a round",
        body: "Search by name, then narrow the list by period (all, active, scheduled, past), type (regular or special), status (draft, cancelled, archived) and sort order. Each row shows dates, times, how many students joined or were selected, who can join and the status.",
      },
      {
        id: "ci-actions", chapter: "actions", quick: true,
        title: "Act on a round",
        body: "Click a row to open it, or use the three-dot menu at its end. Everyone can open a round, export its joined students and copy its management link. On rounds you created, your permissions may also let you edit details, send invitations, publish, mark complete, cancel or delete.",
      },
      {
        id: "ci-careful", chapter: "tips",
        title: "Check before you confirm",
        body: "Each change opens a confirmation that explains what will happen. Deleting removes the round with its pairs and feedback and cannot be undone, so you must type the interview name first. Cancelling only changes the status and sends no email.",
      },
      {
        id: "ci-event-header", target: "ci-event-header", chapter: "overview",
        title: "The round you opened",
        body: "The interview name, its start and end time and the instructions students see.",
      },
      {
        id: "ci-back", target: "ci-back", chapter: "layout",
        title: "Back to the list",
        body: "Returns to the interview list you came from (all, scheduled or past).",
      },
      {
        id: "ci-export", target: "ci-export", chapter: "actions",
        title: "Export CSV",
        body: "Downloads the students who joined this round as a CSV file, for attendance or follow-up.",
      },
      {
        id: "ci-analytics", target: "ci-analytics", chapter: "parts", quick: true,
        title: "Interview Analytics",
        body: "Joined students, pairs formed, pairs scheduled, feedback submissions and the average feedback score for this round. A low feedback count after the round means students still need a reminder.",
      },
      {
        id: "ci-pairs", target: "ci-pairs", chapter: "parts", quick: true,
        title: "Interview pairs",
        body: "Each card shows the mentor and the candidate, the pair's status, the scheduled time and, when set, a Meeting link.",
      },
    ],
  },
  {
    id: "coordinator.feedback",
    paths: ["/coordinator/feedback"],
    permission: "coordinator.feedback.view",
    area: "Interviews",
    title: "Interview Feedback",
    icon: "feedback",
    summary: "Mock interview feedback for your assigned students: filter by interview and college, read marks and comments, download CSV.",
    intro: "After a one-to-one interview, the mentor scores the candidate and writes comments.\nThis page collects that feedback for your assigned students, so you can see who did well and who needs help.",
    next: "coordinator.students",
    tips: [
      "Marks are out of 25.",
      "Download CSV exports exactly what your filters show.",
      "On a phone the records appear as cards instead of a table.",
    ],
    terms: [
      { term: "Mentor", text: "The student or mentor who took the interview and gave the feedback." },
      { term: "Candidate", text: "The student who was interviewed and received the feedback." },
    ],
    steps: [
      {
        id: "cf-interview", target: "cf-interview", chapter: "actions", quick: true,
        title: "Pick an interview",
        body: "Show feedback for one interview round, or for all interviews. The heading below changes to the round's name.",
      },
      {
        id: "cf-title", target: "cf-title", chapter: "overview",
        title: "What you are viewing",
        body: "All Student Feedback, or the name of the interview you picked. The records cover your assigned students.",
      },
      {
        id: "cf-stats", target: "cf-stats", chapter: "parts", quick: true,
        title: "Totals",
        body: "Total feedback records, the average score out of 25 and how many colleges they come from, for the current filters.",
      },
      {
        id: "cf-college", target: "cf-college", chapter: "actions",
        title: "Filter by college",
        body: "Type a college name to see only candidates from that college. The list updates as you type.",
      },
      {
        id: "cf-actions", target: "cf-actions", chapter: "actions",
        title: "Clear and refresh",
        body: "Clear Filters returns to all interviews and all colleges. Refresh reloads the records, for example after a round has just finished.",
      },
      {
        id: "cf-download", target: "cf-download", chapter: "actions", quick: true,
        title: "Download CSV",
        body: "Exports the feedback for the interview and college you filtered by, as a CSV file named after the interview and today's date.",
      },
      {
        id: "cf-records", target: "cf-records", chapter: "parts", quick: true,
        title: "The feedback records",
        body: "Interview, mentor, candidate, college, marks out of 25, comments and the date submitted. Click a column heading to sort by it.",
      },
    ],
  },
  {
    id: "coordinator.ai-interviews",
    paths: ["/coordinator/ai-interviews"],
    permission: "coordinator.interviews.view",
    area: "Interviews",
    title: "AI Interviews",
    icon: "bot",
    summary: "What AI interviews offer today and what coordinators will be able to do with them later.",
    intro: "AI interviews let students practise with an AI interviewer.\nAdmins set them up today; coordinator management is planned. This page explains what is available now and where to go instead.",
    next: "coordinator.interviews",
    steps: [
      {
        id: "cai-title", target: "cai-title", chapter: "overview", quick: true,
        title: "AI Interviews",
        body: "Text AI interviews are available through the admin and student workspaces. Managing them as a coordinator is planned for a later release.",
      },
      {
        id: "cai-planned", target: "cai-planned", chapter: "parts",
        title: "Planned capabilities",
        body: "What is being built: voice-first conversation, coordinator assignments to student groups, multilingual support and reviewable evaluation with transcripts and human override.",
      },
      {
        id: "cai-notice", target: "cai-notice", chapter: "parts", quick: true,
        title: "What you can do today",
        body: "Admins configure text AI interviews and make them available to students. Assignment, scoring, recordings and review are not available on this page yet.",
      },
      {
        id: "cai-open", target: "cai-open", chapter: "actions", quick: true,
        title: "Use one-to-one interviews",
        body: "Opens the one-to-one interview workspace, where you can follow your students' mock interview rounds now.",
      },
      {
        id: "cai-roadmap", target: "cai-roadmap", chapter: "tips",
        title: "How it will roll out",
        body: "The rollout plan: voice first, with cost and capacity controls, and with consent and human review built in.",
      },
    ],
  },
  {
    id: "coordinator.subjects",
    paths: ["/coordinator/subjects"],
    permission: "coordinator.learning.manage",
    area: "Learning",
    title: "Learning Modules",
    icon: "book",
    summary: "Build the study material for each semester: subjects, chapters and topics with problem links, videos and PDFs.",
    intro: "Learning Modules is where you build study material, semester by semester.\nEach semester holds subjects, each subject holds chapters, and each chapter holds topics with a problem link, a video and notes or question PDFs.",
    next: "coordinator.database",
    tips: [
      "Drag subjects and chapters by their handle to change the order.",
      "Deleting a subject or chapter also deletes everything inside it, after a confirmation.",
      "The page reloads by itself when learning content is changed elsewhere.",
    ],
    terms: [
      { term: "Importance", text: "A 1–5 star rating you give a chapter or topic, to show how much it matters." },
      { term: "Video Analytics", text: "Per-subject figures on how students watch the subject's videos." },
    ],
    steps: [
      {
        id: "sm-sidebar", target: "sm-sidebar", chapter: "layout", quick: true,
        title: "Learning modules panel",
        body: "The left panel lists your learning modules, one per semester, with how many there are. Pick the semester you want to work on here.",
      },
      {
        id: "sm-semester", target: "sm-semester", chapter: "actions", quick: true,
        title: "Select a semester",
        body: "Opens the list of semesters with their subject counts. Semesters 1 to 12 are created for you automatically if they are missing.",
        tryIt: "Click the semester picker",
      },
      {
        id: "sm-width", target: "sm-width", chapter: "layout",
        title: "Panel width",
        body: "Cycles the left panel between narrow, wide and extra wide, so long semester names fit.",
      },
      {
        id: "sm-toggle", target: "sm-toggle", chapter: "layout",
        title: "Hide or show the panel",
        body: "Hides the left panel to give the subjects more room, and brings it back.",
      },
      {
        id: "sm-title", target: "sm-title", chapter: "overview",
        title: "The semester you are editing",
        body: "The selected semester's name and description. Everything below belongs to this semester.",
      },
      {
        id: "sm-add-subject", target: "sm-add-subject", chapter: "actions", quick: true,
        title: "Add Subject",
        body: "Opens a short form for the subject name and an optional description. Names must be unique within the semester.",
      },
      {
        id: "sm-subjects", target: "sm-subjects", chapter: "parts", quick: true,
        title: "Subjects",
        body: "Each card is a subject with its description and chapter count. Click a card to open its chapters.",
      },
      {
        id: "sm-drag", target: "sm-drag", chapter: "actions",
        title: "Reorder",
        body: "Drag a subject (or a chapter) by this handle to change its position. The new order is saved straight away.",
      },
      {
        id: "sm-analytics", target: "sm-analytics", chapter: "actions",
        title: "Video Analytics",
        body: "Opens analytics for this subject's videos, starting with how many students there are and how many watched.",
      },
      {
        id: "sm-edit-subject", target: "sm-edit-subject", chapter: "actions",
        title: "Edit or delete a subject",
        body: "The pencil lets you rename the subject or change its description. The bin deletes the subject with all its chapters and topics, after you confirm.",
      },
      {
        id: "sm-expand", target: "sm-expand", chapter: "actions",
        title: "Open a subject",
        body: "Shows or hides the subject's chapters. Clicking anywhere on the card does the same.",
      },
      {
        id: "sm-add-chapter", target: "sm-add-chapter", chapter: "actions",
        title: "Add Chapter",
        body: "Inside an open subject: give the chapter a name and an importance from 1 to 5 stars. Chapter names must be unique within the subject.",
      },
      {
        id: "sm-chapters", target: "sm-chapters", chapter: "parts",
        title: "Chapters",
        body: "Each chapter shows its importance stars and topic count. Click a chapter to open its topics; use the pencil to edit it or the bin to delete it with its topics.",
      },
      {
        id: "sm-add-topic", target: "sm-add-topic", chapter: "actions",
        title: "Add Topic",
        body: "Inside an open chapter: the topic name (required), a problem link, importance stars, difficulty from easy to hard, a video link, and optional notes and question PDFs.",
      },
      {
        id: "sm-topics", target: "sm-topics", chapter: "parts",
        title: "Topics table",
        body: "Each topic with its problem link, importance, difficulty, video, notes and questions. Click a heading to sort. The action buttons open the video or PDFs, or edit or delete the topic.",
      },
    ],
  },
  {
    id: "coordinator.database",
    paths: ["/coordinator/database"],
    permission: "coordinator.courses.view",
    area: "Learning",
    title: "Registered Courses",
    icon: "database",
    summary: "A read-only view of every learning module that has content: subjects, chapters and topics with their resources.",
    intro: "Registered Courses shows the learning content that already exists, without edit buttons.\nUse it to check what a semester covers and to open a topic's problem, video or PDFs.",
    next: "coordinator.subjects",
    tips: [
      "Only semesters with at least one subject appear here.",
      "To add or change content, use Learning Modules (if your admin has enabled it for you).",
    ],
    steps: [
      {
        id: "db-sidebar", target: "db-sidebar", chapter: "layout", quick: true,
        title: "Registered courses",
        body: "The left panel lists each semester that has content, with how many are registered.",
      },
      {
        id: "db-courses", target: "db-courses", chapter: "actions", quick: true,
        title: "Pick a course",
        body: "Each card shows the semester with its subject and chapter counts. Click one to view its content on the right.",
      },
      {
        id: "db-width", target: "db-width", chapter: "layout",
        title: "Panel width",
        body: "Cycles the left panel between narrow, wide and extra wide.",
      },
      {
        id: "db-toggle", target: "db-toggle", chapter: "layout",
        title: "Hide or show the panel",
        body: "Hides the course list to give the content more room, and brings it back.",
      },
      {
        id: "db-title", target: "db-title", chapter: "overview",
        title: "The selected course",
        body: "The semester's name and description. Everything below belongs to it.",
      },
      {
        id: "db-stats", target: "db-stats", chapter: "parts", quick: true,
        title: "Course size",
        body: "Total subjects, chapters and topics in this semester, so you can see how complete it is at a glance.",
      },
      {
        id: "db-subjects", target: "db-subjects", chapter: "parts", quick: true,
        title: "Subjects",
        body: "Each subject with its description, chapter count and topic count. Click a subject to open its chapters.",
      },
      {
        id: "db-chapters", target: "db-chapters", chapter: "parts",
        title: "Chapters",
        body: "Each chapter shows its importance stars and topic count. Click a chapter to see its topics.",
      },
      {
        id: "db-topics", target: "db-topics", chapter: "parts",
        title: "Topics and resources",
        body: "Each topic with a Solve link to its problem, importance, difficulty, and buttons for the video, notes PDF and questions PDF. Click a heading to sort.",
      },
    ],
  },
  {
    id: "coordinator.profile",
    paths: ["/coordinator/profile"],
    permission: "coordinator.profile.manage",
    area: "Account",
    title: "Profile",
    icon: "user",
    summary: "Your coordinator details and profile picture.",
    intro: "Your profile shows the details your admin entered for you.\nYou can change your profile picture here; ask your admin to correct anything else.",
    next: "coordinator.change-password",
    steps: [
      {
        id: "cp-title", target: "cp-title", chapter: "overview", quick: true,
        title: "My Profile",
        body: "Information uploaded by your admin is shown here. The only thing you can change yourself is your profile picture.",
      },
      {
        id: "cp-avatar", target: "cp-avatar", chapter: "parts",
        title: "Profile picture",
        body: "Your current picture, or your initial when you have none. It appears in the app wherever your account is shown.",
      },
      {
        id: "cp-upload", target: "cp-upload", chapter: "actions", quick: true,
        title: "Change your picture",
        body: "Choose an image file, then click Upload. The new picture replaces the old one straight away.",
      },
      {
        id: "cp-details", target: "cp-details", chapter: "parts", quick: true,
        title: "Your details",
        body: "Name, teacher ID, email, department and college. These are read-only; ask your admin if something is wrong.",
      },
      {
        id: "cp-next", chapter: "tips",
        title: "Keep your account safe",
        body: "Change Password and My Activity are in the menu under Settings, My Account. My Activity lists everything done with your account.",
      },
    ],
  },
  {
    id: "coordinator.change-password",
    paths: ["/coordinator/change-password"],
    permission: "coordinator.profile.manage",
    area: "Account",
    title: "Change Password",
    icon: "key",
    summary: "Set a new password for your coordinator account.",
    intro: "Change your password here.\nYou need your current password. After the change you are signed out and sign in again with the new one.",
    next: "coordinator.activity",
    steps: [
      {
        id: "pw-title", target: "pw-title", chapter: "overview",
        title: "Change Password",
        body: "Three fields and one button. All three fields are required.",
      },
      {
        id: "pw-current", target: "pw-current", chapter: "actions", quick: true,
        title: "Current password",
        body: "Enter the password you use now. The eye button shows or hides what you type.",
      },
      {
        id: "pw-new", target: "pw-new", chapter: "actions", quick: true,
        title: "New password",
        body: "At least 8 characters, and different from your current password. A check under the field turns green when the length is right.",
      },
      {
        id: "pw-confirm", target: "pw-confirm", chapter: "actions",
        title: "Confirm it",
        body: "Type the new password again. The field turns green when both match and red when they do not.",
      },
      {
        id: "pw-submit", target: "pw-submit", chapter: "actions", quick: true,
        title: "Save and sign in again",
        body: "Change Password saves the new password, signs you out and takes you to the sign-in page. Sign in with your new password.",
      },
    ],
  },
  {
    id: "coordinator.activity",
    paths: ["/coordinator/activity"],
    permission: "coordinator.activity.view",
    area: "Account",
    title: "My Activity",
    icon: "activity",
    summary: "A log of everything done with your account: what changed, where, and when.",
    intro: "The activity log records your actions across the platform: assessments, library, coding problems, announcements, students, learning content and sign-ins.\nSearch it, filter it and export it.",
    next: "coordinator.overview",
    tips: [
      "Press Enter in the search box to search.",
      "Export CSV uses your search text; the filter panel does not limit the export.",
      "Click a column heading to sort the whole log by it.",
    ],
    steps: [
      {
        id: "ca-title", target: "ca-title", chapter: "overview",
        title: "Activity Log",
        body: "Every action recorded for your account, newest first unless you sort by a column.",
      },
      {
        id: "ca-total", target: "ca-total", chapter: "parts",
        title: "Total",
        body: "How many activities match the current search and filters.",
      },
      {
        id: "ca-search", target: "ca-search", chapter: "actions", quick: true,
        title: "Search activities",
        body: "Type a word, such as a test name or an email, and press Enter. The table then shows only matching activities.",
      },
      {
        id: "ca-filters", target: "ca-filters", chapter: "actions", quick: true,
        title: "Filters",
        body: "Opens the filter panel. The button turns blue and shows Active while a filter is on.",
        tryIt: "Click Filters",
      },
      {
        id: "ca-filter-panel", target: "ca-filter-panel", chapter: "actions",
        title: "Narrow the log",
        body: "Filter by action type (create, update, delete, upload, login and more), by target type (student, assessment, topic and more) and by start and end date. Clear Filters removes them all.",
      },
      {
        id: "ca-refresh", target: "ca-refresh", chapter: "actions",
        title: "Refresh",
        body: "Reloads the log to show anything you did in another tab since the page opened.",
      },
      {
        id: "ca-export", target: "ca-export", chapter: "actions",
        title: "Export CSV",
        body: "Downloads your activity log as a CSV file. It follows your search text, not the filter panel.",
      },
      {
        id: "ca-count", target: "ca-count", chapter: "parts",
        title: "What is shown",
        body: "How many activities are on this page out of the total, with (filtered) while filters are on.",
      },
      {
        id: "ca-table", target: "ca-table", chapter: "parts", quick: true,
        title: "The log",
        body: "Date and time, the account's email and role, the action, the target and a description. For edits, up to three changed fields are listed as old value → new value.",
      },
      {
        id: "ca-columns", target: "ca-columns", chapter: "actions",
        title: "Sort and page",
        body: "Click a column heading to sort the log by it; click again to reverse. The pager at the bottom moves between pages and changes rows per page.",
      },
    ],
  },
];

// ── Admin pages coordinators also use ───────────────────────────────────────────────────────────────
const fromAdmin = (adminId, extra) => {
  const base = admin.find((module) => module.id === adminId);
  if (!base) return null;
  // eslint-disable-next-line no-unused-vars
  const { deployment, feature, ...rest } = base;
  return { ...rest, ...extra, id: extra.id, paths: extra.paths, permission: extra.permission, area: extra.area };
};

const shared = [
  fromAdmin("admin.onboarding", { id: "coordinator.onboarding", area: "Students", title: "Add Student", paths: ["/coordinator/onboarding"], permission: "coordinator.students.create" }),
  fromAdmin("admin.bulk-lists", { id: "coordinator.bulk-lists", area: "Students", paths: ["/coordinator/students/bulk-lists"], permission: "coordinator.students.bulk-lists" }),
  fromAdmin("admin.student-profile", { id: "coordinator.student-profile", area: "Students", paths: ["/coordinator/students/:studentId"], permission: "coordinator.students.profile", openFrom: "coordinator.students", next: "coordinator.students" }),
  fromAdmin("admin.student-resume", { id: "coordinator.student-resume", area: "Students", paths: ["/coordinator/students/:studentId/resume"], permission: "coordinator.students.profile", openFrom: "coordinator.students", next: "coordinator.students" }),
  fromAdmin("admin.event-create", { id: "coordinator.event-create", area: "Interviews", paths: ["/coordinator/event/create"], permission: "coordinator.interviews.create", next: "coordinator.interviews" }),
  fromAdmin("admin.assessments", { id: "coordinator.assessments", area: "Assessments", paths: ["/coordinator/assessment"], permission: "coordinator.assessment.view" }),
  fromAdmin("admin.assessment-editor", { id: "coordinator.assessment-editor", area: "Assessments", paths: ["/coordinator/assessment/create", "/coordinator/assessment/:id", "/coordinator/assessment/:id/edit"], permission: "coordinator.assessment.create" }),
  fromAdmin("admin.assessment-reports", { id: "coordinator.assessment-reports", area: "Assessments", paths: ["/coordinator/assessment/reports"], permission: "coordinator.assessment.reports" }),
  fromAdmin("admin.assessment-feedback", { id: "coordinator.assessment-feedback", area: "Assessments", paths: ["/coordinator/assessment-feedback"], permission: "coordinator.assessment.feedback" }),
  fromAdmin("admin.assessment-select-problem", { id: "coordinator.assessment-select-problem", area: "Assessments", paths: ["/coordinator/assessment/select-problem"], permission: "coordinator.assessment.create" }),
  fromAdmin("admin.library", { id: "coordinator.library", area: "Question library", paths: ["/coordinator/library"], permission: "coordinator.library.view" }),
  fromAdmin("admin.library-question-editor", { id: "coordinator.library-question-editor", area: "Question library", paths: ["/coordinator/library/create", "/coordinator/library/add-question", "/coordinator/library/question/:id/edit"], permission: "coordinator.library.create" }),
  fromAdmin("admin.library-coding-editor", { id: "coordinator.library-coding-editor", area: "Question library", paths: ["/coordinator/library/coding/create", "/coordinator/library/coding/:id/edit", "/coordinator/compiler/create", "/coordinator/compiler/:id/edit"], permission: "coordinator.compiler.create" }),
  fromAdmin("admin.library-coding-preview", { id: "coordinator.library-coding-preview", area: "Question library", paths: ["/coordinator/library/coding/:id/preview", "/coordinator/library/coding/shared/:id/preview", "/coordinator/compiler/:id/preview"], permission: "coordinator.library.view" }),
  libraryGuides.coordinatorCodingAnalytics
    ? { ...libraryGuides.coordinatorCodingAnalytics, id: "coordinator.coding-analytics", area: "Question library", paths: ["/coordinator/library/coding/analytics", "/coordinator/compiler/analytics"], permission: "coordinator.compiler.analytics" }
    : null,
  fromAdmin("admin.announcement-create", { id: "coordinator.announcement-create", area: "Communication", paths: ["/coordinator/announcements/add"], permission: "coordinator.announcements.create" }),
  fromAdmin("admin.announcements", { id: "coordinator.announcements", area: "Communication", paths: ["/coordinator/announcements/manage"], permission: "coordinator.announcements.manage" }),
  fromAdmin("admin.email-templates", { id: "coordinator.email-templates", area: "Communication", paths: ["/coordinator/settings/email-templates"], permission: "coordinator.email-templates.manage" }),
  fromAdmin("admin.email-queue", { id: "coordinator.email-queue", area: "Communication", paths: ["/coordinator/email-queue"], permission: "coordinator.email-queue.manage" }),
  fromAdmin("admin.company-insights", { id: "coordinator.company-insights", area: "Students", paths: ["/coordinator/company-insights"], permission: "coordinator.company.view" }),
  fromAdmin("admin.company-benchmark-add", { id: "coordinator.company-benchmark-add", area: "Students", paths: ["/coordinator/company-insights/add"], permission: "coordinator.company.create" }),
  fromAdmin("admin.master-data", { id: "coordinator.master-data", area: "Settings", paths: ["/coordinator/settings/master-data", "/coordinator/settings/master-data/:category"], permission: "coordinator.master-data.manage" }),
  fromAdmin("admin.promote-students", { id: "coordinator.promote-students", area: "Settings", paths: ["/coordinator/settings/promote-students"], permission: "coordinator.students.promote" }),
  fromAdmin("admin.wallet", {
    id: "coordinator.wallet", area: "Account", paths: ["/coordinator/wallet"], permission: undefined,
    summary: "Your coordinator Prep Coin wallet: your balance, sending coins to your assigned students, and every coin received or sent.",
    intro: "This is your Prep Coin wallet.\nYour university admin sends coins to you; you pass them on to your own assigned students, for example to reward steady practice.",
  }),
].filter(Boolean);

const modules = [...own, ...shared];
const ids = new Set(modules.map((module) => module.id));

// next/openFrom must name coordinator guides: map admin.x → coordinator.x, drop when there is none.
const toCoordinator = (id) => {
  if (!id) return undefined;
  const mapped = id.startsWith("admin.") ? `coordinator.${id.slice("admin.".length)}` : id;
  return ids.has(mapped) ? mapped : undefined;
};

export default modules.map((clean) => {
  const next = toCoordinator(clean.next);
  const openFrom = toCoordinator(clean.openFrom);
  const result = { ...clean };
  if (next && next !== clean.id) result.next = next; else delete result.next;
  if (openFrom) result.openFrom = openFrom; else delete result.openFrom;
  if (!result.permission) delete result.permission;
  return result;
});
