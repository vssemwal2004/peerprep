// "How is this counted?" for every headline number: the exact rule, in plain words, matching the
// server (modules/prepAnalysis/charts.js). Keyed "<section>.<kpi id>".

export const KPI_EXPLAIN = Object.freeze({
  "coding.active": "Students with at least one coding submission in the last 14 days (up to the end of the period).",
  "coding.hard": "Students who have solved at least one Hard problem (first accepted submission).",
  "coding.stopped": "Students who practised coding before but made no submission in the last 14 days, plus students who never practised.",
  "coding.review": "Students with at least one solve worth a look: solved unusually fast or with most of the code pasted. Open them to review; a flag is not proof of copying.",
  "coding.submissions": "Accepted submissions out of all coding submissions in the period. The line is the acceptance rate over time; the badge compares the number of submissions with the previous period of the same length.",
  "quickprep.sheetStarted": "Students who opened at least one Quick Prep sheet open to them.",
  "quickprep.sheetActive": "Students who worked in a sheet (opened it or solved a question) in the last 14 days.",
  "quickprep.sheetFinished": "Students who solved every question of at least one sheet.",
  "quickprep.never": "Students with at least one sheet open to them who have never opened any sheet.",
  "quickprep.review": "Students with at least one sheet solve worth a look: solved unusually fast or mostly pasted.",
  "learning.active": "Students who completed a learning topic or watched lessons in the last 14 days.",
  "learning.topicDone": "Students who completed at least one learning topic.",
  "learning.halfway": "Students who completed at least half of the topics available to them.",
  "learning.stopped": "Students who learned before but not in the last 14 days, plus students who never started.",
  "learning.topics": "Topics completed out of the topics available to the students in view, all students together.",
  "interview.students": "Students who completed at least one interview (mock or AI).",
  "interview.active": "Students who had an interview in the last 14 days.",
  "interview.strong": "Students whose average mock interview score is 60% or more.",
  "interview.never": "Students who have not completed any interview yet.",
  "interview.avgMock": "The average score of all completed mock interviews in the period, out of 100.",
  "assessment.students": "Students who submitted at least one test.",
  "assessment.passedStudents": "Students who scored 40% or more in at least one test.",
  "assessment.missed": "Students who did not attempt a test that was assigned to them and has ended.",
  "assessment.never": "Students assigned at least one test who have not taken any.",
  "assessment.passRate": "Tests passed (40% or more) out of tests taken, all students together.",
  "prepmock.students": "Students who submitted at least one mock.",
  "prepmock.passedStudents": "Students who scored 40% or more in at least one mock.",
  "prepmock.missed": "Students who did not attempt an assigned mock that has ended.",
  "prepmock.never": "Students assigned at least one mock who have not taken any.",
  "prepmock.passRate": "Mocks passed (40% or more) out of mocks taken, all students together.",
});

export const COVERAGE_EXPLAIN = "How many of the students in view this chart is about, out of everyone in view (after the page's filters and period), and that share in %.";
