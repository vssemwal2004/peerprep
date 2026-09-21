import React from 'react';
import {
  Document,
  Font,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import termesRegular from '../../assets/fonts/tex-gyre-termes/texgyretermes-regular.otf';
import termesBold from '../../assets/fonts/tex-gyre-termes/texgyretermes-bold.otf';
import termesItalic from '../../assets/fonts/tex-gyre-termes/texgyretermes-italic.otf';
import termesBoldItalic from '../../assets/fonts/tex-gyre-termes/texgyretermes-bolditalic.otf';
import {
  displayLink,
  getSectionData,
  getSectionTitle,
  paginateResume,
} from './resumeUtils';

Font.register({
  family: 'TeX Gyre Termes',
  fonts: [
    { src: termesRegular, fontWeight: 400, fontStyle: 'normal' },
    { src: termesBold, fontWeight: 700, fontStyle: 'normal' },
    { src: termesItalic, fontWeight: 400, fontStyle: 'italic' },
    { src: termesBoldItalic, fontWeight: 700, fontStyle: 'italic' },
  ],
});

const styles = StyleSheet.create({
  page: { padding: 31.5, fontFamily: 'TeX Gyre Termes', fontSize: 10, lineHeight: 1.152, color: '#000', backgroundColor: '#fff' },
  header: { marginBottom: 6 },
  name: { fontWeight: 700, fontSize: 14.4, lineHeight: 1.05, textTransform: 'uppercase', marginBottom: 1 },
  contact: { fontSize: 10, lineHeight: 1.152 },
  contactLabel: { fontWeight: 700 },
  link: { color: '#000', textDecoration: 'none' },
  referenceLink: { color: '#000', textDecoration: 'underline' },
  section: { marginTop: 9 },
  sectionTitle: { backgroundColor: '#dedede', color: '#000', fontWeight: 700, fontSize: 8, lineHeight: 1.14, paddingVertical: 1.875, paddingHorizontal: 3.75, marginBottom: 1.5 },
  educationBorder: { borderBottomWidth: .6, borderBottomColor: '#333' },
  educationRow: { flexDirection: 'row', paddingVertical: .3, paddingHorizontal: 3.75 },
  educationText: { lineHeight: 1 },
  educationHead: { borderBottomWidth: .6, borderBottomColor: '#333', fontWeight: 700 },
  year: { width: '14%' }, degree: { width: '34%', paddingRight: 4 }, institute: { width: '34%', paddingRight: 4 }, score: { width: '18%' },
  entry: { marginBottom: 4.5 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: 10.5 },
  headingTitle: { fontWeight: 700, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  headingDate: { fontWeight: 700, fontStyle: 'italic', flexShrink: 0, marginLeft: 'auto' },
  subheading: { flexDirection: 'row', justifyContent: 'space-between', gap: 10.5 },
  italic: { fontStyle: 'italic' },
  technologies: { flexDirection: 'row', marginTop: .6 },
  bulletRow: { flexDirection: 'row', marginTop: 1.4, paddingLeft: 5 },
  bulletMarker: { width: 10, paddingTop: 3.2, paddingLeft: 1.2 },
  bulletCircle: { width: 3.2, height: 3.2, borderWidth: .55, borderColor: '#000', borderRadius: 2 },
  bulletText: { flex: 1 },
  skill: { flexDirection: 'row', marginBottom: 2.2 },
  skillText: { flex: 1 },
  skillMarker: { width: 8, paddingTop: 3.1 },
  skillDot: { width: 3.2, height: 3.2, borderRadius: 2, backgroundColor: '#000' },
  certification: { flexDirection: 'row', marginBottom: 1.4 },
  certificationText: { flex: 1 },
  customParagraph: { marginTop: .8 },
  bold: { fontWeight: 700 },
  underline: { textDecoration: 'underline' },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  contactInline: { fontSize: 10 },
  headline: { marginTop: .75, marginBottom: 2.25, fontStyle: 'italic', fontSize: 9.5, textAlign: 'center' },
  educationStack: { paddingHorizontal: 10.5, paddingTop: 1.5, paddingBottom: 3, marginBottom: 1.5 },
  educationStackLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 18, minHeight: 11 },
  educationStackLeft: { flexGrow: 1, flexShrink: 1 },
  educationStackRight: { width: 90, flexShrink: 0, textAlign: 'right' },
  referenceEntry: { paddingHorizontal: 10.5, marginBottom: 4.5 },
  referenceDate: { fontWeight: 400, fontStyle: 'normal' },
  referenceBullets: { paddingLeft: 19 },
  referenceSkill: { paddingLeft: 10.5 },
});

const templateStyles = StyleSheet.create({
  novaPage: { paddingHorizontal: 34.5, paddingVertical: 31.5, fontSize: 11, lineHeight: 1.16 },
  novaHeader: { alignItems: 'center', marginBottom: 9 },
  novaName: { fontSize: 21, letterSpacing: .3, textAlign: 'center', textTransform: 'none' },
  novaSection: { marginTop: 7.5 },
  novaTitle: { backgroundColor: '#fff', borderBottomWidth: .65, borderBottomColor: '#111', paddingHorizontal: 0, paddingBottom: 1.5, fontSize: 10.9, fontWeight: 400, letterSpacing: .15 },
  meridianPage: { paddingHorizontal: 34.5, paddingVertical: 31.5, fontSize: 10.65, lineHeight: 1.14 },
  meridianHeader: { alignItems: 'center', marginBottom: 8.25 },
  meridianName: { fontSize: 21.75, letterSpacing: .5, textAlign: 'center', textTransform: 'none' },
  meridianSection: { marginTop: 6.75 },
  meridianTitle: { backgroundColor: '#fff', borderBottomWidth: .65, borderBottomColor: '#111', paddingHorizontal: 0, paddingBottom: 1.5, fontSize: 10.5, fontWeight: 400 },
  circuitPage: { paddingHorizontal: 34.5, paddingVertical: 31.5, fontFamily: 'Helvetica', fontSize: 10.3, lineHeight: 1.14 },
  circuitHeader: { alignItems: 'center', marginBottom: 8.25 },
  circuitName: { fontFamily: 'Helvetica', fontSize: 19.5, letterSpacing: 0, textAlign: 'center', textTransform: 'none' },
  circuitSection: { marginTop: 7.5 },
  circuitTitle: { backgroundColor: '#fff', borderBottomWidth: .65, borderBottomColor: '#111', paddingHorizontal: 0, paddingBottom: 1.5, fontFamily: 'Helvetica', fontSize: 10.5, fontWeight: 400, letterSpacing: 0 },
  circuitEntry: { marginBottom: 5.25 },
});

const getTemplateStyles = (template) => {
  if (template === 'peerprep-nova') return { reference: true, page: templateStyles.novaPage, header: templateStyles.novaHeader, name: templateStyles.novaName, section: templateStyles.novaSection, title: templateStyles.novaTitle };
  if (template === 'peerprep-meridian') return { reference: true, page: templateStyles.meridianPage, header: templateStyles.meridianHeader, name: templateStyles.meridianName, section: templateStyles.meridianSection, title: templateStyles.meridianTitle };
  if (template === 'peerprep-circuit') return { reference: true, page: templateStyles.circuitPage, header: templateStyles.circuitHeader, name: templateStyles.circuitName, section: templateStyles.circuitSection, title: templateStyles.circuitTitle, entry: templateStyles.circuitEntry };
  return { reference: false };
};

function Header({ resume, theme }) {
  const { basics, basicsVisibility } = resume;
  const contacts = [
    basics.location && basicsVisibility.location !== false ? { value: basics.location } : null,
    basics.email && basicsVisibility.email !== false ? { label: 'Email', value: basics.email, href: `mailto:${basics.email}` } : null,
    basics.mobile && basicsVisibility.mobile !== false ? { label: 'Mobile', value: basics.mobile } : null,
    basics.linkedin && basicsVisibility.linkedin !== false ? { label: 'LinkedIn', value: displayLink(basics.linkedin), href: basics.linkedin } : null,
    basics.github && basicsVisibility.github !== false ? { label: 'GitHub', value: displayLink(basics.github), href: basics.github } : null,
    basics.portfolio && basicsVisibility.portfolio !== false ? { label: 'Portfolio', value: displayLink(basics.portfolio), href: basics.portfolio } : null,
  ].filter(Boolean);
  return (
    <View style={[styles.header, theme.header]}>
      {basics.name ? <Text style={[styles.name, theme.name]}>{basics.name}</Text> : null}
      {basics.headline && theme.reference ? <Text style={styles.headline}>{basics.headline}</Text> : null}
      {theme.reference ? <View style={styles.contactRow}>{contacts.map((item, index) => <Text style={styles.contactInline} key={`${item.label}-${index}`}>
        {index ? ' | ' : ''}{item.href ? <Link src={item.href} style={styles.referenceLink}>{item.value}</Link> : item.value}
      </Text>)}</View> : contacts.map((item, index) => (
        <Text style={[styles.contact, theme.contact]} key={`${item.label}-${index}`}>
          {item.label ? <Text style={styles.contactLabel}>{item.label}: </Text> : null}
          {item.href ? <Link src={item.href} style={styles.link}>{item.value}</Link> : item.value}
        </Text>
      ))}
    </View>
  );
}

function Education({ entries, theme }) {
  if (theme.reference) return entries.map((entry, index) => <View style={styles.educationStack} key={index} wrap={false}>
    <View style={styles.educationStackLine}><Text style={[styles.educationStackLeft, styles.bold]}>{entry.institute}</Text><Text style={styles.educationStackRight}>{entry.score}</Text></View>
    <View style={styles.educationStackLine}><Text style={[styles.educationStackLeft, styles.italic]}>{entry.degree}</Text><Text style={[styles.educationStackRight, styles.italic]}>{entry.year}</Text></View>
  </View>);
  return (
    <View style={styles.educationBorder}>
      <View style={[styles.educationRow, styles.educationHead]}>
        <Text style={[styles.year, styles.educationText]}>Year</Text><Text style={[styles.degree, styles.educationText]}>Degree</Text><Text style={[styles.institute, styles.educationText]}>Institute</Text><Text style={[styles.score, styles.educationText]}>CGPA/Percentage</Text>
      </View>
      {entries.map((entry, index) => (
        <View style={styles.educationRow} key={index} wrap={false}>
          <Text style={[styles.year, styles.educationText]}>{entry.year}</Text><Text style={[styles.degree, styles.educationText]}>{entry.degree}</Text><Text style={[styles.institute, styles.educationText]}>{entry.institute}</Text><Text style={[styles.score, styles.educationText]}>{entry.score}</Text>
        </View>
      ))}
    </View>
  );
}

function Details({ entries, custom = false, theme }) {
  return entries.map((entry, index) => (
    <View style={[styles.entry, theme.entry, theme.reference && styles.referenceEntry]} key={index} wrap={false}>
      <View style={styles.heading}>
        {theme.reference ? <Text style={styles.headingTitle}>{entry.link ? <Link src={entry.link} style={styles.link}>{entry.title}</Link> : entry.title}{entry.technologies ? <Text style={styles.italic}> | {entry.technologies}</Text> : null}</Text> : entry.link ? <Link src={entry.link} style={[styles.link, styles.headingTitle]}>{entry.title}</Link> : <Text style={styles.headingTitle}>{entry.title}</Text>}
        {entry.date ? <Text style={[styles.headingDate, theme.reference && styles.referenceDate]}>{entry.date}</Text> : null}
      </View>
      {entry.subtitle || entry.location ? (
        <View style={styles.subheading}><Text style={styles.italic}>{entry.subtitle}</Text><Text>{entry.location}</Text></View>
      ) : null}
      {entry.technologies && (!theme.reference || custom) ? custom ? <Text style={styles.customParagraph}><PdfInlineText text={entry.technologies} /></Text> : <View style={styles.technologies}><Text style={styles.bold}>Tech: </Text><Text style={styles.italic}>{entry.technologies}</Text></View> : null}
      {(entry.bullets || []).map((bullet, bulletIndex) => (
        <View style={[styles.bulletRow, theme.reference && styles.referenceBullets]} key={bulletIndex}>
          <View style={styles.bulletMarker}><View style={styles.bulletCircle} /></View><Text style={styles.bulletText}><PdfInlineText text={bullet.text || bullet} /></Text>
        </View>
      ))}
    </View>
  ));
}

function PdfInlineText({ text }) {
  return String(text || '').split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <Text key={index} style={styles.bold}>{part.slice(2, -2)}</Text>;
    if (part.startsWith('__') && part.endsWith('__')) return <Text key={index} style={styles.underline}>{part.slice(2, -2)}</Text>;
    if (part.startsWith('*') && part.endsWith('*')) return <Text key={index} style={styles.italic}>{part.slice(1, -1)}</Text>;
    return <Text key={index}>{part}</Text>;
  });
}

function Skills({ entries, theme }) {
  return entries.map((entry, index) => (
    <View style={[styles.skill, theme.reference && styles.referenceSkill]} key={index}>{theme.reference ? null : <View style={styles.skillMarker}><View style={styles.skillDot} /></View>}<Text style={styles.skillText}><Text style={styles.bold}>{entry.category}{entry.category && entry.skills ? ': ' : ''}</Text>{entry.skills}</Text></View>
  ));
}

function CompactCertifications({ entries }) {
  return entries.map((entry, index) => {
    const supporting = [entry.subtitle, entry.location, entry.technologies].filter(Boolean).join(' - ');
    const bullets = (entry.bullets || []).map((bullet) => bullet.text || bullet).filter(Boolean).join(' - ');
    return <View style={styles.certification} key={index} wrap={false}>
      <View style={styles.skillMarker}><View style={styles.skillDot} /></View>
      <Text style={styles.certificationText}>
        <Text style={styles.bold}>{entry.title}</Text>
        {supporting ? ` - ${supporting}` : ''}
        {bullets ? ` - ${bullets}` : ''}
      </Text>
    </View>;
  });
}

function Section({ resume, sectionKey, theme }) {
  const entries = getSectionData(resume, sectionKey);
  const custom = sectionKey.startsWith('custom:');
  const compactCertifications = custom && /certificat/i.test(getSectionTitle(resume, sectionKey));
  return (
    <View style={[styles.section, theme.section]}>
      <Text style={[styles.sectionTitle, theme.title]}>{theme.reference ? getSectionTitle(resume, sectionKey).toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()) : getSectionTitle(resume, sectionKey)}</Text>
      {sectionKey === 'education' ? <Education entries={entries} theme={theme} />
        : sectionKey === 'skills' ? <Skills entries={entries} theme={theme} />
          : compactCertifications ? <CompactCertifications entries={entries} />
          : <Details entries={entries} custom={custom} theme={theme} />}
    </View>
  );
}

export default function ResumePdfDocument({ resume }) {
  const pages = paginateResume(resume);
  const theme = getTemplateStyles(resume.template);
  return (
    <Document title={`${resume.basics?.name || 'Student'} Resume`} author={resume.basics?.name || 'PeerPrep Student'}>
      {pages.map((sections, pageIndex) => (
        <Page size="A4" style={[styles.page, theme.page]} key={pageIndex}>
          {pageIndex === 0 ? <Header resume={resume} theme={theme} /> : null}
          {sections.map((sectionKey) => <Section key={sectionKey} resume={resume} sectionKey={sectionKey} theme={theme} />)}
        </Page>
      ))}
    </Document>
  );
}
