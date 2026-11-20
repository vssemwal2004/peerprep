// Student guides: Prep Assessment (available tests, reports, history, post-test feedback).
// Format: src/guide/platform/registry.js. The live test page (/student/assessment/:id) has no tour.

export default [
  {
    id: "student.assessments",
    paths: ["/student/assessments", "/assessments"],
    area: "Assessments",
    title: "Available Tests",
    icon: "clipboard",
    summary: "Every test your university has set for you: what is live now, what is coming up and what you have finished.",
    intro: "This is where your university's tests live. Placement drives often begin with an online test, so treat each one as practice for the real thing.\nLet's see how to read the cards and how to start a test.",
    next: "student.assessment-reports",
    terms: [
      { term: "Live", text: "The test window is open now, so you can start or continue the test." },
      { term: "Test window", text: "The start and end time set by your university. You can only start a test while its window is open." },
    ],
    tips: [
      "Tests open on a laptop or desktop only. Phones and tablets show a message instead of the test.",
      "Read the details in the start window (duration, sections, marks) before you press Start Test.",
      "If you left a test midway, its button says Continue while the window is still open.",
      "Scores show only after your university announces the result.",
    ],
    steps: [
      {
        id: "asl-stats", target: "asl-stats", chapter: "layout", quick: true,
        title: "Your tests at a glance",
        body: "How many tests are live now, coming up and completed, plus your average score. The average counts only results that have been announced, so it reads Not announced until your first result is out.",
      },
      {
        id: "asl-ongoing", target: "asl-ongoing", chapter: "parts", quick: true,
        title: "Ongoing tests",
        body: "Tests whose window is open right now. These are the ones you can start or continue today, so check here first.",
      },
      {
        id: "asl-upcoming", target: "asl-upcoming", chapter: "parts",
        title: "Upcoming tests",
        body: "Tests scheduled for later. Note the start date and time so you are ready when the window opens. You cannot start them early.",
      },
      {
        id: "asl-completed", target: "asl-completed", chapter: "parts",
        title: "Completed tests",
        body: "Tests you have submitted. Each card shows when you submitted it. Open Reports from the menu to see your score once it is announced.",
      },
      {
        id: "asl-card", target: "asl-card", chapter: "parts",
        title: "A test card",
        body: "Each card is one test: its name, its status and the button you use to take it.",
      },
      {
        id: "asl-card-status", target: "asl-card-status", chapter: "parts",
        title: "Status",
        body: "Live means the window is open. Upcoming means it opens later. Completed means you have already finished it.",
      },
      {
        id: "asl-card-facts", target: "asl-card-facts", chapter: "parts",
        title: "Start time, duration, questions",
        body: "When the test starts, how long you get once you begin, and how many questions it has. Plan a quiet, uninterrupted slot of at least that length.",
      },
      {
        id: "asl-card-action", target: "asl-card-action", chapter: "actions", quick: true,
        title: "Start, continue or give feedback",
        body: "On a live test, Start opens a details window with the start and end time, duration, sections, question types and total marks. If your university set a password, you enter it there. Start Test then opens the test.\nAfter you submit, the button changes to Give feedback.",
      },
      {
        id: "asl-desktop", chapter: "tips", quick: true,
        title: "Use a laptop or desktop",
        body: "Tests need a full screen, a keyboard and the proctoring checks, so they open only on a laptop or desktop. The exact monitoring rules are set for each test by your university.",
      },
    ],
  },
  {
    id: "student.prep-mock",
    paths: ["/student/prep-mock", "/student/prep-mock/:company"],
    area: "Assessments",
    title: "Prep Mock",
    icon: "briefcase",
    feature: "prep_mock",
    summary: "Company mock tests, role by role: pick a company, choose a role and take its mocks under real test conditions.",
    intro: "Prep Mock lets you practise the kind of test a company sets, before the real drive.\nStart with a company, choose the role you are aiming for, then take that role's mocks. They follow the same rules as your assessments.",
    terms: [
      { term: "Role", text: "The job a mock is written for, such as SDE 1 or Data Analyst. One role can have several mocks." },
      { term: "Always open", text: "A mock with no closing date. You can start it whenever you are ready." },
      { term: "Open now", text: "Mocks you can start or continue right now." },
    ],
    tips: [
      "Mocks open on a laptop or desktop only, just like assessments.",
      "Each mock can be submitted once, so pick a quiet slot as long as its duration.",
      "If you leave a mock midway, its button says Continue while it is still open.",
      "Your score shows only after the result is announced.",
    ],
    steps: [
      {
        id: "pmock-header", target: "pmock-header", chapter: "overview", quick: true,
        title: "Welcome to Prep Mock",
        body: "Practise real company tests, role by role. Every mock here was set up by your admin for a specific company and job role. The ring shows how many of your mocks you have completed.",
      },
      {
        id: "pmock-stats", target: "pmock-stats", chapter: "layout",
        title: "Your progress",
        body: "Mocks open now, how many companies you have tried, and your best and latest result. Results show only once they are announced.",
      },
      {
        id: "pmock-spotlight", target: "pmock-spotlight", chapter: "parts", quick: true,
        title: "Right now",
        body: "Mocks you started but did not submit (Continue takes you straight back in), then companies with a mock open now. Scroll sideways to see them all.",
      },
      {
        id: "pmock-search", target: "pmock-search", chapter: "parts",
        title: "Find a company",
        body: "Type a company name, or a role such as SDE or Analyst. Matches are marked, and a company found by its role shows that role on its tile.",
      },
      {
        id: "pmock-filters", target: "pmock-filters", chapter: "parts",
        title: "Filter the list",
        body: "Open now keeps companies with a mock you can start today. Upcoming keeps mocks that open later. Completed keeps companies where you finished or missed a mock.",
      },
      {
        id: "pmock-sort", target: "pmock-sort", chapter: "parts",
        title: "Sort and layout",
        body: "Sort by open now, most mocks or A–Z, and switch between tiles and a list. Your layout choice is remembered on this device.",
      },
      {
        id: "pmock-az", target: "pmock-az", chapter: "parts",
        title: "Jump by letter",
        body: "With many companies, pick a letter to jump straight to companies starting with it. Letters with no company are greyed out.",
      },
      {
        id: "pmock-companies", target: "pmock-companies", chapter: "actions", quick: true, tryIt: "Open a company",
        title: "Pick a company",
        body: "Each tile shows the logo, roles and mocks, and a ring for how many you have completed. A green dot means a mock is open now. Click a company to see its roles.",
      },
      {
        id: "pmock-journey", target: "pmock-journey", chapter: "parts",
        title: "Your mock journey",
        body: "Where all your mocks stand, your recently completed mocks with their result (click one to open the report), and the mocks opening next.",
      },
      {
        id: "pmock-banner", target: "pmock-banner", chapter: "layout",
        title: "The company",
        body: "The company you opened, its roles and mocks, and how many you have completed. Use All companies above it to go back.",
      },
      {
        id: "pmock-rules", target: "pmock-rules", chapter: "tips",
        title: "Same rules as assessments",
        body: "A mock runs exactly like a Prep Assessment: laptop or desktop only, the same instructions, timer and proctoring checks, a password when your admin set one, and one attempt.",
      },
      {
        id: "pmock-roles", target: "pmock-roles", chapter: "parts", quick: true,
        title: "Choose a role",
        body: "Pick the job you are preparing for. Each role shows its number of mocks, and a green dot when one is open now. Mocks saved without a role are under General. Arrow keys move between roles.",
      },
      {
        id: "pmock-mocks", target: "pmock-mocks", chapter: "parts",
        title: "The role's mocks",
        body: "Open mocks come first, then upcoming, then finished ones. Each row shows status, question types, duration, questions, sections, marks and when it is open. Always open means no closing date.",
      },
      {
        id: "pmock-start", target: "pmock-start", chapter: "actions", quick: true,
        title: "Start, continue or see your result",
        body: "Start opens a details window with the duration, sections and marks; enter the password there if asked, then Start Test.\nAfter you submit, the button shows your result once it is announced, and Feedback lets you rate the mock.",
      },
    ],
  },
  {
    id: "student.assessment-reports",
    paths: ["/student/assessment-reports", "/assessment-reports"],
    area: "Assessments",
    title: "Assessment Reports",
    icon: "chart",
    summary: "Your detailed result for each test you took: score, accuracy, section performance and question review, when released.",
    intro: "A test is most useful after it ends. This page shows how you did and where you lost marks, so you know exactly what to revise before the next one.\nYour university decides what each report shows and when.",
    next: "student.assessment-history",
    terms: [
      { term: "Result announced", text: "Your university has released the result, so your score and the parts of the report it allows are visible." },
      { term: "Not announced", text: "Your submission is saved, but the result has not been released yet. Scores stay hidden until then." },
    ],
    tips: [
      "Hidden means your university chose not to show that figure for this test.",
      "Review wrong and skipped questions first: they show your weakest topics.",
      "The page remembers the report and tab you last opened.",
    ],
    steps: [
      {
        id: "rep-list", target: "rep-list", chapter: "layout", quick: true,
        title: "Your reports",
        body: "Every test you have a report for. Each entry shows the test type, the date, whether the result is announced and, once it is, your percentage.",
      },
      {
        id: "rep-search", target: "rep-search", chapter: "parts",
        title: "Find a report",
        body: "Type part of a test name, type or status to narrow the list.",
      },
      {
        id: "rep-status", target: "rep-status", chapter: "parts",
        title: "Filter by status",
        body: "Show only reports with one status. This appears when your reports have more than one status.",
      },
      {
        id: "rep-item", target: "rep-item", chapter: "actions",
        title: "Open a report",
        body: "Click any entry to open its report on the right.",
      },
      {
        id: "rep-header", target: "rep-header", chapter: "parts", quick: true,
        title: "Report header",
        body: "The test name, type, number of questions, duration and status, with when you started and submitted. The tag shows whether the result is announced.",
      },
      {
        id: "rep-metrics", target: "rep-metrics", chapter: "parts",
        title: "Key numbers",
        body: "Score, percentage, attempts and time spent, shown once the result is announced. A figure reads Hidden when your university has not released it for this test.",
      },
      {
        id: "rep-export", target: "rep-export", chapter: "actions",
        title: "Export to Excel",
        body: "Download this report as an Excel file with a summary sheet and, where available, sections, questions and security details. Handy for keeping your own revision notes.",
      },
      {
        id: "rep-tabs", target: "rep-tabs", chapter: "parts", quick: true,
        title: "Report tabs",
        body: "Overview is always here. Questions, Performance, Violations and Feedback appear only when your university has released them for this test.",
      },
      {
        id: "rep-panel", target: "rep-panel", chapter: "parts",
        title: "Read your result",
        body: "Overview shows score, rank, accuracy, time, and correct, wrong and skipped counts. Questions lets you step through each question with your answer, the correct answer and any explanation. Performance shows accuracy section by section.\nIf the result is not announced yet, your submission is saved and this space says so.",
      },
    ],
  },
  {
    id: "student.assessment-history",
    paths: ["/student/assessment-history", "/assessment-history"],
    area: "Assessments",
    title: "Assessment History",
    icon: "history",
    summary: "A record of every test you completed, with date, result, time taken and status.",
    intro: "Your full test record in one table. Use it to see how your results move over time and to open any past attempt quickly.",
    next: "student.analysis",
    tips: [
      "Click a column heading to sort by it, for example by Result to find your best tests.",
      "Results that are not announced yet always sort last.",
    ],
    steps: [
      {
        id: "hist-summary", target: "hist-summary", chapter: "layout", quick: true,
        title: "Your record in numbers",
        body: "How many tests you completed, how many results are announced and, once you have one, your best score.",
      },
      {
        id: "hist-search", target: "hist-search", chapter: "parts",
        title: "Search",
        body: "Type part of a test name to find it in the table.",
      },
      {
        id: "hist-table", target: "hist-table", chapter: "parts", quick: true,
        title: "Completed tests",
        body: "One row per completed test: name and type, completion date, result, time taken and attempt status. Click a column heading to sort, and use the pager at the bottom to move through pages.",
      },
      {
        id: "hist-result", target: "hist-result", chapter: "parts",
        title: "Result",
        body: "Your score out of the total marks. It reads Result not announced yet until your university releases it.",
      },
      {
        id: "hist-row", target: "hist-row", chapter: "actions", quick: true,
        title: "Open a test",
        body: "Click any row to open a summary of that attempt. For the full report with question review, use Reports in the menu.",
      },
    ],
  },
  {
    id: "student.assessment-feedback",
    paths: ["/student/assessment/:id/feedback"],
    openFrom: "student.assessments",
    area: "Assessments",
    title: "Test feedback",
    icon: "feedback",
    summary: "Rate your experience of a test you just submitted, with optional comments.",
    intro: "You have finished the test. Before you leave, tell your university how the experience was. It takes a few seconds and helps them improve future tests.",
    tips: [
      "Feedback can be submitted only once per test, so check your rating before you send it.",
      "This form does not show your score. Results appear in Reports once announced.",
    ],
    steps: [
      {
        id: "afb-header", target: "afb-header", chapter: "layout", quick: true,
        title: "Which test",
        body: "The test you are giving feedback on, and when you submitted it.",
      },
      {
        id: "afb-summary", target: "afb-summary", chapter: "parts",
        title: "Test and submission",
        body: "The same details in short. There is no score here because results may not be released yet.",
      },
      {
        id: "afb-rating", target: "afb-rating", chapter: "actions", quick: true,
        title: "Choose a rating",
        body: "Pick one star from 1 (needs improvement) to 5 (excellent). A rating is required. Until you submit it, the page asks you to stay.",
      },
      {
        id: "afb-comments", target: "afb-comments", chapter: "actions",
        title: "Add comments",
        body: "Optional. Say what worked well or what could be better, for example timing, instructions or technical issues.",
      },
      {
        id: "afb-submit", target: "afb-submit", chapter: "actions", quick: true,
        title: "Submit",
        body: "Sends your feedback. It is linked to this test and can be submitted only once.",
      },
      {
        id: "afb-done", target: "afb-done", chapter: "tips",
        title: "All done",
        body: "Once submitted, you can return to your assessments. Your result will appear in Reports when it is announced.",
      },
    ],
  },
];
