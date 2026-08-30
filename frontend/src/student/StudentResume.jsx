import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  GripVertical,
  GraduationCap,
  Keyboard,
  Lightbulb,
  ListChecks,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Trophy,
  Undo2,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ResumePreview from '../features/resume/ResumePreview';
import {
  DEFAULT_SECTION_ORDER,
  FIXED_SECTION_META,
  calculateReadiness,
  createEmptyDetailEntry,
  filenameForResume,
  hasResumeContent,
  mergeSavedResumeMetadata,
  normalizeClientResume,
  paginateResume,
} from '../features/resume/resumeUtils';
import { api } from '../utils/api';
import RequirePasswordChange from './RequirePasswordChange';
import { useAuth } from '../context/AuthContext';

const SECTION_ICONS = {
  basics: UserRound,
  education: GraduationCap,
  experience: BriefcaseBusiness,
  projects: FolderKanban,
  skills: Wrench,
  achievements: Trophy,
};

const SECTION_HELP = {
  basics: 'Add only the contact information you want recruiters to see.',
  education: 'Add college and school history in the order you prefer.',
  experience: 'Include internships, employment, freelance, or open-source work.',
  projects: 'Describe what you built, your contribution, technologies, and results.',
  skills: 'Group your strongest skills into clear recruiter-friendly categories.',
  achievements: 'Add competitions, awards, certifications, or notable milestones.',
};

const fieldClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-950';

function Field({ label, hint, visibility, onToggleVisibility, multiline = false, ...props }) {
  const Input = multiline ? 'textarea' : 'input';
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        <span className="flex items-center gap-2 text-[9px] font-semibold normal-case tracking-normal text-slate-400">
          Optional
          {onToggleVisibility ? (
            <button type="button" onClick={onToggleVisibility} className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800" title={visibility ? 'Shown in resume' : 'Hidden from resume'}>
              {visibility ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          ) : null}
        </span>
      </span>
      <Input {...props} rows={multiline ? 3 : undefined} className={`${fieldClass} ${multiline ? 'resize-y' : ''}`} />
      {hint ? <span className="mt-1 block text-[11px] leading-4 text-slate-400">{hint}</span> : null}
    </label>
  );
}

function SectionCard({ sectionKey, title, help, icon: Icon, active, collapsed, onCollapse, onFocus, hidden, onToggleHidden, children, status }) {
  const statusClass = status === 'Ready'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    : status === 'Hidden'
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  return (
    <motion.section
      id={`resume-editor-${sectionKey.replace(':', '-')}`}
      onFocusCapture={onFocus}
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all dark:bg-slate-900 ${active ? 'border-sky-400 ring-2 ring-sky-100 dark:border-sky-700 dark:ring-sky-950' : 'border-slate-200 dark:border-slate-800'}`}
    >
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button type="button" onClick={onCollapse} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={!collapsed}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-100 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300"><Icon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-slate-950 dark:text-white">{title}</span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${statusClass}`}>{status}</span>
            </span>
            {!collapsed ? <span className="mt-1 block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{help}</span> : null}
          </span>
        </button>
        {sectionKey !== 'basics' ? (
          <button type="button" onClick={onToggleHidden} className={`rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800 ${hidden ? 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300' : 'text-slate-400 hover:text-slate-700'}`} title={hidden ? 'Hidden from preview — click to show' : 'Shown in preview — click to hide'} aria-label={hidden ? `Show ${title} in preview` : `Hide ${title} from preview`}>
            {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
        <button type="button" onClick={onCollapse} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={collapsed ? 'Expand section' : 'Collapse section'} aria-expanded={!collapsed}>
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
      {!collapsed ? <div className="border-t border-slate-100 p-4 dark:border-slate-800 sm:p-5">
        {hidden ? <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><span>This section is hidden from the resume preview.</span><button type="button" onClick={onToggleHidden} className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-amber-700">Show in preview</button></div> : null}
        {children}
      </div> : null}
    </motion.section>
  );
}

function EntryShell({ label, index, onRemove, onMoveUp, onMoveDown, children }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-950/55">
      <div className="mb-3 flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-slate-300" />
        <span className="flex-1 text-xs font-bold text-slate-700 dark:text-slate-200">{label} {index + 1}</span>
        <button type="button" onClick={onMoveUp} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-sky-600 dark:hover:bg-slate-800" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={onMoveDown} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-sky-600 dark:hover:bg-slate-800" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {children}
    </motion.div>
  );
}

function RichTextArea({ value, onChange, placeholder, rows = 3, label = 'Formatted text', compact = false }) {
  const inputRef = useRef(null);
  const applyFormat = (marker) => {
    const node = inputRef.current;
    if (!node) return;
    const start = node.selectionStart;
    const end = node.selectionEnd;
    const source = String(value || '');
    const selected = source.slice(start, end);
    const replacement = `${marker}${selected}${marker}`;
    onChange(`${source.slice(0, start)}${replacement}${source.slice(end)}`);
    requestAnimationFrame(() => {
      node.focus();
      const cursorStart = start + marker.length;
      node.setSelectionRange(cursorStart, cursorStart + selected.length);
    });
  };
  return <div>
    {!compact ? <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">{label} <span className="font-medium normal-case tracking-normal text-slate-400">· Optional</span></span><span className="text-[10px] text-slate-400">Select text, then format</span></div> : null}
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:ring-sky-950">
      <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900" aria-label="Text formatting controls">
        {[['**', 'B', 'Bold'], ['*', 'I', 'Italic'], ['__', 'U', 'Underline']].map(([marker, text, title]) => <button key={title} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat(marker)} title={title} aria-label={title} className={`flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs text-slate-600 hover:bg-white hover:text-sky-700 dark:text-slate-300 dark:hover:bg-slate-800 ${title === 'Bold' ? 'font-black' : title === 'Italic' ? 'italic' : 'underline'}`}>{text}</button>)}
      </div>
      <textarea ref={inputRef} value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={rows} className="w-full resize-y bg-transparent px-3 py-2.5 text-sm text-slate-800 outline-none dark:text-slate-100" />
    </div>
  </div>;
}

function BulletEditor({ bullets, onChange }) {
  const updateBullet = (index, text) => onChange(bullets.map((bullet, i) => i === index ? { text } : bullet));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500">Description bullets <span className="font-medium normal-case tracking-normal text-slate-400">· Optional</span></span>
        <div className="flex items-center gap-1 text-slate-400">
          <CircleHelp className="h-3.5 w-3.5" /><span className="text-[10px]">Action + work + result</span>
        </div>
      </div>
      {bullets.map((bullet, index) => (
        <div className="flex items-start gap-2" key={index}>
          <span className="mt-2.5 text-sm text-sky-500">○</span>
          <div className="min-w-0 flex-1"><RichTextArea value={bullet?.text || ''} onChange={(text) => updateBullet(index, text)} placeholder="Example: Implemented reusable components that reduced duplicate frontend code." rows={2} compact /></div>
          <button type="button" onClick={() => onChange(bullets.filter((_, i) => i !== index))} className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...bullets, { text: '' }])} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-sky-300 px-3 py-2 text-xs font-bold text-sky-600 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950"><Plus className="h-3.5 w-3.5" /> Add bullet</button>
    </div>
  );
}

function AddButton({ children, onClick }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"><Plus className="h-4 w-4" />{children}</button>;
}

function EmptySection({ title, description, action, onClick }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-5 py-7 text-center dark:border-slate-700 dark:bg-slate-950/40">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      <div className="mt-4"><AddButton onClick={onClick}>{action}</AddButton></div>
    </div>
  );
}

function DetailSectionEditor({ entries, onChange, onRemove, noun, placeholders = {} }) {
  const update = (index, patch) => onChange(entries.map((entry, i) => i === index ? { ...entry, ...patch } : entry));
  const move = (index, delta) => {
    const next = [...entries];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  if (!entries.length) return <EmptySection title={`No ${noun.toLowerCase()} added yet`} description={placeholders.empty || `Add ${noun.toLowerCase()} information when it strengthens your resume.`} action={`Add ${noun}`} onClick={() => onChange([...entries, createEmptyDetailEntry()])} />;
  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <EntryShell key={index} label={noun} index={index} onRemove={() => onRemove ? onRemove(index) : onChange(entries.filter((_, i) => i !== index))} onMoveUp={() => move(index, -1)} onMoveDown={() => move(index, 1)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={placeholders.titleLabel || 'Title'} value={entry.title || ''} onChange={(event) => update(index, { title: event.target.value })} placeholder={placeholders.title || 'Entry title'} />
            <Field label="Date / Duration" value={entry.date || ''} onChange={(event) => update(index, { date: event.target.value })} placeholder="Jan 2025 – Present" />
            <Field label={placeholders.subtitleLabel || 'Subtitle'} value={entry.subtitle || ''} onChange={(event) => update(index, { subtitle: event.target.value })} placeholder={placeholders.subtitle || 'Role or supporting title'} />
            <Field label="Location" value={entry.location || ''} onChange={(event) => update(index, { location: event.target.value })} placeholder="City, India or Remote" />
            <div className="sm:col-span-2"><Field label="Technologies / Supporting details" value={entry.technologies || ''} onChange={(event) => update(index, { technologies: event.target.value })} placeholder="React, Node.js, MongoDB, AWS" /></div>
            <div className="sm:col-span-2"><Field label="Link" type="url" value={entry.link || ''} onChange={(event) => update(index, { link: event.target.value })} placeholder="https://..." /></div>
            <div className="sm:col-span-2"><BulletEditor bullets={entry.bullets || []} onChange={(bullets) => update(index, { bullets })} /></div>
          </div>
        </EntryShell>
      ))}
      <AddButton onClick={() => onChange([...entries, createEmptyDetailEntry()])}>Add another {noun.toLowerCase()}</AddButton>
    </div>
  );
}

function FlexibleCustomSectionEditor({ entries, onChange, onRemove, sectionTitle }) {
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  if (!entries.length) return <EmptySection title={`No content in ${sectionTitle.toLowerCase()} yet`} description="Add a subsection, then use an optional heading, supporting text, formatted paragraph, and bullet points in any combination." action="Add subsection" onClick={() => onChange([createEmptyDetailEntry()])} />;
  return <div className="space-y-3">
    {entries.map((entry, index) => <EntryShell key={index} label="Subsection" index={index} onRemove={() => onRemove(index)} onMoveUp={() => move(index, -1)} onMoveDown={() => move(index, 1)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Heading" value={entry.title || ''} onChange={(event) => onChange(entries.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} placeholder="Certification, responsibility, publication..." />
        <Field label="Date / Duration" value={entry.date || ''} onChange={(event) => onChange(entries.map((item, i) => i === index ? { ...item, date: event.target.value } : item))} placeholder="2025 or Jan 2025 – Present" />
        <Field label="Supporting line" value={entry.subtitle || ''} onChange={(event) => onChange(entries.map((item, i) => i === index ? { ...item, subtitle: event.target.value } : item))} placeholder="Organization, role, issuer, or context" />
        <Field label="Location" value={entry.location || ''} onChange={(event) => onChange(entries.map((item, i) => i === index ? { ...item, location: event.target.value } : item))} placeholder="Optional location" />
        <div className="sm:col-span-2"><Field label="Link" type="url" value={entry.link || ''} onChange={(event) => onChange(entries.map((item, i) => i === index ? { ...item, link: event.target.value } : item))} placeholder="https://..." /></div>
        <div className="sm:col-span-2"><RichTextArea label="Paragraph" value={entry.technologies || ''} onChange={(technologies) => onChange(entries.map((item, i) => i === index ? { ...item, technologies } : item))} placeholder="Add a short description. Select text and use Bold, Italic, or Underline when needed." /></div>
        <div className="sm:col-span-2"><BulletEditor bullets={entry.bullets || []} onChange={(bullets) => onChange(entries.map((item, i) => i === index ? { ...item, bullets } : item))} /></div>
      </div>
    </EntryShell>)}
    <AddButton onClick={() => onChange([...entries, createEmptyDetailEntry()])}>Add another subsection</AddButton>
  </div>;
}

function ManageSectionsModal({ resume, onChange, onUndoableChange, onCustomAdded, onClose }) {
  const [newTitle, setNewTitle] = useState('');
  const [draggedKey, setDraggedKey] = useState('');
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  const keys = resume.sectionOrder;
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= keys.length) return;
    const next = [...keys];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...resume, sectionOrder: next });
  };
  const addCustom = () => {
    const title = newTitle.trim();
    if (!title) return;
    const id = `custom-${Date.now().toString(36)}`;
    onChange({ ...resume, customSections: [...resume.customSections, { id, title: title.toUpperCase(), format: 'details', entries: [] }], sectionOrder: [...resume.sectionOrder, `custom:${id}`] });
    setNewTitle('');
    onCustomAdded?.(`custom:${id}`);
  };
  const removeCustom = (key) => {
    const id = key.slice(7);
    onUndoableChange({ ...resume, customSections: resume.customSections.filter((section) => section.id !== id), sectionOrder: resume.sectionOrder.filter((item) => item !== key), hiddenSections: resume.hiddenSections.filter((item) => item !== key) }, 'Custom section removed');
  };
  const dropSection = (targetKey) => {
    if (!draggedKey || draggedKey === targetKey) return setDraggedKey('');
    const next = [...resume.sectionOrder];
    const from = next.indexOf(draggedKey);
    const to = next.indexOf(targetKey);
    if (from < 0 || to < 0) return setDraggedKey('');
    next.splice(from, 1);
    next.splice(to, 0, draggedKey);
    onChange({ ...resume, sectionOrder: next });
    setDraggedKey('');
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <motion.div initial={{ opacity: 0, y: 12, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300"><Settings2 className="h-5 w-5" /></div>
          <div className="flex-1"><h2 className="text-lg font-black text-slate-950 dark:text-white">Manage resume sections</h2><p className="mt-1 text-xs leading-5 text-slate-500">Arrange your document outline. Hidden and empty sections are excluded from the resume.</p></div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Document outline</div>
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-950"><FileText className="h-4 w-4 text-slate-400" /><span className="flex-1 text-sm font-bold">Basic Details</span><span className="text-[10px] font-bold text-slate-400">FIXED HEADER</span></div>
          <div className="space-y-2">
            {keys.map((key, index) => {
              const custom = key.startsWith('custom:') ? resume.customSections.find((section) => `custom:${section.id}` === key) : null;
              const label = custom?.title || FIXED_SECTION_META[key]?.label || key;
              const hidden = resume.hiddenSections.includes(key);
              return (
                <div
                  key={key}
                  draggable
                  onDragStart={() => setDraggedKey(key)}
                  onDragEnd={() => setDraggedKey('')}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropSection(key)}
                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${draggedKey === key ? 'border-sky-400 bg-sky-50 opacity-70 dark:bg-sky-950' : draggedKey ? 'border-dashed border-sky-300 dark:border-sky-800' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <GripVertical className="h-4 w-4 cursor-grab text-slate-300 active:cursor-grabbing" />
                  {custom ? (
                    <input value={custom.title} onChange={(event) => onChange({ ...resume, customSections: resume.customSections.map((section) => section.id === custom.id ? { ...section, title: event.target.value.toUpperCase(), format: 'details' } : section) })} aria-label="Custom section name" className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1 text-sm font-semibold outline-none focus:bg-sky-50 dark:focus:bg-sky-950" />
                  ) : <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>}
                  <button type="button" onClick={() => move(index, -1)} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => move(index, 1)} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => onChange({ ...resume, hiddenSections: hidden ? resume.hiddenSections.filter((item) => item !== key) : [...resume.hiddenSections, key] })} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">{hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
                  {custom ? <button type="button" onClick={() => removeCustom(key)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 className="h-3.5 w-3.5" /></button> : null}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-sky-50 p-4 dark:bg-sky-950/40">
          <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-sky-700 dark:text-sky-300">Create a custom section</label>
          <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">Give the section a name. You can add flexible subsections, formatted text, and bullet points after it is created.</p>
          <div className="mt-3 flex gap-2"><input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addCustom(); }} placeholder="Certifications, Research, Volunteering..." className={fieldClass} /><button type="button" onClick={addCustom} className="shrink-0 rounded-lg bg-sky-600 px-4 text-sm font-bold text-white">Add section</button></div>
        </div>
        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <button type="button" onClick={() => onChange({ ...resume, sectionOrder: [...DEFAULT_SECTION_ORDER, ...resume.customSections.map((section) => `custom:${section.id}`)], hiddenSections: [] })} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><RotateCcw className="h-3.5 w-3.5" /> Restore default order</button>
          <button type="button" onClick={onClose} className="rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-sky-700">Done</button>
        </div>
      </motion.div>
    </div>
  );
}

function ResumeWelcomeModal({ onStart, onArrange, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="resume-welcome-title">
    <motion.div initial={{ opacity: 0, y: 14, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <div className="border-t-4 border-sky-500 bg-slate-950 px-6 py-7 text-white sm:px-8">
        <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-[.2em] text-sky-300">PeerPrep Resume Studio</div><h2 id="resume-welcome-title" className="mt-2 text-2xl font-black">Build your placement resume with confidence</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Your name and email are prefilled from your profile. Every field remains optional, and the professional A4 preview updates as you type.</p></div><button type="button" onClick={onClose} aria-label="Close introduction" className="rounded-lg border border-white/15 p-2 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-7">
        {[['01', 'Fill only what matters', 'Start in any section. Empty fields and sections never appear in the final document.'], ['02', 'Shape the outline', 'Reorder, hide, rename, and add custom sections in the layout that fits your content.'], ['03', 'Review and download', 'Use the fixed preview, quality guidance, and generate a professional A4 PDF.']].map(([number, title, text]) => <div key={number} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/50"><span className="text-[10px] font-black tracking-[.18em] text-sky-600">{number}</span><h3 className="mt-2 text-sm font-black text-slate-900 dark:text-white">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{text}</p></div>)}
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-7"><div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400"><Keyboard className="h-3.5 w-3.5" /> Ctrl/⌘ + S saves · Ctrl/⌘ + P previews</div><div className="flex gap-2"><button type="button" onClick={onArrange} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">Arrange sections</button><button type="button" onClick={onStart} className="rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-sky-700">Start building</button></div></div>
    </motion.div>
  </div>;
}

function DownloadStatus({ stage, complete, filename, onClose }) {
  if (!stage && !complete) return null;
  const labels = { saving: 'Saving your latest changes…', loading: 'Preparing the PDF engine…', generating: 'Typesetting your A4 resume…' };
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="status" aria-live="polite">
    <motion.div initial={{ opacity: 0, y: 10, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900">
      {complete ? <><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950"><Check className="h-7 w-7" /></div><h2 className="mt-4 text-lg font-black text-slate-950 dark:text-white">Resume downloaded</h2><p className="mt-2 break-all text-xs leading-5 text-slate-500">{filename} is ready. Review the PDF once before submitting it.</p><button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white dark:bg-sky-600">Done</button></> : <><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-950"><Loader2 className="h-7 w-7 animate-spin" /></div><h2 className="mt-4 text-base font-black text-slate-950 dark:text-white">Creating your resume</h2><p className="mt-2 text-xs text-slate-500">{labels[stage] || 'Preparing your document…'}</p><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><motion.div initial={{ width: '18%' }} animate={{ width: stage === 'saving' ? '34%' : stage === 'loading' ? '62%' : '88%' }} className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-600" /></div></>}
    </motion.div>
  </div>;
}

export default function StudentResume() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [resume, setResume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('');
  const [collapsed, setCollapsed] = useState({ basics: true, education: true, experience: true, projects: true, skills: true, achievements: true });
  const [previewPage, setPreviewPage] = useState(0);
  const [editorWidth, setEditorWidth] = useState(() => Number(window.localStorage.getItem('peerprep-resume-editor-width')) || 46);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [fullPreview, setFullPreview] = useState(false);
  const [mobileTab, setMobileTab] = useState('edit');
  const [downloading, setDownloading] = useState(false);
  const [downloadStage, setDownloadStage] = useState('');
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [undoAction, setUndoAction] = useState(null);
  const savingRef = useRef(false);
  const editRevisionRef = useRef(0);
  const resumeRef = useRef(null);
  const workspaceRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    api.getMyResume().then((result) => {
      if (!mounted) return;
      const value = normalizeClientResume(result?.resume);
      if (!value.exists) {
        value.basics.name = value.basics.name || user?.name || '';
        value.basics.email = value.basics.email || user?.email || '';
      }
      resumeRef.current = value;
      setResume(value);
      setCollapsed({ basics: true, education: true, experience: true, projects: true, skills: true, achievements: true, ...Object.fromEntries(value.customSections.map((section) => [`custom:${section.id}`, true])) });
      setSavedAt(value.updatedAt ? new Date(value.updatedAt) : null);
      if (!value.exists && !window.localStorage.getItem('peerprep-resume-intro-v1')) setWelcomeOpen(true);
    }).catch((loadError) => setError(loadError.message || 'Could not load your resume.')).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [user?.email, user?.name]);

  useEffect(() => {
    window.localStorage.setItem('peerprep-resume-editor-width', String(editorWidth));
  }, [editorWidth]);

  const updateResume = useCallback((next, { undoLabel = '' } = {}) => {
    if (undoLabel && resumeRef.current) setUndoAction({ label: undoLabel, resume: JSON.parse(JSON.stringify(resumeRef.current)) });
    editRevisionRef.current += 1;
    setResume((current) => {
      const updated = typeof next === 'function' ? next(current) : next;
      resumeRef.current = updated;
      return updated;
    });
    setDirty(true);
    setSaveState('editing');
  }, []);

  const saveResume = useCallback(async ({ silent = false } = {}) => {
    if (!resume || savingRef.current) return;
    const savingRevision = editRevisionRef.current;
    const payload = resume;
    savingRef.current = true;
    setSaveState('saving');
    if (!silent) setError('');
    try {
      const result = await api.saveMyResume(payload);
      const saved = normalizeClientResume(result?.resume);
      if (editRevisionRef.current === savingRevision) {
        const preservedDraft = mergeSavedResumeMetadata(payload, saved);
        resumeRef.current = preservedDraft;
        setResume(preservedDraft);
        setDirty(false);
        setSaveState('saved');
        setSavedAt(new Date(saved.updatedAt || Date.now()));
      } else {
        setDirty(true);
        setSaveState('editing');
      }
    } catch (saveError) {
      setSaveState('error');
      setError(saveError.message || 'Could not save your resume.');
    } finally {
      savingRef.current = false;
    }
  }, [resume]);

  useEffect(() => {
    if (!dirty || !resume || savingRef.current) return undefined;
    const timer = setTimeout(() => saveResume({ silent: true }), 1300);
    return () => clearTimeout(timer);
  }, [dirty, resume, saveResume, saveState]);

  // A section currently being edited must stay open while rows are added and
  // while autosave updates the resume metadata.
  useEffect(() => {
    if (!activeSection) return;
    setCollapsed((state) => (state[activeSection] === false
      ? state
      : { ...state, [activeSection]: false }));
  }, [activeSection, resume]);

  useEffect(() => {
    if (!dirty) return undefined;
    const protectChanges = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protectChanges);
    return () => window.removeEventListener('beforeunload', protectChanges);
  }, [dirty]);

  useEffect(() => {
    if (!undoAction) return undefined;
    const timer = setTimeout(() => setUndoAction(null), 9000);
    return () => clearTimeout(timer);
  }, [undoAction]);

  const readiness = useMemo(() => resume ? calculateReadiness(resume) : { percent: 0, suggestions: [] }, [resume]);
  const pages = useMemo(() => resume ? paginateResume(resume) : [[]], [resume]);

  useEffect(() => { if (previewPage >= pages.length) setPreviewPage(Math.max(0, pages.length - 1)); }, [pages.length, previewPage]);
  useEffect(() => {
    const index = pages.findIndex((pageKeys) => pageKeys.includes(activeSection));
    if (index >= 0) setPreviewPage(index);
  }, [activeSection, pages]);

  const setSection = (key, value, undoLabel = '') => updateResume((current) => {
    const addedFirstEntry = !(current[key]?.length) && value.length > 0;
    return {
      ...current,
      [key]: value,
      hiddenSections: addedFirstEntry
        ? current.hiddenSections.filter((item) => item !== key)
        : current.hiddenSections,
    };
  }, { undoLabel });
  const toggleHidden = (key) => updateResume((current) => ({ ...current, hiddenSections: current.hiddenSections.includes(key) ? current.hiddenSections.filter((item) => item !== key) : [...current.hiddenSections, key] }));
  const isReady = (key) => {
    if (key === 'basics') return Object.values(resume.basics).some(Boolean);
    if (key === 'education') return resume.education.some((entry) => Object.values(entry).some(Boolean));
    if (key === 'skills') return resume.skills.some((entry) => entry.category || entry.skills);
    if (key.startsWith('custom:')) return resume.customSections.find((section) => `custom:${section.id}` === key)?.entries.length > 0;
    return resume[key]?.length > 0;
  };

  const handleDownload = useCallback(async () => {
    if (!resume || !hasResumeContent(resume) || downloading) return;
    setDownloading(true);
    setDownloadComplete(false);
    try {
      if (dirty) {
        setDownloadStage('saving');
        await saveResume();
      }
      setDownloadStage('loading');
      const [{ pdf }, { default: ResumePdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../features/resume/ResumePdf'),
      ]);
      setDownloadStage('generating');
      const documentResume = normalizeClientResume(resumeRef.current || resume);
      const blob = await pdf(<ResumePdfDocument resume={documentResume} />).toBlob();
      if (!blob?.size) throw new Error('The generated PDF was empty. Please try again.');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filenameForResume(resume);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadStage('');
      setDownloadComplete(true);
    } catch (downloadError) {
      setDownloadStage('');
      setError(downloadError.message || 'Could not generate the PDF.');
    } finally {
      setDownloading(false);
    }
  }, [dirty, downloading, resume, saveResume]);

  const restorePrevious = async () => {
    try {
      const result = await api.restorePreviousResume();
      const restored = normalizeClientResume(result.resume);
      resumeRef.current = restored;
      setResume(restored);
      setDirty(false);
      setSaveState('saved');
    } catch (restoreError) { setError(restoreError.message || 'No previous version is available.'); }
  };

  const undoLastAction = useCallback(() => {
    if (!undoAction?.resume) return;
    editRevisionRef.current += 1;
    const restored = normalizeClientResume(undoAction.resume);
    resumeRef.current = restored;
    setResume(restored);
    setDirty(true);
    setSaveState('editing');
    setUndoAction(null);
  }, [undoAction]);

  const dismissWelcome = () => {
    window.localStorage.setItem('peerprep-resume-intro-v1', 'seen');
    setWelcomeOpen(false);
  };

  const startEditorResize = useCallback((event) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    event.preventDefault();
    const bounds = workspace.getBoundingClientRect();
    const resize = (moveEvent) => {
      const percent = ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
      setEditorWidth(Math.min(58, Math.max(34, percent)));
    };
    const stop = () => {
      document.body.style.removeProperty('user-select');
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stop);
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', stop);
  }, []);

  useEffect(() => {
    const handler = (event) => {
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (command && key === 's') { event.preventDefault(); saveResume(); }
      if (command && key === 'p') { event.preventDefault(); setFullPreview(true); }
      if (command && event.shiftKey && key === 'd') { event.preventDefault(); handleDownload(); }
      if (command && key === 'z' && undoAction) { event.preventDefault(); undoLastAction(); }
      if (event.key === 'Escape') { setFullPreview(false); setDownloadComplete(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDownload, saveResume, undoAction, undoLastAction]);

  if (loading) return <div className="min-h-screen bg-slate-50 pt-20 dark:bg-slate-950"><div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,.9fr)_minmax(540px,1.1fr)]"><div className="h-[700px] animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" /><div className="h-[700px] animate-pulse rounded-2xl bg-slate-300 dark:bg-slate-900" /></div></div>;
  if (!resume) return <div className="min-h-screen bg-slate-50 pt-24 text-center dark:bg-slate-950"><p className="text-slate-600 dark:text-slate-300">{error || 'Resume builder is unavailable.'}</p><button onClick={() => navigate('/student/dashboard')} className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white">Back to dashboard</button></div>;

  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Retry save' : dirty ? 'Unsaved changes' : 'Save';
  const sectionItems = [{ key: 'basics', label: 'Basics' }, ...resume.sectionOrder.map((key) => ({ key, label: key.startsWith('custom:') ? resume.customSections.find((section) => `custom:${section.id}` === key)?.title || 'Custom' : FIXED_SECTION_META[key]?.label || key }))];

  return (
    <RequirePasswordChange user={user}>
      <div className="min-h-screen bg-slate-50 pb-10 pt-16 dark:bg-slate-950">
        <div className="sticky top-14 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/95">
          <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <button type="button" onClick={() => navigate('/student/dashboard')} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4" /></button>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white sm:flex"><FileText className="h-5 w-5" /></div>
              <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-black text-slate-950 dark:text-white sm:text-lg">Resume Builder</h1><span className="hidden rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.13em] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 sm:inline">Professional A4</span></div><p className="hidden text-[11px] text-slate-500 sm:block">A focused workspace for a clear, placement-ready resume.</p></div>
            </div>
            <div className="hidden items-center gap-2 text-[11px] font-semibold text-slate-500 md:flex">{saveState === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" /> : saveState === 'saved' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : dirty ? <span className="h-2 w-2 rounded-full bg-amber-400" /> : null}{saveLabel}{savedAt && saveState === 'saved' ? ` · ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</div>
            <button type="button" onClick={() => setManageOpen(true)} className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:inline-flex"><Settings2 className="h-4 w-4" /> Sections</button>
            <button type="button" onClick={() => saveResume()} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300">{saveState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
            <button type="button" onClick={handleDownload} disabled={!hasResumeContent(resume) || downloading} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40">{downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span className="hidden sm:inline">Download PDF</span></button>
          </div>
        </div>

        <div className="mx-auto mt-4 flex max-w-[1680px] gap-2 px-4 lg:hidden"><button type="button" onClick={() => setMobileTab('edit')} className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-bold ${mobileTab === 'edit' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>Edit Resume</button><button type="button" onClick={() => setMobileTab('preview')} className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-bold ${mobileTab === 'preview' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>Preview</button></div>

        <main ref={workspaceRef} className={`resume-workspace mx-auto max-w-[1680px] px-4 py-4 sm:px-6 ${editorCollapsed ? 'resume-workspace-collapsed' : ''}`} style={{ '--resume-editor-width': `${editorWidth}%` }}>
          <div className={`${mobileTab === 'preview' ? 'hidden lg:block' : 'block'} ${editorCollapsed ? 'lg:hidden' : ''} min-w-0 space-y-4`}>
            {error ? <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={() => setError('')}><X className="h-4 w-4" /></button></div> : null}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Resume quality</div><h2 className="mt-1 text-sm font-black text-slate-900 dark:text-white">{readiness.percent >= 70 ? 'Strong foundation' : readiness.percent >= 35 ? 'Good progress' : 'Build at your own pace'}</h2></div>
                <div className="flex items-center gap-3"><span className="text-sm font-black text-sky-700 dark:text-sky-300">{readiness.percent}%</span><button type="button" onClick={restorePrevious} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><RotateCcw className="h-3 w-3" /> Restore</button></div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${readiness.percent}%` }} /></div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400" aria-label="Resume quality summary"><span className="inline-flex items-center gap-1.5"><ListChecks className="h-3 w-3" /> {readiness.metrics?.bulletCount || 0} bullets</span><span>{readiness.metrics?.measurableBullets || 0} with measurable results</span><span>{readiness.metrics?.pageCount || 1} page{readiness.metrics?.pageCount === 1 ? '' : 's'}</span></div>
              {readiness.suggestions.length ? <div className="mt-3 flex items-start gap-2 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-600 dark:border-slate-800 dark:text-slate-300"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /><span>{readiness.suggestions[0]}</span></div> : null}
            </section>

            <div className="flex gap-2 overflow-x-auto pb-1">{sectionItems.map((item) => <button type="button" key={item.key} onClick={() => { setActiveSection(item.key); setCollapsed((state) => ({ ...state, [item.key]: false })); requestAnimationFrame(() => document.getElementById(`resume-editor-${item.key.replace(':', '-')}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold ${activeSection === item.key ? 'border-sky-500 bg-sky-500 text-white' : isReady(item.key) ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900'}`}>{item.label}</button>)}</div>

            <SectionCard sectionKey="basics" title="Basic Details" help={SECTION_HELP.basics} icon={UserRound} active={activeSection === 'basics'} collapsed={collapsed.basics} onCollapse={() => setCollapsed((state) => ({ ...state, basics: !state.basics }))} onFocus={() => setActiveSection('basics')} status={isReady('basics') ? 'Ready' : 'Not added'}>
              <div className="mb-4 rounded-xl bg-sky-50 px-3 py-2 text-[11px] leading-5 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">Profile information is used only as a starting point. Editing or hiding it here does not change your PeerPrep profile.</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries({ name: 'Full Name', location: 'Location', email: 'Email', mobile: 'Mobile', linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portfolio' }).map(([key, label]) => (
                  <div key={key} className={key === 'portfolio' ? 'sm:col-span-2' : ''}><Field label={label} type={['email'].includes(key) ? key : key === 'mobile' ? 'tel' : ['linkedin', 'github', 'portfolio'].includes(key) ? 'url' : 'text'} value={resume.basics[key] || ''} onChange={(event) => updateResume((current) => ({ ...current, basics: { ...current.basics, [key]: event.target.value } }))} placeholder={key === 'name' ? 'Your full name' : key === 'location' ? 'City, India' : key === 'email' ? 'you@example.com' : key === 'mobile' ? '+91...' : 'https://...'} visibility={key === 'name' ? undefined : resume.basicsVisibility[key]} onToggleVisibility={key === 'name' ? undefined : () => updateResume((current) => ({ ...current, basicsVisibility: { ...current.basicsVisibility, [key]: !current.basicsVisibility[key] } }))} /></div>
                ))}
              </div>
            </SectionCard>

            <SectionCard sectionKey="education" title="Academic Details" help={SECTION_HELP.education} icon={GraduationCap} active={activeSection === 'education'} collapsed={collapsed.education} onCollapse={() => setCollapsed((state) => ({ ...state, education: !state.education }))} onFocus={() => setActiveSection('education')} hidden={resume.hiddenSections.includes('education')} onToggleHidden={() => toggleHidden('education')} status={resume.hiddenSections.includes('education') ? 'Hidden' : isReady('education') ? 'Ready' : 'Not added'}>
              {!resume.education.length ? <EmptySection title="No academic details added" description="Add college, secondary school, or other relevant education in your preferred wording." action="Add education" onClick={() => { setActiveSection('education'); setCollapsed((state) => ({ ...state, education: false })); setSection('education', [{ year: '', degree: '', institute: '', score: '' }]); }} /> : <div className="space-y-3">{resume.education.map((entry, index) => <EntryShell key={index} label="Education" index={index} onRemove={() => setSection('education', resume.education.filter((_, i) => i !== index), 'Education entry removed')} onMoveUp={() => { if (index > 0) { const next = [...resume.education]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setSection('education', next); } }} onMoveDown={() => { if (index < resume.education.length - 1) { const next = [...resume.education]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setSection('education', next); } }}><div className="grid gap-3 sm:grid-cols-2"><Field label="Degree" value={entry.degree || ''} onChange={(event) => setSection('education', resume.education.map((item, i) => i === index ? { ...item, degree: event.target.value } : item))} placeholder="B.Tech Computer Science and Engineering" /><Field label="Institute" value={entry.institute || ''} onChange={(event) => setSection('education', resume.education.map((item, i) => i === index ? { ...item, institute: event.target.value } : item))} placeholder="College or school name" /><Field label="Year / Duration" value={entry.year || ''} onChange={(event) => setSection('education', resume.education.map((item, i) => i === index ? { ...item, year: event.target.value } : item))} placeholder="2023 – Present" /><Field label="CGPA / Percentage" value={entry.score || ''} onChange={(event) => setSection('education', resume.education.map((item, i) => i === index ? { ...item, score: event.target.value } : item))} placeholder="7.64 or 90%" /></div></EntryShell>)}<AddButton onClick={() => setSection('education', [...resume.education, { year: '', degree: '', institute: '', score: '' }])}>Add another education</AddButton></div>}
            </SectionCard>

            {[
              { key: 'experience', noun: 'Experience', icon: BriefcaseBusiness, placeholders: { titleLabel: 'Company', title: 'Company or organization', subtitleLabel: 'Role', subtitle: 'Technical Intern', empty: 'Internships, employment, freelance work, and open-source contributions can be included here.' } },
              { key: 'projects', noun: 'Project', icon: FolderKanban, placeholders: { titleLabel: 'Project title', title: 'Project name', subtitleLabel: 'Supporting title', subtitle: 'Short project description', empty: 'Add academic, personal, hackathon, or production projects that demonstrate your skills.' } },
              { key: 'achievements', noun: 'Achievement', icon: Trophy, placeholders: { titleLabel: 'Achievement title', title: 'Award, certification, or milestone', subtitleLabel: 'Organization', subtitle: 'Issuing organization', empty: 'Awards, certifications, competitions, and notable milestones can appear here.' } },
            ].map((config) => <SectionCard key={config.key} sectionKey={config.key} title={FIXED_SECTION_META[config.key].label} help={SECTION_HELP[config.key]} icon={config.icon} active={activeSection === config.key} collapsed={collapsed[config.key]} onCollapse={() => setCollapsed((state) => ({ ...state, [config.key]: !state[config.key] }))} onFocus={() => setActiveSection(config.key)} hidden={resume.hiddenSections.includes(config.key)} onToggleHidden={() => toggleHidden(config.key)} status={resume.hiddenSections.includes(config.key) ? 'Hidden' : isReady(config.key) ? 'Ready' : 'Not added'}><DetailSectionEditor entries={resume[config.key]} onChange={(entries) => setSection(config.key, entries)} onRemove={(index) => setSection(config.key, resume[config.key].filter((_, i) => i !== index), `${config.noun} removed`)} noun={config.noun} placeholders={config.placeholders} /></SectionCard>)}

            <SectionCard sectionKey="skills" title="Technical Skills" help={SECTION_HELP.skills} icon={Wrench} active={activeSection === 'skills'} collapsed={collapsed.skills} onCollapse={() => setCollapsed((state) => ({ ...state, skills: !state.skills }))} onFocus={() => setActiveSection('skills')} hidden={resume.hiddenSections.includes('skills')} onToggleHidden={() => toggleHidden('skills')} status={resume.hiddenSections.includes('skills') ? 'Hidden' : isReady('skills') ? 'Ready' : 'Not added'}>
              {!resume.skills.length ? <EmptySection title="No technical skills added" description="Create clear categories such as Programming Languages, Full Stack Development, or Tools & Cloud." action="Add skill category" onClick={() => setSection('skills', [{ category: '', skills: '' }])} /> : <div className="space-y-3">{resume.skills.map((entry, index) => <EntryShell key={index} label="Skill category" index={index} onRemove={() => setSection('skills', resume.skills.filter((_, i) => i !== index), 'Skill category removed')} onMoveUp={() => { if (index > 0) { const next = [...resume.skills]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setSection('skills', next); } }} onMoveDown={() => { if (index < resume.skills.length - 1) { const next = [...resume.skills]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setSection('skills', next); } }}><div className="grid gap-3 sm:grid-cols-[.42fr_.58fr]"><Field label="Category" value={entry.category || ''} onChange={(event) => setSection('skills', resume.skills.map((item, i) => i === index ? { ...item, category: event.target.value } : item))} placeholder="Programming Languages" /><Field label="Skills" value={entry.skills || ''} onChange={(event) => setSection('skills', resume.skills.map((item, i) => i === index ? { ...item, skills: event.target.value } : item))} placeholder="C, C++, Java, Python" hint="Separate skills with commas." /></div></EntryShell>)}<AddButton onClick={() => setSection('skills', [...resume.skills, { category: '', skills: '' }])}>Add skill category</AddButton></div>}
            </SectionCard>

            {resume.customSections.map((section) => {
              const key = `custom:${section.id}`;
              const changeEntries = (entries) => updateResume((current) => {
                const currentSection = current.customSections.find((item) => item.id === section.id);
                const addedFirstEntry = !(currentSection?.entries?.length) && entries.length > 0;
                return {
                  ...current,
                  customSections: current.customSections.map((item) => item.id === section.id ? { ...item, entries } : item),
                  hiddenSections: addedFirstEntry
                    ? current.hiddenSections.filter((item) => item !== key)
                    : current.hiddenSections,
                };
              });
              const removeEntry = (index) => updateResume((current) => ({ ...current, customSections: current.customSections.map((item) => item.id === section.id ? { ...item, entries: item.entries.filter((_, i) => i !== index) } : item) }), { undoLabel: `${section.title} entry removed` });
              return <SectionCard key={key} sectionKey={key} title={section.title} help="Add any combination of subsections, headings, formatted paragraphs, dates, links, and bullet points." icon={Sparkles} active={activeSection === key} collapsed={collapsed[key]} onCollapse={() => setCollapsed((state) => ({ ...state, [key]: !state[key] }))} onFocus={() => setActiveSection(key)} hidden={resume.hiddenSections.includes(key)} onToggleHidden={() => toggleHidden(key)} status={resume.hiddenSections.includes(key) ? 'Hidden' : isReady(key) ? 'Ready' : 'Not added'}>
                <FlexibleCustomSectionEditor sectionTitle={section.title} entries={section.entries || []} onChange={changeEntries} onRemove={removeEntry} />
              </SectionCard>;
            })}

            <button type="button" onClick={() => setManageOpen(true)} className="group flex w-full items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-left shadow-sm transition hover:border-sky-400 dark:border-slate-700 dark:bg-slate-900"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300"><Plus className="h-4 w-4" /></div><div className="flex-1"><h3 className="text-sm font-black text-slate-900 dark:text-white">Create your own section</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Add certifications, research, volunteering, leadership, publications, or anything relevant.</p></div><Settings2 className="h-4 w-4 text-slate-400 transition group-hover:text-sky-600" /></button>
          </div>

          <div className="resume-workspace-divider" aria-label="Resize resume editor">
            <button type="button" onClick={() => setEditorCollapsed((value) => !value)} aria-label={editorCollapsed ? 'Show editor' : 'Hide editor'} title={editorCollapsed ? 'Show editor' : 'Hide editor'}>{editorCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
            {!editorCollapsed ? <div role="separator" aria-orientation="vertical" aria-label="Resize editor width" aria-valuemin="34" aria-valuemax="58" aria-valuenow={Math.round(editorWidth)} tabIndex="0" onPointerDown={startEditorResize} onKeyDown={(event) => { if (event.key === 'ArrowLeft') setEditorWidth((value) => Math.max(34, value - 2)); if (event.key === 'ArrowRight') setEditorWidth((value) => Math.min(58, value + 2)); }} className="resume-workspace-resize"><span /></div> : null}
          </div>

          <aside className={`${mobileTab === 'edit' ? 'hidden lg:block' : 'block'} min-w-0 lg:sticky lg:top-[116px] lg:self-start`}>
            <ResumePreview resume={resume} activeSection={activeSection} page={previewPage} onPageChange={setPreviewPage} onExpand={() => setFullPreview(true)} />
          </aside>
        </main>

        <div className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-2xl backdrop-blur lg:hidden dark:border-slate-700 dark:bg-slate-900/95"><button type="button" onClick={() => saveResume()} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-xs font-bold dark:border-slate-700"><Save className="h-4 w-4" />Save</button><button type="button" onClick={() => setMobileTab(mobileTab === 'edit' ? 'preview' : 'edit')} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-xs font-bold dark:border-slate-700"><Eye className="h-4 w-4" />{mobileTab === 'edit' ? 'Preview' : 'Edit'}</button><button type="button" onClick={handleDownload} disabled={!hasResumeContent(resume) || downloading} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 py-2.5 text-xs font-bold text-white disabled:opacity-40"><Download className="h-4 w-4" />PDF</button></div>

        <AnimatePresence>{undoAction ? <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-20 left-1/2 z-[85] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs text-white shadow-2xl lg:bottom-6"><span>{undoAction.label}</span><button type="button" onClick={undoLastAction} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 font-black text-sky-300 hover:bg-white/20"><Undo2 className="h-3.5 w-3.5" /> Undo</button><button type="button" onClick={() => setUndoAction(null)} aria-label="Dismiss undo" className="text-slate-400"><X className="h-3.5 w-3.5" /></button></motion.div> : null}</AnimatePresence>
        {manageOpen ? <ManageSectionsModal resume={resume} onChange={updateResume} onUndoableChange={(next, label) => updateResume(next, { undoLabel: label })} onCustomAdded={(key) => { setManageOpen(false); setCollapsed((state) => ({ ...state, [key]: false })); setActiveSection(key); requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`resume-editor-${key.replace(':', '-')}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))); }} onClose={() => setManageOpen(false)} /> : null}
        {fullPreview ? <div className="fixed inset-0 z-[95] flex flex-col bg-slate-950/95 p-3 backdrop-blur"><div className="mx-auto flex w-full max-w-6xl items-center justify-between py-2 text-white"><div><div className="text-xs font-bold uppercase tracking-[.15em] text-sky-300">Resume preview</div><div className="mt-1 text-sm font-bold">{filenameForResume(resume)}</div></div><div className="flex gap-2"><button type="button" onClick={handleDownload} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold"><Download className="h-4 w-4" />Download</button><button type="button" onClick={() => setFullPreview(false)} className="rounded-lg border border-white/20 p-2"><X className="h-4 w-4" /></button></div></div><div className="mx-auto min-h-0 w-full max-w-5xl flex-1"><ResumePreview resume={resume} page={previewPage} onPageChange={setPreviewPage} /></div></div> : null}
        {welcomeOpen ? <ResumeWelcomeModal onClose={dismissWelcome} onStart={() => { dismissWelcome(); setActiveSection('basics'); setCollapsed((state) => ({ ...state, basics: false })); requestAnimationFrame(() => document.getElementById('resume-editor-basics')?.scrollIntoView({ behavior: 'smooth' })); }} onArrange={() => { dismissWelcome(); setManageOpen(true); }} /> : null}
        <DownloadStatus stage={downloadStage} complete={downloadComplete} filename={filenameForResume(resume)} onClose={() => setDownloadComplete(false)} />
      </div>
    </RequirePasswordChange>
  );
}
