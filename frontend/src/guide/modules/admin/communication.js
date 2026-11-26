// Admin guides: announcements, email templates and the email queue. Coordinators use the same
// pages on /coordinator/* routes (coordinator modules import these step arrays), so keep the step
// ids stable and the text role-neutral.

export const announcementCreateSteps = [
  {
    id: "ac-header", target: "ac-header", chapter: "overview",
    title: "Write an announcement",
    body: "Announcements appear on the student dashboard. Use them for reminders, news and encouragement.",
  },
  {
    id: "ac-title", target: "ac-title", chapter: "parts", quick: true,
    title: "Title",
    body: "A short headline students see first. Title and message are both required.",
  },
  {
    id: "ac-message", target: "ac-message", chapter: "parts",
    title: "Message",
    body: "The full text of the announcement. Keep it short and say what students should do.",
  },
  {
    id: "ac-audience", target: "ac-audience", chapter: "parts", quick: true,
    title: "Who sees this",
    body: "All students, or only selected students. Choose Selected students to tick registered students (search, semester and other filters, select all filtered) or upload a CSV/Excel list with name and email (semester, college and branch are optional). Only the chosen students will see it.",
  },
  {
    id: "ac-type-status", target: "ac-type-status", chapter: "parts",
    title: "Type and status",
    body: "Type labels the announcement as Motivation, Info or Alert. Status decides whether Save makes it visible: Active shows it to students, Inactive keeps it as a draft.",
  },
  {
    id: "ac-priority-expiry", target: "ac-priority-expiry", chapter: "parts",
    title: "Priority and expiry",
    body: "Higher-priority announcements are listed first. After the expiry date passes, the announcement is no longer shown; leave it empty to keep it until you turn it off.",
  },
  {
    id: "ac-popup", target: "ac-popup", chapter: "parts", quick: true,
    title: "Show as a popup",
    body: "Tick this to show the announcement as a popup when students sign in. They see it once after each login while it is active.",
  },
  {
    id: "ac-buttons", target: "ac-buttons", chapter: "actions", quick: true,
    title: "Save or Publish",
    body: "Save stores it with the status you chose. Publish stores it as Active, so students see it straight away. You can edit, deactivate or delete it later under Manage announcements.",
  },
];

export const announcementManageSteps = [
  {
    id: "am-header", target: "am-header", chapter: "overview",
    title: "All announcements",
    body: "Every announcement, active or not. From here you edit, switch on or off, or delete them.",
  },
  {
    id: "am-filters", target: "am-filters", chapter: "actions", quick: true,
    title: "Filter",
    body: "Show only Active or Inactive announcements, or only one type: Motivation, Info or Alert.",
  },
  {
    id: "am-table", target: "am-table", chapter: "parts", quick: true,
    title: "The list",
    body: "Each announcement with its type, status, priority, expiry and creation date. A Popup tag means students see it after they sign in. Click a column header to sort.",
  },
  {
    id: "am-actions", target: "am-table", chapter: "actions", quick: true,
    title: "Edit, Activate, Delete",
    body: "Edit opens the full form. Activate or Deactivate shows or hides it for students at once. Delete removes it for good after you confirm; to hide it for now, Deactivate instead.",
  },
];

export const emailTemplateSteps = [
  {
    id: "et-header", target: "et-header", chapter: "overview",
    title: "System email templates",
    body: "The subject lines and HTML content of the emails PeerPrep sends, such as credentials and invitations.",
  },
  {
    id: "et-search", target: "et-search", chapter: "actions", quick: true,
    title: "Find a template",
    body: "Search by template name, subject or type.",
  },
  {
    id: "et-table", target: "et-table", chapter: "parts", quick: true,
    title: "Templates",
    body: "Each template with its subject, type and last update. System templates are built in; Custom ones were added later. On or Off shows whether the template is in use.",
  },
  {
    id: "et-actions", target: "et-table", chapter: "actions", quick: true,
    title: "The actions menu",
    body: "The menu at the end of each row lets you view the email, edit it, or turn it off or on. While a template is off, emails of that type are not sent. Only custom templates can be deleted, and deleting cannot be undone.",
  },
  {
    id: "et-editor", chapter: "tips",
    title: "Editing a template",
    body: "The editor shows the HTML beside a live preview. Click a variable chip to insert it where your cursor is; use Find to jump through the HTML, and Undo or Redo while editing. Save Changes applies it to the next emails.",
  },
];

export const emailQueueSteps = [
  {
    id: "eq-header", target: "eq-header", chapter: "overview",
    title: "Track every system email",
    body: "Queued, delivered and failed emails, such as student credentials and invitations. Delivery logs are kept for seven days.",
  },
  {
    id: "eq-refresh", target: "eq-refresh", chapter: "actions",
    title: "Refresh",
    body: "The list also refreshes by itself every few seconds while the page is open, so you can watch a batch go out.",
  },
  {
    id: "eq-cards", target: "eq-cards", chapter: "parts", quick: true,
    title: "Status totals",
    body: "All emails, waiting (queued or being sent), delivered and failed, for your current filters.",
  },
  {
    id: "eq-filters", target: "eq-filters", chapter: "actions", quick: true,
    title: "Filters",
    body: "Search by recipient, requester, batch or error text, and filter by mail type, delivery status and dates.",
  },
  {
    id: "eq-table", target: "eq-table", chapter: "parts", quick: true,
    title: "Email log",
    body: "Each email with its recipient, type, status, attempts used, when it was queued and finished, and details. For a failed email, Details shows the last error, which tells you what to fix (often the address).",
  },
];

export default [
  {
    id: "admin.announcement-create",
    paths: ["/admin/announcements/add"],
    area: "Communication",
    title: "Add announcement",
    icon: "megaphone",
    summary: "Write an announcement for the student dashboard, optionally as a popup after sign-in.",
    intro: "Create an announcement students see on their dashboard.\nFill in the title and message, choose how it shows, then save it as a draft or publish it.",
    next: "admin.announcements",
    tips: [
      "Use Save with status Inactive to prepare an announcement in advance.",
      "Set an expiry date for time-bound news so it disappears by itself.",
      "Keep popups for important messages: students see them after each login.",
    ],
    steps: announcementCreateSteps,
  },
  {
    id: "admin.announcements",
    paths: ["/admin/announcements/manage"],
    area: "Communication",
    title: "Manage announcements",
    icon: "megaphone",
    summary: "Edit, switch on or off, and delete the announcements shown to students.",
    intro: "All announcements in one list.\nFilter them, change what students see with one click, or edit the details.",
    next: "admin.announcement-create",
    tips: [
      "Deactivate instead of delete if you may need the announcement again.",
      "Sort by Expiry to find announcements that are about to disappear.",
    ],
    steps: announcementManageSteps,
  },
  {
    id: "admin.email-templates",
    paths: ["/admin/settings/email-templates"],
    area: "Communication",
    title: "Email templates",
    icon: "mail",
    summary: "The subject and HTML content of every system email, with preview, editing and an on/off switch.",
    intro: "Every email PeerPrep sends uses one of these templates.\nView, edit or switch off a template here; changes apply to the next emails sent.",
    next: "admin.email-queue",
    tips: [
      "Preview a template with View before you edit it.",
      "Keep the {{variables}} in place: they are filled in for each recipient.",
      "Turning a template off stops that type of email until you turn it on again.",
    ],
    steps: emailTemplateSteps,
  },
  {
    id: "admin.email-queue",
    paths: ["/admin/email-queue"],
    area: "Communication",
    title: "Email queue",
    icon: "inbox",
    summary: "Track queued, delivered and failed system emails with their attempts and errors.",
    intro: "The email queue shows what happened to each email PeerPrep sent.\nUse it to confirm students got their credentials or invitations, and to find failures.",
    next: "admin.email-templates",
    tips: [
      "Filter by status Failed to see only problems.",
      "Search by a student's email to check whether their mail arrived.",
      "Logs are kept for seven days.",
    ],
    steps: emailQueueSteps,
  },
];
