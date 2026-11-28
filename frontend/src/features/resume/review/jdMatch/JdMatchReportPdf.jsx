// ANVI JD Match report as a printable A4 PDF (react-pdf, loaded only when a student downloads it).
// Built-in Helvetica keeps it small and safe; text is limited to characters that font can draw.
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

const C = { ink: '#0f172a', soft: '#475569', faint: '#94a3b8', line: '#e2e8f0', violet: '#6d28d9', violetBg: '#f5f3ff', sky: '#0369a1', rose: '#be123c', roseBg: '#fff1f2', amber: '#92400e', amberBg: '#fffbeb', green: '#047857', greenBg: '#ecfdf5', panel: '#f8fafc' };

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 48, paddingHorizontal: 38, fontFamily: 'Helvetica', fontSize: 9.5, color: C.ink, lineHeight: 1.4 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 2, borderBottomColor: C.violet, paddingBottom: 8 },
  brand: { fontSize: 9, color: C.violet, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6 },
  // react-pdf resolves a unitless lineHeight against the page's font size, so big text sets its own.
  title: { fontSize: 17, lineHeight: '22pt', fontFamily: 'Helvetica-Bold', marginTop: 2 },
  meta: { fontSize: 8.5, color: C.soft, textAlign: 'right' },
  scoreRow: { flexDirection: 'row', marginTop: 14, gap: 12 },
  scoreBox: { width: 112, borderRadius: 8, backgroundColor: C.violetBg, padding: 10, alignItems: 'center', justifyContent: 'center' },
  scoreNum: { fontSize: 30, lineHeight: '34pt', fontFamily: 'Helvetica-Bold', color: C.violet },
  scoreLabel: { fontSize: 8, lineHeight: '11pt', color: C.soft, marginTop: 2 },
  summaryBox: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: C.line, padding: 10 },
  summary: { fontSize: 10.5, lineHeight: 1.45 },
  stats: { flexDirection: 'row', marginTop: 8, gap: 8 },
  stat: { flex: 1, backgroundColor: C.panel, borderRadius: 6, padding: 6 },
  statLabel: { fontSize: 7.5, color: C.faint, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  statValue: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  howBox: { marginTop: 12, backgroundColor: C.panel, borderRadius: 8, padding: 9 },
  howTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  howItem: { fontSize: 8.5, color: C.soft },
  h2: { fontSize: 12, lineHeight: '16pt', fontFamily: 'Helvetica-Bold', marginTop: 16, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { fontSize: 8.5, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  sectionBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.ink, color: '#ffffff', borderRadius: 5, paddingVertical: 5, paddingHorizontal: 8, marginTop: 10 },
  sectionName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 0.4 },
  sectionCount: { fontSize: 8.5, color: '#e2e8f0' },
  okLine: { fontSize: 8.5, color: C.green, marginTop: 4, marginLeft: 2 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 8, marginTop: 6 },
  label: { fontSize: 7.5, color: C.faint, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  quote: { fontSize: 9, color: C.soft, marginTop: 1, borderLeftWidth: 2, borderLeftColor: C.line, paddingLeft: 6 },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 5 },
  example: { marginTop: 5, backgroundColor: C.violetBg, borderRadius: 4, padding: 6 },
  exampleText: { fontSize: 9, color: C.ink, marginTop: 1 },
  tip: { fontSize: 8.5, color: C.amber, marginTop: 4 },
  warnBox: { marginTop: 8, backgroundColor: C.amberBg, borderRadius: 8, padding: 9 },
  footerLeft: { position: 'absolute', bottom: 22, left: 38, right: 38, fontSize: 7.5, lineHeight: '10pt', color: C.faint },
});

// Helvetica draws Latin-1 (and typographic quotes/dashes); anything else becomes a plain fallback.
const EXTRA = new Set([0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026]); // dashes, quotes, bullet, ellipsis
const drawable = (code) => (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || EXTRA.has(code);
const safe = (value) => Array.from(String(value ?? '')).map((char) => {
  const code = char.codePointAt(0);
  if (drawable(code)) return char;
  return code === 0x2192 ? '->' : '';
}).join('').replace(/\s+/g, ' ').trim();

function Chip({ term, importance, present = false }) {
  const tone = present ? { backgroundColor: C.greenBg, color: C.green } : importance === 'must' ? { backgroundColor: C.roseBg, color: C.rose } : { backgroundColor: C.amberBg, color: C.amber };
  return <Text style={[s.chip, tone]}>{present ? '' : '+ '}{safe(term)}{!present && importance === 'must' ? '  (MUST)' : ''}</Text>;
}

export default function JdMatchReportPdf({ match, studentName = '' }) {
  const report = match.report;
  const { totals } = report;
  const checked = new Date(report.checkedAt || match.finishedAt || match.createdAt || Date.now());
  const about = [report.role, report.company].filter(Boolean).map(safe).join(' · ') || 'Job description match';
  let number = 0;
  return (
    <Document title={`ANVI JD Match - ${about}`} author="PeerPrep" creator="PeerPrep ANVI" subject="Résumé keyword report">
      <Page size="A4" style={s.page} wrap>
        <View style={s.brandRow} fixed>
          <View>
            <Text style={s.brand}>PEERPREP  ·  ANVI JD MATCH REPORT</Text>
            <Text style={s.title}>{about}</Text>
          </View>
          <View>
            {studentName ? <Text style={s.meta}>{safe(studentName)}</Text> : null}
            <Text style={s.meta}>{checked.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          </View>
        </View>

        <View style={s.scoreRow} wrap={false}>
          <View style={s.scoreBox}>
            <Text style={s.scoreNum}>{report.score}%</Text>
            <Text style={s.scoreLabel}>keyword match</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summary}>{safe(report.summary)}</Text>
            <View style={s.stats}>
              <View style={s.stat}><Text style={s.statLabel}>MUST-HAVE SHOWN</Text><Text style={s.statValue}>{totals.mustPresent} of {totals.must}</Text></View>
              <View style={s.stat}><Text style={s.statLabel}>GOOD-TO-HAVE SHOWN</Text><Text style={s.statValue}>{totals.goodPresent} of {totals.good}</Text></View>
              <View style={s.stat}><Text style={s.statLabel}>KEYWORDS TO ADD</Text><Text style={s.statValue}>{totals.toAdd}</Text></View>
            </View>
          </View>
        </View>

        <View style={s.howBox} wrap={false}>
          <Text style={s.howTitle}>How to use this report</Text>
          <Text style={s.howItem}>1.  Go section by section below. Each card shows one line of your résumé and the keywords to add to it.</Text>
          <Text style={s.howItem}>2.  "For reference only" lines are pointers, not text to copy. Write your own line with your real facts and numbers.</Text>
          <Text style={s.howItem}>3.  Fix the MUST keywords first, then check again in PeerPrep to see your new match.</Text>
        </View>

        {report.toAdd.length ? <>
          <Text style={s.h2}>Keywords to add ({report.toAdd.length})</Text>
          <View style={s.chips}>{report.toAdd.map((item) => <Chip key={item.term} {...item} />)}</View>
        </> : null}

        <Text style={s.h2}>Section by section, line by line</Text>
        {report.sections.map((section) => {
          const label = section.toAdd ? `${(number += 1)}.  ${safe(section.heading)}` : safe(section.heading);
          const cards = [
            ...section.lines.map((line) => (
              <View key={line.id} style={s.card}>
                <Text style={s.label}>YOUR LINE{line.entry ? `  ·  ${safe(line.entry).toUpperCase()}` : ''}</Text>
                <Text style={s.quote}>“{safe(line.text)}”</Text>
                <View style={s.addRow}><Text style={s.label}>ADD HERE</Text>{line.add.map((item) => <Chip key={item.term} {...item} />)}</View>
                {line.example ? <View style={s.example}><Text style={[s.label, { color: C.violet }]}>FOR REFERENCE ONLY</Text><Text style={s.exampleText}>{safe(line.example)}</Text></View> : null}
                {line.tip ? <Text style={s.tip}>Tip: {safe(line.tip)}</Text> : null}
              </View>
            )),
            ...(section.newLine ? [(
              <View key="new" style={[s.card, { borderStyle: 'dashed', borderColor: '#c4b5fd' }]}>
                <Text style={[s.label, { color: C.violet }]}>{section.isNew ? `ADD A ${safe(section.heading)} SECTION` : 'ADD A NEW LINE'}</Text>
                <View style={s.addRow}>{section.newLine.terms.map((item) => <Chip key={item.term} {...item} />)}</View>
                <Text style={s.tip}>{section.key.endsWith('skills') ? 'List only the ones you have really used.' : safe(section.newLine.terms[0]?.tip) || 'Add a line that shows where you used these.'}</Text>
              </View>
            )] : []),
          ];
          const bar = (
            <View style={s.sectionBar}>
              <Text style={s.sectionName}>{label}{section.isNew ? '  (new section)' : ''}</Text>
              <Text style={s.sectionCount}>{section.toAdd ? `${section.toAdd} to add` : 'All good'}</Text>
            </View>
          );
          return (
            <View key={section.key}>
              {/* The heading travels with its first card, so it never sits alone at the bottom of a page. */}
              <View wrap={false}>
                {bar}
                {!section.toAdd ? <Text style={s.okLine}>Nothing to add here{section.presentTerms.length ? `. Already shows: ${section.presentTerms.map(safe).join(', ')}` : ''}.</Text> : cards[0]}
              </View>
              {cards.slice(1).map((card) => <View key={card.key} wrap={false}>{card}</View>)}
            </View>
          );
        })}

        {report.noEvidence.length ? (
          <View style={s.warnBox} wrap={false}>
            <Text style={[s.howTitle, { color: C.amber }]}>No evidence on your résumé yet</Text>
            <Text style={s.howItem}>The job asks for these, but nothing on your résumé shows them. If you have used one, add it with where you used it; if not, learn it with a small project first.</Text>
            <View style={[s.chips, { marginTop: 5 }]}>{report.noEvidence.map((item) => <Chip key={item.term} {...item} />)}</View>
          </View>
        ) : null}

        {report.present.length ? <>
          <Text style={s.h2}>Already on your résumé ({report.present.length})</Text>
          <View style={s.chips}>{report.present.map((item) => <Chip key={item.term} term={item.term} present />)}</View>
        </> : null}

        <View style={[s.howBox, { marginTop: 16 }]} wrap={false}>
          <Text style={s.howItem}>Add only what you have really done: interviewers ask about every keyword on your résumé. The keyword match is separate from ATS readability and résumé strength. ANVI's suggestions are checked against your résumé and the job description, but read each one before you use it.</Text>
        </View>

        {/* Static on purpose: a `render` (page number) footer did not draw with this react-pdf build. */}
        <Text style={s.footerLeft} fixed>PeerPrep · ANVI JD Match · {about} · Generated {checked.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
      </Page>
    </Document>
  );
}
