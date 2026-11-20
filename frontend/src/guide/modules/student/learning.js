// Student guides: Learning modules (semesters, subjects, teachers) and a subject's chapters and topics.

export default [
  {
    id: "student.learning",
    paths: ["/student/learning"],
    area: "Learning",
    title: "Learning",
    icon: "book",
    summary: "Study material from your teachers, organised by semester, subject and teacher.",
    intro: "Learning holds the videos, notes and practice questions your teachers share, organised by semester and subject.\nUse it to revise your fundamentals alongside coding practice.",
    tips: [
      "New material appears here automatically when a teacher publishes it.",
      "A subject can have more than one teacher; pick the one whose material you want to follow.",
    ],
    steps: [
      {
        id: "ln-header", target: "ln-header", chapter: "overview", quick: true,
        title: "Learning modules",
        body: "Start by choosing a semester. Each semester lists its subjects, and each subject lists the teachers who shared material for it.",
      },
      {
        id: "ln-semesters", target: "ln-semesters", chapter: "parts", quick: true,
        title: "Semesters",
        body: "One card per semester, with how many subjects it has. Click a card to see its subjects.",
        tryIt: "Click a semester card to open its subjects",
      },
      {
        id: "ln-empty", target: "ln-empty", chapter: "parts",
        title: "Nothing here yet",
        body: "No learning material has been published for you yet. It will appear here as soon as your teachers add it.",
      },
      {
        id: "ln-subjects", chapter: "parts", quick: true,
        title: "Subjects and teachers",
        body: "In the semester window, click a subject to see its teachers, then click a teacher to open their chapters and topics.",
      },
      {
        id: "ln-progress", chapter: "tips",
        title: "Track your progress",
        body: "Inside a subject you can mark each topic as complete. Your progress for every subject is shown as you go, so you always know what is left to revise.",
      },
    ],
  },
  {
    id: "student.learning-detail",
    paths: ["/student/learning/:semester/:subject/:teacherId"],
    area: "Learning",
    title: "Subject",
    icon: "book",
    openFrom: "student.learning",
    summary: "One subject from one teacher: chapters, topics, videos, notes and practice questions, with your progress.",
    intro: "This is a subject's study plan from your teacher, split into chapters and topics.\nWatch the videos, read the notes, try the questions and mark each topic complete as you finish it.",
    tips: [
      "Mark a topic complete when you finish it so your progress stays accurate.",
      "Stars show how important a chapter or topic is: start with the ones that have more stars.",
      "Use the column headings in a topic table to sort, for example by difficulty.",
    ],
    steps: [
      {
        id: "ld-subjects", target: "ld-subjects", chapter: "layout", quick: true,
        title: "My Subjects",
        body: "Your subjects with a progress bar for each. Click another subject to switch to it. A green tick means you completed every topic.",
      },
      {
        id: "ld-header", target: "ld-header", chapter: "overview",
        title: "The subject",
        body: "The subject name and description, as written by your teacher.",
      },
      {
        id: "ld-instructor", target: "ld-instructor", chapter: "parts",
        title: "Instructor",
        body: "The teacher whose material you are viewing.",
      },
      {
        id: "ld-back", target: "ld-back", chapter: "layout",
        title: "Back",
        body: "Returns to Learning to choose another semester, subject or teacher.",
      },
      {
        id: "ld-chapters", target: "ld-chapters", chapter: "parts", quick: true,
        title: "Chapters",
        body: "Each chapter shows its importance (stars), how many topics it has and how many you completed. Click a chapter to open its topics.",
        tryIt: "Click a chapter to open its topics",
      },
      {
        id: "ld-topics", target: "ld-topics", chapter: "parts", quick: true,
        title: "Topics",
        body: "Every topic in the chapter with its status, a Solve link to a practice problem, importance, difficulty, and buttons for the video, notes and questions. Sort by any column.",
      },
      {
        id: "ld-complete", chapter: "actions",
        title: "Mark a topic complete",
        body: "Click the circle in the Status column when you finish a topic. It turns green and your chapter and subject progress update. Click again to undo.",
      },
      {
        id: "ld-tip", target: "ld-tip", chapter: "tips",
        title: "Keep progress up to date",
        body: "When you finish a video, click the status circle to mark the topic complete so your progress updates.",
      },
    ],
  },
];
