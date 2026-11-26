// Admin guides: the Prep Coin wallet (university deployment, also used by coordinators) and the
// Master Admin's Prep Coin console (control deployment). Coordinator guides reuse walletSteps, so
// keep step ids stable and the text role-neutral.

export const walletSteps = [
  {
    id: "wallet-header", target: "coin-header", chapter: "overview",
    title: "Your Prep Coin wallet",
    body: "Prep Coins are credits students spend on paid features. They never change a student's Prep Score or ranking.\nThis page shows your balance, lets you pass coins on, and lists what came in and went out.",
  },
  {
    id: "wallet-balance", target: "wallet-balance", chapter: "parts", quick: true,
    title: "Available balance",
    body: "The coins you can pass on right now. A university admin's wallet is the university wallet that PeerPrep fills; a coordinator's wallet holds what the university admin sent.",
  },
  {
    id: "wallet-send", target: "wallet-send", chapter: "parts", quick: true,
    title: "Send coins",
    body: "Coins move one step at a time: university admins send to coordinators, and coordinators send to their own assigned students. Only people you may send to are listed.",
  },
  {
    id: "wallet-search", target: "wallet-search", chapter: "actions",
    title: "Find the recipient",
    body: "Type a name or email and press Find (or Enter). Then click one person in the list to choose them; the chosen card is highlighted.",
  },
  {
    id: "wallet-amount", target: "wallet-amount", chapter: "actions", quick: true,
    title: "Enter the amount and send",
    body: "Enter a whole number no larger than your balance, then press Send coins. The coins leave your balance straight away.\nThis page has no way to take coins back, so check the name and amount first.",
  },
  {
    id: "wallet-activity", target: "wallet-activity", chapter: "parts", quick: true,
    title: "Recent activity",
    body: "Every coin you received and sent, newest first, with who it came from or went to and when. Use it to confirm a transfer went through.",
  },
  {
    id: "wallet-retry", chapter: "tips",
    title: "Safe to retry",
    body: "If a send fails on a slow connection, press Send coins again: the same transfer is not made twice. Changing the person or the amount starts a new transfer.",
  },
];

const coinHeader = (id, body) => ({ id, target: "coin-header", chapter: "overview", title: "What this page is for", body });

export default [
  {
    id: "admin.wallet",
    paths: ["/admin/wallet"],
    area: "Prep Coins",
    title: "Wallet",
    icon: "wallet",
    deployment: "university",
    summary: "Your university's Prep Coin balance, sending coins to coordinators, and every coin received or sent.",
    intro: "This is your Prep Coin wallet.\nPeerPrep fills the university wallet; you pass coins to coordinators, and they pass them to their students.",
    next: "admin.overview",
    tips: [
      "Coins never affect Prep Score or ranking.",
      "Check the recipient and amount before sending: there is no undo here.",
      "Recent activity is the record of every coin in and out.",
    ],
    terms: [{ term: "university wallet", text: "The university's own Prep Coin balance, filled by PeerPrep. Its admins pass coins from it to coordinators." }],
    steps: walletSteps,
  },
  {
    id: "admin.prep-coins",
    paths: ["/admin/prep-coins"],
    area: "Prep Coins",
    title: "Prep Coins overview",
    icon: "coins",
    deployment: "control",
    summary: "Every Prep Coin across PeerPrep and its universities: balances, flow, paid features, top holders and the latest movements, updated live.",
    intro: "The Prep Coin console's home page.\nIt shows where every coin is, how coins moved in the period you choose, and which paid features students spend them on.",
    next: "admin.issue-coins",
    tips: [
      "Balances are always current; the period changes only flow, spending and passed-on figures.",
      "Click a card with an arrow to open the wallets or the ledger, already filtered.",
      "If no feature has a price, students use everything for free.",
    ],
    terms: [
      { term: "Passed on", text: "Coins moved down the chain: a university admin to a coordinator, or a coordinator to a student." },
      { term: "Waiting to settle", text: "Charges for a paid feature that are still being confirmed. They end as spent or refunded." },
    ],
    steps: [
      coinHeader("pco-header", "Every Prep Coin across PeerPrep and its universities in one place. The page refreshes by itself every 30 seconds while it is open."),
      {
        id: "pco-toolbar", target: "coin-actions", chapter: "actions", quick: true,
        title: "Live status, period and actions",
        body: "Live shows when the figures last refreshed. The period picker sets the flow, spending and passed-on figures; balances are always current. Issue coins and Ledger open those pages.",
      },
      {
        id: "pco-kpis", target: "pco-kpis", chapter: "parts", quick: true,
        title: "Headline cards",
        body: "Coins in circulation, university wallets, coins with students, free and paid uses, and coins issued, spent and refunded in the period. Waiting to settle counts charges still being confirmed. Cards with an arrow open the wallets or the filtered ledger.",
      },
      {
        id: "pco-flow", target: "pco-flow", chapter: "parts",
        title: "Coin flow",
        body: "Daily movements in the period, stacked by kind: issued, passed on, spent and refunded. A tall Spent bar means students used paid features that day. Open ledger lists each movement.",
      },
      {
        id: "pco-where", target: "pco-where", chapter: "parts",
        title: "Where coins are",
        body: "Today's balances split between university wallets, students and coordinators. The note below splits account balances between PeerPrep main accounts and university accounts.",
      },
      {
        id: "pco-features", target: "pco-features", chapter: "parts", quick: true,
        title: "Paid features",
        body: "Each paid student feature with its price, free uses per month, and the paid uses, coins spent and coins refunded in the period. Edit prices opens the Pricing page.",
      },
      {
        id: "pco-holders", target: "pco-holders", chapter: "parts",
        title: "Top holders",
        body: "The accounts holding the most coins, with their role and where they belong. Useful to spot coins that are piling up instead of being used.",
      },
      {
        id: "pco-universities", target: "pco-universities", chapter: "parts",
        title: "University wallets",
        body: "Each university's balance and how many coins it passed on. All opens the Wallets page, where you can add coins to a university.",
      },
      {
        id: "pco-recent", target: "pco-recent", chapter: "parts", quick: true,
        title: "Latest movements",
        body: "The newest coin movements with their kind, from and to, the feature if any, and the amount (minus for spending). Full ledger shows every movement with filters.",
      },
    ],
  },
  {
    id: "admin.issue-coins",
    paths: ["/admin/prep-coins/issue"],
    area: "Prep Coins",
    title: "Issue coins",
    icon: "send",
    deployment: "control",
    summary: "Create new Prep Coins and add them to a university wallet or to a PeerPrep coordinator or student account.",
    intro: "Issuing creates new Prep Coins: there is no Master Admin balance to run out.\nChoose who receives them, enter an amount, check the review card, then issue.",
    next: "admin.coin-ledger",
    tips: [
      "Top up a university wallet; its admin passes coins on to coordinators and students.",
      "University students get coins from their own university, not from here.",
      "There is no undo on this page: check the review card before you issue.",
    ],
    steps: [
      coinHeader("ic-header", "Add new Prep Coins to one wallet. Every issue is recorded in the ledger and the activity log."),
      {
        id: "ic-type", target: "ic-type", chapter: "parts", quick: true,
        title: "1. Choose the recipient type",
        body: "University wallet tops up a university. PeerPrep coordinator and PeerPrep student credit accounts in PeerPrep's main database. University students receive coins from their own university.",
        tryIt: "Click a recipient type",
      },
      {
        id: "ic-who", target: "ic-who", chapter: "actions",
        title: "Pick who receives them",
        body: "For a university, filter by name or ID and click it. For an account, search by name, email or ID (at least two characters) and click the person. Each card shows the current balance.",
      },
      {
        id: "ic-amount", target: "ic-amount", chapter: "actions", quick: true,
        title: "2. Enter the amount",
        body: "Type a whole number from 1 to 1,000,000,000, or use a quick button to fill in a common amount.",
      },
      {
        id: "ic-review", target: "ic-review", chapter: "parts", quick: true,
        title: "3. Review",
        body: "Shows the recipient and their balance now and after this issue. Check both before you press Issue.",
      },
      {
        id: "ic-issue", target: "ic-issue", chapter: "actions", quick: true,
        title: "Issue the coins",
        body: "Adds the coins to the chosen wallet at once and shows the new balance. A retried click never issues twice.\nThis page cannot take coins back, so an issued amount stays in that wallet.",
      },
      {
        id: "ic-recent", target: "ic-recent", chapter: "parts",
        title: "Recently issued",
        body: "Your latest issues, with the recipient, where they belong and when. It updates after each issue.",
      },
      {
        id: "ic-history", target: "coin-actions", chapter: "actions",
        title: "Issue history",
        body: "Opens the ledger filtered to issued coins, for the complete record of every issue.",
      },
    ],
  },
  {
    id: "admin.coin-wallets",
    paths: ["/admin/prep-coins/wallets"],
    area: "Prep Coins",
    title: "Wallets",
    icon: "wallet",
    deployment: "control",
    summary: "Who holds Prep Coins right now: every university wallet and every PeerPrep main-database account.",
    intro: "Wallets lists current balances.\nSwitch between university wallets and PeerPrep accounts, find one, and open its ledger or add coins.",
    next: "admin.coin-ledger",
    tips: [
      "Sort by Balance to see who holds the most.",
      "Add coins opens Issue coins with that wallet already chosen.",
    ],
    steps: [
      coinHeader("cw-header", "Who holds Prep Coins right now. Balances here are current, not for a period."),
      {
        id: "cw-switch", target: "coin-actions", chapter: "actions", quick: true,
        title: "Choose the wallet type",
        body: "Universities shows each university wallet; PeerPrep accounts shows coordinators and students in the main database. Issue coins opens the issue page.",
      },
      {
        id: "cw-universities", target: "cw-universities", chapter: "parts", quick: true,
        title: "University wallets",
        body: "Each university's balance, its share of all university coins, and how many it passed on in the last 30 days. The Live badge shows the last refresh. Click a column header to sort.",
      },
      {
        id: "cw-search", target: "cw-search", chapter: "actions",
        title: "Search",
        body: "Type part of a university's name or ID to narrow the table.",
      },
      {
        id: "cw-rows", target: "cw-rows", chapter: "actions", quick: true,
        title: "Ledger and Add coins",
        body: "Ledger opens that university's movements. Add coins opens Issue coins with the university already chosen; nothing is issued until you confirm there.",
      },
      {
        id: "cw-accounts", target: "cw-accounts", chapter: "parts",
        title: "PeerPrep accounts",
        body: "Coordinators and students in the main database with their balance and last change. Filter by type, search by name, email or ID, and use Add coins to issue to that account.",
      },
    ],
  },
  {
    id: "admin.coin-ledger",
    paths: ["/admin/prep-coins/ledger"],
    area: "Prep Coins",
    title: "Ledger",
    icon: "list",
    deployment: "control",
    summary: "Every Prep Coin movement, newest first, filtered by kind and wallet, with new movements appearing on their own.",
    intro: "The ledger is the full record of Prep Coin movements.\nFilter it by kind and wallet; on the first page new movements appear by themselves.",
    next: "admin.prep-coin-pricing",
    tips: [
      "Only the first page follows new movements, so older pages stay still while you read.",
      "Links from other coin pages open the ledger already filtered.",
    ],
    terms: [
      { term: "Earned by students", text: "Coins PeerPrep creates for a student's own work, such as a daily login, a problem solved or a badge level. They never come from a university balance." },
      { term: "Passed on", text: "Coins moved down the chain: a university admin to a coordinator, or a coordinator to a student." },
    ],
    steps: [
      coinHeader("cl-header", "Every Prep Coin movement, newest first, grouped by day. Use it to check any balance change."),
      {
        id: "cl-toolbar", target: "coin-actions", chapter: "actions",
        title: "Live, Refresh and Issue",
        body: "Live shows when the list last refreshed; the first page checks for new movements every 30 seconds. Refresh reloads now. Issue coins opens the issue page.",
      },
      {
        id: "cl-kinds", target: "cl-kinds", chapter: "parts", quick: true,
        title: "Filter by kind",
        body: "Show all movements or only issued, passed on, earned by students, spent or refunded coins.",
        tryIt: "Click a kind, for example Spent",
      },
      {
        id: "cl-scope", target: "cl-scope", chapter: "parts", quick: true,
        title: "Filter by wallet",
        body: "Every wallet, only PeerPrep main accounts, or one university.",
      },
      {
        id: "cl-list", target: "cl-list", chapter: "parts", quick: true,
        title: "Movements",
        body: "Each row shows the time, the kind, from and to, the feature or transfer, the wallet, and the amount (minus for spending). New rows found by the live check are highlighted.",
      },
    ],
  },
  {
    id: "admin.prep-coin-pricing",
    paths: ["/admin/prep-coins/pricing"],
    area: "Prep Coins",
    title: "Pricing",
    icon: "sliders",
    deployment: "control",
    summary: "Set the coins students earn for their own work and what each paid feature costs, with free uses per month.",
    intro: "Pricing has two parts: the coins students earn, and the price of each paid feature.\nFree monthly uses come first, and coins never change Prep Score or rank.",
    next: "admin.prep-coins",
    tips: [
      "Every feature is free until a price is saved.",
      "New prices apply to the next paid action; nothing already paid changes.",
      "Add a short reason when you save prices so the change is easy to understand later.",
    ],
    steps: [
      coinHeader("pcp-header", "Decide what students earn and what paid features cost. The two parts are saved separately."),
      {
        id: "pcp-earning", target: "pcp-earning", chapter: "parts", quick: true,
        title: "Coins students earn",
        body: "Coins for a daily login (the first time a student opens PeerPrep each day) and for each problem solved (first solve, within the daily topic limit). PeerPrep creates these coins; university balances are never used.",
      },
      {
        id: "pcp-badge-levels", target: "pcp-badge-levels", chapter: "parts",
        title: "Monthly badge levels",
        body: "Coins for each badge level, L1 to L10. Each level pays once per badge per month, and a harder level cannot pay fewer coins than an easier one.",
      },
      {
        id: "pcp-earning-save", target: "pcp-earning-save", chapter: "actions",
        title: "Save earning",
        body: "Use whole numbers from 0 to 1000. Save earning applies the new amounts to rewards earned from now on; Discard returns to the saved values.",
      },
      {
        id: "pcp-features", target: "pcp-features", chapter: "parts", quick: true,
        title: "Feature prices",
        body: "One card per paid feature: the price in coins and the free uses per month. A price of 0 makes it free. The line at the bottom shows exactly what students will see; changed cards are marked Unsaved.",
      },
      {
        id: "pcp-jd-match", target: "pcp-jd-match", chapter: "parts",
        title: "ANVI JD Match budget",
        body: "Caps what PeerPrep pays Google for one résumé-vs-job check (ANVI trims long inputs to stay under it) and sets a monthly budget: when this month's real Gemini spend reaches it, checks pause and no coins are taken. Also limits checks per student per day and shows this month's calls, average and costliest check.",
      },
      {
        id: "pcp-save", target: "pcp-save", chapter: "actions", quick: true,
        title: "Save prices",
        body: "Add an optional reason, then Save prices. Prices apply to the next paid action; nothing already paid changes. Discard drops your unsaved edits. The version and last change are shown here.",
      },
    ],
  },
];
