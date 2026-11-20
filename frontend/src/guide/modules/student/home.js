// Student guides: the dashboard (home) and the app's frame (menu, Guides, account).

export default [
  {
    id: "student.dashboard",
    paths: ["/student/dashboard"],
    area: "Get started",
    title: "Dashboard",
    icon: "dashboard",
    summary: "Your home page: what to do today, where you left off, your streak, rank, badges and what is coming up.",
    intro: "Welcome to PeerPrep! This is your dashboard, the page you land on after signing in.\nIt shows what to do next, how you are doing, and what is coming up. Let's walk through it.",
    next: "student.problems",
    tips: [
      "One problem a day keeps your streak alive. The Today card shows how your week looks.",
      "Cards on the right follow you as you scroll on a large screen, so your rank and deadlines stay in view.",
      "Every page has an ⓘ next to its title with a tour like this one.",
    ],
    steps: [
      {
        id: "dash-menu", target: "app-nav", chapter: "layout", quick: true,
        title: "Your menu",
        body: "Every part of PeerPrep is here: Prep Coding, Quick Prep, tests, resume, ranking, interviews and more. Hover the rail to see the names, or pin it open.\nYou only see what your university has turned on for you.",
      },
      {
        id: "dash-greeting", target: "dash-greeting", chapter: "parts",
        title: "Your daily nudge",
        body: "The line under your name changes with your progress: it reminds you of your streak, today's challenge, or where to start if you are new.",
      },
      {
        id: "dash-badges", target: "dash-badges", chapter: "parts",
        title: "Badges at a glance",
        body: "Your current badge levels in one row. Hover a badge to see what it is for. The full list with progress is further down the page.",
      },
      {
        id: "dash-continue", target: "dash-continue", chapter: "parts", quick: true,
        title: "Continue where you left off",
        body: "The problems, sheets and lessons you opened recently, newest first. One click takes you back to exactly where you stopped.",
      },
      {
        id: "dash-today", target: "dash-today", chapter: "parts", quick: true,
        title: "Today: streak and missions",
        body: "Your streak and the last seven days at a glance, then today's challenge or missions. Finish them to earn rewards and keep the streak going.",
      },
      {
        id: "dash-announcements", target: "dash-announcements", chapter: "parts",
        title: "Announcements",
        body: "Notices from your university, newest first. Important ones may also pop up once after you sign in.",
      },
      {
        id: "dash-coding", target: "dash-coding", chapter: "parts",
        title: "Coding progress",
        body: "How many problems you solved, split by Easy, Medium and Hard. Solving harder problems raises your Prep Score faster.",
      },
      {
        id: "dash-rank", target: "dash-rank", chapter: "parts", quick: true,
        title: "Your rank",
        body: "Where you stand by Prep Score among students of your university. Open Ranking from the menu to see the full leaderboard.",
      },
      {
        id: "dash-coming-up", target: "dash-coming-up", chapter: "parts", quick: true,
        title: "Coming up",
        body: "Tests, interviews and AI interviews scheduled for you, soonest first, with their dates. Check here so you never miss a start time.",
      },
      {
        id: "dash-sheets", target: "dash-sheets", chapter: "parts",
        title: "Coding sheets",
        body: "Quick Prep sheets: short, curated sets of problems. Sheets you are working on come first. View all opens every sheet you can take.",
      },
      {
        id: "dash-monthly-badges", target: "dash-monthly-badges", chapter: "parts",
        title: "This month's badges",
        body: "Each badge has levels with targets set from your own recent months, so they stay a fair challenge. Reaching a level earns Prep Coins. Targets reset every month.",
      },
      {
        id: "dash-practice", target: "dash-practice", chapter: "parts",
        title: "Next in practice",
        body: "Problems picked for you from what you solved so far. A good place to start when you are not sure what to practise.",
      },
      {
        id: "dash-page-guide", target: "page-guide", chapter: "tips",
        title: "The ⓘ on every page",
        body: "Every page has this ⓘ next to its title. It explains the page and offers a quick look or a full tour like this one. A blue dot means you have not taken that tour yet.",
      },
      {
        id: "dash-guides", target: "app-guides", chapter: "tips", quick: true,
        title: "All guides in one place",
        body: "Guides lists every page you can use, with a tour for each and how many you have explored. Search it when you are looking for a feature.",
      },
      {
        id: "dash-account", target: "app-account", chapter: "tips",
        title: "Your account",
        body: "Your profile, password and the dark theme are here. Sign out from this menu too.",
      },
    ],
  },
];
