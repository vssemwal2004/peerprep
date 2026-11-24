import { useEffect, useRef, useState } from 'react';
import {
  Bold, Highlighter, Italic, Link2, List, ListOrdered, Minus, Palette, Quote, Redo2, RemoveFormatting, Strikethrough, TextAlignCenter, TextAlignEnd,
  TextAlignStart, Underline, Undo2,
} from 'lucide-react';
import { safeAnnouncementHtml } from './announcementMeta';

const TEXT_COLORS = ['#0f172a', '#0284c7', '#0d9488', '#059669', '#d97706', '#ea580c', '#e11d48', '#64748b'];
const HIGHLIGHTS = ['#fef3c7', '#dcfce7', '#e0f2fe', '#ffe4e6', '#f1f5f9'];
const BLOCKS = [['p', 'Paragraph'], ['h2', 'Heading'], ['h3', 'Subheading'], ['h4', 'Small heading']];

function ToolButton({ label, onAction, children, active = false }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active}
      onMouseDown={(event) => { event.preventDefault(); onAction(); }}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white ${active ? 'bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white' : ''}`}>
      {children}
    </button>
  );
}

function Swatches({ label, Icon, colors, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <ToolButton label={label} onAction={() => setOpen((value) => !value)} active={open}><Icon className="h-4 w-4" /></ToolButton>
      {open ? (
        <div className="absolute left-0 top-9 z-20 flex gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-zinc-900" role="menu">
          {colors.map((color) => (
            <button key={color} type="button" role="menuitem" aria-label={`${label} ${color}`} title={color}
              onMouseDown={(event) => { event.preventDefault(); onPick(color); setOpen(false); }}
              className="h-6 w-6 rounded-md ring-1 ring-inset ring-black/10 transition hover:scale-110" style={{ backgroundColor: color }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A small formatting editor for announcements: headings, paragraphs, bold/italic/underline,
 * lists, quotes, links, text colour, highlight and alignment. Emits HTML that the server sanitises
 * again (announcementContent.js); pasted content is cleaned to the same safe tags and styles.
 */
export default function RichTextEditor({ value, onChange, placeholder = 'Write your announcement…', minHeight = 180, id }) {
  const ref = useRef(null);
  const lastEmitted = useRef(null);
  const [empty, setEmpty] = useState(!value);

  // Outside changes (a template, a reset, opening another announcement) replace the content;
  // our own typing does not re-render the editor (that would move the cursor).
  useEffect(() => {
    if (!ref.current || value === lastEmitted.current) return;
    ref.current.innerHTML = safeAnnouncementHtml(value || '');
    lastEmitted.current = value;
    setEmpty(!ref.current.textContent.trim());
  }, [value]);

  const emit = () => {
    const html = ref.current?.innerHTML || '';
    const isEmpty = !ref.current?.textContent.trim();
    setEmpty(isEmpty);
    lastEmitted.current = isEmpty ? '' : html;
    onChange(isEmpty ? '' : html);
  };
  const run = (command, argument = null) => {
    ref.current?.focus();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(command, false, argument);
    emit();
  };
  const addLink = () => {
    const url = window.prompt('Link address (https://… or a PeerPrep page like /student/dashboard)');
    if (!url) return;
    const safe = url.trim();
    if (!/^(https?:\/\/|mailto:|\/(?!\/))/i.test(safe)) { window.alert('Use a link that starts with https:// or a PeerPrep page starting with /.'); return; }
    run('createLink', safe);
  };
  const onPaste = (event) => {
    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain') || '';
    event.preventDefault();
    if (html) document.execCommand('insertHTML', false, safeAnnouncementHtml(html));
    else document.execCommand('insertText', false, text);
    emit();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:focus-within:ring-sky-500/20">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50/80 px-1.5 py-1 dark:border-white/10 dark:bg-white/[0.03]" role="toolbar" aria-label="Formatting">
        <select aria-label="Text style" defaultValue="" onChange={(event) => { if (event.target.value) run('formatBlock', `<${event.target.value}>`); event.target.value = ''; }}
          className="mr-1 h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12.5px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200">
          <option value="" disabled>Text style</option>
          {BLOCKS.map(([tag, label]) => <option key={tag} value={tag}>{label}</option>)}
        </select>
        <ToolButton label="Bold" onAction={() => run('bold')}><Bold className="h-4 w-4" /></ToolButton>
        <ToolButton label="Italic" onAction={() => run('italic')}><Italic className="h-4 w-4" /></ToolButton>
        <ToolButton label="Underline" onAction={() => run('underline')}><Underline className="h-4 w-4" /></ToolButton>
        <ToolButton label="Strikethrough" onAction={() => run('strikeThrough')}><Strikethrough className="h-4 w-4" /></ToolButton>
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/10" aria-hidden="true" />
        <Swatches label="Text colour" Icon={Palette} colors={TEXT_COLORS} onPick={(color) => run('foreColor', color)} />
        <Swatches label="Highlight" Icon={Highlighter} colors={HIGHLIGHTS} onPick={(color) => run('hiliteColor', color)} />
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/10" aria-hidden="true" />
        <ToolButton label="Bulleted list" onAction={() => run('insertUnorderedList')}><List className="h-4 w-4" /></ToolButton>
        <ToolButton label="Numbered list" onAction={() => run('insertOrderedList')}><ListOrdered className="h-4 w-4" /></ToolButton>
        <ToolButton label="Quote" onAction={() => run('formatBlock', '<blockquote>')}><Quote className="h-4 w-4" /></ToolButton>
        <ToolButton label="Link" onAction={addLink}><Link2 className="h-4 w-4" /></ToolButton>
        <ToolButton label="Divider" onAction={() => run('insertHorizontalRule')}><Minus className="h-4 w-4" /></ToolButton>
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/10" aria-hidden="true" />
        <ToolButton label="Align left" onAction={() => run('justifyLeft')}><TextAlignStart className="h-4 w-4" /></ToolButton>
        <ToolButton label="Align centre" onAction={() => run('justifyCenter')}><TextAlignCenter className="h-4 w-4" /></ToolButton>
        <ToolButton label="Align right" onAction={() => run('justifyRight')}><TextAlignEnd className="h-4 w-4" /></ToolButton>
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/10" aria-hidden="true" />
        <ToolButton label="Clear formatting" onAction={() => run('removeFormat')}><RemoveFormatting className="h-4 w-4" /></ToolButton>
        <ToolButton label="Undo" onAction={() => run('undo')}><Undo2 className="h-4 w-4" /></ToolButton>
        <ToolButton label="Redo" onAction={() => run('redo')}><Redo2 className="h-4 w-4" /></ToolButton>
      </div>
      <div className="relative">
        {empty ? <p className="pointer-events-none absolute left-4 top-3 text-sm text-slate-400 dark:text-zinc-500">{placeholder}</p> : null}
        <div id={id} ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Message"
          onInput={emit} onBlur={emit} onPaste={onPaste}
          className="announcement-editor max-h-[420px] overflow-y-auto px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none dark:text-zinc-200 [&_a]:text-sky-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h2]:text-lg [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-semibold [&_h4]:font-semibold [&_hr]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
          style={{ minHeight }} />
      </div>
    </div>
  );
}
