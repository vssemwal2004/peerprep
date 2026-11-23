import { atsRuleInfo, collectTextUnits, toPlain } from './reviewModel';

const FIX_TEXT = {
  'parse.text': 'Use a text-based template so the words can be selected and read.',
  'parse.imageOnly': 'Switch to a text-based template so the reader can pick up your words.',
  'parse.roles': 'If you have work experience, add your role, employer and dates together.',
  'parse.roleCompleteness': 'Check that each work entry includes your role, employer and start date.',
  'parse.contact': 'Check the contact details at the top of the exported PDF.',
  'contact.email': 'Show an email address where a recruiter can reach you.',
  'contact.position': 'Choose a layout with your contact details near the top of page one.',
  'structure.experience': 'If you have a job or internship, put it under Experience. A project can show your work as a fresher.',
  'structure.education': 'Give your qualifications a visible Education heading.',
  'structure.skills': 'Put your skills together under a visible Skills heading.',
  'content.metrics': 'If you measured a result, include that number in the bullet.',
  'content.verbs': 'Start the bullet with what you did, such as “Built” or “Tested”.',
  'content.timeline': 'Check the start and end dates for your work entries.',
  'content.skillEvidence': 'Mention where you used a listed skill in a project or role.',
  'format.columns': 'Try a single-column template, then check the order of the extracted text.',
  'format.tables': 'Try a template that keeps the content in one reading order.',
  'writing.weakOpeners': 'Start with a specific action you took.',
  'writing.bulletLength': 'Split a long bullet into shorter points with one idea each.',
};

export function describeAtsFinding(finding, resume) {
  const info = atsRuleInfo(finding.id, resume);
  const rule = String(finding.id).replace(/^ats-v\d+\./, '');
  const target = { section: info.section, template: info.template };
  if (rule === 'contact.email') target.field = 'email';
  if (rule === 'parse.contact') {
    target.field = ['name', 'email', 'mobile'].find(field => !resume.basics?.[field]?.trim() || resume.basicsVisibility?.[field] === false);
  }
  if (rule === 'parse.roleCompleteness') {
    const entryIndex = resume.experience.findIndex(entry => !entry.title || !entry.subtitle || !entry.date);
    if (entryIndex >= 0) {
      target.entryIndex = entryIndex;
      target.field = ['title','subtitle','date'].find(key => !resume.experience[entryIndex][key]);
    }
  }
  // An engine finding can cite a line. Resolve only unique, verbatim evidence.
  if (!target.template && !target.field && finding.evidence) {
    const evidence = String(finding.evidence).toLowerCase();
    const matches = collectTextUnits(resume).filter(unit => {
      if (unit.field !== 'bullet') return false;
      const line = toPlain(unit.raw).text.toLowerCase().trim();
      return line.length >= 12 && evidence.includes(line);
    });
    if (matches.length === 1) Object.assign(target, matches[0]);
  }
  return { ...info, target, instruction: FIX_TEXT[rule] || finding.fix };
}
