import test from 'node:test';
import assert from 'node:assert/strict';
import { headlineQuality, resumeStrength } from '../src/features/resume/review/resumeStrength.js';

const base = { sectionOrder: ['education', 'experience', 'projects', 'skills', 'achievements'], hiddenSections: [], customSections: [], basicsVisibility: {} };

test('a thin résumé that an ATS reads perfectly still scores low on strength', () => {
  const thin = resumeStrength({
    ...base,
    basics: { name: 'A', email: 'a@x.com', mobile: '1' },
    education: [{ degree: 'B.Tech', institute: 'GEU' }],
    projects: [{ title: 'Todo app', bullets: [{ text: 'Made a todo app' }] }],
    skills: [{ category: 'Languages', skills: 'Java, C' }],
  });
  assert.ok(thin.score < 40, `thin résumé scored ${thin.score}`);
  assert.equal(thin.label, 'Thin');
  assert.deepEqual(thin.improvements.slice(0, 2).map((check) => check.id), ['metrics', 'depth'], 'the biggest point gaps come first');
  assert.deepEqual(thin.checks.find((check) => check.id === 'metrics').target, { section: 'projects', entryIndex: 0, field: 'bullet', bulletIndex: 0 });
});

test('a full résumé with measurable, action-led bullets scores strong', () => {
  const bullet = (value) => ({ text: value });
  const strong = resumeStrength({
    ...base,
    basics: { headline: 'Full-stack developer, React and Node.js', linkedin: 'in/a', github: 'gh/a' },
    education: [{ degree: 'B.Tech CSE', institute: 'GEU', score: '8.6 CGPA', year: '2026' }],
    experience: [{ title: 'SDE Intern', subtitle: 'Acme', bullets: [bullet('Built 6 React dashboards used by 2,000 sales staff every day'), bullet('Reduced API response time by 40% by adding Redis caching to order search')] }],
    projects: [
      { title: 'Chat app', bullets: [bullet('Developed a real-time chat app with Socket.IO for 120 classmates'), bullet('Deployed on AWS EC2 with GitHub Actions CI, cutting release time to 5 minutes')] },
      { title: 'Judge', bullets: [bullet('Designed a code judge running 3 languages in Docker sandboxes'), bullet('Wrote 150 unit tests in Jest, keeping coverage above 85 percent')] },
    ],
    skills: [{ category: 'Languages', skills: 'Java, Python, JavaScript, TypeScript, SQL' }, { category: 'Tools', skills: 'React, Node.js, Docker, AWS, Git, Redis' }],
    achievements: [{ title: 'Smart India Hackathon 2025 finalist (top 5 of 300 teams)' }],
  });
  assert.ok(strong.score >= 85, `strong résumé scored ${strong.score}`);
  assert.equal(strong.label, 'Strong');
});

test('junk headlines and writing issues lower the score', () => {
  assert.equal(headlineQuality('Github GitHub'), 0);
  assert.equal(headlineQuality('linkedin.com/in/x'), 0);
  assert.equal(headlineQuality('Full-stack developer · React, Node.js'), 1);
  const resume = { ...base, basics: { headline: 'Backend developer, Java and Spring' }, projects: [{ title: 'X', bullets: [{ text: 'Built an API serving 200 users with Spring Boot and MySQL' }] }] };
  const unchecked = resumeStrength(resume);
  assert.equal(unchecked.checks.some((check) => check.id === 'writing'), false, 'left out until the grammar check runs');
  assert.ok(resumeStrength(resume, { writingIssues: 6 }).score < resumeStrength(resume, { writingIssues: 0 }).score);
});

test('hidden sections do not count', () => {
  const hidden = resumeStrength({ ...base, hiddenSections: ['projects'], projects: [{ title: 'X', bullets: [{ text: 'Built a thing for 10 users quickly' }] }] });
  assert.equal(hidden.checks.find((check) => check.id === 'depth').earned, 0);
});
