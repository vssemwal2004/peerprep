import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react';
import {
  displayLink,
  getSectionData,
  getSectionTitle,
  hasResumeContent,
  paginateResume,
} from './resumeUtils';
import './resume.css';

function InlineText({ text }) {
  const source = String(text || '');
  const parts = source.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('__') && part.endsWith('__')) return <u key={index}>{part.slice(2, -2)}</u>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return <span key={index}>{part}</span>;
  });
}

function ResumeHeader({ resume }) {
  const { basics, basicsVisibility } = resume;
  const contacts = [
    basics.location && basicsVisibility.location !== false ? { label: '', value: basics.location } : null,
    basics.email && basicsVisibility.email !== false ? { label: 'Email', value: basics.email, href: `mailto:${basics.email}` } : null,
    basics.mobile && basicsVisibility.mobile !== false ? { label: 'Mobile', value: basics.mobile } : null,
    basics.linkedin && basicsVisibility.linkedin !== false ? { label: 'LinkedIn', value: displayLink(basics.linkedin), href: basics.linkedin } : null,
    basics.github && basicsVisibility.github !== false ? { label: 'GitHub', value: displayLink(basics.github), href: basics.github } : null,
    basics.portfolio && basicsVisibility.portfolio !== false ? { label: 'Portfolio', value: displayLink(basics.portfolio), href: basics.portfolio } : null,
  ].filter(Boolean);
  return (
    <header className="resume-document-header">
      {basics.name ? <h1>{basics.name}</h1> : null}
      {contacts.map((item, index) => (
        <div key={`${item.label}-${index}`} className="resume-contact-line">
          {item.label ? <strong>{item.label}: </strong> : null}
          {item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.value}</a> : item.value}
        </div>
      ))}
    </header>
  );
}

function EducationSection({ entries }) {
  return (
    <div className="resume-education-table">
      <div className="resume-education-row resume-education-head">
        <strong>Year</strong><strong>Degree</strong><strong>Institute</strong><strong>CGPA/Percentage</strong>
      </div>
      {entries.map((entry, index) => (
        <div className="resume-education-row" key={index}>
          <span>{entry.year}</span><span>{entry.degree}</span><span>{entry.institute}</span><span>{entry.score}</span>
        </div>
      ))}
    </div>
  );
}

function DetailEntries({ entries, custom = false }) {
  return entries.map((entry, index) => (
    <div className="resume-detail-entry" key={index}>
      <div className="resume-entry-heading">
        <strong>{entry.link ? <a href={entry.link} target="_blank" rel="noreferrer">{entry.title}</a> : entry.title}</strong>
        {entry.date ? <em>{entry.date}</em> : null}
      </div>
      {(entry.subtitle || entry.location) ? (
        <div className="resume-entry-subheading">
          <em>{entry.subtitle}</em>{entry.location ? <span>{entry.location}</span> : null}
        </div>
      ) : null}
      {entry.technologies ? custom ? <div className="resume-custom-paragraph"><InlineText text={entry.technologies} /></div> : <div className="resume-technologies"><strong>Tech: </strong><em>{entry.technologies}</em></div> : null}
      {entry.bullets?.length ? (
        <ul>{entry.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}><InlineText text={bullet.text || bullet} /></li>)}</ul>
      ) : null}
    </div>
  ));
}

function SkillsSection({ entries }) {
  return <div className="resume-skills-list">{entries.map((entry, index) => (
    <div key={index}><span className="resume-skill-bullet">•</span><strong>{entry.category}{entry.category && entry.skills ? ': ' : ''}</strong>{entry.skills}</div>
  ))}</div>;
}

function CompactCertificationEntries({ entries }) {
  return <ul className="resume-certification-list">{entries.map((entry, index) => {
    const supporting = [entry.subtitle, entry.location, entry.technologies].filter(Boolean).join(' - ');
    return <li key={index}>
      <strong>{entry.link ? <a href={entry.link} target="_blank" rel="noreferrer">{entry.title}</a> : entry.title}</strong>
      {supporting ? <><span> - </span><InlineText text={supporting} /></> : null}
      {(entry.bullets || []).map((bullet, bulletIndex) => <span key={bulletIndex}> - <InlineText text={bullet.text || bullet} /></span>)}
    </li>;
  })}</ul>;
}

function ResumeSection({ resume, sectionKey }) {
  const entries = getSectionData(resume, sectionKey);
  const custom = sectionKey.startsWith('custom:');
  const compactCertifications = custom && /certificat/i.test(getSectionTitle(resume, sectionKey));
  return (
    <section className="resume-document-section">
      <div className="resume-section-title">{getSectionTitle(resume, sectionKey)}</div>
      {sectionKey === 'education' ? <EducationSection entries={entries} />
        : sectionKey === 'skills' ? <SkillsSection entries={entries} />
          : compactCertifications ? <CompactCertificationEntries entries={entries} />
          : <DetailEntries entries={entries} custom={custom} />}
    </section>
  );
}

export function ResumePage({ resume, sections, firstPage = false }) {
  return (
    <article className="resume-a4-page">
      {firstPage ? <ResumeHeader resume={resume} /> : null}
      {sections.map((key) => <ResumeSection key={key} resume={resume} sectionKey={key} />)}
    </article>
  );
}

export default function ResumePreview({ resume, page, onPageChange, onExpand }) {
  const pages = useMemo(() => paginateResume(resume), [resume]);
  const safePage = Math.min(Math.max(page || 0, 0), pages.length - 1);
  const viewportRef = useRef(null);
  const [fitScale, setFitScale] = useState(.55);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const updateScale = () => {
      const { width, height } = viewport.getBoundingClientRect();
      const next = Math.min((width - 16) / 794, (height - 16) / 1123, 1);
      setFitScale(Math.max(.28, Number.isFinite(next) ? next : .55));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  if (!hasResumeContent(resume)) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-100/80 p-8 text-center dark:border-slate-700 dark:bg-slate-950/70">
        <div className="max-w-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm dark:bg-slate-900">📄</div>
          <h3 className="mt-5 text-lg font-bold text-slate-900 dark:text-white">Your resume preview will appear here</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Start with any field on the left. Nothing is compulsory, and empty sections are automatically hidden.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="resume-preview-shell">
      <div className="resume-preview-viewport" ref={viewportRef}>
        <div className="resume-preview-page-frame" style={{ width: 794 * fitScale, height: 1123 * fitScale }}>
          <div className="resume-preview-scaler" style={{ transform: `scale(${fitScale})` }}>
            <ResumePage resume={resume} sections={pages[safePage]} firstPage={safePage === 0} />
          </div>
        </div>
      </div>
      {onExpand ? <button type="button" onClick={onExpand} className="resume-preview-expand" aria-label="Open full preview" title="Open full preview"><Expand /></button> : null}
      {pages.length > 1 ? <div className="resume-preview-pagination">
        <button type="button" onClick={() => onPageChange(Math.max(0, safePage - 1))} disabled={safePage === 0} aria-label="Previous page"><ChevronLeft /></button>
        <span>{safePage + 1} / {pages.length}</span>
        <button type="button" onClick={() => onPageChange(Math.min(pages.length - 1, safePage + 1))} disabled={safePage === pages.length - 1} aria-label="Next page"><ChevronRight /></button>
      </div> : null}
    </div>
  );
}
