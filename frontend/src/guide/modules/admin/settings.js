// Admin guides: settings pages. Coordinators reuse Master data and Promote students on
// /coordinator/* routes (coordinator modules import masterDataSteps and promotionSteps), so keep
// those step ids stable and the text role-neutral.

export const masterDataSteps = [
  {
    id: "md-header", target: "md-header", chapter: "overview",
    title: "Approved academic values",
    body: "Master data is the list of approved values that student onboarding, the student directory and analysis filters pick from: campuses, branches, semesters, courses, sections and groups.",
  },
  {
    id: "md-sync", target: "md-sync", chapter: "actions",
    title: "Sync from students",
    body: "Reads the values already used in student records and adds any that are missing here, refreshing the ones that exist. Use it once after a large upload so every value in use is listed.",
  },
  {
    id: "md-categories", target: "md-categories", chapter: "layout", quick: true,
    title: "Data categories",
    body: "Pick the list to manage. Each category shows how many values it holds; the open one is highlighted.",
    tryIt: "Click a category, for example Branches",
  },
  {
    id: "md-category", target: "md-category", chapter: "parts",
    title: "The open category",
    body: "The name and purpose of the list you are editing. Everything below belongs to this category only.",
  },
  {
    id: "md-search", target: "md-search", chapter: "actions",
    title: "Search values",
    body: "Type part of a name or code to narrow the table.",
  },
  {
    id: "md-table", target: "md-table", chapter: "parts", quick: true,
    title: "Values table",
    body: "Each value with its code, how many students use it, and whether it is Active. Inactive values are not offered in student forms and analytics. Use the pencil to edit and the bin to delete.",
  },
  {
    id: "md-add", target: "md-add", chapter: "actions", quick: true,
    title: "Add a value",
    body: "Opens a short form: display name (a number from 1 to 8 for semesters), an optional code, the display order, and whether it is available in student forms and analytics. Renaming a value in use also updates the student records that use it.",
  },
  {
    id: "md-delete", chapter: "tips",
    title: "Deleting safely",
    body: "Only unused values can be deleted. If students use a value, reassign them first, or mark the value Inactive instead so reports stay consistent.",
  },
];

export const promotionSteps = [
  {
    id: "sp-header", target: "sp-header", chapter: "overview",
    title: "Move students up a semester",
    body: "Promotion moves students from their current semester to the next one. Open a semester, review its roster, then promote one student, the ones you select, or the whole semester.",
  },
  {
    id: "sp-semesters", target: "sp-semesters", chapter: "parts", quick: true,
    title: "Semesters",
    body: "One card per semester with its number of registered students. Promotable semesters can move up; Semester 8 is Final and cannot be promoted. Click a card to open its roster.",
  },
  {
    id: "sp-roster", target: "sp-roster", chapter: "parts", quick: true,
    title: "Semester roster",
    body: "Every student in the open semester, with how many are selected. Tick students in the first column; the header box selects every student that matches the search, on all pages.",
  },
  {
    id: "sp-search", target: "sp-search", chapter: "actions",
    title: "Search the roster",
    body: "Filter by name, ID, email, course or branch before you select, so you promote exactly the right group.",
  },
  {
    id: "sp-table", target: "sp-table", chapter: "parts",
    title: "Students and the Promote button",
    body: "Each row shows the student's ID, email, course, branch, college and group. Promote on a row moves just that student.",
  },
  {
    id: "sp-actions", target: "sp-actions", chapter: "actions", quick: true,
    title: "Promote selected or all",
    body: "Promote selected moves the ticked students; Promote all moves the whole semester. A confirmation shows how many students will move before anything changes.",
  },
  {
    id: "sp-what-changes", chapter: "tips",
    title: "What changes",
    body: "Only the semester changes, immediately after you confirm. Assessment history, learning progress, accounts and coordinator assignments stay the same. This page has no undo, so check the count in the confirmation.",
  },
];

export default [
  {
    id: "admin.prep-topic-priority",
    paths: ["/admin/settings/prep-topic-priority"],
    area: "Settings",
    title: "Prep Topic Priority Adjustment",
    icon: "sliders",
    deployment: "control",
    summary: "Topic weight, target and priority for SBC and PBC Prep Readiness, edited as a draft, previewed on real students and published for every university.",
    intro: "This page sets the Prep Readiness topic policy for every university.\nWeight and target change scores; priority only orders ANVI practice suggestions. Nothing changes for students until you publish.",
    tips: [
      "Run the preview before publishing: it separates catalogue shortages from student practice gaps.",
      "Excluding a topic from a track (weight 0) removes it from that track's total.",
      "If another admin publishes first, your edits stay on screen; reload to continue from their version.",
    ],
    steps: [
      { id: "ptp-header", target: "ptp-header", chapter: "overview", quick: true, title: "Live version and draft", body: "Shows the live version, your draft and unsaved changes, with the read-only cutoffs (SBC 70, PBC 75) and Easy/Medium/Hard multipliers for each track." },
      { id: "ptp-editor", target: "ptp-editor", chapter: "parts", quick: true, title: "Edit topics", body: "Switch between SBC and PBC, search or filter by category, and change weight, target and priority. Rows that differ from live are highlighted, and invalid values are flagged inline." },
      { id: "ptp-actions", target: "ptp-actions", chapter: "actions", title: "Save, discard, publish", body: "Save the draft as often as you like. Publishing needs a short reason and a confirmation, and records who published which version and when." },
      { id: "ptp-preview", target: "ptp-preview", chapter: "parts", title: "Preview impact", body: "Scores stored evidence for a chosen university under the draft without changing anything: score distributions before and after, and topics where the catalogue cannot reach the target." },
      { id: "ptp-unmapped", target: "ptp-unmapped", chapter: "parts", title: "Questions without a topic", body: "Practice questions whose tags match no canonical topic. Choose a topic to start giving readiness credit for their accepted solves; each choice is audited." },
      { id: "ptp-history", target: "ptp-history", chapter: "parts", title: "Version history", body: "Every published version with its date and reason. Student growth charts score each day under the version that applied then." },
    ],
  },
  {
    id: "admin.prep-score-adjustment",
    paths: ["/admin/settings/prep-score-adjustment"],
    area: "Settings",
    title: "Prep Score Adjustment",
    icon: "sliders",
    deployment: "control",
    summary: "Every value in the Prep Score formula for all universities, edited as a draft, previewed on real students and then published.",
    intro: "This page sets how the Prep Score is calculated for every university.\nChanges stay in a draft until you publish; you can try them on a sample student and preview the effect on real students first.",
    next: "admin.prep-coin-pricing",
    tips: [
      "Save a draft as often as you like: students see nothing until you publish.",
      "Run the impact preview before publishing to see how many scores and ranks change.",
      "Restore an older version as a draft if a change needs to be rolled back.",
    ],
    terms: [
      { term: "draft", text: "Saved values that are not live yet. Students keep the published version until you publish the draft." },
      { term: "Prep Coding", text: "Verified coding solves are the only activity that changes Prep Score and rank." },
      { term: "daily topic limit", text: "How many new solves per topic count each day (IST). Later solves that day add nothing to the score." },
    ],
    steps: [
      {
        id: "psa-header", target: "psa-header", chapter: "overview",
        title: "One formula for every university",
        body: "Prep Score comes from verified Prep Coding solves. Assessment, Interview and Learning keep independent activity points. Students see their Prep Score and rank. Prep Coins are separate and not affected.",
      },
      {
        id: "psa-status", target: "psa-status", chapter: "parts", quick: true,
        title: "Live, draft and unsaved",
        body: "Live is the published version students are scored with. Draft appears when a saved draft is waiting. Unsaved changes means you edited values that are not saved yet.",
      },
      {
        id: "psa-points", target: "psa-points", chapter: "parts", quick: true,
        title: "Prep Score points",
        body: "Prep Score is a points total replayed from each student's own history: solves (shared across the problem's topics, within the daily topic limit), the daily challenge, finished sheets, daily visits and badges add points; wrong answers and days without practice remove a little, with caps. It never goes below 0.",
      },
      {
        id: "psa-formula", target: "psa-formula", chapter: "parts",
        title: "Prep Coding activity formula",
        body: "S × N^α × Q^β is now the Prep Coding activity metric used in Prep Analysis, where N is the Easy, Medium and Hard solves counted and Q is the average points per solve. It does not set the Prep Score.",
      },
      {
        id: "psa-module", target: "psa-module", chapter: "parts",
        title: "Module cards",
        body: "The Prep Coding card controls Prep Score points and the daily solves per topic that count (0 means no limit; applies to solves after publishing). Other cards control independent activity points, pass marks, video completion and their counting rules.",
      },
      {
        id: "psa-simulator", target: "psa-simulator", chapter: "actions",
        title: "Try it on a student",
        body: "Type a student's Easy, Medium and Hard coding solves to see the Prep Score these values would give, including unsaved changes. Reset sample brings back the example numbers.",
      },
      {
        id: "psa-impact", target: "psa-impact", chapter: "actions", quick: true,
        title: "Impact on real students",
        body: "Choose a university and Run preview to compare current scores with these values: students with work, scores and ranks that change, the average before and after, and the top students. Nothing is saved or shown to students.",
      },
      {
        id: "psa-publish", target: "psa-publish", chapter: "actions", quick: true,
        title: "Save and publish",
        body: "Save draft keeps your values without affecting anyone. Publish needs a reason of at least 5 characters and a confirmation; it then recalculates every student's score and rank in the background, and students keep their previous scores until theirs finishes.",
      },
      {
        id: "psa-history", target: "psa-history", chapter: "parts",
        title: "Version history",
        body: "Every published version with its reason and date; the live one is marked. Restore as draft copies an older version into the draft so you can review and publish it again.",
      },
    ],
  },
  {
    id: "admin.progression-settings",
    paths: ["/admin/settings/student-progression"],
    area: "Settings",
    title: "Challenges & badges",
    icon: "trophy",
    summary: "The daily coding challenge policy, your own university badges, the level requirements and the last 30 days of rewards.",
    intro: "Set how the daily challenge works for your students and add badges of your own.\nNew assignments use the saved rules; targets already given and rewards already earned are kept.",
    next: "admin.student-access",
    tips: [
      "Use Policy scope to give one semester its own rules; other semesters keep the defaults.",
      "A feature your university does not have cannot be turned on here.",
      "Pause the challenge through a date for exams or holidays.",
    ],
    terms: [{ term: "Policy scope", text: "Which students a saved policy applies to: all students, or one semester. Semester policies inherit the university defaults." }],
    steps: [
      {
        id: "eng-header", target: "eng-header", chapter: "overview",
        title: "Challenges and badges",
        body: "Every student gets a personal daily coding problem, plus permanent badges and levels. This page sets the rules for that.",
      },
      {
        id: "eng-scope", target: "eng-scope", chapter: "actions", quick: true,
        title: "Choose the policy scope",
        body: "Pick All students or one semester; the page loads that policy. Your university's module allocation is the upper limit: choosing a feature here cannot unlock a module the university does not have.",
      },
      {
        id: "eng-daily", target: "eng-daily", chapter: "parts", quick: true,
        title: "Daily challenge policy",
        body: "The daily challenge resets at 2 AM IST. Each student gets one unsolved coding problem at their level, different from classmates. Universities without coding get one task from their other features.",
      },
      {
        id: "eng-enabled", target: "eng-enabled", chapter: "actions",
        title: "Turn the challenge on or off",
        body: "Untick Enabled and save to stop assigning daily challenges for this scope.",
      },
      {
        id: "eng-domains", target: "eng-domains", chapter: "parts",
        title: "Features the challenge can use",
        body: "Tick the features a challenge may come from. Features marked Not allocated are not part of your university's plan and cannot be ticked.",
      },
      {
        id: "eng-limits", target: "eng-limits", chapter: "parts",
        title: "Time, XP, difficulty and pause",
        body: "Set the daily time budget, the XP a completed challenge gives, the hardest difficulty it may use, and a date (IST) to pause the challenge through.",
      },
      {
        id: "eng-badges", target: "eng-badges", chapter: "parts", quick: true,
        title: "University badges",
        body: "Create your own badge: give it a name, choose a verified metric and a target, then Add. The bin retires a badge; editions already earned keep their original requirements.",
      },
      {
        id: "eng-save", target: "eng-save", chapter: "actions", quick: true,
        title: "Save the policy",
        body: "Saves the daily challenge settings and badges for the chosen scope. New assignments use these rules; existing targets and earned rewards are kept.",
      },
      {
        id: "eng-levels", target: "eng-levels", chapter: "parts",
        title: "Level requirements",
        body: "What each level needs: XP, mastery and active days. All three are required, XP cannot replace mastery, and levels never drop when a student takes a break.",
      },
      {
        id: "eng-stats", target: "eng-stats", chapter: "parts",
        title: "Last 30 days",
        body: "How many students earned rewards, the XP awarded, and the share of daily challenges completed out of those assigned.",
      },
    ],
  },
  {
    id: "admin.student-access",
    paths: ["/admin/settings/student-access"],
    area: "Settings",
    title: "Default student access",
    icon: "shield",
    summary: "Choose which modules every future student gets when they are added; existing students keep their permissions.",
    intro: "These defaults decide what new students can use from their first sign-in.\nThey apply to future single and Excel/CSV onboarding only.",
    next: "admin.master-data",
    tips: [
      "Change one student's access from their profile; this page only sets the default.",
      "Prep Mates stays off unless you tick it, even with complete access on.",
    ],
    steps: [
      {
        id: "sa-header", target: "sa-header", chapter: "overview",
        title: "Defaults for new students",
        body: "What every future student receives at onboarding. Students who already exist keep the permissions they have.",
      },
      {
        id: "sa-all", target: "sa-all", chapter: "actions", quick: true,
        title: "Complete platform access",
        body: "When on, adding a student skips the access popup and grants every standard module. Turn it off to choose modules yourself.",
      },
      {
        id: "sa-features", target: "sa-features", chapter: "parts", quick: true,
        title: "Choose modules",
        body: "Click a module to tick or untick it. Opt-in modules such as Prep Mates are off unless you turn them on. Disabled modules are removed from the student menu and blocked on direct links.",
      },
      {
        id: "sa-save", target: "sa-save", chapter: "actions", quick: true,
        title: "Save defaults",
        body: "Saves the defaults for future onboarding. With complete access off, at least one module must be ticked.",
      },
    ],
  },
  {
    id: "admin.master-data",
    paths: ["/admin/settings/master-data", "/admin/settings/master-data/:category"],
    area: "Settings",
    title: "Master data",
    icon: "database",
    summary: "The approved campuses, branches, semesters, courses, sections and groups used by onboarding, directories and filters.",
    intro: "Master data keeps student records consistent.\nEvery form and filter that asks for a campus, branch, semester, course, section or group picks from these lists.",
    next: "admin.bulk-uploads",
    tips: [
      "Run Sync from students after a large upload to list every value in use.",
      "Mark a value Inactive instead of deleting it when students still use it.",
      "Use Display order to put the most common values first.",
    ],
    steps: masterDataSteps,
  },
  {
    id: "admin.bulk-uploads",
    paths: ["/admin/settings/bulk-uploads"],
    area: "Settings",
    title: "Bulk uploads",
    icon: "upload",
    summary: "Every student, coordinator and question spreadsheet uploaded, with results, downloads, archiving and guarded deletion.",
    intro: "Each spreadsheet upload is kept as a list you can track.\nSee what it created or updated, download its data or errors, and remove it safely when needed.",
    next: "admin.promote-students",
    tips: [
      "Click a row to see its full details and download the error report.",
      "Archive hides an upload from the default view; Restore brings it back.",
      "Deleting asks you to type the list name and shows what will be removed first.",
    ],
    steps: [
      {
        id: "bu-header", target: "bu-header", chapter: "overview",
        title: "Your upload history",
        body: "Student, coordinator and question spreadsheets, each kept with a record of which rows it created or updated, so downloads and deletions stay traceable.",
      },
      {
        id: "bu-shortcuts", target: "bu-shortcuts", chapter: "actions",
        title: "Upload more",
        body: "Upload students, Upload coordinators and Upload questions open the pages where you add a new spreadsheet. Refresh reloads this list.",
      },
      {
        id: "bu-stats", target: "bu-stats", chapter: "parts", quick: true,
        title: "Summary",
        body: "How many uploads match your filters, and the records and failed rows on the current page of the table.",
      },
      {
        id: "bu-filters", target: "bu-filters", chapter: "actions", quick: true,
        title: "Filters",
        body: "Search by list, file or uploader, and filter by data type, status (active, archived or deleted audit records) and upload dates. Press Apply filters; Reset clears them. Active uploads show by default.",
      },
      {
        id: "bu-table", target: "bu-table", chapter: "parts", quick: true,
        title: "Uploads table",
        body: "Each upload with its type, date, records, result (created, updated, failed), owner and status. Click a row for details, the error report and, for students, a link to manage those students.",
      },
      {
        id: "bu-row-actions", target: "bu-table", chapter: "actions",
        title: "Row actions",
        body: "Download the uploaded data, rename the list, archive or restore it, or delete. Delete first checks what is linked, then lets you remove only the list, the records it created, or (for students) the linked accounts and their test data.",
      },
      {
        id: "bu-delete-care", chapter: "tips",
        title: "Deleting is permanent",
        body: "Deleting records or student accounts cannot be undone from this page. You must type the list name to confirm, and options are blocked when the check finds a problem. Archive instead if you only want to hide an upload.",
      },
    ],
  },
  {
    id: "admin.promote-students",
    paths: ["/admin/settings/promote-students"],
    area: "Settings",
    title: "Promote students",
    icon: "graduation",
    summary: "Move students to the next semester: one student, a selection, or a whole semester at once.",
    intro: "Promote students at the end of a term.\nOpen a semester, check its roster, and move students up by one semester.",
    next: "admin.master-data",
    tips: [
      "Search the roster first, then tick the header box to select every match.",
      "Promotion changes only the semester; history and progress stay.",
      "There is no undo here: read the count in the confirmation.",
    ],
    steps: promotionSteps,
  },
];
