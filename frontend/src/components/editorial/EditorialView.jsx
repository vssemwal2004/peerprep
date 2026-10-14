import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import { AlertTriangle, ExternalLink, Info, Lightbulb, ListTree, Sparkles } from 'lucide-react';
import 'katex/dist/katex.min.css';
import './editorial.css';
import EditorialCodeGroup from './EditorialCodeGroup';
import {
  KATEX_OPTIONS,
  buildImplementationBlocks,
  editorialSanitizeSchema,
  editorialUrlTransform,
  hasImplementationSection,
  normalizeEditorialMarkdown,
  rehypeEditorialStructure,
  rehypeRawToText,
  remarkPromoteDisplayMath,
} from './editorialMarkdown';
import {
  EditorialLanguageContext,
  readStoredEditorialLanguage,
  writeStoredEditorialLanguage,
} from './editorialPreferences';

const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkPromoteDisplayMath];

const BODY_TEXT = 'text-[15px] leading-[26px] text-slate-800 dark:text-gray-200';

function scrollToHeading(element) {
  if (!element) return;
  try {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    element.scrollIntoView?.();
  }
}

function findInEditorial(from, id) {
  const root = from?.closest?.('[data-editorial-root]');
  if (!root || !id) return null;
  return [...root.querySelectorAll('[id]')].find((element) => element.id === id) || null;
}

function makeHeading(Tag, className) {
  return function EditorialHeading({ node: _node, id, children, ...rest }) {
    return (
      <Tag id={id} className={`group scroll-mt-4 ${className}`} {...rest}>
        {children}
        {id ? (
          <a
            href={`#${id}`}
            aria-label="Link to this section"
            onClick={(event) => {
              event.preventDefault();
              scrollToHeading(event.currentTarget.parentElement);
            }}
            className="ml-2 align-middle text-[0.8em] font-normal text-zinc-300 no-underline opacity-0 transition-opacity hover:text-[#ffa116] focus:opacity-100 group-hover:opacity-100 dark:text-zinc-600"
          >
            #
          </a>
        ) : null}
      </Tag>
    );
  };
}

const CALLOUT_STYLES = {
  note: {
    Icon: Info,
    box: 'border-sky-200 bg-sky-50/70 dark:border-sky-500/30 dark:bg-sky-500/10',
    title: 'text-sky-800 dark:text-sky-200',
  },
  tip: {
    Icon: Lightbulb,
    box: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10',
    title: 'text-emerald-800 dark:text-emerald-200',
  },
  warning: {
    Icon: AlertTriangle,
    box: 'border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10',
    title: 'text-amber-800 dark:text-amber-200',
  },
  insight: {
    Icon: Sparkles,
    box: 'border-violet-200 bg-violet-50/60 dark:border-violet-500/30 dark:bg-violet-500/10',
    title: 'text-violet-800 dark:text-violet-200',
  },
};

function Blockquote({ node, children }) {
  const kind = node?.data?.callout;
  const style = kind ? CALLOUT_STYLES[kind] : null;
  if (!style) {
    return (
      <blockquote className="my-4 border-l-4 border-zinc-300 pl-4 text-slate-700 dark:border-zinc-600 dark:text-gray-300">
        {children}
      </blockquote>
    );
  }
  const { Icon } = style;
  return (
    <aside className={`editorial-callout my-5 rounded-xl border px-4 py-3 ${style.box}`} data-callout={kind} role="note">
      <div className={`mb-1 flex items-center gap-2 text-sm font-semibold ${style.title}`}>
        <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
        <span>{node?.data?.calloutLabel || kind}</span>
      </div>
      <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2">{children}</div>
    </aside>
  );
}

function UnorderedList({ node, className = '', children }) {
  if (node?.data?.complexityList) {
    return (
      <ul className="editorial-complexity my-4 grid list-none gap-2 p-0" data-complexity-list="">
        {children}
      </ul>
    );
  }
  const taskList = String(className).includes('contains-task-list');
  return (
    <ul className={`my-3 space-y-1.5 ${taskList ? 'list-none pl-1' : 'list-disc pl-6'} marker:text-zinc-400 dark:marker:text-zinc-500 [&_ol]:my-1.5 [&_ul]:my-1.5`}>
      {children}
    </ul>
  );
}

function OrderedList({ node: _node, children, start }) {
  return (
    <ol start={start} className="my-3 list-decimal space-y-1.5 pl-6 marker:font-semibold marker:text-zinc-500 dark:marker:text-zinc-400 [&_ol]:my-1.5 [&_ul]:my-1.5">
      {children}
    </ol>
  );
}

function ListItem({ node, children }) {
  const complexity = node?.data?.complexity;
  if (complexity) {
    return (
      <li
        className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50"
        data-complexity={complexity}
      >
        <span
          className={`mt-[3px] inline-flex w-14 flex-none justify-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
            complexity === 'time'
              ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300'
              : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
          }`}
        >
          {complexity === 'time' ? 'Time' : 'Space'}
        </span>
        <div className="min-w-0 flex-1 [&>p]:my-0">{children}</div>
      </li>
    );
  }
  return <li className="pl-1 [&>p]:my-1.5">{children}</li>;
}

function MarkdownLink({ node: _node, href = '', children, title }) {
  if (!href) {
    // Unsafe URL (e.g. javascript:) was removed: keep the text, drop the link.
    return <span className="text-slate-800 dark:text-gray-200" data-neutralized-link="">{children}</span>;
  }
  if (href.startsWith('#')) {
    return (
      <a
        href={href}
        title={title}
        onClick={(event) => {
          const target = findInEditorial(event.currentTarget, href.slice(1));
          if (!target) return;
          event.preventDefault();
          scrollToHeading(target);
        }}
        className="font-medium text-[#d97706] underline decoration-[#ffa116]/40 underline-offset-2 hover:decoration-[#ffa116] dark:text-[#ffb84d]"
      >
        {children}
      </a>
    );
  }
  return (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-0.5 font-medium text-[#d97706] underline decoration-[#ffa116]/40 underline-offset-2 hover:decoration-[#ffa116] dark:text-[#ffb84d]"
    >
      {children}
      <ExternalLink className="h-3 w-3 self-center" aria-hidden="true" />
    </a>
  );
}

function MarkdownImage({ node: _node, src = '', alt = '', title }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      title={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="my-4 h-auto max-w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-700"
    />
  );
}

const MARKDOWN_COMPONENTS = {
  h2: makeHeading('h2', 'mt-8 mb-3 border-b border-zinc-200 pb-2 text-lg font-semibold text-zinc-900 first:mt-0 dark:border-zinc-700 dark:text-white'),
  h3: makeHeading('h3', 'mt-6 mb-2 text-base font-semibold text-zinc-900 dark:text-white'),
  h4: makeHeading('h4', 'mt-5 mb-2 text-[15px] font-semibold text-zinc-800 dark:text-gray-100'),
  h5: makeHeading('h5', 'mt-4 mb-1.5 text-sm font-semibold text-zinc-800 dark:text-gray-100'),
  h6: makeHeading('h6', 'mt-4 mb-1.5 text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-gray-300'),
  p: ({ node: _node, children }) => <p className="my-3">{children}</p>,
  a: MarkdownLink,
  img: MarkdownImage,
  ul: UnorderedList,
  ol: OrderedList,
  li: ListItem,
  blockquote: Blockquote,
  hr: () => <hr className="my-6 border-zinc-200 dark:border-zinc-700" />,
  strong: ({ node: _node, children }) => <strong className="font-semibold text-zinc-950 dark:text-white">{children}</strong>,
  em: ({ node: _node, children }) => <em className="italic">{children}</em>,
  del: ({ node: _node, children }) => <del className="text-zinc-500">{children}</del>,
  code: ({ node: _node, children }) => (
    <code className="rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-[1px] font-mono text-[0.86em] text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
      {children}
    </code>
  ),
  pre: ({ node: _node, children }) => (
    <pre className="my-4 overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 font-mono text-[13px] leading-6 dark:border-zinc-700 dark:bg-[#1e1e1e]">{children}</pre>
  ),
  table: ({ node: _node, children }) => (
    // Only this wrapper scrolls horizontally; the page never does. Cells wrap normally and
    // the table grows past the container only when its content cannot wrap.
    <div className="editorial-table my-5 max-w-full overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700" data-table-scroll="" tabIndex={0} role="region" aria-label="Table">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ node: _node, children }) => <thead className="bg-zinc-50 dark:bg-zinc-800/70">{children}</thead>,
  tr: ({ node: _node, children }) => <tr className="border-b border-zinc-200 last:border-0 dark:border-zinc-700">{children}</tr>,
  // No text-transform: headers often hold identifiers such as `nums[i]` that must keep their case.
  th: ({ node: _node, children, style }) => (
    <th style={style} className="px-3 py-2 align-bottom text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">{children}</th>
  ),
  td: ({ node: _node, children, style }) => (
    <td style={style} className="px-3 py-2 align-top text-zinc-800 dark:text-gray-200">{children}</td>
  ),
  input: ({ node: _node, checked, type }) => (type === 'checkbox'
    ? <input type="checkbox" checked={Boolean(checked)} readOnly disabled className="mr-2 align-middle accent-[#ffa116]" />
    : null),
  'editorial-code-group': ({ node }) => <EditorialCodeGroup blocks={node?.data?.blocks || []} />,
};

const EditorialMarkdownBody = memo(function EditorialMarkdownBody({ markdown, idPrefix, title }) {
  const rehypePlugins = useMemo(() => [
    rehypeRawToText,
    [rehypeSanitize, editorialSanitizeSchema],
    [rehypeEditorialStructure, { idPrefix, title }],
    [rehypeKatex, KATEX_OPTIONS],
  ], [idPrefix, title]);
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={rehypePlugins}
      components={MARKDOWN_COMPONENTS}
      urlTransform={editorialUrlTransform}
    >
      {markdown}
    </ReactMarkdown>
  );
});

function sameOutline(left, right) {
  return left.length === right.length
    && left.every((item, index) => item.id === right[index].id && item.label === right[index].label && item.level === right[index].level);
}

function EditorialOutline({ items }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/40">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
        <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
        On this page
      </div>
      <ol className="space-y-0.5 text-[13px] leading-6">
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? 'pl-4' : ''}>
            <a
              href={`#${item.id}`}
              onClick={(event) => {
                event.preventDefault();
                scrollToHeading(findInEditorial(event.currentTarget, item.id));
              }}
              className={`block truncate rounded px-1.5 transition-colors hover:bg-white hover:text-zinc-900 dark:hover:bg-zinc-700/60 dark:hover:text-white ${
                item.level === 2 ? 'font-medium text-zinc-700 dark:text-zinc-200' : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

const LICENSE_LINKS = {
  'CC-BY-SA-4.0': { label: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
};

const SOURCE_LABELS = {
  'doocs-derived': 'doocs/leetcode',
};

// http(s) only; normalised through URL so stored values with spaces become valid hrefs.
function safeExternalUrl(value) {
  const url = String(value || '').trim();
  if (!/^https?:\/\//i.test(url)) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

const FOOTER_CLASS = 'mt-8 border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400';
const FOOTER_LINK_CLASS = 'font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:text-zinc-200 dark:decoration-zinc-600 dark:hover:text-white';

/**
 * Footer driven only by editorialMeta (the markdown body never contains links):
 * - a license (CC BY-SA for doocs-derived text): adaptation notice + license link;
 * - source 'leetcode-ca-derived' without a license: a subtle "Reference" link;
 * - anything else (peerprep-original, legacy): nothing.
 */
function EditorialAttribution({ meta }) {
  const license = String(meta?.license || '').trim();
  const sourceUrl = safeExternalUrl(meta?.attributionUrl);
  if (license) {
    const licenseInfo = LICENSE_LINKS[license.toUpperCase()] || null;
    const sourceLabel = SOURCE_LABELS[meta?.source] || 'the original source';
    return (
      <footer className={FOOTER_CLASS} data-editorial-attribution="license">
        This editorial is adapted from{' '}
        {sourceUrl
          ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={FOOTER_LINK_CLASS}>{sourceLabel}</a>
          : <span className="font-medium">{sourceLabel}</span>}
        {' '}and is licensed under{' '}
        {licenseInfo
          ? <a href={licenseInfo.url} target="_blank" rel="noopener noreferrer license" className={FOOTER_LINK_CLASS}>{licenseInfo.label}</a>
          : <span className="font-medium">{license}</span>}
        . Changes were made to the original text.
      </footer>
    );
  }
  if (meta?.source === 'leetcode-ca-derived' && sourceUrl) {
    return (
      <footer className={FOOTER_CLASS} data-editorial-attribution="reference">
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-zinc-200">
          Reference
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </footer>
    );
  }
  return null;
}

function EditorialView({ markdown = '', solutions = null, meta = null, title = '', className = '' }) {
  const reactId = useId();
  const idPrefix = `ed${reactId.replace(/[^a-zA-Z0-9]/g, '')}-`;
  const source = useMemo(() => normalizeEditorialMarkdown(markdown), [markdown]);
  // md-v2 inlineImplementation editorials already end with "## Implementation": never show it twice.
  const inlineImplementation = useMemo(() => hasImplementationSection(source), [source]);
  const implementationBlocks = useMemo(
    () => (inlineImplementation ? [] : buildImplementationBlocks(solutions)),
    [inlineImplementation, solutions],
  );
  const [preferredLanguage, setPreferredLanguageState] = useState(readStoredEditorialLanguage);
  const [outline, setOutline] = useState([]);
  const rootRef = useRef(null);

  const setPreferredLanguage = useCallback((language) => {
    setPreferredLanguageState(language);
    writeStoredEditorialLanguage(language);
  }, []);
  const languageContext = useMemo(
    () => ({ preferredLanguage, setPreferredLanguage }),
    [preferredLanguage, setPreferredLanguage],
  );

  // Outline is read from the rendered headings so ids always match what is on screen.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = [...root.querySelectorAll('h2[id], h3[id]')].map((heading) => ({
      id: heading.id,
      level: heading.tagName === 'H3' ? 3 : 2,
      label: heading.getAttribute('data-outline-label') || heading.textContent.replace(/#$/, '').trim(),
    }));
    setOutline((previous) => (sameOutline(previous, items) ? previous : items));
  }, [source, implementationBlocks, idPrefix]);

  if (!source && implementationBlocks.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-gray-400">No editorial is available for this problem yet.</p>
    );
  }

  return (
    <EditorialLanguageContext.Provider value={languageContext}>
      <div ref={rootRef} className={`editorial-view min-w-0 ${BODY_TEXT} ${className}`} data-editorial-root="" data-editorial-format={meta?.format || 'legacy'}>
        <EditorialOutline items={outline} />
        {source ? <EditorialMarkdownBody markdown={source} idPrefix={idPrefix} title={title} /> : null}
        {implementationBlocks.length > 0 ? (
          <section aria-labelledby={`${idPrefix}reference-implementation`} data-editorial-implementation="">
            <h2
              id={`${idPrefix}reference-implementation`}
              data-outline-label="Implementation"
              className="mt-8 mb-2 scroll-mt-4 border-b border-zinc-200 pb-2 text-lg font-semibold text-zinc-900 dark:border-zinc-700 dark:text-white"
            >
              Implementation
            </h2>
            <p className="my-2 text-sm text-slate-500 dark:text-gray-400">
              {implementationBlocks.every((block) => block.lang === 'sql')
                ? 'Reference query validated against this problem’s test cases.'
                : 'Reference solutions validated against this problem’s test cases.'}
            </p>
            <EditorialCodeGroup blocks={implementationBlocks} label="Reference implementation" />
          </section>
        ) : null}
        <EditorialAttribution meta={meta} />
      </div>
    </EditorialLanguageContext.Provider>
  );
}

export default memo(EditorialView);
