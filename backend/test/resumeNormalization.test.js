import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResume } from '../src/controllers/resumeController.js';

test('resume normalization keeps every section optional and removes empty entries', () => {
  const result = normalizeResume({
    basics: { name: '', email: '', mobile: '' },
    education: [{ year: '', degree: '', institute: '', score: '' }],
    projects: [{ title: '', bullets: [{ text: '' }] }],
  });

  assert.equal(result.basics.name, '');
  assert.deepEqual(result.education, []);
  assert.deepEqual(result.projects, []);
  assert.equal(result.completion, 0);
});

test('resume normalization sanitizes section order, custom ids, links, and bullets', () => {
  const result = normalizeResume({
    basics: { name: '  Student Name  ', github: 'github.com/student' },
    projects: [{
      title: 'PeerPrep',
      link: 'javascript:alert(1)',
      bullets: [{ text: ' Built a placement platform. ' }, { text: '' }],
    }],
    customSections: [{ id: 'certs<script>', title: ' Certifications ', format: 'highlights', entries: [{ title: 'AWS' }] }],
    sectionOrder: ['projects', 'projects', 'unknown', 'custom:certsscript'],
    hiddenSections: ['unknown', 'education'],
  });

  assert.equal(result.basics.name, 'Student Name');
  assert.equal(result.basics.github, 'https://github.com/student');
  assert.equal(result.projects[0].link, '');
  assert.deepEqual(result.projects[0].bullets, [{ text: 'Built a placement platform.' }]);
  assert.equal(result.customSections[0].id, 'certsscript');
  assert.equal(result.customSections[0].format, 'details');
  assert.equal(result.sectionOrder[0], 'projects');
  assert.equal(result.hiddenSections.includes('unknown'), false);
  assert.equal(result.hiddenSections.includes('education'), true);
});

test('resume normalization defaults unknown custom layouts for older and malformed documents', () => {
  const result = normalizeResume({
    customSections: [
      { id: 'legacy', title: 'Legacy', entries: [{ title: 'Compatible entry' }] },
      { id: 'invalid', title: 'Invalid', format: 'freeform-html', entries: [{ title: 'Safe entry' }] },
      { id: 'groups', title: 'Coursework', format: 'skills', entries: [{ title: 'Core', technologies: 'DBMS, OS' }] },
    ],
  });

  assert.deepEqual(result.customSections.map((section) => section.format), ['details', 'details', 'details']);
});
