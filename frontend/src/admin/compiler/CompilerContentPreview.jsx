import { difficultyBadgeClass, formatDateTime, formatPercent, problemStatusClass } from './compilerUtils';

function renderInlineNodes(text, keyPrefix) {
  const tokens = String(text || '').split(/(\*\*.*?\*\*|`.*?`|_.*?_)/g).filter(Boolean);

  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={key}>{token.slice(2, -2)}</strong>;
    }

    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={key} className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.92em] text-slate-700 dark:bg-gray-800 dark:text-gray-200">
          {token.slice(1, -1)}
        </code>
      );
    }

    if (token.startsWith('_') && token.endsWith('_')) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }

    return <span key={key}>{token}</span>;
  });
}

export function RichTextPreview({ content, className = '' }) {
  const lines = String(content || '').split('\n');
  const blocks = [];
  let listBuffer = null;

  const flushList = () => {
    if (!listBuffer || listBuffer.items.length === 0) return;

    const ListTag = listBuffer.type === 'ordered' ? 'ol' : 'ul';
    blocks.push(
      <ListTag
        key={`list-${blocks.length}`}
        className={`space-y-2 pl-5 ${listBuffer.type === 'ordered' ? 'list-decimal' : 'list-disc'}`}
      >
        {listBuffer.items.map((item, index) => (
          <li key={`${listBuffer.type}-${index}`} className="leading-7 text-slate-700 dark:text-gray-300">
            {renderInlineNodes(item, `${listBuffer.type}-${index}`)}
          </li>
        ))}
      </ListTag>,
    );
    listBuffer = null;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith('- ')) {
      if (!listBuffer || listBuffer.type !== 'unordered') {
        flushList();
        listBuffer = { type: 'unordered', items: [] };
      }
      listBuffer.items.push(trimmed.slice(2));
      return;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      if (!listBuffer || listBuffer.type !== 'ordered') {
        flushList();
        listBuffer = { type: 'ordered', items: [] };
      }
      listBuffer.items.push(trimmed.replace(/^\d+\.\s/, ''));
      return;
    }

    flushList();

    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h3 key={`heading-${blocks.length}`} className="text-lg font-semibold text-slate-800 dark:text-gray-100">
          {renderInlineNodes(trimmed.slice(3), `heading-${blocks.length}`)}
        </h3>,
      );
      return;
    }

    if (trimmed.startsWith('> ')) {
      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="border-l-4 border-sky-400/70 bg-sky-50/70 px-4 py-3 text-sm italic text-slate-700 dark:border-sky-600 dark:bg-sky-900/10 dark:text-gray-300"
        >
          {renderInlineNodes(trimmed.slice(2), `quote-${blocks.length}`)}
        </blockquote>,
      );
      return;
    }

    blocks.push(
      <p key={`paragraph-${blocks.length}`} className="leading-7 text-slate-700 dark:text-gray-300">
        {renderInlineNodes(trimmed, `paragraph-${blocks.length}`)}
      </p>,
    );
  });

  flushList();

  return (
    <div className={`space-y-4 text-sm ${className}`}>
      {blocks.length > 0 ? blocks : (
        <p className="text-slate-500 dark:text-gray-400">Nothing to preview yet.</p>
      )}
    </div>
  );
}

export function ProblemStatementPreview({ problem, showMeta = true }) {
  const sampleTestCases = problem?.sampleTestCases || [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-gray-700">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
              Live Preview
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-gray-100">
              {problem?.title || 'Untitled Problem'}
            </h2>
          </div>

          {showMeta && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${difficultyBadgeClass(problem?.difficulty || 'Easy')}`}>
                {problem?.difficulty || 'Easy'}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${problemStatusClass(problem?.status || 'Draft')}`}>
                {problem?.status || 'Draft'}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(problem?.tags || []).map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-gray-800 dark:text-gray-300">
              {tag}
            </span>
          ))}
          {(problem?.companyTags || []).map((tag) => (
            <span key={tag} className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-6 px-5 py-5">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Problem Description</h3>
          <RichTextPreview content={problem?.description || ''} />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-gray-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Input</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-gray-300">
              {problem?.inputFormat || 'Input details will appear here.'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-gray-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Output</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-gray-300">
              {problem?.outputFormat || 'Output details will appear here.'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-gray-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Constraints</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-gray-300">
              {problem?.constraints || 'Constraints will appear here.'}
            </p>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-gray-700">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Languages</p>
            <p className="mt-2 text-sm text-slate-700 dark:text-gray-300">
              {(problem?.supportedLanguages || []).length > 0 ? problem.supportedLanguages.join(', ') : 'No languages selected'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-gray-700">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Time Limit</p>
            <p className="mt-2 text-sm text-slate-700 dark:text-gray-300">{problem?.timeLimitSeconds || 2} sec</p>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-gray-700">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Memory Limit</p>
            <p className="mt-2 text-sm text-slate-700 dark:text-gray-300">{problem?.memoryLimitMb || 256} MB</p>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Sample Test Cases</h3>
            <span className="text-xs text-slate-500 dark:text-gray-400">{sampleTestCases.length} configured</span>
          </div>

          {sampleTestCases.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400">
              Sample cases will appear here once added.
            </div>
          ) : (
            <div className="space-y-3">
              {sampleTestCases.map((testCase, index) => (
                <div key={`${index + 1}-${testCase.input}`} className="rounded-xl border border-slate-200 p-4 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Sample {index + 1}</h4>
                    <span className="text-xs text-slate-400 dark:text-gray-500">Preview</span>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Input</p>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 px-3 py-3 text-xs text-slate-100">{testCase.input || '(empty)'}</pre>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Output</p>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 px-3 py-3 text-xs text-slate-100">{testCase.output || '(empty)'}</pre>
                    </div>
                  </div>
                  {testCase.explanation && (
                    <p className="mt-3 text-sm text-slate-600 dark:text-gray-400">{testCase.explanation}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {problem?.createdAt && (
          <div className="flex flex-wrap gap-4 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-gray-700 dark:text-gray-400">
            <span>Created {formatDateTime(problem.createdAt)}</span>
            <span>{problem.hiddenTestCaseCount || 0} hidden test cases</span>
            <span>{formatPercent(problem.acceptanceRate || 0)} acceptance</span>
          </div>
        )}
      </div>
    </div>
  );
}
