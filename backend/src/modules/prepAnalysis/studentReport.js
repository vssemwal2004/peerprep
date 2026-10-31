// One student's full report for a period, as Excel (one sheet per part) or PDF. It holds
// everything the student drawer shows and more: every topic and every problem the student
// touched (with first try, first solve and last try), each day of practice, and their Quick
// Prep sheets, lessons, interviews and tests where the university has those features.

import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PASS_PERCENT } from './assessmentFacts.js';
import { LANGUAGE_NAMES, problemsOf } from './drill.js';
import { RATINGS } from './interviewFacts.js';
import { periodText } from './prepAnalysis.export.js';

const VERDICT_LABELS = { AC: 'Accepted', WA: 'Wrong answer', TLE: 'Too slow', RE: 'Crashed', CE: 'Did not compile' };
const STATUS = {
  coding: { active: 'Practising', inactive: 'Stopped', never: 'Never practised' },
  learning: { active: 'Learning', inactive: 'Stopped', never: 'Never started' },
  interview: { active: 'Interviewing', inactive: 'Stopped', never: 'Never interviewed' },
  assessment: { active: 'Taking tests', inactive: 'Stopped', never: 'Never took a test' },
};
const MODULE_LABELS = { coding: 'Prep Coding', learning: 'Prep Learning', interview: 'Prep Interview', assessment: 'Prep Assessment' };
const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);
const percent = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const language = (key) => LANGUAGE_NAMES[key] || key;
const daysAgo = (days) => (days === null || days === undefined ? 'Never' : days === 0 ? 'Today' : `${days} days ago`);

const col = (label, kind = 'text', width = 14) => ({ label, kind, width });
const pairs = (title, rows) => ({ title, kind: 'pairs', columns: [col('Item', 'text', 30), col('Value', 'text', 50)], rows: rows.filter(([, value]) => value !== undefined) });

/** Every topic the student touched, most practised first. */
function allTopics(row) {
  const topics = new Map();
  for (const problem of problemsOf(row)) {
    for (const name of problem.topics) {
      const topic = topics.get(name) || { name, attempted: 0, solved: 0, submissions: 0, accepted: 0 };
      topic.attempted += 1;
      if (problem.solved) topic.solved += 1;
      topic.submissions += problem.attempts;
      topic.accepted += problem.accepted;
      topics.set(name, topic);
    }
  }
  return [...topics.values()].sort((left, right) => right.attempted - left.attempted || right.solved - left.solved || left.name.localeCompare(right.name));
}

/**
 * The report model: { title, details, sections: [{ title, columns, rows }] }. `profile` is
 * buildStudentProfile's output for the same row and period; `times` comes from loadProblemTimes.
 */
export function buildStudentReport({ row, profile, times = new Map(), range, generatedAt = new Date() }) {
  const { student } = profile;
  const sections = [];
  sections.push(pairs('Profile', [
    ['Name', student.name], ['Student ID', student.studentId || '—'], ['Email', student.email || '—'],
    ['Semester', student.semester ?? '—'], ['Course', student.course || '—'], ['Branch', student.branch || '—'],
    ['College / University', student.college || '—'], ['Group / Section', student.group || '—'],
    ['Uploaded lists', (student.batchNames || []).join(', ') || '—'], ['Account', student.status === 'inactive' ? 'Disabled' : 'Active'],
    ['Period', periodText(range)], ['Generated', generatedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })],
  ]));

  const features = profile.prepScore?.features || {};
  sections.push({
    title: 'Prep Score', columns: [col('Part', 'text', 22), col('Score', 'decimal', 12)],
    rows: [['Overall', profile.prepScore?.total ?? 0], ...Object.entries(features).map(([key, feature]) => [MODULE_LABELS[key] || key, feature?.score ?? 0])],
    note: 'Prep Score is all-time and does not change with the period.',
  });

  if (profile.coding) {
    const coding = profile.coding;
    const counts = row.coding.scoredCounts || {};
    sections.push(pairs('Prep Coding', [
      ['Status', STATUS.coding[coding.practiceStatus] || coding.practiceStatus], ['Last practice', daysAgo(coding.daysSinceActive)],
      ['Problems solved (period)', `${coding.solved.total} · Easy ${coding.solved.Easy} · Medium ${coding.solved.Medium} · Hard ${coding.solved.Hard}`],
      ['Problems solved behind the Prep Score (all time)', `Easy ${counts.Easy || 0} · Medium ${counts.Medium || 0} · Hard ${counts.Hard || 0}`],
      ['Problems attempted', coding.attempted], ['Submissions', coding.submissions], ['Accepted submissions', coding.accepted],
      ['Accuracy', `${coding.accuracy}%`], ['Days practised', coding.activeDays],
      ['Languages', coding.languages.map((entry) => `${language(entry.language)} (${entry.submissions})`).join(', ') || '—'],
      ['Results', coding.verdicts.map((entry) => `${entry.name} ${entry.value} (${percent(entry.value, coding.submissions)}%)`).join(', ') || '—'],
    ]));
    sections.push({
      title: 'Topics', columns: [col('Topic', 'text', 28), col('Problems solved', 'number'), col('Problems attempted', 'number'), col('Submissions', 'number'), col('Accuracy %', 'percent')],
      rows: allTopics(row).map((topic) => [topic.name, topic.solved, topic.attempted, topic.submissions, percent(topic.accepted, topic.submissions)]),
    });
    sections.push({
      title: 'Problems',
      columns: [col('Problem', 'text', 30), col('Difficulty', 'text', 10), col('Topics', 'text', 28), col('Submissions', 'number', 11), col('Accepted', 'number', 9),
        ...['WA', 'TLE', 'RE', 'CE'].map((key) => col(VERDICT_LABELS[key], 'number', 10)), col('Languages', 'text', 14), col('Solved', 'text', 7),
        col('First try', 'text', 11), col('First solved', 'text', 11), col('Last try', 'text', 11)],
      rows: [...problemsOf(row)].sort((left, right) => Number(left.solved) - Number(right.solved) || right.attempts - left.attempts || left.title.localeCompare(right.title))
        .map((problem) => {
          const time = times.get(problem.problemId) || {};
          return [problem.title, problem.difficulty, problem.topics.join(', '), problem.attempts, problem.accepted,
            ...['WA', 'TLE', 'RE', 'CE'].map((key) => problem.verdicts[key]), problem.languages.map(language).join(', '), problem.solved ? 'Yes' : 'No',
            day(time.firstAt), day(time.firstAcceptedAt), day(time.lastAt)];
        }),
      note: 'Unsolved problems first, then by submissions.',
    });
    sections.push({
      title: 'Daily practice', columns: [col('Day', 'text', 12), col('Submissions', 'number'), col('Accepted', 'number')],
      rows: [...row.days.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([date, value]) => [date, value.attempts, value.accepted]),
    });
  }
  if (profile.quickprep) {
    const quickprep = profile.quickprep;
    sections.push({
      title: 'Quick Prep sheets', columns: [col('Sheet', 'text', 30), col('Solved', 'number'), col('Questions', 'number'), col('Progress %', 'percent'), col('Finished', 'text', 9), col('Last opened', 'text', 12)],
      rows: [...quickprep.sheets.map((sheet) => [sheet.title, sheet.solved, sheet.total, sheet.progress, sheet.finished ? 'Yes' : 'No', day(sheet.lastViewedAt)]),
        ...quickprep.notStarted.map((title) => [title, 0, null, 0, 'Not started', null])],
    });
  }
  if (profile.learning) {
    const learning = profile.learning;
    sections.push({
      title: 'Prep Learning', columns: [col('Subject', 'text', 30), col('Topics completed', 'number'), col('Topics', 'number'), col('Progress %', 'percent')],
      rows: learning.subjects.map((subject) => [subject.name, subject.completed, subject.total, subject.progress]),
      note: `${STATUS.learning[learning.status] || learning.status} · ${learning.progress}% of the course · ${learning.videoMinutes} video minutes · last lesson ${daysAgo(learning.daysSinceActive)}`,
    });
  }
  if (profile.interview) {
    const interview = profile.interview;
    sections.push({
      title: 'Prep Interview', columns: [col('Mock interview', 'text', 16), col('Score %', 'percent')],
      rows: interview.mocks.map((mock) => [day(mock.at), mock.score]),
      note: [`${STATUS.interview[interview.status] || interview.status}`, `${interview.done} done`, `${interview.mockDone} mock`, `${interview.aiCompleted} AI`,
        ...RATINGS.map(({ key, label }) => `${label} ${interview.ratings.find((rating) => rating.key === key)?.value ?? '—'}`)].join(' · '),
    });
  }
  if (profile.assessment) {
    const assessment = profile.assessment;
    sections.push({
      title: 'Prep Assessment', columns: [col('Test', 'text', 30), col('Score %', 'percent'), col('Marks', 'decimal'), col('Out of', 'decimal'), col(`Passed (${PASS_PERCENT}%+)`, 'text', 10), col('Taken on', 'text', 12)],
      rows: [...assessment.tests.map((test) => [test.title, test.percent, test.score, test.maxMarks, test.passed ? 'Yes' : 'No', day(test.at)]),
        ...assessment.missedTests.map((title) => [title, null, null, null, 'Missed', null])],
    });
  }
  return { title: `Prep report · ${student.name}`, student, generatedAt, sections };
}

// ---------------------------------------------------------------- Excel

const HEADER = 'FF0284C7';
const MUTED = 'FF64748B';

export async function renderStudentReportXlsx(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PeerPrep Prep Analysis';
  workbook.created = report.generatedAt;
  for (const section of report.sections) {
    const sheet = workbook.addWorksheet(section.title.slice(0, 31));
    sheet.columns = section.columns.map((column) => ({ width: Math.max(column.width || 12, Math.min(40, column.label.length + 2)) }));
    if (section.note) sheet.addRow([section.note]).getCell(1).font = { italic: true, color: { argb: MUTED } };
    const header = sheet.addRow(section.columns.map((column) => column.label));
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER } };
    });
    for (const values of section.rows) sheet.addRow(values);
    section.columns.forEach((column, index) => {
      const format = column.kind === 'percent' ? '0.0"%"' : column.kind === 'decimal' ? '0.0#' : column.kind === 'number' ? '0' : null;
      if (format) sheet.getColumn(index + 1).numFmt = format;
    });
    sheet.views = [{ state: 'frozen', ySplit: header.number }];
    if (section.kind !== 'pairs' && section.rows.length) sheet.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number + section.rows.length, column: section.columns.length } };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ---------------------------------------------------------------- PDF

const PDF_ROWS_PER_SECTION = 400;
const pdfCell = (value, kind) => {
  if (value === null || value === undefined || value === '') return '—';
  if (kind === 'percent') return `${value}%`;
  if (kind === 'decimal' && typeof value === 'number') return value.toFixed(1);
  return String(value);
};

export function renderStudentReportPdf(report) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, bufferPages: true, info: { Title: report.title, Author: 'PeerPrep' } });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const left = 30;
  const usable = doc.page.width - 60;
  const bottom = doc.page.height - 40;
  const ensure = (height) => { if (doc.y + height > bottom) { doc.addPage(); doc.y = 30; } };

  doc.rect(0, 0, doc.page.width, 58).fill('#0369a1');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17).text(report.title, left, 18);
  doc.font('Helvetica').fontSize(8.5).fillColor('#e0f2fe').text(`${report.student.studentId || ''}  ${report.student.email || ''}`.trim(), left, 40, { width: usable });
  doc.y = 72;

  for (const section of report.sections) {
    ensure(60);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(section.title, left, doc.y);
    if (section.note) doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(section.note, left, doc.y + 1, { width: usable });
    doc.moveDown(0.4);
    if (section.kind === 'pairs') {
      for (const [label, value] of section.rows) {
        ensure(14);
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#475569').text(String(label), left, y, { width: 210 });
        doc.font('Helvetica').fillColor('#0f172a').text(String(value ?? '—'), left + 215, y, { width: usable - 215 });
        doc.y = Math.max(doc.y, y + 12);
      }
      doc.moveDown(0.8);
      continue;
    }
    const totalWeight = section.columns.reduce((sum, column) => sum + (column.width || 12), 0);
    const widths = section.columns.map((column) => (usable * (column.width || 12)) / totalWeight);
    const fontSize = section.columns.length > 9 ? 7 : 8;
    const rowHeight = fontSize + 7;
    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y, usable, rowHeight + 4).fill('#0284c7');
      let x = left;
      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#ffffff');
      section.columns.forEach((column, index) => {
        doc.text(column.label, x + 3, y + 3, { width: widths[index] - 6, height: rowHeight, ellipsis: true, lineBreak: false, align: column.kind === 'text' ? 'left' : 'right' });
        x += widths[index];
      });
      doc.y = y + rowHeight + 4;
    };
    ensure(rowHeight * 3);
    drawHeader();
    const rows = section.rows.slice(0, PDF_ROWS_PER_SECTION);
    rows.forEach((values, rowIndex) => {
      if (doc.y + rowHeight > bottom) { doc.addPage(); doc.y = 30; drawHeader(); }
      const y = doc.y;
      if (rowIndex % 2 === 1) doc.rect(left, y, usable, rowHeight).fill('#f1f5f9');
      let x = left;
      doc.font('Helvetica').fontSize(fontSize).fillColor('#0f172a');
      values.forEach((value, index) => {
        const column = section.columns[index];
        doc.text(pdfCell(value, column.kind), x + 3, y + 3, { width: widths[index] - 6, height: rowHeight, ellipsis: true, lineBreak: false, align: column.kind === 'text' ? 'left' : 'right' });
        x += widths[index];
      });
      doc.y = y + rowHeight;
    });
    if (!rows.length) doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text('Nothing in this period.', left, doc.y + 4);
    if (section.rows.length > rows.length) doc.font('Helvetica').fontSize(8).fillColor('#b45309').text(`Only the first ${PDF_ROWS_PER_SECTION} rows fit in the PDF; the Excel report has all ${section.rows.length}.`, left, doc.y + 4);
    doc.moveDown(1);
  }

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8')
      .text(`PeerPrep · ${report.title}`, left, doc.page.height - 24, { width: usable / 2, lineBreak: false })
      .text(`Page ${index + 1} of ${range.count}`, left + usable / 2, doc.page.height - 24, { width: usable / 2, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}

export const STUDENT_REPORT_TYPES = Object.freeze({
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx', render: renderStudentReportXlsx },
  pdf: { contentType: 'application/pdf', extension: 'pdf', render: renderStudentReportPdf },
});
