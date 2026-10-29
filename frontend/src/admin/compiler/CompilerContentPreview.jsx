import ProblemAssetImages from '../../components/ProblemAssetImages';
import { normalizeRichText } from './problemStatementFormatting';

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
  let tableBuffer = null;

  const flushTable = () => {
    if (!tableBuffer || tableBuffer.rows.length === 0) return;
    const [header, ...body] = tableBuffer.rows;
    blocks.push(
      <div key={`table-${blocks.length}`} className="max-w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-700">
        <table className="w-full min-w-max border-collapse text-left text-sm text-slate-800 dark:text-gray-200">
          <thead className="bg-slate-100 text-slate-950 dark:bg-gray-800 dark:text-white">
            <tr>{header.map((cell, index) => <th key={`head-${index}`} className="border-b border-slate-200 px-3.5 py-2.5 font-semibold dark:border-gray-700">{renderInlineNodes(cell, `table-head-${index}`)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
            {body.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`cell-${rowIndex}-${cellIndex}`} className="px-3.5 py-2.5 align-top">{renderInlineNodes(cell, `table-${rowIndex}-${cellIndex}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableBuffer = null;
  };

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
    const tableCells = /^\|.*\|$/.test(trimmed)
      ? trimmed.slice(1, -1).split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
      : null;
    const tableDivider = tableCells?.every((cell) => /^:?-{3,}:?$/.test(cell));
    if (tableCells && tableCells.length >= 2) {
      flushList();
      flushExample();
      if (!tableBuffer) tableBuffer = { rows: [] };
      if (!tableDivider) tableBuffer.rows.push(tableCells);
      return;
    }
    flushTable();
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
  flushTable();
  if (codeBuffer) blocks.push(<pre key={`code-${blocks.length}`} className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 px-4 py-4 font-mono text-[13px] leading-6 text-sky-100 shadow-inner"><code>{codeBuffer.join('\n')}</code></pre>);

  return (
    <div className={`space-y-3.5 ${className}`}>
      {blocks.length > 0 ? blocks : (
        <p className="text-slate-500 dark:text-gray-400">Nothing to preview yet.</p>
      )}
    </div>
  );
}

