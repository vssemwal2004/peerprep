// Admin guides: the university activity log and changing your password.

export default [
  {
    id: "admin.activity",
    paths: ["/admin/activity"],
    area: "Account",
    title: "Activity log",
    icon: "history",
    deployment: "university",
    summary: "A 10-day audit sheet of what university admins and coordinators did, with filters and a CSV export.",
    intro: "The activity log records who changed what in your university.\nFilter it by person, action, record type and dates, and export the view as a spreadsheet.",
    next: "admin.overview",
    tips: [
      "Pick one coordinator in the Actor filter to review only their actions.",
      "Open View changes on a row to see each field's old and new value.",
      "Export sheet downloads exactly the rows your filters show.",
    ],
    steps: [
      {
        id: "act-header", target: "act-header", chapter: "overview",
        title: "Your university's audit trail",
        body: "Actions by university admins and coordinators over the last 10 days by default. These logs stay inside your university's database.",
      },
      {
        id: "act-buttons", target: "act-buttons", chapter: "actions", quick: true,
        title: "Refresh and Export sheet",
        body: "Refresh loads the newest actions. Export sheet downloads the current filtered view as a CSV file.",
      },
      {
        id: "act-stats", target: "act-stats", chapter: "parts", quick: true,
        title: "Summary",
        body: "Events in the selected view, actions today, records created or updated, and sensitive actions (delete, cancel or reject).",
      },
      {
        id: "act-filters", target: "act-filters", chapter: "actions", quick: true,
        title: "Filters",
        body: "Search by action, email or record ID and press Search. Narrow by actor (all, admins, all coordinators, or one coordinator), action type, record type and a date range. The reset button clears every filter.",
      },
      {
        id: "act-sheet", target: "act-sheet", chapter: "parts", quick: true,
        title: "10-day activity sheet",
        body: "Rows grouped by day: time, who acted and their role, the action, the record, and what changed. Click a column name to sort; any sort other than time shows one flat list.",
      },
    ],
  },
  {
    id: "admin.change-password",
    paths: ["/admin/change-password"],
    area: "Account",
    title: "Change password",
    icon: "key",
    summary: "Change the password of your admin account.",
    intro: "Set a new password for your admin account.\nAfter it changes you are signed out and sign in again with the new password.",
    nudge: false,
    steps: [
      {
        id: "apw-header", target: "apw-header", chapter: "overview",
        title: "Change your password",
        body: "Updates the password of the account you are signed in with.",
      },
      {
        id: "apw-current", target: "apw-current", chapter: "parts", quick: true,
        title: "Current password",
        body: "Enter the password you use now. The eye button shows or hides what you type.",
      },
      {
        id: "apw-new", target: "apw-new", chapter: "parts", quick: true,
        title: "New password",
        body: "At least 8 characters and it must contain @ or #. The checks below the box turn green as each rule is met.",
      },
      {
        id: "apw-confirm", target: "apw-confirm", chapter: "parts",
        title: "Confirm it",
        body: "Type the new password again. The page tells you straight away whether the two match.",
      },
      {
        id: "apw-buttons", target: "apw-buttons", chapter: "actions", quick: true,
        title: "Update or cancel",
        body: "Update Password saves it, signs you out and takes you to sign-in, where you use the new password. Cancel leaves without changing anything.",
      },
    ],
  },
];
