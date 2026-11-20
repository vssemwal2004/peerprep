// Admin guides: the coordinator database, adding coordinators, the coordinator overview and
// coordinator access (the list and one coordinator's permissions). Admin-only pages.

export default [
  {
    id: "admin.coordinator-directory",
    paths: ["/admin/coordinator-directory"],
    area: "Coordinators",
    title: "Coordinators",
    icon: "users",
    summary: "Every coordinator account: search, filter by status, and edit, email, activate, deactivate or delete coordinators.",
    intro: "This is your coordinator database.\nFind a coordinator, see their status, permissions and last activity, and manage their account from one table.",
    next: "admin.coordinator-onboarding",
    tips: [
      "Coordinators with assigned students or interviews cannot be deleted; deactivate them instead.",
      "Manage access in a coordinator's ⋮ menu decides which features they can use.",
    ],
    steps: [
      {
        id: "cd-title", target: "cd-title", chapter: "overview", quick: true,
        title: "Coordinator database",
        body: "All coordinator accounts of your university. The line under the title counts the coordinators that match your search and status filter.",
      },
      {
        id: "cd-search", target: "cd-search", chapter: "actions", quick: true,
        title: "Search",
        body: "Find a coordinator by name, Teacher ID, email, phone, department or college.",
      },
      {
        id: "cd-status", target: "cd-status", chapter: "actions",
        title: "Status filter",
        body: "Show all coordinators, only active ones, or only disabled ones. A disabled coordinator cannot sign in.",
      },
      {
        id: "cd-add", target: "cd-add", chapter: "actions",
        title: "Add coordinator",
        body: "Opens Add Coordinator, where you create one coordinator or upload many from a CSV.",
      },
      {
        id: "cd-select", target: "cd-select", chapter: "parts",
        title: "Select coordinators",
        body: "Tick coordinators in the table, or use Select page for everyone on this page. The count shows how many are selected; Clear removes the selection.",
      },
      {
        id: "cd-bulk", target: "cd-bulk", chapter: "actions",
        title: "Bulk actions",
        body: "The ⋮ menu acts on the selected coordinators: select all filtered, send or resend login credentials, deactivate, activate, or delete. Each change asks you to confirm. Coordinators who still own students or interviews are kept.",
      },
      {
        id: "cd-table", target: "cd-table", chapter: "parts", quick: true,
        title: "The coordinator table",
        body: "Name with Teacher ID, email, phone, role, status, number of permissions and last activity. Click a column header to sort. Click a name to see details such as students assigned and events created.",
      },
      {
        id: "cd-row-actions", chapter: "actions", quick: true,
        title: "Actions on one coordinator",
        body: "The ⋮ at the end of each row lets you view details, edit name, email, phone, department and college, manage access, send or resend credentials, activate or deactivate the account, or delete the coordinator.",
      },
    ],
  },
  {
    id: "admin.coordinator-onboarding",
    paths: ["/admin/coordinators"],
    area: "Coordinators",
    title: "Add Coordinator",
    icon: "userPlus",
    summary: "Create coordinator accounts one at a time or in bulk from a CSV, and choose their starting access.",
    intro: "Add Coordinator creates coordinator accounts.\nUpload a CSV for many coordinators, or switch to Individual Coordinator to add one. Each gets a generated Teacher ID that you then use when assigning students.",
    next: "admin.coordinator-access",
    tips: [
      "Download the template first so your CSV has the right columns.",
      "Leave default access off if you want to set every permission yourself in Coordinator Access.",
      "The Teacher ID is what students' Teacher ID column must match when you add students.",
    ],
    steps: [
      {
        id: "co-title", target: "co-title", chapter: "overview", quick: true,
        title: "Add coordinators",
        body: "Create a coordinator account, record their details, and choose whether they start with default platform access.",
      },
      {
        id: "co-access-link", target: "co-access-link", chapter: "actions",
        title: "Manage Access",
        body: "Opens Coordinator Access, where you fine-tune what each existing coordinator can do.",
      },
      {
        id: "co-quota", target: "co-quota", chapter: "parts",
        title: "Account limit",
        body: "How many coordinator accounts your university is using out of its limit. When the limit is reached, no more coordinators can be added.",
      },
      {
        id: "co-mode", target: "co-mode", chapter: "layout", quick: true,
        title: "Bulk or individual",
        body: "Bulk CSV Upload adds many coordinators from a file. Individual Coordinator shows a form for one.",
        tryIt: "Click Individual Coordinator to see the form",
      },
      {
        id: "co-guidelines", target: "co-guidelines", chapter: "parts",
        title: "CSV guidelines and template",
        body: "Name and Email are required. Teacher IDs are generated, and the password defaults to that ID unless your file gives one. Download template gives you a file with every supported column.",
      },
      {
        id: "co-upload", target: "co-upload", chapter: "actions", quick: true,
        title: "Choose your CSV",
        body: "Drop or select the file. Each row is checked straight away for missing names or emails, invalid emails, short passwords and duplicate emails.",
      },
      {
        id: "co-errors", target: "co-errors", chapter: "parts",
        title: "Problems to fix",
        body: "Rows that failed the checks, with the reason. Fix them in your file and choose it again; the upload stays locked until the list is empty.",
      },
      {
        id: "co-preview", target: "co-preview", chapter: "actions",
        title: "Preview and upload",
        body: "Every row with its department, college and whether it gets default access. Upload coordinators creates the accounts; each row then shows Created or the reason it failed.",
      },
      {
        id: "co-results", target: "co-results", chapter: "parts",
        title: "Upload result",
        body: "How many coordinators were created or failed, and how many credential emails were sent or failed.",
      },
      {
        id: "co-form", target: "co-form", chapter: "actions",
        title: "One coordinator",
        body: "Name, email, department and college are required; department and college come from master data. Leave Temporary Password empty to use the generated Teacher ID. Create Coordinator saves the account and queues the login email.",
      },
      {
        id: "co-scope", target: "co-scope", chapter: "parts",
        title: "Data visibility",
        body: "Own data limits the coordinator to their assigned students and the records they created. Whole data lets them see institution-wide records in every feature you enable for them.",
      },
      {
        id: "co-default-access", target: "co-default-access", chapter: "actions",
        title: "Default access",
        body: "Tick to give the new coordinator the default set of features. Leave it off to create the account with no feature access and set permissions later in Coordinator Access.",
      },
      {
        id: "co-flow", target: "co-flow", chapter: "tips",
        title: "How access works",
        body: "Create the coordinator, assign default or custom access, and they see only the features you enabled. You can change access at any time.",
      },
    ],
  },
  {
    id: "admin.coordinator-overview",
    paths: ["/admin/coordinator-overview"],
    area: "Coordinators",
    title: "Coordinator Overview",
    icon: "chart",
    summary: "Coordinator readiness and workload at a glance, with a priority list of who needs attention.",
    intro: "Coordinator Overview shows whether your coordinators are set up and working.\nSee their status, workload and coding access, and a prioritised list of who needs a follow-up.",
    next: "admin.coordinator-access",
    tips: [
      "Start with the top of the readiness table: it is sorted so the coordinators that need action come first.",
      "Access opens a coordinator's permissions directly.",
    ],
    terms: [
      { term: "Workload", text: "Students assigned to the coordinator plus interview events they created." },
      { term: "Access Review", text: "The coordinator has fewer than about half of the available permissions enabled." },
    ],
    steps: [
      {
        id: "cov-title", target: "cov-title", chapter: "overview", quick: true,
        title: "Coordinator Overview",
        body: "An operational view of every coordinator: who is active, how much they handle, whether they can use coding, and who needs your attention.",
      },
      {
        id: "cov-actions", target: "cov-actions", chapter: "actions",
        title: "Add and manage",
        body: "Add Coordinator creates new coordinator accounts. Manage Access opens the list where you set each coordinator's permissions.",
      },
      {
        id: "cov-metrics", target: "cov-metrics", chapter: "parts", quick: true,
        title: "Headline numbers",
        body: "Total coordinators, how many are active (and disabled), how many have coding (compiler) access, and the most recently added accounts.",
      },
      {
        id: "cov-ops", target: "cov-ops", chapter: "parts",
        title: "Operations table",
        body: "One row per coordinator: status, students assigned, events created, permissions, coding access and last activity. Sort by any column; Access opens that coordinator's permissions.",
      },
      {
        id: "cov-readiness", target: "cov-readiness", chapter: "parts", quick: true,
        title: "Readiness and workload",
        body: "A follow-up queue built from account status, permissions, workload and last activity. Open Access Matrix takes you to Coordinator Access.",
      },
      {
        id: "cov-signals", target: "cov-signals", chapter: "parts",
        title: "Readiness counts",
        body: "Need Review: disabled, inactive for over 14 days, or limited access. Ready to Operate: healthy access and active workload. No Workload: no students or events. High Workload: 8 or more students and events combined.",
      },
      {
        id: "cov-queue", target: "cov-queue", chapter: "actions", quick: true,
        title: "Priority list",
        body: "Coordinators ranked by what needs action first: disabled, then access review or inactive, then no workload, then ready. Each row shows access coverage, workload, status with the reason, and a recommended action.",
      },
    ],
  },
  {
    id: "admin.coordinator-access",
    paths: ["/admin/coordinator-access"],
    area: "Coordinators",
    title: "Coordinator Access",
    icon: "shield",
    summary: "Choose a coordinator and set which PeerPrep features they can use.",
    intro: "Coordinator Access lists every coordinator with how much access they have.\nOpen one to switch individual features on or off and choose whether they see only their own data or the whole institution's.",
    next: "admin.coordinator-directory",
    steps: [
      {
        id: "ca-title", target: "ca-title", chapter: "overview", quick: true,
        title: "Coordinator Access",
        body: "Every coordinator whose feature access you can manage. The count follows your search and status filter.",
      },
      {
        id: "ca-search", target: "ca-search", chapter: "actions", quick: true,
        title: "Search",
        body: "Find a coordinator by name, Teacher ID, email, phone, role or department.",
      },
      {
        id: "ca-status", target: "ca-status", chapter: "actions",
        title: "Status filter",
        body: "Show all coordinators, active only, or disabled only.",
      },
      {
        id: "ca-overview", target: "ca-overview", chapter: "actions",
        title: "Overview",
        body: "Opens Coordinator Overview, with readiness and workload for every coordinator.",
      },
      {
        id: "ca-table", target: "ca-table", chapter: "parts", quick: true,
        title: "Access by coordinator",
        body: "Each coordinator's status, number of enabled permissions, whether coding access is on, and when access was last updated. Click a row or Manage to edit that coordinator's permissions.",
        tryIt: "Click a coordinator to open their access",
      },
    ],
  },
  {
    id: "admin.coordinator-access-detail",
    paths: ["/admin/coordinator-access/:coordinatorId"],
    area: "Coordinators",
    title: "Coordinator permissions",
    icon: "key",
    summary: "Turn each feature on or off for one coordinator, choose their data visibility, and review the change history.",
    intro: "This page controls exactly what one coordinator can do.\nFeatures are grouped into phases. Switch them on or off, choose own or whole-institution data, then save.",
    openFrom: "admin.coordinator-access",
    next: "admin.coordinator-access",
    tips: [
      "Nothing changes until you press Save Changes.",
      "Enabling assessment candidates also enables creating assessments, because one needs the other.",
      "Use Enabled only to review what a coordinator can do today.",
    ],
    steps: [
      {
        id: "cad-back", target: "cad-back", chapter: "layout",
        title: "Back to the list",
        body: "Returns to Coordinator Access, the list of all coordinators.",
      },
      {
        id: "cad-title", target: "cad-title", chapter: "overview",
        title: "Whose access this is",
        body: "The coordinator you are editing. Every switch on this page applies only to them.",
      },
      {
        id: "cad-actions", target: "cad-actions", chapter: "actions", quick: true,
        title: "History and Save",
        body: "History shows earlier permission changes with who made them. Save Changes stores your edits; it is enabled only when something has changed.",
      },
      {
        id: "cad-stats", target: "cad-stats", chapter: "parts", quick: true,
        title: "Access summary",
        body: "Teacher ID, account status, how many permissions are enabled out of the total, and the coverage as a percentage.",
      },
      {
        id: "cad-scope", target: "cad-scope", chapter: "actions", quick: true,
        title: "Data visibility",
        body: "Own data only: the coordinator sees their assigned students and their own records. Whole institution data: they see everything in the features you enable. The choice applies to every enabled feature.",
      },
      {
        id: "cad-bulk", target: "cad-bulk", chapter: "actions",
        title: "Select all, Reset, Clear",
        body: "Select All turns on every coordinator feature, Reset goes back to the last saved state, and Clear turns everything off. Each asks you to confirm, and none is saved until you press Save Changes.",
      },
      {
        id: "cad-phases", target: "cad-phases", chapter: "parts",
        title: "Access phases",
        body: "Features grouped by area, each with how many are enabled. Pick a phase to edit just that group, or All Modules to see the full matrix.",
      },
      {
        id: "cad-search", target: "cad-search", chapter: "actions",
        title: "Find a permission",
        body: "Search permissions by name, description, access type or usage, and filter to enabled or disabled ones.",
      },
      {
        id: "cad-matrix", target: "cad-matrix", chapter: "parts", quick: true,
        title: "Permission switches",
        body: "Each permission with a switch, its access type, what it does, where it is used and the pages it opens. Enable Phase or Disable Phase switches a whole group at once.",
      },
    ],
  },
];
