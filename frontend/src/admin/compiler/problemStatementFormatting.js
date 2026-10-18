function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

const PROTECTED_TOKEN_PREFIX = '\uE000PEERPREP_CODE_';
const PROTECTED_TOKEN_SUFFIX = '_END\uE001';

function protectCode(value) {
  const blocks = [];
  const text = String(value || '').replace(/```[\s\S]*?```|`[^`\n]*`/g, (match) => {
    const token = `${PROTECTED_TOKEN_PREFIX}${blocks.length}${PROTECTED_TOKEN_SUFFIX}`;
    blocks.push(match);
    return token;
  });
  return { text, blocks };
}

function restoreCode(value, blocks) {
  return String(value || '').replace(
    new RegExp(`${PROTECTED_TOKEN_PREFIX}(\\d+)${PROTECTED_TOKEN_SUFFIX}`, 'g'),
    (_, index) => blocks[Number(index)] ?? _,
  );
}

function plainCell(value) {
  return decodeEntities(String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(?:p|div|span|strong|b|em|i)\b[^>]*>/gi, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .replaceAll('|', '\\|');
}

function tableMarkdown(rows) {
  if (rows.length < 2 || rows[0].length < 2) return '';
  const width = rows[0].length;
  if (!rows.every((row) => row.length === width)) return '';
  const line = (row) => `| ${row.join(' | ')} |`;
  return [line(rows[0]), line(Array.from({ length: width }, () => '---')), ...rows.slice(1).map(line)].join('\n');
}

function convertHtmlTables(value) {
  return String(value || '').replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (source, body) => {
    const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) => (
      [...rowMatch[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
        .map((cellMatch) => plainCell(cellMatch[1]))
    )).filter((row) => row.length > 0);
    return tableMarkdown(rows) || source;
  });
}

function convertAsciiBoxTables(value) {
  const lines = String(value || '').replace(/\r\n/g, '\n').split('\n');
  const output = [];
  const borderColumns = (line) => (/^\s*\+(?:-+\+){1,}\s*$/.test(line)
    ? (line.match(/\+/g) || []).length - 1
    : 0);

  for (let index = 0; index < lines.length;) {
    const columns = borderColumns(lines[index]);
    if (!columns) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const rows = [];
    let cursor = index + 1;
    let endedOnBorder = false;
    let valid = true;
    while (cursor < lines.length) {
      const nextColumns = borderColumns(lines[cursor]);
      if (nextColumns) {
        if (nextColumns !== columns) break;
        endedOnBorder = true;
        cursor += 1;
        continue;
      }
      if (!/^\s*\|.*\|\s*$/.test(lines[cursor])) break;
      const cells = lines[cursor].trim().slice(1, -1).split('|').map(plainCell);
      if (cells.length !== columns) valid = false;
      rows.push(cells);
      endedOnBorder = false;
      cursor += 1;
    }

    if (valid && endedOnBorder && rows.length >= 2) {
      output.push(tableMarkdown(rows));
      index = cursor;
      continue;
    }

    output.push(lines[index]);
    index += 1;
  }
  return output.join('\n');
}

function normalizeEscapedBreaks(value) {
  const source = String(value || '');
  const escapedBreaks = source.match(/\\r\\n|\\n|\\r/g) || [];
  // Some imported statements contain serialized CRLF text. Requiring several
  // occurrences avoids changing an intentional `\n` mentioned in normal prose.
  return escapedBreaks.length >= 3 ? source.replace(/\\r\\n|\\n|\\r/g, '\n') : source;
}

const linesOf = (block) => String(block || '').split('\n').map((line) => line.trim()).filter(Boolean);
const isShortCell = (value) => String(value || '').length <= 40 && !/^(?:input|output|explanation|example|constraints?)\s*:/i.test(value);
const hasLayoutHint = (blocks, index) => blocks.slice(Math.max(0, index - 5), index)
  .some((block) => /\b(?:table|grid|keyboard|matrix|shown below|following values|mapped values)\b/i.test(block));
const hasKeyboardHint = (blocks, index) => blocks.slice(Math.max(0, index - 5), index)
  .some((block) => /\bkeyboard\b/i.test(block));

function repairLegacyLayouts(value) {
  const blocks = String(value || '').split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const repaired = [];

  for (let index = 0; index < blocks.length;) {
    const cells = linesOf(blocks[index]);

    // Most imported HTML tables retain a blank line between rows and a single
    // line break between cells. Recover those rows as a real Markdown table.
    if (hasLayoutHint(blocks, index) && cells.length >= 2 && cells.length <= 6 && cells.every(isShortCell)) {
      const rows = [cells];
      let cursor = index + 1;
      while (cursor < blocks.length) {
        const row = linesOf(blocks[cursor]);
        if (row.length !== cells.length || !row.every(isShortCell)) break;
        rows.push(row);
        cursor += 1;
      }
      if (rows.length >= 3) {
        repaired.push(tableMarkdown(rows));
        index = cursor;
        continue;
      }
    }

    // A few legacy scrapes put every table cell in its own paragraph. Infer a
    // small column count from the header and rebuild the table when unambiguous.
    if (hasLayoutHint(blocks, index) && cells.length === 1 && isShortCell(cells[0])) {
      const flatCells = [];
      let cursor = index;
      while (cursor < blocks.length) {
        const row = linesOf(blocks[cursor]);
        if (row.length !== 1 || !isShortCell(row[0]) || row[0].length > 24) break;
        flatCells.push(row[0]);
        cursor += 1;
      }
      const widths = [6, 5, 4, 3, 2].filter((width) => (
        flatCells.length >= width * 3
        && flatCells.length % width === 0
        && flatCells.slice(0, width).every((cell) => /[A-Za-z?]/.test(cell) && !/^\d/.test(cell))
        && flatCells.slice(width, width * 2).some((cell) => /\d/.test(cell))
      ));
      if (widths.length === 1) {
        const width = widths[0];
        const rows = Array.from({ length: flatCells.length / width }, (_, rowIndex) => (
          flatCells.slice(rowIndex * width, (rowIndex + 1) * width)
        ));
        repaired.push(tableMarkdown(rows));
        index = cursor;
        continue;
      }
    }

    // Keyboard and coordinate diagrams often lose their image/table wrapper but
    // retain one short token per line. Keep the row together and let it wrap.
    if (hasKeyboardHint(blocks, index) && cells.length >= 4 && cells.every((cell) => cell.length <= 12)) {
      repaired.push(cells.map((cell) => `\`${cell.replaceAll('`', '')}\``).join('  '));
      index += 1;
      continue;
    }

    // Preserve non-keyboard grids and diagrams as preformatted multiline text.
    if (hasLayoutHint(blocks, index) && cells.length >= 4 && cells.every((cell) => cell.length <= 40)) {
      repaired.push(`\`\`\`text\n${cells.join('\n')}\n\`\`\``);
      index += 1;
      continue;
    }

    repaired.push(blocks[index]);
    index += 1;
  }

  return repaired.join('\n\n');
}

export function normalizeRichText(value) {
  // Convert explicit HTML code elements first, then hide all code spans and
  // fences while prose markup/entities are normalized. This keeps literals
  // such as <sign>, 2 <= x <= 5, and &quot; intact when they are code.
  const withMarkdownCode = String(value || '').replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');
  const protectedCode = protectCode(withMarkdownCode);
  const normalized = repairLegacyLayouts(normalizeEscapedBreaks(convertAsciiBoxTables(convertHtmlTables(protectedCode.text))))
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, '_$1_')
    .replace(/<li>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<\/(?:p|div|ul|ol)>/gi, '\n\n')
    .replace(/<(?:p|div|ul|ol|span)\b[^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    .replace(/\n{3,}/g, '\n\n');

  const decoded = decodeEntities(normalized);
  let implicitList = false;
  const prose = decoded.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (implicitList && /^(?:return|given|input|output|example|constraints?)\b/i.test(trimmed)) implicitList = false;
    const rendered = implicitList && !/^[-*]\s/.test(trimmed) ? `- ${trimmed}` : line;
    if (/(?:either|following|conditions?|requirements?)\s*:\s*$/i.test(trimmed)) implicitList = true;
    return rendered;
  }).join('\n');
  return restoreCode(prose, protectedCode.blocks);
}

export function getDisplayProblemStatement(content, hasStructuredExamples = false) {
  const normalized = normalizeRichText(content);
  if (!hasStructuredExamples) return normalized;
  const lines = normalized.split('\n');
  const startIndex = lines.findIndex((line) => /^\s*(?:#{1,3}\s*)?(?:\*\*)?(?:example\s*\d+\s*:|input\s*:)/i.test(line));
  if (startIndex < 0) return normalized;
  const remainder = lines.slice(startIndex).join('\n');
  if (!/(?:^|\n)\s*(?:\*\*)?output\s*:/i.test(remainder)) return normalized;
  return lines.slice(0, startIndex).join('\n').trim();
}
