// Student guides: peer (mock) interviews, scheduled sessions and feedback, AI interviews.
// Format: src/guide/platform/registry.js. The AI interview room has no tour.

export default [
  {
    id: "student.interviews",
    paths: ["/student/interview"],
    area: "Interviews",
    title: "Interviews",
    icon: "calendar",
    summary: "Join mock interview events, agree a time with your partner, and join the meeting.",
    intro: "Mock interviews with a classmate are the closest thing to a real placement interview. In each event you are paired up: one of you interviews, the other is the candidate.\nThis tour shows how to join an event, agree a time and join the call.",
    next: "student.interview-session",
    terms: [
      { term: "Event", text: "A mock interview round set up by your university, with a start and end date. You join it, then get paired." },
      { term: "Special", text: "An interview event your university assigned to you directly." },
      { term: "Candidate", text: "The person being interviewed in a pair. The other person is the interviewer." },
    ],
    tips: [
      "Open the interview template before your session so you know the format and topics.",
      "Agree a time early: each of you can propose up to 3 times.",
      "The meeting link opens about 30 minutes before the confirmed time.",
      "Joining an open event may cost Prep Coins. You always see the cost and confirm first.",
    ],
    steps: [
      {
        id: "int-sidebar", target: "int-sidebar", chapter: "layout", quick: true,
        title: "Your interview events",
        body: "Every interview event you can see, with its start date. A tick means you have joined it. Pick an event to open its details.",
      },
      {
        id: "int-pin", target: "int-pin", chapter: "layout",
        title: "Keep the list open",
        body: "Pin keeps this panel open. Unpinned, it shrinks to icons and opens again when you hover over it.",
      },
      {
        id: "int-types", target: "int-types", chapter: "parts",
        title: "Regular, Special, Past",
        body: "Regular shows open interview events. Special shows events your university assigned to you. Past shows events that have ended.",
        tryIt: "Click Special or Past to switch the list",
      },
      {
        id: "int-status", target: "int-status", chapter: "parts",
        title: "Active or upcoming",
        body: "Narrow the list to events running now (Active) or starting later (Upcoming).",
      },
      {
        id: "int-search", target: "int-search", chapter: "parts",
        title: "Search",
        body: "Find an event by its name or description.",
      },
      {
        id: "int-list", target: "int-list", chapter: "parts",
        title: "Pick an event",
        body: "Click an event to open it. Once you have joined and been paired, your roles appear under it: Interviewer and Candidate. Click a role to open its scheduling.",
      },
      {
        id: "int-active", target: "int-active", chapter: "parts", quick: true,
        title: "Your next interview",
        body: "Your nearest scheduled interview: its time and your partner. Join Session opens the meeting when it is close to the start time, and the interview's details before that.",
      },
      {
        id: "int-session-status", target: "int-session-status", chapter: "parts",
        title: "Session status",
        body: "Whether you are paired, whether the time is confirmed, and whether feedback is still pending for that session.",
      },
      {
        id: "int-joined", target: "int-joined", chapter: "parts",
        title: "Events you joined",
        body: "Each joined event with its state: Pending, Scheduled or Completed. View details or Schedule opens it so you can agree a time.",
      },
      {
        id: "int-event-header", target: "int-event-header", chapter: "parts",
        title: "Event details",
        body: "The event's name, description, start and end, and whether it is upcoming, active or past.",
      },
      {
        id: "int-join", target: "int-join", chapter: "actions", quick: true,
        title: "Join the event",
        body: "Join Interview signs you up so you can be paired. If joining costs Prep Coins, you see the cost and confirm first. Participation Closed means joining has ended for this event.",
      },
      {
        id: "int-template", target: "int-template", chapter: "parts",
        title: "Interview template",
        body: "The format, expectations and topics for this event. Read it before your session so you walk in prepared.",
      },
      {
        id: "int-pair-people", target: "int-pair-people", chapter: "parts",
        title: "Your pair",
        body: "Who is the interviewer and who is the candidate, your own role, and whether the time is Confirmed, Awaiting or Declined.",
      },
      {
        id: "int-schedule", target: "int-schedule", chapter: "actions", quick: true,
        title: "Agree a time",
        body: "Confirm the suggested time or propose a different one within the event dates. Each of you can propose up to 3 times. If you do not agree, the most recent proposal is confirmed automatically.",
      },
      {
        id: "int-past-slots", target: "int-past-slots", chapter: "parts",
        title: "Past time slots",
        body: "A history of proposals that expired, were rejected or were replaced, so you can see how the time was agreed.",
      },
      {
        id: "int-meeting", target: "int-meeting", chapter: "actions",
        title: "Join the meeting",
        body: "After the time is confirmed, the meeting link appears here. Join Meeting and Copy Link work from about 30 minutes before the start. As the interviewer, you are taken to the feedback form after you open the meeting.",
      },
    ],
  },
  {
    id: "student.interview-session",
    paths: ["/student/session"],
    area: "Interviews",
    title: "Sessions & feedback",
    icon: "feedback",
    summary: "Your scheduled mock interview sessions, their meeting links, and the feedback given or received.",
    intro: "Every mock interview with a confirmed time is listed here. Open one to join the meeting, give feedback as the interviewer, or read the feedback you received as the candidate.\nHonest feedback is how you improve before the real interviews.",
    next: "student.ai-interviews",
    tips: [
      "As the interviewer, feedback opens after the session ends.",
      "As the candidate, check back after your session to read your feedback.",
    ],
    steps: [
      {
        id: "ses-sidebar", target: "ses-sidebar", chapter: "layout", quick: true,
        title: "Scheduled sessions",
        body: "Every session with a confirmed time: the event, who interviews whom, and the date. Tags show Feedback Submitted or Feedback Received.",
      },
      {
        id: "ses-search", target: "ses-search", chapter: "parts",
        title: "Search",
        body: "Find a session by event name or by a participant's name.",
      },
      {
        id: "ses-item", target: "ses-item", chapter: "actions",
        title: "Open a session",
        body: "Click a session to see its details on the right.",
      },
      {
        id: "ses-detail", target: "ses-detail", chapter: "parts", quick: true,
        title: "Session details",
        body: "What you see depends on your role. Interviewers give feedback here; candidates read the feedback they received. Until you pick a session, this area asks you to choose one.",
      },
      {
        id: "ses-time", target: "ses-time", chapter: "parts",
        title: "Time and meeting link",
        body: "The scheduled time and, once it is available, the Join Meeting link. Before then, a note says when the link will appear.",
      },
      {
        id: "ses-feedback-form", target: "ses-feedback-form", chapter: "actions",
        title: "Give feedback",
        body: "As the interviewer, enter marks out of 100 and your comments, then submit. Be specific: say what went well and one thing to improve.",
      },
      {
        id: "ses-received", target: "ses-received", chapter: "parts", quick: true,
        title: "Feedback you received",
        body: "As the candidate, read who gave the feedback, the rating out of 5 and their comments. Use it to plan what to practise next.",
      },
    ],
  },
  {
    id: "student.interview-feedback",
    paths: ["/student/feedback/:pairId"],
    openFrom: "student.interviews",
    area: "Interviews",
    title: "Interview feedback form",
    icon: "feedback",
    summary: "The interviewer's form to rate the candidate after a mock interview.",
    intro: "You interviewed a classmate. Now rate them fairly and leave useful comments: good feedback helps them improve, and giving it sharpens your own sense of what interviewers look for.\nOnly the interviewer of the session can fill in this form.",
    tips: [
      "Feedback can be submitted once. Check every rating before you submit.",
      "The page warns you if you try to leave before submitting.",
    ],
    steps: [
      {
        id: "ifb-meeting", target: "ifb-meeting", chapter: "layout",
        title: "Meeting link",
        body: "The session's meeting link, with Copy and Join, in case you need to go back to the call.",
      },
      {
        id: "ifb-details", target: "ifb-details", chapter: "parts",
        title: "Session details",
        body: "The event, its date and the candidate you are rating.",
      },
      {
        id: "ifb-ratings", target: "ifb-ratings", chapter: "actions", quick: true,
        title: "Rate each point",
        body: "Rate the candidate from 1 (poor) to 5 (excellent) on integrity, communication, preparedness, problem solving, and attitude and respect.",
      },
      {
        id: "ifb-total", target: "ifb-total", chapter: "parts",
        title: "Total marks",
        body: "The five ratings added up, out of 25. It updates as you change a rating.",
      },
      {
        id: "ifb-comments", target: "ifb-comments", chapter: "actions", quick: true,
        title: "Comments (required)",
        body: "Write specific feedback and suggestions. Mention what the candidate did well and what to work on next.",
      },
      {
        id: "ifb-submit", target: "ifb-submit", chapter: "actions", quick: true,
        title: "Submit",
        body: "Sends your feedback. After a successful submit you are taken back to your dashboard.",
      },
    ],
  },
  {
    id: "student.ai-interviews",
    paths: ["/student/ai-interviews"],
    area: "Interviews",
    title: "AI Interviews",
    icon: "bot",
    summary: "Interviews scheduled by your university and practice interviews with ANVI, the AI interviewer, with a report after each.",
    intro: "Practise speaking your answers out loud with ANVI, the AI interviewer, and get a written report afterwards. Your university may also schedule interviews for you here.\nLet's look at the tabs, the two kinds of interview, and how to start one.",
    next: "student.analysis",
    terms: [
      { term: "ANVI", text: "PeerPrep's AI interviewer. It asks questions by voice and writes your report afterwards." },
      { term: "Join window", text: "The time during which a scheduled interview can be started." },
    ],
    tips: [
      "The interview room opens on a laptop or desktop only, and needs a working microphone.",
      "Find a quiet place before you start: the check before joining tests your microphone.",
      "Times on this page are shown in IST.",
      "Starting a new practice interview may cost Prep Coins. Continuing one, and scheduled interviews, do not.",
    ],
    steps: [
      {
        id: "ai-header", target: "ai-header", chapter: "layout",
        title: "AI Interviews",
        body: "Complete interviews your university scheduled for you, or practise with ANVI any time.",
      },
      {
        id: "ai-tabs", target: "ai-tabs", chapter: "layout", quick: true,
        title: "Upcoming, Ongoing, Completed",
        body: "Upcoming holds scheduled interviews and practice you can start. Ongoing holds interviews whose join window is open or that you are in the middle of. Completed holds finished ones with their reports.",
        tryIt: "Click a tab to switch",
      },
      {
        id: "ai-scheduled", target: "ai-scheduled", chapter: "parts", quick: true,
        title: "Scheduled interviews",
        body: "Interviews your university assigned. Some ask you to book a slot first; others can be started any time within their window.",
      },
      {
        id: "ai-scheduled-row", target: "ai-scheduled-row", chapter: "parts",
        title: "A scheduled interview",
        body: "The date tile, title, status, the time or window in IST, and facts like language and length. Statuses include Booking needed, Booked, Open now, In progress, Report ready and Missed.",
      },
      {
        id: "ai-checklist", target: "ai-checklist", chapter: "parts",
        title: "Before your interview",
        body: "Whether a resume is needed, optional or already added, and the interview language. Click the resume chip to add or manage your resume.",
      },
      {
        id: "ai-row-action", target: "ai-row-action", chapter: "actions", quick: true,
        title: "Book, join or view",
        body: "The main button changes with the state: Book a slot, Join interview, Continue or View report. Before the window opens it shows Opens in, with a countdown. The menu beside a booking lets you reschedule, add it to your calendar or cancel.",
      },
      {
        id: "ai-practice", target: "ai-practice", chapter: "parts",
        title: "Practice interviews",
        body: "Interviews you can take whenever you like to build confidence. Each card shows the role, language and length, and whether it uses your resume.",
      },
      {
        id: "ai-start-practice", target: "ai-start-practice", chapter: "actions",
        title: "Start practice",
        body: "Opens the setup before joining: interview details and resume, a microphone, browser and network check, the monitoring rules, and a final review with consent. Then the interview starts.",
      },
      {
        id: "ai-blocked", target: "ai-blocked", chapter: "parts",
        title: "Practice paused",
        body: "When your university has scheduled the same interview, its practice is unavailable until that schedule ends.",
      },
      {
        id: "ai-ongoing", target: "ai-ongoing", chapter: "parts",
        title: "In progress",
        body: "Interviews you can join now or have already started. Continue takes you back into the room.",
      },
      {
        id: "ai-completed", target: "ai-completed", chapter: "parts",
        title: "Interview history",
        body: "Finished interviews, newest first, with a score once the report is ready. A scheduled interview's report appears when your university releases it.",
      },
    ],
  },
];
