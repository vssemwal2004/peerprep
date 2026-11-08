// "What to do next": a short, ranked list of steps built from the student's own numbers.
// Every step says why (one measurable reason) and links to the exact place to act, so the
// analysis page leads straight into practice. Rules are deterministic and only look at the
// features the student can use (the caller passes null for the others).

const DAY_MS = 24 * 60 * 60 * 1000;
export const COACH_LIMIT = 6;

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;
const topicLink = (name, difficulty = '') => `/problems?topic=${encodeURIComponent(name)}${difficulty ? `&difficulty=${difficulty}` : ''}`;
const shortDate = (value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * input: { coverage, coding (period row.coding), retry (first tried-not-solved question link or null),
 * quickprep, learning, assessment: { upcoming, latest, missed }, interview, ai, activity: { daysSinceActive }, now }
 * Returns at most COACH_LIMIT steps, most important first, one per kind.
 */
export function buildCoachSteps(input) {
  const steps = [];
  const add = (step) => steps.push(step);
  const { coverage, activity, now = new Date() } = input;

  // Habit first: a long gap matters more than any one topic.
  if (activity && (activity.daysSinceActive === null || activity.daysSinceActive >= 3)) {
    const never = activity.daysSinceActive === null;
    add({
      id: 'restart', kind: 'habit', tone: never ? 'focus' : 'urgent', priority: never ? 80 : Math.min(95, 70 + activity.daysSinceActive),
      title: never ? 'Start your preparation today' : 'Get back on track today',
      reason: never ? 'No practice yet. One easy question starts your streak.' : `No activity for ${plural(activity.daysSinceActive, 'day')}.`,
      action: input.coding ? { label: 'Solve an easy question', to: '/problems?difficulty=Easy' } : null,
    });
  }

  if (input.assessment?.upcoming) {
    const test = input.assessment.upcoming;
    const days = Math.max(0, Math.ceil((new Date(test.startTime) - now) / DAY_MS));
    if (days <= 7) {
      add({
        id: `test-${test.id}`, kind: 'upcomingTest', tone: 'urgent', priority: 92 - days,
        title: test.live ? `Take ${test.title}` : `Prepare for ${test.title}`,
        reason: test.live ? `Live now, open until ${shortDate(test.endTime)}.` : days === 0 ? 'Starts today.' : `Starts in ${plural(days, 'day')} (${shortDate(test.startTime)}).`,
        action: { label: 'Open tests', to: '/student/assessments' },
      });
    }
  }

  if (coverage) {
    const core = coverage.topics.filter((topic) => topic.core);
    const weak = core.filter((topic) => topic.state === 'needsWork').sort((left, right) => right.graded - left.graded)[0];
    if (weak) {
      add({
        id: `fix-${weak.key}`, kind: 'fixTopic', tone: 'urgent', priority: 85, topicKey: weak.key,
        title: `Fix accuracy in ${weak.name}`,
        reason: weak.solved === 0 ? `Tried ${plural(weak.started, 'question')}, none solved yet.` : `${weak.accuracy}% correct over ${plural(weak.graded, 'try', 'tries')}.`,
        action: { label: `Practise ${weak.name}`, to: topicLink(weak.name, 'Easy') },
      });
    }
    const close = core.filter((topic) => topic.state === 'building' && topic.solved < topic.target)
      .sort((left, right) => (left.target - left.solved) - (right.target - right.solved) || right.total - left.total)[0];
    if (close) {
      const left = close.target - close.solved;
      add({
        id: `grow-${close.key}`, kind: 'growTopic', tone: 'grow', priority: 72, topicKey: close.key,
        title: `${plural(left, 'more question')} to be strong in ${close.name}`,
        reason: `Solved ${close.solved} of ${close.total}; strong starts at ${close.target}.`,
        action: { label: `Continue ${close.name}`, to: topicLink(close.name) },
      });
    }
    const fresh = core.filter((topic) => topic.state === 'notStarted').sort((left, right) => right.total - left.total)[0];
    if (fresh) {
      add({
        id: `start-${fresh.key}`, kind: 'startTopic', tone: 'focus', priority: 66, topicKey: fresh.key,
        title: `Start ${fresh.name}`, reason: `A core topic with ${plural(fresh.total, 'question')}; none tried yet.`,
        action: { label: `Open ${fresh.name}`, to: topicLink(fresh.name, 'Easy') },
      });
    }
    const { Easy, Medium } = coverage.totals.byDifficulty;
    if (Easy.solved >= 10 && Medium.solved < Math.ceil(Easy.solved / 3)) {
      add({
        id: 'step-up', kind: 'stepUp', tone: 'grow', priority: 64,
        title: 'Step up to Medium questions', reason: `${Easy.solved} Easy solved, only ${Medium.solved} Medium.`,
        action: { label: 'Practise Medium', to: '/problems?difficulty=Medium' },
      });
    }
  }

  if (input.retry?.count) {
    add({
      id: 'retry', kind: 'retry', tone: 'focus', priority: 60,
      title: `Finish ${plural(input.retry.count, 'question')} you started`, reason: `Last tried: ${input.retry.first.title}.`,
      action: { label: 'Retry it', to: input.retry.first.to },
    });
  }

  if (input.quickprep) {
    const sheets = input.quickprep.sheets || [];
    const open = sheets.filter((sheet) => !sheet.finished && sheet.total > 0).sort((left, right) => right.progress - left.progress)[0];
    if (open) {
      add({
        id: `sheet-${open.id}`, kind: 'sheet', tone: 'grow', priority: 62,
        title: `Finish ${open.title}`, reason: `${open.solved} of ${open.total} done (${open.progress}%).`,
        action: { label: 'Open sheet', to: open.slug ? `/student/quickprep/${open.slug}` : '/student/quickprep' },
      });
    } else if (!sheets.length && input.quickprep.notStarted?.length) {
      const first = input.quickprep.notStarted[0];
      add({
        id: 'sheet-start', kind: 'sheet', tone: 'focus', priority: 50,
        title: `Try the ${first.title} sheet`, reason: `${plural(input.quickprep.notStarted.length, 'QuickPrep sheet')} waiting for you.`,
        action: { label: 'Open QuickPrep', to: first.slug ? `/student/quickprep/${first.slug}` : '/student/quickprep' },
      });
    }
  }

  if (input.learning) {
    const subjects = input.learning.subjects || [];
    const current = subjects.filter((subject) => subject.progress > 0 && subject.progress < 100).sort((left, right) => right.progress - left.progress)[0];
    const unstarted = subjects.find((subject) => subject.progress === 0);
    const subject = current || unstarted;
    if (subject) {
      add({
        id: `learn-${subject.name}`, kind: 'learning', tone: current ? 'grow' : 'focus', priority: current ? 58 : 48,
        title: current ? `Continue ${subject.name}` : `Start ${subject.name}`,
        reason: `${subject.completed} of ${plural(subject.total, 'lesson')} done.`,
        action: { label: 'Open learning', to: '/student/learning' },
      });
    }
  }

  if (input.assessment?.latest && !input.assessment.latest.passed) {
    const test = input.assessment.latest;
    add({
      id: `review-${test.id}`, kind: 'reviewTest', tone: 'urgent', priority: 78,
      title: `Review ${test.title}`, reason: `Scored ${test.percent}%; the pass mark is ${input.assessment.passPercent}%.`,
      action: { label: 'See results', to: '/student/assessment-reports' },
    });
  }

  if (input.interview) {
    const ratings = (input.interview.ratings || []).filter((rating) => rating.value > 0).sort((left, right) => left.value - right.value);
    const lowest = ratings[0];
    if (lowest && lowest.value < 3) {
      add({
        id: `rating-${lowest.key}`, kind: 'interviewSkill', tone: 'focus', priority: 56,
        title: `Work on ${lowest.label.toLowerCase()}`, reason: `Interviewers rated it ${lowest.value} of 5.`,
        action: { label: 'Book a mock interview', to: '/student/interview' },
      });
    } else if (!input.interview.mockDone && !input.interview.scheduled) {
      add({
        id: 'mock-start', kind: 'mock', tone: 'focus', priority: 46,
        title: 'Take a mock interview', reason: 'No mock interview in this period.',
        action: { label: 'Book one', to: '/student/interview' },
      });
    }
  }

  if (input.ai && !input.ai.completed) {
    add({
      id: 'ai-start', kind: 'ai', tone: 'focus', priority: 44,
      title: 'Practise with an AI interview', reason: input.ai.started ? 'Started, not finished yet.' : 'No AI interview in this period.',
      action: { label: 'Open AI interviews', to: '/student/ai-interviews' },
    });
  }

  const seen = new Set();
  return steps.sort((left, right) => right.priority - left.priority)
    .filter((step) => (seen.has(step.kind) ? false : seen.add(step.kind)))
    .slice(0, COACH_LIMIT)
    .map(({ priority, ...step }) => step);
}
