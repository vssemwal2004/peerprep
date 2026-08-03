import { useRef } from 'react';
import { Bold, Code2, Heading2, Italic, List, MessageSquareQuote } from 'lucide-react';

const TOOLBAR_ACTIONS = [
  {
    label: 'Heading',
    Icon: Heading2,
    action: ({ value, start, end }) => {
      const selected = value.slice(start, end) || 'Section title';
      const formatted = selected.split('\n').map((line) => line ? `## ${line}` : line).join('\n');
      return {
        nextValue: `${value.slice(0, start)}${formatted}${value.slice(end)}`,
        selectionStart: start,
        selectionEnd: start + formatted.length,
      };
    },
  },
  {
    label: 'Bold',
    Icon: Bold,
    action: ({ value, start, end }) => {
      const selected = value.slice(start, end) || 'bold text';
      const formatted = selected.split('\n').map((line) => line ? `**${line}**` : line).join('\n');
      return {
        nextValue: `${value.slice(0, start)}${formatted}${value.slice(end)}`,
        selectionStart: start,
        selectionEnd: start + formatted.length,
      };
    },
  },
  {
    label: 'Italic',
    Icon: Italic,
    action: ({ value, start, end }) => {
      const selected = value.slice(start, end) || 'italic text';
      const formatted = selected.split('\n').map((line) => line ? `_${line}_` : line).join('\n');
      return {
        nextValue: `${value.slice(0, start)}${formatted}${value.slice(end)}`,
        selectionStart: start,
        selectionEnd: start + formatted.length,
      };
    },
  },
  {
    label: 'List',
    Icon: List,
    action: ({ value, start, end }) => {
      const selected = value.slice(start, end) || 'First item';
      const formatted = selected.split('\n').map((line) => line ? `- ${line}` : line).join('\n');
      return {
        nextValue: `${value.slice(0, start)}${formatted}${value.slice(end)}`,
        selectionStart: start,
        selectionEnd: start + formatted.length,
      };
    },
  },
  {
    label: 'Quote',
    Icon: MessageSquareQuote,
    action: ({ value, start, end }) => {
      const selected = value.slice(start, end) || 'Important note';
      const formatted = selected.split('\n').map((line) => line ? `> ${line}` : line).join('\n');
      return {
        nextValue: `${value.slice(0, start)}${formatted}${value.slice(end)}`,
        selectionStart: start,
        selectionEnd: start + formatted.length,
      };
    },
  },
  {
    label: 'Code',
    Icon: Code2,
    action: ({ value, start, end }) => {
      const selected = value.slice(start, end) || 'value';
      const formatted = selected.split('\n').map((line) => line ? `\`${line}\`` : line).join('\n');
      return {
        nextValue: `${value.slice(0, start)}${formatted}${value.slice(end)}`,
        selectionStart: start,
        selectionEnd: start + formatted.length,
      };
    },
  },
];

export default function RichTextEditor({ value, onChange, rows = 12, placeholder }) {
  const textareaRef = useRef(null);

  const applyAction = (toolbarAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const result = toolbarAction.action({
      value,
      start,
      end,
    });

    onChange(result.nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-3 dark:border-gray-700">
        {TOOLBAR_ACTIONS.map((toolbarAction) => (
          <button
            key={toolbarAction.label}
            type="button"
            onClick={() => applyAction(toolbarAction)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <toolbarAction.Icon className="h-3.5 w-3.5" />
            {toolbarAction.label}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="min-h-[240px] w-full resize-y rounded-b-2xl bg-transparent px-4 py-4 text-sm leading-7 text-slate-700 outline-none placeholder:text-slate-400 dark:text-gray-200 dark:placeholder:text-gray-500"
      />
    </div>
  );
}
