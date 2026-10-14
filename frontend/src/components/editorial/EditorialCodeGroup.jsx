import { useContext, useEffect, useId, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import { languageLabel } from './editorialMarkdown';
import { EditorialLanguageContext, copyTextToClipboard } from './editorialPreferences';

// Prism "light" build: only the six judged languages and SQL are bundled.
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('sql', sql);

const HIGHLIGHTED = new Set(['c', 'cpp', 'java', 'python', 'javascript', 'typescript', 'sql']);

function resolveActiveIndex(blocks, preferredLanguage, localIndex) {
  const local = localIndex !== null ? blocks[localIndex] : null;
  if (local && (!preferredLanguage || !local.lang || local.lang === preferredLanguage)) {
    return localIndex;
  }
  const preferred = preferredLanguage ? blocks.findIndex((block) => block.lang === preferredLanguage) : -1;
  if (preferred >= 0) return preferred;
  return localIndex !== null && blocks[localIndex] ? localIndex : 0;
}

export default function EditorialCodeGroup({ blocks = [], label = '' }) {
  const { preferredLanguage, setPreferredLanguage } = useContext(EditorialLanguageContext);
  const [localIndex, setLocalIndex] = useState(null);
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef(null);
  const groupId = useId();

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  if (!blocks.length) return null;
  const activeIndex = resolveActiveIndex(blocks, preferredLanguage, localIndex);
  const active = blocks[activeIndex];
  const showTabs = blocks.length > 1;
  const tabId = (index) => `${groupId}-tab-${index}`;
  const panelId = `${groupId}-panel`;

  const selectTab = (index) => {
    setLocalIndex(index);
    if (blocks[index]?.lang) setPreferredLanguage(blocks[index].lang);
  };

  const handleKeyDown = (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (activeIndex + delta + blocks.length) % blocks.length;
    selectTab(nextIndex);
    event.currentTarget.parentElement?.querySelector(`[data-tab-index="${nextIndex}"]`)?.focus();
  };

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(active.code);
    setCopied(ok);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="editorial-code my-5 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-[#1e1e1e]"
      data-code-group=""
      data-tab-count={blocks.length}
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-white/70 pl-2 pr-1.5 dark:border-zinc-700 dark:bg-zinc-800/60">
        {showTabs ? (
          <div role="tablist" aria-label={label || 'Code samples'} className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {blocks.map((block, index) => {
              const selected = index === activeIndex;
              return (
                <button
                  key={`${block.lang}-${index}`}
                  id={tabId(index)}
                  type="button"
                  role="tab"
                  data-tab-index={index}
                  aria-selected={selected}
                  aria-controls={panelId}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectTab(index)}
                  onKeyDown={handleKeyDown}
                  className={`relative whitespace-nowrap px-2.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffa116]/60 ${
                    selected
                      ? 'text-zinc-900 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#ffa116] dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  {languageLabel(block.lang)}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="px-2.5 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{languageLabel(active.lang)}</span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : `Copy ${languageLabel(active.lang)} code`}
          className="inline-flex flex-none items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffa116]/60 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div
        id={panelId}
        role={showTabs ? 'tabpanel' : undefined}
        aria-labelledby={showTabs ? tabId(activeIndex) : undefined}
        data-language={active.lang || 'text'}
      >
        <SyntaxHighlighter
          language={HIGHLIGHTED.has(active.lang) ? active.lang : 'text'}
          useInlineStyles={false}
          PreTag="pre"
          CodeTag="code"
          className="editorial-code-pre"
          wrapLongLines={false}
        >
          {active.code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
