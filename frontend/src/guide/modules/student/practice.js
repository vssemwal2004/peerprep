// Student guides: Prep Coding (question list and the coding workspace) and Quick Prep (sheets).

export default [
  {
    id: "student.problems",
    paths: ["/problems"],
    area: "Practice",
    title: "Prep Coding",
    icon: "code",
    summary: "Every practice question in one place: search, filter by topic, company or difficulty, save lists, and open a problem to solve it.",
    intro: "Prep Coding is where you practise coding for placements. Every problem you solve here adds to your Prep Score.\nThis tour shows how to find the right question fast and keep track of what you want to solve next.",
    next: "student.quickprep",
    tips: [
      "Type 12 or #12 in the search to jump to question number 12, or #two-pointers to search a topic.",
      "Pick a company to see the questions asked there, most recently asked first.",
      "Favorites are kept in this browser. Use a list if you want your picks on every device.",
      "Not sure what to do? Surprise me opens a random question from the current list.",
    ],
    steps: [
      {
        id: "pc-header", target: "pc-header", chapter: "overview", quick: true,
        title: "Your question bank",
        body: "The title line shows how many questions, topics and companies are available to you. Everything on this page helps you narrow that down to the next question worth solving.",
      },
      {
        id: "pc-anvi", target: "pc-anvi", chapter: "overview",
        title: "AnvI, your coding guide",
        body: "Inside every coding problem you can press Ask AnvI. It gives you one direction to try, not the full solution, so you still do the thinking yourself. Ask again for a fresh angle.",
      },
      {
        id: "pc-companies", target: "pc-companies", chapter: "parts", quick: true,
        title: "Practise by company",
        body: "Companies whose interviews asked these questions, with how many questions each has. Click a company to see only its questions, newest reports first. All opens the full list with a search.",
        tryIt: "Click any company to filter the list",
      },
      {
        id: "pc-library", target: "pc-library", chapter: "parts",
        title: "Library and your lists",
        body: "Switch between All questions, your Favorites and your own lists. Use + to create a list, for example \"Revise before Friday\". Hover a list to delete it.\nFavorites stay in this browser; lists are saved to your account.",
      },
      {
        id: "pc-calendar", target: "pc-calendar", chapter: "parts",
        title: "Practice calendar",
        body: "Your streak, active days this month and the last seven days at a glance. Greener days mean more practice. Month opens the full calendar.\nBelow it is today's problem: your daily challenge, or the problem of the day.",
      },
      {
        id: "pc-search", target: "pc-search", chapter: "parts", quick: true,
        title: "Search",
        body: "Search by title or company. Type a number like 12 or #12 to open a question by its number, or #topic (for example #two-pointers) to search a topic.",
      },
      {
        id: "pc-difficulty", target: "pc-difficulty", chapter: "parts",
        title: "Pick a difficulty",
        body: "Show All, Easy, Medium or Hard questions. Start with Easy to warm up on a new topic, then move up. Harder problems add more to your Prep Score.",
      },
      {
        id: "pc-sort", target: "pc-sort", chapter: "parts",
        title: "Sort the list",
        body: "Change the order: by question number, difficulty, title, or most recently asked in interviews. You can also click the column labels above the list to sort.",
      },
      {
        id: "pc-summary", target: "pc-summary", chapter: "parts",
        title: "What you are looking at",
        body: "How many questions match, and how many on this page you have solved. Each active filter shows as a chip: click its × to remove it, or Clear all to start again.",
      },
      {
        id: "pc-columns", target: "pc-columns", chapter: "parts",
        title: "Sortable columns",
        body: "Click No., Title or Difficulty to sort by that column. Click again to reverse, and a third time to go back to the default order.",
      },
      {
        id: "pc-list", target: "pc-list", chapter: "parts", quick: true,
        title: "The questions",
        body: "Click a question to open it. The circle shows your status: green tick for solved, dashed for attempted, empty for not started. Orange tags are companies (click one to filter), and the bookmark saves the question to Favorites or a list.",
      },
      {
        id: "pc-pager", target: "pc-pager", chapter: "parts",
        title: "Pages",
        body: "Move between pages and choose how many questions to show per page. Your choice is remembered for next time.",
      },
      {
        id: "pc-topics", target: "pc-topics", chapter: "parts", quick: true,
        title: "Topics",
        body: "The most common topics with their question counts. Click a topic to practise only that topic; click it again to clear it. Search topics here, or open View all to browse every topic.",
        tryIt: "Click a topic to filter the list",
      },
      {
        id: "pc-surprise", target: "pc-surprise", chapter: "actions",
        title: "Surprise me",
        body: "Opens a random question from the list you are looking at now. A good way to practise solving something you did not pick yourself, just like in a real interview.",
      },
    ],
  },
  {
    id: "student.problem-solver",
    paths: ["/problems/:id", "/problems/shared/:id"],
    area: "Practice",
    title: "Coding workspace",
    icon: "code",
    openFrom: "student.problems",
    summary: "Read a problem, write your code, test it on examples or your own input, and submit it to be checked on all test cases.",
    intro: "This is your coding workspace: the problem on the left, your editor and test results on the right.\nRun checks your code on the examples; Submit checks it on every test case. An accepted submission counts as solved.",
    tips: [
      "Run often while you work; Submit when you are confident. Only submissions decide if a problem is solved.",
      "Your code is saved as a draft in this browser for each language, so you can come back later.",
      "Stuck? Ask AnvI for one approach to try before you look anywhere else.",
      "Drag the bar between the two panels to give the editor more room.",
    ],
    steps: [
      {
        id: "ps-navigator", target: "ps-navigator", chapter: "layout",
        title: "Problem list",
        body: "Click the problem name to open the question list and jump to another one. The arrows next to it go to the previous or next question.",
      },
      {
        id: "ps-sheet", target: "ps-sheet", chapter: "layout",
        title: "Your Quick Prep sheet",
        body: "When you opened this problem from a Quick Prep sheet, this chip shows the sheet and how many of its questions you have solved. Click it to go back to the sheet.",
      },
      {
        id: "ps-timer", target: "ps-timer", chapter: "layout",
        title: "Practice timer",
        body: "A stopwatch that starts when you open the problem. Pause it or reset it. Try to solve within the time you would have in a real interview.",
      },
      {
        id: "ps-tabs", target: "ps-tabs", chapter: "parts",
        title: "Problem tabs",
        body: "Description has the problem. Editorial (when available) explains a solution. Submissions lists your past attempts, and the last tab shows the result of the selected submission.",
      },
      {
        id: "ps-problem-head", target: "ps-problem-head", chapter: "parts", quick: true,
        title: "The problem at a glance",
        body: "The title, difficulty and your status (solved or not). Topics and Companies open the tags for this problem. A note here reminds you that time spent and code pasted from outside the editor are recorded for your mentors.",
      },
      {
        id: "ps-quota", target: "ps-quota", chapter: "parts",
        title: "Counts toward Prep Score",
        body: "What this question adds to your Prep Score today. Its points are shared across its topics, and each topic counts only a few new solves a day. A full topic gives its share to the others; when all are full it adds nothing until midnight. A tip at the top tells you when to switch.",
      },
      {
        id: "ps-statement", target: "ps-statement", chapter: "parts",
        title: "Read the statement",
        body: "Read the whole problem carefully before you code. Note the input and output format: most wrong answers come from a missed detail here.",
      },
      {
        id: "ps-examples", target: "ps-examples", chapter: "parts", quick: true,
        title: "Examples",
        body: "Sample inputs with their expected outputs, and sometimes an explanation. Work through one by hand first; it is the fastest way to understand what is being asked.",
      },
      {
        id: "ps-constraints", target: "ps-constraints", chapter: "parts",
        title: "Constraints",
        body: "The limits on the input size and values. They tell you how fast your solution must be, so check them before choosing an approach.",
      },
      {
        id: "ps-language", target: "ps-language", chapter: "parts",
        title: "Choose a language",
        body: "Pick the language you want to code in. Each language keeps its own code, and PeerPrep remembers the language you used last.",
      },
      {
        id: "ps-editor", target: "ps-editor", chapter: "parts", quick: true,
        title: "The code editor",
        body: "Write your solution here. It starts with a template for the chosen language. Your code is saved in this browser as you type.",
      },
      {
        id: "ps-console", target: "ps-console", chapter: "parts",
        title: "Testcase and Test Result",
        body: "Testcase shows the inputs your code will be run on; pick one with its tab. Test Result shows the verdict, runtime, memory and each case's output after you run or submit.",
      },
      {
        id: "ps-custom", target: "ps-custom", chapter: "parts",
        title: "Your own test cases",
        body: "Click Custom to add your own input, starting from the selected case. Leave the expected output blank and it is compared with the reference solution's output. Your custom cases are remembered for this problem in this browser.",
      },
      {
        id: "ps-run-submit", target: "ps-run-submit", chapter: "actions", quick: true,
        title: "Run or Submit",
        body: "Run checks your code on the test cases shown below; it never marks the problem solved. Submit checks it on all of the problem's test cases; when every case passes the submission is accepted and the problem counts as solved.",
      },
      {
        id: "ps-anvi", target: "ps-anvi", chapter: "actions",
        title: "Ask AnvI",
        body: "Stuck? Ask AnvI shows one approach to try, not a full solution. Ask again for a different angle. Try your own idea first; AnvI is there to get you moving.",
      },
      {
        id: "ps-reset", target: "ps-reset", chapter: "actions",
        title: "Reset code",
        body: "Puts the starting template back in the editor for the current language. It replaces your code straight away, so copy anything you want to keep first.",
      },
    ],
  },
  {
    id: "student.quickprep",
    paths: ["/student/quickprep"],
    area: "Practice",
    title: "Quick Prep",
    icon: "zap",
    summary: "Curated question sheets from your university: pick one, work through it at your own pace, and earn its badge and XP.",
    intro: "Quick Prep sheets are short, focused sets of questions prepared by your university, for example for one company or one topic.\nThis tour shows where to find them, how to continue the ones you started, and how progress is counted.",
    next: "student.rankings",
    tips: [
      "Start with a sheet for a company or topic you are preparing for right now.",
      "Questions you already solved count as soon as you start a sheet.",
      "A sheet with a start and end time only counts solves made between them.",
    ],
    steps: [
      {
        id: "qp-hero", target: "qp-hero", chapter: "overview", quick: true,
        title: "Sheets from your university",
        body: "Every sheet here is put together by your university's team for placement preparation. Pick one that matches your goal and work through it step by step.",
      },
      {
        id: "qp-stats", target: "qp-stats", chapter: "overview",
        title: "Your sheet summary",
        body: "How many sheets are available to you, how many you are working on, and how many you have completed.",
      },
      {
        id: "qp-refresh", target: "qp-refresh", chapter: "layout",
        title: "Refresh sheets",
        body: "Loads the latest sheets and your progress again, for example after a new sheet has been published.",
      },
      {
        id: "qp-xp", target: "qp-xp", chapter: "parts",
        title: "XP left to earn",
        body: "Available and completed sheets, and the XP you can still earn from sheets that have not ended. Finishing a sheet gives you its XP and unlocks its badge.",
      },
      {
        id: "qp-in-progress", target: "qp-in-progress", chapter: "parts", quick: true,
        title: "In progress",
        body: "Sheets you started, most recent first, with the last question you opened and your progress. Continue takes you straight back to where you stopped.",
      },
      {
        id: "qp-types", target: "qp-types", chapter: "parts",
        title: "Filter by type",
        body: "When there are different kinds of sheets, pick a type to see only those sheets.",
        tryIt: "Click a type to filter the sheets",
      },
      {
        id: "qp-search", target: "qp-search", chapter: "parts",
        title: "Search sheets",
        body: "Find a sheet by its name, a company or a topic, for example the company you have an interview with.",
      },
      {
        id: "qp-catalog", target: "qp-catalog", chapter: "parts", quick: true,
        title: "All sheets",
        body: "Every sheet as a card with its questions, difficulty mix, XP reward and badge. Open sheets come first, then upcoming ones, then ended ones. Click a card to open the sheet.",
      },
      {
        id: "qp-rules", target: "qp-rules", chapter: "tips",
        title: "How progress counts",
        body: "Questions you already solved count the moment you start a sheet. A sheet with a start and end time counts only solves made between them.",
      },
    ],
  },
  {
    id: "student.quickprep-sheet",
    paths: ["/student/quickprep/:slug"],
    area: "Practice",
    title: "Quick Prep sheet",
    icon: "zap",
    openFrom: "student.quickprep",
    summary: "One Quick Prep sheet: its goal, your progress, the badge you can unlock and every question in order.",
    intro: "This is one Quick Prep sheet. Start it, then solve its questions one by one.\nSolve every question to complete the sheet, earn its XP and unlock its badge.",
    tips: [
      "Use Continue to jump straight to the next question you have not solved.",
      "The To solve filter hides what you already finished.",
      "Opening a question from here keeps the sheet's progress in the coding workspace too.",
    ],
    steps: [
      {
        id: "qs-back", target: "qs-back", chapter: "layout",
        title: "Back to all sheets",
        body: "Returns to the Quick Prep page with every sheet available to you.",
      },
      {
        id: "qs-hero", target: "qs-hero", chapter: "overview", quick: true,
        title: "About this sheet",
        body: "The sheet's name and what it is for, written by your university. Read the description to know what this sheet prepares you for.",
      },
      {
        id: "qs-tags", target: "qs-tags", chapter: "parts",
        title: "Type, companies and topics",
        body: "The kind of sheet, the companies it targets and its main topics, so you can see at a glance whether it fits your goals.",
      },
      {
        id: "qs-action", target: "qs-action", chapter: "actions", quick: true,
        title: "Start or continue",
        body: "Start QuickPrep begins the sheet; questions you already solved count straight away. After that, Continue opens the next unsolved question. You also see the XP reward, the number of questions and, if set, when the sheet is open.",
      },
      {
        id: "qs-progress", target: "qs-progress", chapter: "parts", quick: true,
        title: "Progress and badge",
        body: "The ring shows how many questions you solved out of the total. Next to it is the badge you unlock when you complete the sheet.",
      },
      {
        id: "qs-mix", target: "qs-mix", chapter: "parts",
        title: "Difficulty mix",
        body: "How many Easy, Medium and Hard questions the sheet has. Plan your time: harder questions take longer.",
      },
      {
        id: "qs-counts", target: "qs-counts", chapter: "parts",
        title: "Solved, attempted, to start",
        body: "A quick count of where you stand: questions solved, attempted but not solved yet, and not started.",
      },
      {
        id: "qs-filter", target: "qs-filter", chapter: "parts",
        title: "Filter the questions",
        body: "Show all questions, only those still to solve, or only the solved ones for revision.",
        tryIt: "Click To solve to hide finished questions",
      },
      {
        id: "qs-table", target: "qs-table", chapter: "parts", quick: true,
        title: "The questions",
        body: "Questions in the sheet's order, grouped by section with each section's progress. Click a row to open it in the coding workspace: Solve, Retry or Review. Click a column heading to sort.",
      },
    ],
  },
];
