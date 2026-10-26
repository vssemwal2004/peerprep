# PeerPrep — Pitch Voice-over (English) — SUPERSEDED

> Record from **voiceover-timed.md** instead: it is matched line by line to the frames of the final video. This file is the earlier draft kept for reference.

Pace: ~145 words per minute, calm and confident. Each block starts at its timecode; a short silence at the end of a block is fine — the video holds.
Pronunciation: **ANVI** = "AHN-vee" · **Judge0** = "Judge zero" · **PeerPrep** = "Peer Prep".
Every number spoken or shown comes from the platform itself (admin dashboard and PrepCoding page, 26 Oct 2026). If your numbers grow before the hackathon, update script/facts.json and this line together.

---

### 01 · The problem — 0:00 (21 s)
Every placement season looks the same. Students practise coding on one site, take mock tests on another, and prepare for interviews on their own, often with no feedback. Placement teams see none of it, so they find out who needs help only after the drive is over.

### 02 · Vision — 0:21 (16 s)
We asked a simple question: what if a student's entire preparation, and a college's entire view of it, lived in one place? That is PeerPrep — one platform to learn, practise, get assessed and get interview-ready.

### 03 · Student dashboard — 0:37 (11 s)
A student logs in to a dashboard that picks up where they left off: today's goal, a daily challenge, practice sheets and progress.

### 04 · Prep Coding — 0:48 (26 s)
Prep Coding is our practice engine. Problems are organised by topic and company, and every one opens in a full code editor. Students write code in C++, Java, Python and more, run it against test cases, and submit. Each submission is judged in an isolated sandbox, and an accepted solution earns Prep Coins and moves their Prep Score.

### 05 · Assessments — 1:14 (10 s)
Colleges can also run timed assessments, with MCQ and coding sections, and optional AI proctoring that flags tab switches and camera violations.

### 06 · ANVI, the AI interviewer — 1:24 (30 s)
Then there is ANVI, our AI interviewer. A college schedules an interview for a cohort, and each student takes it as a real voice conversation: warm-up, technical questions, and follow-ups based on what they actually say. ANVI then scores every answer and writes a detailed report, with question-wise feedback, analysis and action items, downloadable as a PDF. The placement team reviews it and releases it to the student.

### 07 · Learning analysis — 1:54 (17 s)
All of this feeds one learning analysis. Students see their readiness, their coding accuracy topic by topic, what to practise next, a single Prep Score, and where they rank in their university.

### 08 · Multi-campus admin — 2:11 (15 s)
Now the other side. PeerPrep is built for many universities at once. Our team onboards a campus, switches on the modules it needs, and sets its plan: service dates and student seats.

### 09 · AI interview builder — 2:26 (19 s)
Placement teams create AI interviews in four guided steps: basics, questions, ANVI settings, and review. Questions can be fixed, or generated live by topic priority, so every student gets a different interview. Every session's AI usage is tracked: minutes, tokens and calls.

### 10 · Prep Analysis — 2:45 (17 s)
And for the first time, they can see preparation as it happens. Prep Analysis filters any group of students by feature and period, and exports the result for placement meetings. Even the Prep Score formula is configurable.

### 11 · How we built it — 3:02 (20 s)
Under the hood: a React front end and a Node and Express API. Every university gets its own isolated MongoDB database, selected per request. Code runs on Judge0 through Redis job queues, ANVI runs on Google Gemini, and analytics run as a separate Python service.

### 12 · Business model — 3:22 (15 s)
Our model is B2B: universities subscribe per campus, sized by student seats and the modules they switch on. AI interviews run on Prep Coin credits, so usage-heavy features pay for their own compute.

### 13 · Built to scale — 3:37 (17 s)
Because every campus is isolated and every heavy job runs in a queue, adding a university means adding a database, not rewriting the product. Today: 589 students onboarded, over four thousand problems, and built for many more.

**End — 3:54**

---

## Claims to confirm before recording (each is checked against the code; you confirm it is true for your live deployment)
- **Scene 05:** proctoring is optional per assessment — "optional" stays in the line.
- **Scene 06:** the video shows the report from the admin side (the student's copy is "pending release"), which is why the line says the placement team releases it.
- **Scene 09:** "generated live by topic priority" is a real wizard option but is not shown on screen; the usage numbers are.
- **Scene 12:** this is the go-to-market model. The product already enforces it (seat caps, module switches, coin wallets), but there is no payment gateway or price list yet — if a judge asks about pricing, say prices are set per campus during onboarding.
- **Scene 13:** 589 students, 4,012 problems, 577 company tags and 132 topics are read from the platform; you can open the admin dashboard to prove them.
