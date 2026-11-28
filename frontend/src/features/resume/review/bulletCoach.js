// Bullet coach: checks one résumé bullet and asks the student questions. It never writes or
// rewrites a line (text written by ANVI would read as AI-written and would not be the student's
// own work); it only names what is missing and offers single words as reference. Pure logic.
import { opensWithAction } from './resumeStrength';
import { TECH_TERMS, WEAK_OPENER } from './reviewModel';

/** Single verbs to start a bullet with, by what the work was. Words only, never sentences. */
export const VERB_IDEAS = {
  'You built something': ['Built', 'Developed', 'Designed', 'Implemented', 'Created'],
  'You made it better': ['Reduced', 'Improved', 'Optimised', 'Automated', 'Simplified'],
  'You worked with people': ['Led', 'Coordinated', 'Mentored', 'Presented', 'Organised'],
  'You found or studied something': ['Analysed', 'Tested', 'Researched', 'Evaluated', 'Debugged'],
};

const words = (text) => String(text || '').trim().split(/\s+/).filter(Boolean);

/** { score, total, checks: [{ id, title, passed, question, tip }] } for one bullet's plain text. */
export function coachBullet(text, lineIssues = []) {
  const count = words(text).length;
  const tokens = words(text).map((word) => word.replace(/[^A-Za-z0-9.+#/-]/g, '').replace(/\.$/, '').toLowerCase());
  const mistakes = lineIssues.filter((issue) => issue.category !== 'style').length;
  const checks = [
    { id: 'action', title: 'Starts with what you did', passed: opensWithAction(text) && !WEAK_OPENER.test(text.trim()),
      question: 'What did you do yourself? Put that verb first.', tip: 'Not “Responsible for” or “Worked on”: the action word comes first.' },
    { id: 'result', title: 'Shows a result with a number', passed: /\d/.test(text),
      question: 'What changed because of your work? How many users, what %, how much time saved, what rank?', tip: 'Use only a number you can explain in an interview.' },
    { id: 'how', title: 'Says how (tool or method)', passed: tokens.some((token) => TECH_TERMS[token]) || /\b(using|with|by|through|via)\b/i.test(text),
      question: 'Which tool, language or method did you use?', tip: 'Name it only if you really used it.' },
    { id: 'length', title: 'One clear idea, 1–2 lines', passed: count >= 8 && count <= 32,
      question: count < 8 ? 'Can you add what you did, how, and the result?' : 'Is this two ideas? Split it into two bullets.', tip: `${count} words now; aim for 8–32.` },
    { id: 'person', title: 'No “I”, “my” or “we”', passed: !/\b(I|my|me|we|our)\b/.test(text),
      question: 'Can you start with the action instead of “I”?', tip: 'Résumé bullets leave out the pronoun.' },
    { id: 'clean', title: 'No spelling or grammar mistakes', passed: mistakes === 0,
      question: mistakes ? `This line has ${mistakes} mistake${mistakes === 1 ? '' : 's'}. Open Issues to see ${mistakes === 1 ? 'it' : 'them'}.` : '', tip: '' },
  ];
  return { score: checks.filter((check) => check.passed).length, total: checks.length, checks };
}
