import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import {
  displayLink,
  getSectionData,
  getSectionTitle,
  paginateResume,
} from './resumeUtils';

const styles = StyleSheet.create({
  page: { padding: 31, fontFamily: 'Times-Roman', fontSize: 10, lineHeight: 1.152, color: '#000', backgroundColor: '#fff' },
  header: { marginBottom: 6 },
  name: { fontFamily: 'Times-Bold', fontSize: 14.4, lineHeight: 1.05, textTransform: 'uppercase', marginBottom: 1 },
  contact: { fontSize: 10, lineHeight: 1.152 },
  contactLabel: { fontFamily: 'Times-Bold' },
  link: { color: '#000', textDecoration: 'none' },
  section: { marginTop: 9 },
  sectionTitle: { backgroundColor: '#dedede', color: '#000', fontFamily: 'Times-Bold', fontSize: 8, lineHeight: 1.14, paddingVertical: 1.9, paddingHorizontal: 4, marginBottom: 1.5 },
  educationBorder: { borderBottomWidth: .6, borderBottomColor: '#333' },
  educationRow: { flexDirection: 'row', paddingVertical: .3, paddingHorizontal: 4 },
  educationDataRow: { marginTop: -3.3 },
  educationText: { lineHeight: 1 },
  educationHead: { borderBottomWidth: .6, borderBottomColor: '#333', fontFamily: 'Times-Bold' },
  year: { width: '14%' }, degree: { width: '34%', paddingRight: 4 }, institute: { width: '34%', paddingRight: 4 }, score: { width: '18%' },
  entry: { marginBottom: 4.5 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  headingTitle: { fontFamily: 'Times-Bold', flexGrow: 1 },
  headingDate: { fontFamily: 'Times-BoldItalic', flexShrink: 0, marginLeft: 'auto' },
  subheading: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  italic: { fontFamily: 'Times-Italic' },
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
  bold: { fontFamily: 'Times-Bold' },
  underline: { textDecoration: 'underline' },
});

function Header({ resume }) {
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
    <View style={styles.header}>
      {basics.name ? <Text style={styles.name}>{basics.name}</Text> : null}
      {contacts.map((item, index) => (
        <Text style={styles.contact} key={`${item.label}-${index}`}>
          {item.label ? <Text style={styles.contactLabel}>{item.label}: </Text> : null}
          {item.href ? <Link src={item.href} style={styles.link}>{item.value}</Link> : item.value}
        </Text>
      ))}
    </View>
  );
}

function Education({ entries }) {
  return (
    <View style={styles.educationBorder}>
      <View style={[styles.educationRow, styles.educationHead]}>
        <Text style={[styles.year, styles.educationText]}>Year</Text><Text style={[styles.degree, styles.educationText]}>Degree</Text><Text style={[styles.institute, styles.educationText]}>Institute</Text><Text style={[styles.score, styles.educationText]}>CGPA/Percentage</Text>
      </View>
      {entries.map((entry, index) => (
        <View style={[styles.educationRow, styles.educationDataRow]} key={index} wrap={false}>
          <Text style={[styles.year, styles.educationText]}>{entry.year}</Text><Text style={[styles.degree, styles.educationText]}>{entry.degree}</Text><Text style={[styles.institute, styles.educationText]}>{entry.institute}</Text><Text style={[styles.score, styles.educationText]}>{entry.score}</Text>
        </View>
      ))}
    </View>
  );
}

function Details({ entries, custom = false }) {
  return entries.map((entry, index) => (
    <View style={styles.entry} key={index} wrap={false}>
      <View style={styles.heading}>
        {entry.link ? <Link src={entry.link} style={[styles.link, styles.headingTitle]}>{entry.title}</Link> : <Text style={styles.headingTitle}>{entry.title}</Text>}
        {entry.date ? <Text style={styles.headingDate}>{entry.date}</Text> : null}
      </View>
      {entry.subtitle || entry.location ? (
        <View style={styles.subheading}><Text style={styles.italic}>{entry.subtitle}</Text><Text>{entry.location}</Text></View>
      ) : null}
      {entry.technologies ? custom ? <Text style={styles.customParagraph}><PdfInlineText text={entry.technologies} /></Text> : <View style={styles.technologies}><Text style={styles.bold}>Tech: </Text><Text style={styles.italic}>{entry.technologies}</Text></View> : null}
      {(entry.bullets || []).map((bullet, bulletIndex) => (
        <View style={styles.bulletRow} key={bulletIndex}>
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

function Skills({ entries }) {
  return entries.map((entry, index) => (
    <View style={styles.skill} key={index}><View style={styles.skillMarker}><View style={styles.skillDot} /></View><Text style={styles.skillText}><Text style={styles.bold}>{entry.category}{entry.category && entry.skills ? ': ' : ''}</Text>{entry.skills}</Text></View>
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

function Section({ resume, sectionKey }) {
  const entries = getSectionData(resume, sectionKey);
  const custom = sectionKey.startsWith('custom:');
  const compactCertifications = custom && /certificat/i.test(getSectionTitle(resume, sectionKey));
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{getSectionTitle(resume, sectionKey)}</Text>
      {sectionKey === 'education' ? <Education entries={entries} />
        : sectionKey === 'skills' ? <Skills entries={entries} />
          : compactCertifications ? <CompactCertifications entries={entries} />
          : <Details entries={entries} custom={custom} />}
    </View>
  );
}

export default function ResumePdfDocument({ resume }) {
  const pages = paginateResume(resume);
  return (
    <Document title={`${resume.basics?.name || 'Student'} Resume`} author={resume.basics?.name || 'PeerPrep Student'}>
      {pages.map((sections, pageIndex) => (
        <Page size="A4" style={styles.page} key={pageIndex}>
          {pageIndex === 0 ? <Header resume={resume} /> : null}
          {sections.map((sectionKey) => <Section key={sectionKey} resume={resume} sectionKey={sectionKey} />)}
        </Page>
      ))}
    </Document>
  );
}
