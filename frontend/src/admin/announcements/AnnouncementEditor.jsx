import { useMemo, useRef, useState } from 'react';
import { Check, Eye, ImagePlus, LayoutTemplate, Loader2, Trash2, Wand2 } from 'lucide-react';
import { api } from '../../utils/api';
import AnnouncementView from '../../components/announcements/AnnouncementView';
import AnnouncementDialog from '../../components/announcements/AnnouncementDialog';
import RichTextEditor from '../../components/announcements/RichTextEditor';
import AudienceSection from './AudienceSection';
import { audienceLabel } from './audienceModel';
import { CATEGORIES, DESIGNS, TEMPLATES, THEMES, THEME_KEYS, categoryOf, plainTextOf } from '../../components/announcements/announcementMeta';

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-sky-500/20';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const section = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900';

const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Form state from a saved announcement (or the defaults for a new one). */
export function formFromAnnouncement(announcement = null) {
  const item = announcement || {};
  const category = categoryOf(item);
  return {
    title: item.title || '',
    // Old announcements have plain text only: shown as paragraphs so they can be formatted now.
    messageHtml: item.messageHtml || (item.message ? String(item.message).split(/\n{2,}/).map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('') : ''),
    category: category.key,
    label: item.label || '',
    design: item.design || 'classic',
    theme: item.theme || category.theme,
    imageUrl: item.imageUrl || '',
    imageAlt: item.imageAlt || '',
    ctaLabel: item.ctaLabel || '',
    ctaUrl: item.ctaUrl || '',
    status: item.status || 'inactive',
    priority: item.priority || 'normal',
    expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().slice(0, 10) : '',
    showAsPopup: Boolean(item.showAsPopup),
    // Who sees it. A saved "selected" announcement loads its students separately (audienceLoaded).
    audience: item.audience === 'selected' ? 'selected' : 'all',
    students: [],
    hiddenCount: 0,
    audienceCount: Number(item.audienceCount) || 0,
    audienceLoaded: item.audience !== 'selected',
    audienceError: '',
  };
}

/** What the API saves from the form. The audience is sent only once the chosen students are known. */
export function payloadFromForm(form, statusOverride) {
  const payload = {
    title: form.title.trim(), messageHtml: form.messageHtml, category: form.category, label: form.label.trim(),
    design: form.design, theme: form.theme, imageUrl: form.imageUrl.trim(), imageAlt: form.imageAlt.trim(),
    ctaLabel: form.ctaLabel.trim(), ctaUrl: form.ctaUrl.trim(), status: statusOverride || form.status, priority: form.priority,
    expiryDate: form.expiryDate || null, showAsPopup: form.showAsPopup,
  };
  if (form.audienceLoaded !== false) {
    payload.audience = form.audience === 'selected' ? 'selected' : 'all';
    if (payload.audience === 'selected') payload.studentIds = (form.students || []).map((student) => String(student._id));
  }
  return payload;
}

/** A reason the form cannot be saved yet because of its audience, or ''. */
export function audienceProblem(form) {
  if (form.audience !== 'selected' || form.audienceLoaded === false) return '';
  return form.students?.length ? '' : 'Choose the students who should see this, or pick "All students".';
}

/** A draft as students would see it (preview). */
const previewItem = (form) => ({ ...payloadFromForm(form), _id: 'preview', message: plainTextOf(form.messageHtml) || 'Your message appears here.', title: form.title.trim() || 'Your title appears here', createdAt: new Date().toISOString() });

function DesignThumb({ design, theme }) {
  const t = THEMES[theme] || THEMES.sky;
  const line = 'h-1 rounded-full bg-slate-200 dark:bg-white/15';
  const frame = 'relative flex h-16 w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-zinc-900';
  if (design === 'banner') return <span className={frame}><span className={`h-6 bg-gradient-to-br ${t.gradient}`} /><span className="space-y-1 p-1.5"><span className={`block w-3/4 ${line}`} /><span className={`block w-1/2 ${line}`} /></span></span>;
  if (design === 'spotlight') return <span className={`${frame} items-center pt-1.5`}><span className={`h-5 w-5 rounded-md bg-gradient-to-br ${t.gradient}`} /><span className={`mt-1 block w-2/3 ${line}`} /><span className={`mt-1 block w-1/2 ${line}`} /></span>;
  if (design === 'split') return <span className="relative flex h-16 w-full flex-row overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-zinc-900"><span className={`block w-2/5 shrink-0 bg-gradient-to-br ${t.gradient}`} /><span className="flex-1 space-y-1 p-1.5"><span className={`block w-3/4 ${line}`} /><span className={`block w-full ${line}`} /><span className={`block w-1/2 ${line}`} /></span></span>;
  if (design === 'minimal') return <span className={`${frame} pl-2`}><span className={`absolute inset-y-0 left-0 w-1 ${t.solid}`} /><span className="space-y-1 p-1.5"><span className={`block w-1/3 ${line}`} /><span className={`block w-3/4 ${line}`} /><span className={`block w-full ${line}`} /></span></span>;
  if (design === 'celebration') return <span className={`${frame} items-center justify-center bg-gradient-to-br ${t.gradient}`}><span className="h-4 w-4 rounded-full bg-white/40" /><span className="mt-1 h-3 w-4/5 rounded bg-white/90" /></span>;
  return <span className={frame}><span className="flex items-center gap-1 p-1.5"><span className={`h-4 w-4 rounded ${t.solid}`} /><span className={`block flex-1 ${line}`} /></span><span className="space-y-1 px-1.5"><span className={`block w-full ${line}`} /><span className={`block w-2/3 ${line}`} /></span></span>;
}

/**
 * Create / edit an announcement: what it is called (category or own label), formatted content,
 * popup design and colour, optional image and button, publishing options, with a live preview and
 * "Preview as student" that shows exactly what students will see.
 * actions(form) renders the buttons (Save / Publish …); `extra` sits under the form (email).
 */
export default function AnnouncementEditor({ form, setForm, actions, extra = null, error = '' }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef(null);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const preview = useMemo(() => previewItem(form), [form]);

  const applyTemplate = (template) => setForm((current) => ({
    ...current, category: template.category, design: template.design, theme: template.theme, priority: template.priority,
    title: template.title, messageHtml: template.html, label: '', ctaLabel: template.ctaLabel || '', ctaUrl: template.ctaUrl || '',
  }));
  const pickCategory = (key) => setForm((current) => ({ ...current, category: key, theme: CATEGORIES.find((item) => item.key === key)?.theme || current.theme }));
  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setUploadError('Image must be 2 MB or smaller.'); return; }
    setUploading(true); setUploadError('');
    try {
      const { image } = await api.uploadAnnouncementImage(file);
      setForm((current) => ({ ...current, imageUrl: image.url, design: current.design === 'classic' || current.design === 'minimal' ? 'banner' : current.design }));
    } catch (err) {
      setUploadError(err?.message || 'The image could not be uploaded.');
    } finally { setUploading(false); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className="flex min-w-0 flex-col gap-5">
        {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">{error}</div> : null}

        <section className={section} data-guide="ac-templates" aria-labelledby="ann-templates">
          <h2 id="ann-templates" className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Wand2 className="h-4 w-4 text-sky-600" />Start from a template <span className="font-normal text-slate-400">(optional, change anything after)</span></h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {TEMPLATES.map((template) => {
              const { Icon } = CATEGORIES.find((item) => item.key === template.category);
              return (
                <button key={template.key} type="button" onClick={() => applyTemplate(template)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset transition hover:-translate-y-0.5 hover:shadow-sm ${THEMES[template.theme].soft}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />{template.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className={section} data-guide="ac-title" aria-labelledby="ann-content">
          <h2 id="ann-content" className="sr-only">Content</h2>
          <p className={labelClass}>Students see it as</p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6" role="radiogroup" aria-label="Category">
            {CATEGORIES.map(({ key, label, Icon, theme }) => {
              const active = form.category === key;
              return (
                <button key={key} type="button" role="radio" aria-checked={active} onClick={() => pickCategory(key)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[12px] font-semibold transition ${active ? `ring-2 ring-sky-500 ${THEMES[theme].soft} border-transparent` : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/[0.04]'}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />{label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <div>
              <label htmlFor="ann-title" className={labelClass}>Title</label>
              <input id="ann-title" value={form.title} maxLength={160} onChange={(e) => update('title', e.target.value)} className={`mt-1.5 ${input}`} placeholder="Short, clear title" />
            </div>
            <div>
              <label htmlFor="ann-label" className={labelClass}>Own name <span className="normal-case tracking-normal text-slate-400">(optional)</span></label>
              <input id="ann-label" value={form.label} maxLength={24} onChange={(e) => update('label', e.target.value)} className={`mt-1.5 ${input}`} placeholder={`e.g. ${CATEGORIES.find((item) => item.key === form.category)?.label}, T&P Cell`} />
            </div>
          </div>
          <div className="mt-3" data-guide="ac-message">
            <label htmlFor="ann-message" className={labelClass}>Message</label>
            <div className="mt-1.5"><RichTextEditor id="ann-message" value={form.messageHtml} onChange={(html) => update('messageHtml', html)} /></div>
          </div>
        </section>

        <section className={section} data-guide="ac-look" aria-labelledby="ann-look">
          <h2 id="ann-look" className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><LayoutTemplate className="h-4 w-4 text-sky-600" />Popup design and colour</h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Design">
            {DESIGNS.map((design) => {
              const active = form.design === design.key;
              return (
                <button key={design.key} type="button" role="radio" aria-checked={active} onClick={() => update('design', design.key)}
                  className={`rounded-xl border p-2 text-left transition ${active ? 'border-sky-500 ring-2 ring-sky-500/30' : 'border-slate-200 hover:border-slate-300 dark:border-white/10'}`}>
                  <DesignThumb design={design.key} theme={form.theme} />
                  <span className="mt-1.5 flex items-center gap-1 text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100">{active ? <Check className="h-3.5 w-3.5 text-sky-600" /> : null}{design.label}</span>
                  <span className="block text-[11px] leading-snug text-slate-500 dark:text-zinc-400">{design.hint}</span>
                </button>
              );
            })}
          </div>
          <p className={`mt-4 ${labelClass}`}>Colour</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
            {THEME_KEYS.map((key) => (
              <button key={key} type="button" role="radio" aria-checked={form.theme === key} onClick={() => update('theme', key)} title={THEMES[key].label}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition ${form.theme === key ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-zinc-300'}`}>
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: THEMES[key].swatch }} aria-hidden="true" />{THEMES[key].label}
              </button>
            ))}
          </div>
        </section>

        <section className={section} aria-labelledby="ann-media">
          <h2 id="ann-media" className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><ImagePlus className="h-4 w-4 text-sky-600" />Image and button <span className="font-normal text-slate-400">(optional)</span></h2>
          <div className="mt-3 flex flex-wrap items-start gap-4">
            {form.imageUrl ? <img src={form.imageUrl} alt="" className="h-20 w-32 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-white/10" /> : null}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onFile} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/[0.05]">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{form.imageUrl ? 'Replace image' : 'Upload image'}
                </button>
                {form.imageUrl ? <button type="button" onClick={() => setForm((current) => ({ ...current, imageUrl: '', imageAlt: '' }))}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" />Remove</button> : null}
              </div>
              <input value={form.imageUrl} onChange={(e) => update('imageUrl', e.target.value)} className={input} placeholder="…or paste an https:// image link" aria-label="Image link" />
              {form.imageUrl ? <input value={form.imageAlt} maxLength={160} onChange={(e) => update('imageAlt', e.target.value)} className={input} placeholder="Describe the image (for screen readers)" aria-label="Image description" /> : null}
              {uploadError ? <p role="alert" className="text-[12.5px] text-rose-600">{uploadError}</p> : <p className="text-[11.5px] text-slate-400">JPG, PNG, WebP or GIF up to 2 MB. Wide images (about 1200 × 500) suit the Banner design.</p>}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <input value={form.ctaLabel} maxLength={40} onChange={(e) => update('ctaLabel', e.target.value)} className={input} placeholder="Button text, e.g. Register now" aria-label="Button text" />
            <input value={form.ctaUrl} onChange={(e) => update('ctaUrl', e.target.value)} className={input} placeholder="Button link: https://… or /student/assessments" aria-label="Button link" />
          </div>
        </section>

        <AudienceSection form={form} setForm={setForm} className={section} />

        <section className={section} data-guide="ac-type-status" aria-labelledby="ann-publish">
          <h2 id="ann-publish" className="text-sm font-semibold text-slate-900 dark:text-white">Publishing</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3" data-guide="ac-priority-expiry">
            <label className="block"><span className={labelClass}>Status</span>
              <select value={form.status} onChange={(e) => update('status', e.target.value)} className={`mt-1.5 ${input}`}><option value="active">Active</option><option value="inactive">Inactive (draft)</option></select></label>
            <label className="block"><span className={labelClass}>Priority</span>
              <select value={form.priority} onChange={(e) => update('priority', e.target.value)} className={`mt-1.5 ${input}`}><option value="high">High (shown first, marked Important)</option><option value="normal">Normal</option><option value="low">Low</option></select></label>
            <label className="block"><span className={labelClass}>Show until</span>
              <input type="date" value={form.expiryDate} onChange={(e) => update('expiryDate', e.target.value)} className={`mt-1.5 ${input}`} /></label>
          </div>
          <label data-guide="ac-popup" className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
            <input type="checkbox" checked={form.showAsPopup} onChange={(e) => update('showAsPopup', e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
            <span><span className="block text-sm font-semibold text-slate-800 dark:text-white">Show as popup when students log in</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Students see it once after each login while it is active, in the design above.</span></span>
          </label>
          {extra}
          <div data-guide="ac-buttons" className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setPreviewOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200">
              <Eye className="h-4 w-4" />Preview as student
            </button>
            {actions}
          </div>
        </section>
      </div>

      <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start" aria-label="Live preview">
        <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            Live preview <span className="rounded-full bg-white px-2 py-0.5 normal-case tracking-normal text-slate-500 shadow-sm dark:bg-white/10 dark:text-zinc-300">Popup</span>
          </p>
          <div className="mt-3">
            <AnnouncementView announcement={preview} titleId="ann-preview-title" bodyId="ann-preview-body" preview bodyMaxClass="max-h-[340px]" />
          </div>
          <p className="mt-3 text-[11.5px] leading-snug text-slate-500 dark:text-zinc-400">On the dashboard it shows as <strong className="text-slate-700 dark:text-zinc-200">{preview.label || CATEGORIES.find((item) => item.key === form.category)?.label}</strong> in the colour you chose.</p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-slate-500 dark:text-zinc-400">Shown to <strong className="text-slate-700 dark:text-zinc-200">{audienceLabel(form.audience, form.audienceLoaded ? form.students.length + (form.hiddenCount || 0) : form.audienceCount)}</strong>.</p>
        </div>
      </aside>

      {previewOpen ? <AnnouncementDialog items={[preview]} onClose={() => setPreviewOpen(false)} zIndex="z-[200]" doneLabel="Close preview" preview /> : null}
    </div>
  );
}
