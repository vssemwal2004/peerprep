// Student guide: Prep Analysis (overview + one page per feature). One module for every section:
// steps whose part is not on the open section are skipped automatically.
// Format: src/guide/platform/registry.js.

export default [
  {
    id: "student.analysis",
    paths: ["/student/analysis", "/student/analysis/:section", "/student/analytics", "/student/analytics/:section"],
    area: "Progress & rewards",
    title: "Prep Analysis",
    icon: "pie",
    summary: "Your own preparation in numbers: topic coverage, coding, sheets, lessons, tests, interviews, activity, badges and company readiness.",
    intro: "Prep Analysis turns everything you do on PeerPrep into a clear picture of how ready you are for placements, and what to do next.\nThe overview shows each part in brief; the tabs open a full page for each one. Run this tour on any tab to learn that page.",
    next: "student.rankings",
    terms: [
      { term: "Preparation estimate", text: "How close you are to \"strong\" across the core topics, as a percentage." },
      { term: "Core topic", text: "One of the main coding topics the preparation estimate is built from." },
      { term: "Strong", text: "A topic where you solved its target number of questions with at least 60% accuracy." },
      { term: "Accuracy", text: "The share of your submissions that were accepted." },
    ],
    tips: [
      "Green and red arrows compare this period with the one before it.",
      "Most numbers and cards are links: click one to open its full page.",
      "Your chosen period is remembered for your next visit.",
      "Use What to do next on the overview when you are unsure what to practise.",
    ],
    steps: [
      {
        id: "an-banner", target: "an-banner", chapter: "layout", quick: true,
        title: "Your profile at a glance",
        body: "Your name and class details, your streak, level, badges and Prep Score. The level and badge chips open the Badges page; the Prep Score chip opens Ranking.",
      },
      {
        id: "an-prep", target: "an-prep", chapter: "parts",
        title: "Preparation",
        body: "Your preparation estimate as a percentage, with how many topics are strong, building, needing work or not started. It rises as you solve more questions correctly in the main topics.",
      },
      {
        id: "an-tabs", target: "an-tabs", chapter: "layout", quick: true,
        title: "One page per part",
        body: "Overview, Topics, Coding, QuickPrep, Learning, Tests, Interviews, Activity, Badges and Companies. You only see the pages for features your university has turned on for you.",
      },
      {
        id: "an-period", target: "an-period", chapter: "actions", quick: true,
        title: "Choose the period",
        body: "Pick 7 days, 30 days, 90 days, 6 months, 1 year, All time or your own dates. Every number follows this period, and the line on the left says which period and comparison you are looking at.",
      },
      {
        id: "an-download", target: "an-download", chapter: "actions",
        title: "Download your report",
        body: "Save your analysis for the chosen period as an Excel workbook or a PDF report. The refresh button beside it reloads the latest figures.",
      },
      {
        id: "an-summary", target: "an-summary", chapter: "parts", quick: true,
        title: "Preparation at a glance",
        body: "The preparation ring shows progress to strong across the core topics, with your Easy, Medium and Hard solves below it. The tiles beside it are your key numbers for the period, each with its change. Click any of them to open its full page.",
      },
      {
        id: "an-heatmap", target: "an-heatmap", chapter: "parts",
        title: "Activity calendar",
        body: "Your last 12 months, one square per day. Darker means you did more that day. Aim for an unbroken run of coloured days: steady practice beats last-minute cramming.",
      },
      {
        id: "an-next", target: "an-next", chapter: "parts", quick: true,
        title: "What to do next",
        body: "Steps picked from your own numbers, marked Fix first, Next or Keep going. Each one has a button that takes you straight to the place to act.",
      },
      {
        id: "an-explore", target: "an-explore", chapter: "parts",
        title: "Explore your analysis",
        body: "A card for every part you can open, with its headline number. Click a card to open that page.",
      },
      {
        id: "an-topics", target: "an-topics", chapter: "parts",
        title: "Topics",
        body: "Every coding topic with your progress to strong, its state and your accuracy. Switch between List, Map and Coverage views. Click a topic to see its details.\nA topic is strong once you solve its target (10% of its questions, between 3 and 15) with at least 60% accuracy.",
      },
      {
        id: "an-topic-filters", target: "an-topic-filters", chapter: "actions",
        title: "Filter and sort topics",
        body: "Show only one state, keep only core topics, search by name, or sort, for example by lowest accuracy to find weak spots.",
      },
      {
        id: "an-strengths", target: "an-strengths", chapter: "parts",
        title: "Strengths and gaps",
        body: "Your strongest topics and the ones that need attention, among those you have practised. Start your next session with a topic from the right-hand list.",
      },
      {
        id: "an-coding", target: "an-coding", chapter: "parts",
        title: "Coding practice",
        body: "Problems accepted, accuracy, submissions and days practised in the period, then charts: daily practice, how submissions ended, accepted by difficulty, and the languages you use.",
      },
      {
        id: "an-retry", target: "an-retry", chapter: "parts",
        title: "Started, not solved",
        body: "Questions you tried but have not solved yet. Click one to go back and finish it.",
      },
      {
        id: "an-quickprep", target: "an-quickprep", chapter: "parts",
        title: "QuickPrep sheets",
        body: "Your overall progress across the sheets you started, each sheet's progress bar, and sheets you have not started yet. Click a sheet to open it.",
      },
      {
        id: "an-learning", target: "an-learning", chapter: "parts",
        title: "Learning",
        body: "Course progress, lessons completed in the period, video minutes watched, and progress in each subject.",
      },
      {
        id: "an-tests", target: "an-tests", chapter: "parts",
        title: "Tests",
        body: "Average and best score, tests taken, passed, failed and missed, with your score trend, a list of your tests and the ones coming up. The pass mark is shown under the title.",
      },
      {
        id: "an-interviews", target: "an-interviews", chapter: "parts",
        title: "Interviews",
        body: "Mock and AI interviews in the period. For mock interviews, see your interviewers' average rating on each skill and your latest scores.",
      },
      {
        id: "an-activity", target: "an-activity", chapter: "parts",
        title: "Activity",
        body: "Your current and best streak, active days, your busiest weekdays and where your time goes across practice, lessons, tests and interviews over 12 months.",
      },
      {
        id: "an-badges-page", target: "an-badges-page", chapter: "parts",
        title: "Badges",
        body: "Your level, the badges you have earned and the ones still to unlock, plus your next solve milestone. These are the same badges as on your dashboard and profile.",
      },
      {
        id: "an-companies", target: "an-companies", chapter: "parts",
        title: "Company readiness",
        body: "Choose a company to compare your preparation with its hiring bar: a readiness score, how you measure up on each requirement, topics to strengthen and steps to close the gap.",
      },
    ],
  },
];
