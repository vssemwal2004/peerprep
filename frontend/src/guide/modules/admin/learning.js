// Admin guides: Prep Learning (semesters → subjects → teachers) and one teacher's subject content.
// Coordinators manage their own subjects elsewhere; these pages are admin-only, but the text stays role-neutral.

export const learningSteps = [
  {
    id: "lrn-title", target: "lrn-title", chapter: "overview", quick: true,
    title: "Learning content by semester",
    body: "This page lists every semester that has learning content. Each semester holds subjects, and each subject is taught by one or more teachers who add chapters, topics, videos and notes.",
  },
  {
    id: "lrn-edit", target: "lrn-edit", chapter: "actions",
    title: "Edit semesters",
    body: "Edit switches the cards into edit mode: each card shows a pencil to rename the semester or change its description, and a bin to delete it. Deleting removes the semester and all its content, so you are asked to confirm first. Click Done to leave edit mode.",
  },
  {
    id: "lrn-semesters", target: "lrn-semesters", chapter: "parts", quick: true,
    title: "Semester cards",
    body: "One card per semester, in semester order, with its description and how many subjects it has. Click a card to see its subjects.",
    tryIt: "Click a semester card",
  },
  {
    id: "lrn-subjects", target: "lrn-subjects", chapter: "parts", quick: true,
    title: "Subjects and teachers",
    body: "The semester's subjects, each with its number of teachers. Click a subject to list its teachers, then click a teacher to open the chapters and topics they added for that subject.",
  },
  {
    id: "lrn-empty", target: "lrn-empty", chapter: "parts",
    title: "No semesters yet",
    body: "Nothing has been added yet. Semesters appear here as soon as learning content is created for them.",
  },
  {
    id: "lrn-shared", chapter: "tips",
    title: "Shared learning content",
    body: "If your university uses shared learning content, the line under the title says so. Shared content is managed by the super admin, so the Edit button is not shown and you can browse but not change it.",
  },
  {
    id: "lrn-live", chapter: "tips",
    title: "Always up to date",
    body: "The page refreshes by itself when learning content changes anywhere on the platform, so new subjects and teachers appear without reloading.",
  },
];

export const learningDetailSteps = [
  {
    id: "lrd-header", target: "lrd-header", chapter: "overview", quick: true,
    title: "Subject and teacher",
    body: "The subject's name and description, and the teacher whose content you are viewing. Everything below belongs to this teacher's version of the subject.",
  },
  {
    id: "lrd-subjects", target: "lrd-subjects", chapter: "layout",
    title: "This teacher's subjects",
    body: "Every subject this teacher teaches. Click another subject to switch to it without going back. On small screens the panel can be closed and opened again with the menu button.",
  },
  {
    id: "lrd-back", target: "lrd-back", chapter: "layout",
    title: "Back to all semesters",
    body: "Returns to the Learning Modules page with every semester.",
  },
  {
    id: "lrd-analytics", target: "lrd-analytics", chapter: "actions", quick: true,
    title: "Subject analytics",
    body: "Opens the learning analytics for this subject: how many students watched the videos and how many have not started, overall engagement, and each student's status, watch time and last watched date.",
  },
  {
    id: "lrd-add-chapter", target: "lrd-add-chapter", chapter: "actions",
    title: "Add a chapter",
    body: "Creates a new chapter with a name and an importance level from 1 to 5 stars. Not shown when learning content is shared and managed by the super admin.",
  },
  {
    id: "lrd-chapters", target: "lrd-chapters", chapter: "parts", quick: true,
    title: "Chapters and topics",
    body: "Each chapter shows its importance stars and number of topics. Click a chapter to open its topics table: problem link, importance, difficulty, and the video, notes PDF and questions PDF for each topic.\nThe buttons on the right of a chapter add a topic, edit the chapter or delete it.",
  },
  {
    id: "lrd-topics", chapter: "tips",
    title: "Working with topics",
    body: "Click a video or PDF icon to preview it here; the arrow button in the preview opens it in a new tab. Topic headers sort the table. Use the pencil to edit a topic and the bin to delete it; deleting a chapter also deletes all its topics.",
  },
  {
    id: "lrd-empty", target: "lrd-empty", chapter: "parts",
    title: "Pick a subject",
    body: "No subject is open yet. Choose one from the Subjects panel on the left to see its chapters and topics.",
  },
];

export default [
  {
    id: "admin.learning",
    paths: ["/admin/learning"],
    area: "Learning",
    title: "Prep Learning",
    icon: "book",
    summary: "Browse every semester's subjects and teachers, and manage semesters.",
    intro: "Prep Learning organises course content as semesters, subjects and teachers.\nOpen a semester, pick a subject and a teacher to see the chapters, topics, videos and notes your students study.",
    next: "admin.assessment-analysis",
    tips: [
      "Click a semester, then a subject, then a teacher to reach the content.",
      "Edit mode is for renaming or deleting whole semesters; chapters and topics are managed on the teacher's subject page.",
      "Deleting a semester removes all of its content.",
    ],
    steps: learningSteps,
  },
  {
    id: "admin.learning-detail",
    paths: ["/admin/learning/:semester/:subject/:teacherId"],
    area: "Learning",
    title: "Subject content",
    icon: "book",
    openFrom: "admin.learning",
    summary: "One teacher's chapters and topics for a subject, with analytics and content management.",
    intro: "This page shows one teacher's content for a subject: chapters, and inside them topics with problem links, videos and PDFs.\nYou can add, edit and delete chapters and topics, and open the subject's learning analytics.",
    tips: [
      "Open a chapter to see and sort its topics.",
      "Switch subjects from the left panel without leaving the page.",
      "Analytics shows how students engage with this subject.",
    ],
    terms: [
      { term: "Importance level", text: "A 1 to 5 star rating that tells students how important a chapter or topic is." },
    ],
    steps: learningDetailSteps,
  },
];
