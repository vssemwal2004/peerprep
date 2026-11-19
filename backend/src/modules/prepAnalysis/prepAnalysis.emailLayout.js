// The standard PeerPrep student email: a coloured header (eyebrow + title), a body of paragraphs,
// bullet lists and one button, and a footer. Every part carries a data-pp marker so the admin's
// email editor can turn the HTML back into plain text and rebuild it (frontend
// admin/prepAnalysis/components/emailText.js writes the same markup).
//
// Text is HTML-escaped; {{variables}} pass through untouched and are filled per student later.

const escape = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

/**
 * blocks: [{ type: 'p', text } | { type: 'list', items: [text] } | { type: 'button', label, href }]
 */
export function studentEmailHtml({ eyebrow = 'PeerPrep · Prep Coding', title, blocks = [], accent = '#0284c7' }) {
  const body = blocks.map((block) => {
    if (block.type === 'list') {
      return `      <ul data-pp="list" style="margin:0 0 18px;padding-left:20px;color:#334155;">\n${block.items.map((item) => `        <li style="margin:4px 0;">${escape(item)}</li>`).join('\n')}\n      </ul>`;
    }
    if (block.type === 'button') {
      return `      <p style="margin:6px 0 24px;text-align:center;"><a data-pp="button" href="${escape(block.href)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:10px;">${escape(block.label)}</a></p>`;
    }
    return `      <p data-pp="p" style="margin:0 0 14px;">${escape(block.text)}</p>`;
  }).join('\n');
  return `<div data-pp="email" style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <tr><td style="background-color:${accent};padding:22px 28px;color:#ffffff;">
      <div data-pp="eyebrow" style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.85;">${escape(eyebrow)}</div>
      <div data-pp="title" style="margin-top:6px;font-size:22px;font-weight:800;line-height:1.3;">${escape(title)}</div>
    </td></tr>
    <tr><td data-pp="body" style="padding:26px 28px 8px;color:#0f172a;font-size:15px;line-height:1.65;">
${body}
    </td></tr>
    <tr><td style="padding:16px 28px 22px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5;">
      Sent by your placement team at {{college}} through PeerPrep.
    </td></tr>
  </table>
</div>`;
}

const p = (text) => ({ type: 'p', text });
const list = (...items) => ({ type: 'list', items });
const button = (label) => ({ type: 'button', label, href: '{{dashboardUrl}}' });

/**
 * One ready-made email per gap of the "Practice journey" funnel (drill keys lost:1 … lost:4), each
 * written for exactly where those students stopped. Created once per university as ordinary,
 * editable templates (Settings → Email Templates).
 */
export const FUNNEL_GAP_TEMPLATES = Object.freeze([
  {
    stage: 'lost:1', type: 'PREP_JOURNEY_NOT_STARTED', name: 'Practice journey 1: never tried a problem',
    subject: '{{firstName}}, your first Prep Coding problem is waiting',
    title: 'Start with one problem today', accent: '#0284c7',
    blocks: [
      p('Hi {{firstName}},'),
      p('Your Prep Coding space is ready, but you have not tried a problem yet. Placement tests reward steady practice, and the hardest part is simply starting.'),
      p('Here is an easy way in:'),
      list('Open Prep Coding and pick any Easy problem', 'Spend 20 minutes on it; a wrong first try is completely fine', 'Submit your code and see how the judge responds'),
      button('Try my first problem'),
      p('Reply to this email if anything stops you from getting started, and we will help.'),
    ],
  },
  {
    stage: 'lost:2', type: 'PREP_JOURNEY_FIRST_SOLVE', name: 'Practice journey 2: tried, nothing solved yet',
    subject: '{{firstName}}, your first accepted solution is close',
    title: 'Turn your attempts into a first solve', accent: '#2563eb',
    blocks: [
      p('Hi {{firstName}},'),
      p('You have already submitted code in Prep Coding. That is the right start. Now let us get your first problem accepted.'),
      p('Tips that help most students:'),
      list('Read the sample input and output once more before coding', 'Test edge cases: empty input, one element, very large values', 'Pick an Easy problem from a topic you already know'),
      button('Solve my first problem'),
      p('Stuck on a wrong answer? Reply with the problem name and we will point you in the right direction.'),
    ],
  },
  {
    stage: 'lost:3', type: 'PREP_JOURNEY_FIRST_MEDIUM', name: 'Practice journey 3: ready for Medium',
    subject: '{{firstName}}, you are ready for a Medium problem',
    title: 'Step up to your first Medium', accent: '#4f46e5',
    blocks: [
      p('Hi {{firstName}},'),
      p('Well done on solving problems in Prep Coding. Placement rounds mostly ask Medium-level questions, so this is the right moment to step up.'),
      p('This week, try to:'),
      list('Solve one Medium problem in a topic you have already practised', 'Write down your approach before you start coding', 'Compare your solution with a faster one after it is accepted'),
      button('Try a Medium problem'),
      p('One Medium a week makes a real difference by placement season.'),
    ],
  },
  {
    stage: 'lost:4', type: 'PREP_JOURNEY_FIRST_HARD', name: 'Practice journey 4: take on a Hard',
    subject: '{{firstName}}, time for your first Hard problem',
    title: 'Take on a Hard problem', accent: '#7c3aed',
    blocks: [
      p('Hi {{firstName}},'),
      p('You are solving Medium problems, which puts you ahead of most students. A Hard problem is the next step, and it is what top companies use to pick their best candidates.'),
      p('How to approach it:'),
      list('Choose a Hard problem in your strongest topic', 'Break it into smaller parts and solve a simpler version first', 'Give it 45 minutes, then study the idea you missed and try again'),
      button('Try a Hard problem'),
      p('Keep going. You are close to the top of your batch.'),
    ],
  },
].map((template) => Object.freeze({
  ...template,
  templateKey: template.type,
  variables: ['firstName', 'name', 'college', 'dashboardUrl'],
  htmlContent: studentEmailHtml({ title: template.title, blocks: template.blocks, accent: template.accent }),
})));

export const FUNNEL_GAP_BY_STAGE = new Map(FUNNEL_GAP_TEMPLATES.map((template) => [template.stage, template]));
export const FUNNEL_GAP_BY_TYPE = new Map(FUNNEL_GAP_TEMPLATES.map((template) => [template.type, template]));
