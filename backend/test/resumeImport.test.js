import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, test } from 'node:test';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import { createImportReader, importResume } from '../src/modules/resumeImport/resumeImport.service.js';
import { mapImport } from '../src/modules/resumeImport/resumeImport.mapper.js';

const extractor = createImportReader();
after(() => extractor.close());
const read = (originalname, buffer) => importResume({ originalname, buffer }, { extractor, config: {} });

async function pdf(write) {
  const document = new PDFDocument({ size: 'A4' });
  const chunks = [];
  document.on('data', (chunk) => chunks.push(chunk));
  const end = once(document, 'end');
  write(document);
  document.end();
  await end;
  return Buffer.concat(chunks);
}

test('PDF renders into editable fields including a hyperlink hidden behind its project label', async () => {
  const buffer = await pdf((doc) => {
    doc.text('Asha Verma').text('asha@example.com | Bengaluru, India');
    doc.text('PROFESSIONAL SUMMARY').text('Building tools to help students learn.');
    doc.text('EDUCATION').text('Example University').text('B.Tech Computer Science | 2022 - 2026 | GPA 8.4');
    doc.text('PROJECTS').text('Campus Events | Live', { link: 'https://campus.example.org/' }).text('Tech: React, SQL').text('• Built an event calendar for the student council.');
    doc.text('SKILLS').text('Languages: Python, SQL');
  });
  const { resume } = await read('resume.pdf', buffer);
  assert.equal(resume.basics.name, 'Asha Verma');
  assert.equal(resume.basics.email, 'asha@example.com');
  assert.equal(resume.basics.location, 'Bengaluru, India');
  assert.equal(resume.education[0].institute, 'Example University');
  assert.equal(resume.education[0].year, '2022 - 2026');
  assert.equal(resume.education[0].score, 'GPA 8.4');
  assert.equal(resume.projects[0].title, 'Campus Events');
  assert.equal(resume.projects[0].link, 'https://campus.example.org/');
  assert.equal(resume.projects[0].bullets[0].text, 'Built an event calendar for the student council.');
  assert.equal(resume.customSections[0].entries[0].technologies, 'Building tools to help students learn.');
  assert.equal(resume.skills[0].skills, 'Python, SQL');
});

test('DOCX import resolves relationship links, list paragraphs and XML entities', async () => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  const para = (s) => '<w:p><w:r><w:t>' + s + '</w:t></w:r></w:p>';
  zip.file('word/document.xml', '<w:document xmlns:w="urn:word" xmlns:r="urn:rel"><w:body>' +
    para('Asha Verma') + para('asha@example.com') + para('PROJECTS') +
    '<w:p><w:r><w:t>Reading List | </w:t></w:r><w:hyperlink r:id="rId1"><w:r><w:t>GitHub</w:t></w:r></w:hyperlink></w:p>' +
    '<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Created a reading &amp; review app.</w:t></w:r></w:p>' +
    para('SKILLS') + para('Languages: Python') + '</w:body></w:document>');
  zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Target="https://github.com/example/reading"/></Relationships>');
  const { resume } = await read('reading.docx', await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(resume.projects[0].link, 'https://github.com/example/reading');
  assert.equal(resume.projects[0].bullets[0].text, 'Created a reading & review app.');
  assert.equal(resume.skills[0].skills, 'Python');
});

test('side-by-side PDF sections keep their own entries and bullet text', async () => {
  const buffer = await pdf((doc) => {
    doc.text('Asha Verma', 40, 40).text('asha@example.com', 40, 58);
    doc.text('EDUCATION', 40, 98).text('PROJECTS', 305, 98);
    doc.text('Example University', 40, 118).text('Campus Map', 305, 118);
    doc.text('B.Tech Computer Science', 40, 138).text('• Built a route planner.', 305, 138);
  });
  const { resume } = await read('two-columns.pdf', buffer);
  assert.equal(resume.education[0].institute, 'Example University');
  assert.equal(resume.projects[0].title, 'Campus Map');
  assert.equal(resume.projects[0].bullets[0].text, 'Built a route planner.');
});
test('empty scanned PDF, malformed Word upload and unsupported extensions return actionable errors', async () => {
  await assert.rejects(read('scan.pdf', await pdf(() => {})), /readable text/);
  const zip = new JSZip();
  zip.file('unrelated', 'test');
  await assert.rejects(read('wrong.docx', await zip.generateAsync({ type: 'nodebuffer' })), /could not be read/);
  await assert.rejects(read('wrong.txt', Buffer.from('student resume')), /PDF or Word/);
});

test('column dates, shared school headings and wrapped bullets map to the correct entries', () => {
  const { resume } = mapImport([
    'Asha Verma', 'asha@example.com', 'EDUCATION',
    'EXAMPLE UNIVERSITY\t2023 - Present', 'B.Tech Computer Science | GPA: 8.2\tDelhi, India',
    'Example School\t2022', 'Class XII (ISC) | 90%\tDelhi, India', 'Class X (ICSE) | 81%\t2020',
    'PROJECTS', 'Campus portal | Live\tNov 2025 - Present https://campus.example.org/',
    '• Created a tool for students to use', 'React forms to register.',
    'ACHIEVEMENTS & CERTIFICATIONS', '• Hackathon Finalist (Top 5%, Aug 2025): Built a campus app.',
  ]);
  assert.deepEqual(resume.education.map((item) => [item.year, item.score]), [['2023 - Present', 'GPA: 8.2'], ['2022', '90%'], ['2020', '81%']]);
  assert.equal(resume.education[2].institute, 'Example School');
  assert.equal(resume.projects.length, 1);
  assert.equal(resume.projects[0].bullets[0].text, 'Created a tool for students to use React forms to register.');
  assert.equal(resume.achievements[0].date, 'Aug 2025');
  assert.equal(resume.achievements[0].bullets[0].text, 'Built a campus app.');
});

test('partial drafts keep their readable text and oversized native fields remain available for review', () => {
  const partial = mapImport(['Asha Verma', 'asha@example.com', 'Developed a library tool for campus readers.']);
  assert.ok(partial.resume.customSections[0].entries[0].technologies.includes('library tool'));
  assert.ok(partial.warnings.length);
  const bullets = Array.from({ length: 23 }, (_, n) => '• Delivered task ' + (n + 1) + '.');
  const oversized = mapImport(['Asha Verma', 'PROJECTS', 'Student portal', ...bullets]);
  assert.equal(oversized.resume.projects[0].bullets.length, 20);
  assert.ok(oversized.resume.customSections.some((s) => s.entries.some((e) => e.technologies.includes('Delivered task 23.'))));
  assert.ok(oversized.warnings.length);
});
