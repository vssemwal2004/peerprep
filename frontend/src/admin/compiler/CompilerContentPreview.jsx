import { difficultyBadgeClass, formatDateTime, formatPercent, problemStatusClass } from './compilerUtils';
import ProblemAssetImages from '../../components/ProblemAssetImages';
import { getDisplayProblemStatement, normalizeRichText } from './problemStatementFormatting';

const INLINE_CODE_CLASS = 'rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[0.88em] font-normal text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200';

function renderSemanticText(text, keyPrefix) {
  const semanticPattern = /(O\([^\n)]*\)|\b(?:null|true|false|None)\b|\b\d+(?:\.\d+)?\s*\^\s*\d+\b|\[[^\]\n]{1,80}\]|"[^"\n]{1,100}"|'[^'\n]{1,100}'|\b[A-Za-z_]\w*(?=\s*\()|\b(?:minimum|maximum|at least|at most|exactly|distinct|unique|non-empty|in any order)\b)/gi;
  return String(text || '').split(semanticPattern).filter(Boolean).map((part, index) => (
    /^(?:minimum|maximum|at least|at most|exactly|distinct|unique|non-empty|in any order)$/i.test(part)
      ? <strong key={`${keyPrefix}-important-${index}`} className="font-semibold text-slate-950 dark:text-white">{part}</strong>
      : /^(?:O\([^\n)]*\)|(?:null|true|false|None)|\d+(?:\.\d+)?\s*\^\s*\d+|\[[^\]\n]{1,80}\]|"[^"\n]{1,100}"|'[^'\n]{1,100}'|[A-Za-z_]\w*)$/.test(part)
        ? <code key={`${keyPrefix}-semantic-${index}`} className={INLINE_CODE_CLASS}>{part}</code>
        : <span key={`${keyPrefix}-text-${index}`}>{part}</span>
  ));
}

function renderInlineNodes(text, keyPrefix) {
  const tokens = String(text || '').split(/(\*\*.*?\*\*|`.*?`|_.*?_)/g).filter(Boolean);

  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={key} className="font-bold text-slate-950 dark:text-white">{token.slice(2, -2)}</strong>;
    }

    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={key} className={INLINE_CODE_CLASS}>
          {token.slice(1, -1)}
        </code>
      );
    }

    if (token.startsWith('_') && token.endsWith('_')) {
      return <em key={key} className="font-medium text-slate-700 dark:text-gray-200">{token.slice(1, -1)}</em>;
    }

    return <span key={key}>{renderSemanticText(token, key)}</span>;
  });
}

export function RichTextPreview({ content, className = '', lead = false }) {
  const lines = normalizeRichText(content).split('\n');
  const blocks = [];
  let listBuffer = null;
  let codeBuffer = null;
  let exampleBuffer = null;

  const flushExample = () => {
    if (!exampleBuffer) return;
    const input = exampleBuffer.input.join('\n').trim();
    const output = exampleBuffer.output.join('\n').trim();
    const explanation = exampleBuffer.explanation.join('\n').trim();
    blocks.push(
      <section key={`inline-example-${blocks.length}`} className="max-w-[78ch] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-gray-700 dark:bg-gray-900">
        <div className="space-y-3 bg-slate-50/80 px-4 py-3.5 font-mono text-[13px] leading-6 text-slate-800 dark:bg-gray-800/80 dark:text-gray-200">
          {input ? <div><div className="font-sans text-sm font-semibold text-slate-950 dark:text-white">Input:</div><div className="mt-1 whitespace-pre-wrap break-words">{renderInlineNodes(input, `inline-input-${blocks.length}`)}</div></div> : null}
          {output ? <div><div className="font-sans text-sm font-semibold text-slate-950 dark:text-white">Output:</div><div className="mt-1 whitespace-pre-wrap break-words">{renderInlineNodes(output, `inline-output-${blocks.length}`)}</div></div> : null}
        </div>
        {explanation ? <div className="whitespace-pre-wrap border-t border-slate-100 px-4 py-3.5 text-[15px] leading-6 text-slate-700 dark:border-gray-800 dark:text-gray-200"><span className="font-semibold text-slate-950 dark:text-white">Explanation: </span>{renderInlineNodes(explanation, `inline-explanation-${blocks.length}`)}</div> : null}
      </section>,
    );
    exampleBuffer = null;
  };

  const flushList = () => {
    if (!listBuffer || listBuffer.items.length === 0) return;

    const ListTag = listBuffer.type === 'ordered' ? 'ol' : 'ul';
    blocks.push(
      <ListTag
        key={`list-${blocks.length}`}
        className={`space-y-2 pl-6 text-[15px] text-slate-800 dark:text-gray-200 ${listBuffer.type === 'ordered' ? 'list-decimal' : 'list-disc'}`}
      >
        {listBuffer.items.map((item, index) => (
          <li key={`${listBuffer.type}-${index}`} className="pl-1 leading-[26px] marker:text-slate-700 dark:marker:text-gray-300">
            {renderInlineNodes(item, `${listBuffer.type}-${index}`)}
          </li>
        ))}
      </ListTag>,
    );
    listBuffer = null;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const labeledLine = trimmed.match(/^(?:\*\*)?(input|output|explanation)\s*:(?:\*\*)?\s*(.*)$/i);
    const constraintLine = /^(?:\d+|[A-Za-z_]\w*(?:\[[^\]]+\]|(?:\.\w+))*)\s*(?:<=|>=|<|>|==|!=)/.test(trimmed);
    if (labeledLine) {
      flushList();
      const field = labeledLine[1].toLowerCase();
      if (field === 'input') {
        flushExample();
        exampleBuffer = { input: [], output: [], explanation: [], active: 'input' };
      } else if (!exampleBuffer) {
        exampleBuffer = { input: [], output: [], explanation: [], active: field };
      }
      exampleBuffer.active = field;
      if (labeledLine[2]) exampleBuffer[field].push(labeledLine[2]);
      return;
    }
    if (exampleBuffer) {
      if (constraintLine || /^(?:#{2,3}\s|example\s+\d+\s*:|constraints?\s*:)/i.test(trimmed)) {
        flushExample();
      } else {
        if (trimmed) exampleBuffer[exampleBuffer.active].push(trimmed);
        return;
      }
    }
    if (trimmed.startsWith('```')) {
      flushList();
      if (codeBuffer) {
        blocks.push(<pre key={`code-${blocks.length}`} className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 px-4 py-4 font-mono text-[13px] leading-6 text-sky-100 shadow-inner"><code>{codeBuffer.join('\n')}</code></pre>);
        codeBuffer = null;
      } else codeBuffer = [];
      return;
    }
    if (codeBuffer) {
      codeBuffer.push(line);
      return;
    }
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

    if (constraintLine) {
      blocks.push(<div key={`constraint-${blocks.length}`} className="max-w-[78ch] rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-[13px] leading-6 text-slate-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">{renderInlineNodes(trimmed, `constraint-${blocks.length}`)}</div>);
      return;
    }

    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h3 key={`heading-${blocks.length}`} className="text-base font-semibold text-slate-900 dark:text-white">
          {renderInlineNodes(trimmed.slice(3), `heading-${blocks.length}`)}
        </h3>,
      );
      return;
    }

    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h4 key={`subheading-${blocks.length}`} className="text-base font-bold text-slate-900 dark:text-gray-100">
          {renderInlineNodes(trimmed.slice(4), `subheading-${blocks.length}`)}
        </h4>,
      );
      return;
    }

    if (trimmed.startsWith('> ')) {
      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="border-l-4 border-slate-300 pl-4 text-[15px] leading-[26px] text-slate-800 dark:border-gray-600 dark:text-gray-200"
        >
          {renderInlineNodes(trimmed.slice(2), `quote-${blocks.length}`)}
        </blockquote>,
      );
      return;
    }

    const isCallout = /^(?:note|important|remember|you may assume|it is guaranteed|the overall|follow-up)\b/i.test(trimmed);
    const isLead = lead && blocks.length === 0;
    blocks.push(isCallout ? (
      <p key={`paragraph-${blocks.length}`} className="max-w-[78ch] text-[15px] leading-[26px] text-slate-800 dark:text-gray-200">
        {renderInlineNodes(trimmed, `paragraph-${blocks.length}`)}
      </p>
    ) : (
      <p key={`paragraph-${blocks.length}`} className={`${isLead ? 'font-medium text-slate-900 dark:text-gray-100' : 'text-slate-800 dark:text-gray-200'} max-w-[78ch] text-[15px] leading-[26px]`}>
        {renderInlineNodes(trimmed, `paragraph-${blocks.length}`)}
      </p>
    ));
  });

  flushList();
  flushExample();
  if (codeBuffer) blocks.push(<pre key={`code-${blocks.length}`} className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 px-4 py-4 font-mono text-[13px] leading-6 text-sky-100 shadow-inner"><code>{codeBuffer.join('\n')}</code></pre>);

  return (
    <div className={`space-y-3.5 ${className}`}>
      {blocks.length > 0 ? blocks : (
        <p className="text-slate-500 dark:text-gray-400">Nothing to preview yet.</p>
      )}
    </div>
  );
}

export function ProblemStatementPreview({ problem, showMeta = true }) {
  const sampleTestCases = problem?.sampleTestCases || [];
  const hints = Array.isArray(problem?.hints) ? problem.hints.filter((hint) => String(hint || '').trim()).slice(0, 10) : [];
  const faqs = Array.isArray(problem?.faqs)
    ? problem.faqs.filter((faq) => String(faq?.question || '').trim() || String(faq?.answer || '').trim())
    : [];

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
                {(String(problem?.status || 'draft').toLowerCase() === 'published' || String(problem?.status || '').toLowerCase() === 'active') ? 'Published' : 'Draft'}
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
          <RichTextPreview content={getDisplayProblemStatement(problem?.description || '', sampleTestCases.length > 0)} lead />
          <ProblemAssetImages images={(problem?.contentImages || []).filter((image) => image.section !== 'constraints')} />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-gray-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Input</p>
            <RichTextPreview className="mt-2" content={problem?.inputFormat || 'Input details will appear here.'} />
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-gray-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Output</p>
            <RichTextPreview className="mt-2" content={problem?.outputFormat || 'Output details will appear here.'} />
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-gray-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Constraints</p>
            <RichTextPreview className="mt-2" content={problem?.constraints || 'Constraints will appear here.'} />
          </div>
        </section>

        {hints.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100">AnvI Approaches</h3>
              <span className="text-xs text-slate-500 dark:text-gray-400">{hints.length} configured</span>
            </div>
            <div className="space-y-2">
              {hints.map((hint, index) => (
                <div key={`hint-preview-${index}`} className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-slate-700 dark:border-sky-900/40 dark:bg-sky-900/10 dark:text-gray-300">
                  <span className="font-semibold text-violet-700 dark:text-violet-300">Approach {index + 1}: </span>
                  {hint}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {faqs.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100">FAQ</h3>
              <span className="text-xs text-slate-500 dark:text-gray-400">{faqs.length} configured</span>
            </div>
            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <div key={`faq-preview-${index}`} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-gray-700">
                  <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{faq.question}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-gray-300">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

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
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">{Number(testCase.marks) || 1} mark(s)</span>
                  </div>
                  <ProblemAssetImages images={testCase.images} className="mt-3" />
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

