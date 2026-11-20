// Admin guides: the student database, adding students, bulk lists, a student's profile and resume.
// Coordinators reuse Add Students, Bulk lists, the profile and the resume pages (coordinator/pages.js
// builds their guides from these modules), so that text stays role-neutral: "you", "your students".

export const studentDirectorySteps = [
  {
    id: "sd-title", target: "sd-title", chapter: "overview", quick: true,
    title: "Your student database",
    body: "Every registered student of your university in one table. The line under the title counts the students that match your current search and filters. When you open a bulk list, the title changes to that list's name and only its students are shown.",
  },
  {
    id: "sd-upload-file", target: "sd-upload-file", chapter: "parts",
    title: "Filter by uploaded file",
    body: "Pick a CSV upload (a bulk list) to see only the students who came from that file. Choose All uploaded files to go back to everyone.",
  },
  {
    id: "sd-semester", target: "sd-semester", chapter: "parts",
    title: "Semester",
    body: "Narrow the table to one semester. The number in brackets beside each semester is how many students are in it.",
  },
  {
    id: "sd-filters", target: "sd-filters", chapter: "parts", quick: true,
    title: "More filters",
    body: "Filter by platform activity (logged in or never logged in), credential eligibility, account status, credential mail, branch, course, college, section, group and coordinator. The badge shows how many filters are on; Clear all removes them.",
    tryIt: "Click Filters to open the filter panel",
  },
  {
    id: "sd-columns", target: "sd-columns", chapter: "parts",
    title: "Choose columns",
    body: "Show or hide table columns, such as email, section, coordinator or credential mail. Your choice is remembered on this browser. Show all brings every column back.",
  },
  {
    id: "sd-export", target: "sd-export", chapter: "actions",
    title: "Export results",
    body: "Downloads a CSV of the students that match your current search and filters, not only the page you are looking at.",
  },
  {
    id: "sd-select", target: "sd-select", chapter: "parts",
    title: "Select students",
    body: "Tick students in the table, or use Select page for everyone on this page. When some are selected you can also select every student that matches your filters, across all pages. Clear removes the selection.",
  },
  {
    id: "sd-search", target: "sd-search", chapter: "actions", quick: true,
    title: "Search",
    body: "Type a name, student ID, email, branch or course. The table updates as you type and works together with the filters.",
  },
  {
    id: "sd-bulk-actions", target: "sd-bulk-actions", chapter: "actions",
    title: "Bulk actions",
    body: "The ⋮ menu acts on the selected students: export them as CSV, change their access and features, send credential mail, or delete them. Credential mail only goes to students who have never logged in and have no credential email pending; the menu shows how many are eligible.",
  },
  {
    id: "sd-table", target: "sd-table", chapter: "parts", quick: true,
    title: "The student table",
    body: "Click a student's name to open their full profile. Click a column header to sort by it. Status shows Active once a student has logged in, otherwise Awaiting login; Credential mail shows whether the login email was sent.\nPage size and page controls sit under the table.",
  },
  {
    id: "sd-row-actions", chapter: "actions",
    title: "Actions on one student",
    body: "The ⋮ at the end of each row lets you view the profile, edit details, change access and features, copy the email or student ID, download that student's data, resend credential mail (before first login) or delete the student. Deleting asks you to confirm first.",
  },
  {
    id: "sd-back", chapter: "tips",
    title: "Your list is kept",
    body: "Search, filters, sort and page are kept for this browser tab, so you can open a student, press Back and land on the same list.",
  },
];

export const onboardingSteps = [
  {
    id: "onb-title", target: "onb-title", chapter: "overview", quick: true,
    title: "Add students",
    body: "Create student accounts in bulk from a CSV file, or one at a time with a short form. Every row is checked before anything is saved.",
  },
  {
    id: "onb-quota", target: "onb-quota", chapter: "parts",
    title: "Account limit",
    body: "How many student accounts your university is using out of its limit. If the limit is reached, new students cannot be added. Refresh reloads the number.",
  },
  {
    id: "onb-guidelines", target: "onb-guidelines", chapter: "parts", quick: true,
    title: "CSV guidelines",
    body: "The columns your file needs and the rules they must follow. Teacher ID must match an existing coordinator; Section and Group use values from master data. Passwords are generated for each student automatically.",
  },
  {
    id: "onb-actions", target: "onb-actions", chapter: "actions",
    title: "Sample file and single entry",
    body: "Download Sample CSV gives you a file with the right headers in the right order: fill it in rather than building your own. Add Single Student opens a form for one student.",
  },
  {
    id: "onb-single-form", target: "onb-single-form", chapter: "actions",
    title: "Add one student",
    body: "Fill in the required fields; branch, semester, course and campus come from master data, and Teacher ID lets you pick one or more existing coordinators. Create Student asks you to confirm, where you can also choose to send the login email.",
  },
  {
    id: "onb-upload", target: "onb-upload", chapter: "actions", quick: true,
    title: "Upload a CSV",
    body: "Drop your CSV here or click to browse. The file is read and checked straight away: missing fields, bad emails and duplicate rows are flagged, then the rows are compared with existing students to see who is new and who will be updated.",
  },
  {
    id: "onb-stats", target: "onb-stats", chapter: "parts",
    title: "Check results",
    body: "Total rows in your file, how many are valid and how many have errors. You can only upload once errors are at zero.",
  },
  {
    id: "onb-records", target: "onb-records", chapter: "actions", quick: true,
    title: "Upload to server",
    body: "When the file is clean, Upload to Server asks for a bulk list name and lets you choose to queue login emails (and, where your university uses it, which modules these students can use). Download Errors CSV lists every problem; Clear All starts over.",
  },
  {
    id: "onb-errors", target: "onb-errors", chapter: "parts",
    title: "Validation errors",
    body: "Each problem with its row number. Fix them in your spreadsheet and upload the file again.",
  },
  {
    id: "onb-preview", target: "onb-preview", chapter: "parts",
    title: "Preview your rows",
    body: "Every row of the file with its status: Valid, Ready to add, Will update (with the fields that change), Already exists or a conflict. Click a row to open its details in a tab above the table.",
  },
];

export const bulkListSteps = [
  {
    id: "bl-title", target: "bl-title", chapter: "overview", quick: true,
    title: "Bulk student lists",
    body: "Every CSV upload is saved as a named list, so you can find the students who came from one file and act on them together.",
  },
  {
    id: "bl-search", target: "bl-search", chapter: "actions",
    title: "Find a list",
    body: "Search by list name or original file name.",
  },
  {
    id: "bl-stats", target: "bl-stats", chapter: "parts",
    title: "Totals",
    body: "How many lists are saved, how many students they represent, and the date of the latest upload.",
  },
  {
    id: "bl-table", target: "bl-table", chapter: "parts", quick: true,
    title: "The lists",
    body: "Each list shows its original file, upload date, number of students, what the upload did (added, updated, failed) and who uploaded it. Click a row to open its students in the student table. Lists created from an assessment are tagged Assessment.",
  },
  {
    id: "bl-actions", chapter: "actions", quick: true,
    title: "List actions",
    body: "The ⋮ on a row opens View students. Where your role allows, it also lets you send credential mail to the list's eligible students, rename the list, or delete it.\nDeleting a list also deletes every student account in it, and asks you to type DELETE first.",
  },
];

export const studentProfileSteps = [
  {
    id: "sp-breadcrumb", target: "sp-breadcrumb", chapter: "layout",
    title: "Back to students",
    body: "Students takes you back to the student list, with your search and filters as you left them.",
  },
  {
    id: "sp-identity", target: "sp-identity", chapter: "parts", quick: true,
    title: "Who the student is",
    body: "Photo, name, coding level (click it to see every level), whether the account is active, and the student's bio. This column stays in view as you scroll.",
  },
  {
    id: "sp-contact", target: "sp-contact", chapter: "actions",
    title: "Resume and email",
    body: "View Resume opens the resume the student built in PeerPrep, read-only. The mail button starts an email to the student.",
  },
  {
    id: "sp-details", target: "sp-details", chapter: "parts",
    title: "Student details",
    body: "Student ID, email, college, course, branch, semester, section, group, coordinator and the date the account was created. Not provided means the field is empty.",
  },
  {
    id: "sp-prep-score", target: "sp-prep-score", chapter: "parts", quick: true,
    title: "Prep Score",
    body: "The student's overall Prep Score, the same number used in rankings and Prep Analysis, with the module scores behind it: Prep Coding, Assessment, Interview and Learning (only modules your university uses).",
  },
  {
    id: "sp-snapshot", target: "sp-snapshot", chapter: "parts", quick: true,
    title: "Performance snapshot",
    body: "Headline numbers for each module the student can use: problems solved, acceptance, assessment average, interview average, learning progress and current streak. A dash means there is no data yet, not a zero score.",
  },
  {
    id: "sp-tabs", target: "sp-tabs", chapter: "layout", quick: true,
    title: "Profile sections",
    body: "Overview, Coding, Quick Prep, Assessments, Interviews, Learning and Activity. Tabs for modules this student cannot use are hidden. The bar stays at the top while you scroll.",
  },
  {
    id: "sp-panel", target: "sp-panel", chapter: "parts",
    title: "Section detail",
    body: "The open section. Overview has coding progress, badges, a recent timeline and milestones; Coding lists submissions and solved problems; the other tabs show that module's scores, sheets, feedback or courses.",
  },
];

export const studentResumeSteps = [
  {
    id: "sr-title", target: "sr-title", chapter: "overview", quick: true,
    title: "Student resume",
    body: "The resume this student built in PeerPrep's resume builder, shown read-only on an A4 page. You see their latest saved version.",
  },
  {
    id: "sr-back", target: "sr-back", chapter: "layout",
    title: "Back to profile",
    body: "Returns to this student's profile.",
  },
  {
    id: "sr-download", target: "sr-download", chapter: "actions", quick: true,
    title: "Download PDF",
    body: "Creates a PDF of the resume and downloads it, for example to share with a recruiter or placement cell.",
  },
  {
    id: "sr-preview", target: "sr-preview", chapter: "parts", quick: true,
    title: "Resume preview",
    body: "The resume as it prints. Longer resumes have more than one page: use the arrows under the page to move between them.",
  },
  {
    id: "sr-empty", target: "sr-empty", chapter: "parts",
    title: "No resume yet",
    body: "The student has not saved a resume in PeerPrep. It appears here as soon as they save one.",
  },
];

export default [
  {
    id: "admin.students",
    paths: ["/admin/students"],
    area: "Students",
    title: "Students",
    icon: "users",
    summary: "Search, filter, select and manage every student account, and open any student's profile.",
    intro: "This is your student database.\nFind students with search and filters, pick the columns you need, export lists, send login emails, and open any student's full profile.",
    next: "admin.onboarding",
    tips: [
      "Filter by Never logged in, then select all matching and send credential mail to chase students who have not started.",
      "Export results downloads every matching student, across all pages.",
      "Open a bulk list from Bulk lists to see only the students from one CSV upload.",
    ],
    terms: [
      { term: "Awaiting login", text: "The student has an account but has never signed in." },
      { term: "Credential mail", text: "The email with the student's login details. Unconfirmed means it may have been sent before delivery tracking existed." },
    ],
    steps: studentDirectorySteps,
  },
  {
    id: "admin.onboarding",
    paths: ["/admin/onboarding"],
    area: "Students",
    title: "Add Students",
    icon: "userPlus",
    summary: "Add students in bulk from a CSV file or one at a time, with every row checked before it is saved.",
    intro: "Add Students creates student accounts.\nUpload a CSV for a whole batch, or add one student with the form. Errors are shown before anything is saved, and each upload becomes a named bulk list.",
    next: "admin.bulk-lists",
    tips: [
      "Start from Download Sample CSV so the headers and their order are right.",
      "Set up courses, branches, sections and groups in master data first; the form and the checks use those lists.",
      "Uploading a student who already exists updates their details instead of creating a duplicate.",
    ],
    steps: onboardingSteps,
  },
  {
    id: "admin.bulk-lists",
    paths: ["/admin/students/bulk-lists"],
    area: "Students",
    title: "Bulk lists",
    icon: "spreadsheet",
    summary: "Every CSV upload saved as a named list of students, ready to open or act on together.",
    intro: "Each time students are uploaded from a CSV, the upload is kept here as a bulk list.\nOpen a list to see just those students, or act on the whole list at once.",
    next: "admin.students",
    tips: [
      "Give uploads clear names (for example batch and section) so lists are easy to find later.",
      "Deleting a list deletes its student accounts too. To remove only the list, rename it instead.",
    ],
    steps: bulkListSteps,
  },
  {
    id: "admin.student-profile",
    paths: ["/admin/students/:studentId"],
    area: "Students",
    title: "Student profile",
    icon: "user",
    summary: "One student's details, Prep Score and performance in every module, with a tab for each.",
    intro: "Everything about one student on one page.\nWho they are and how to reach them on the left; their Prep Score, headline numbers and a tab per module on the right.",
    openFrom: "admin.students",
    next: "admin.students",
    tips: [
      "Use the tabs to go from the headline number to the detail behind it.",
      "A dash means no data yet; it is not a score of zero.",
    ],
    steps: studentProfileSteps,
  },
  {
    id: "admin.student-resume",
    paths: ["/admin/students/:studentId/resume"],
    area: "Students",
    title: "Student resume",
    icon: "file",
    summary: "A read-only view of the resume a student built in PeerPrep, with a PDF download.",
    intro: "This is the resume the student made in PeerPrep's resume builder.\nYou can read it and download it as a PDF, but only the student can change it.",
    openFrom: "admin.students",
    next: "admin.students",
    steps: studentResumeSteps,
  },
];
