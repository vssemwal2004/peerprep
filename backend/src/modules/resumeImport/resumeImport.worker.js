// Isolated by the same bounded worker queue used for the ATS PDF reader.
import JSZip from 'jszip';
import { SaxesParser } from 'saxes';
import { Readable } from 'node:stream';
import { sectionKind } from './resumeImport.sections.js';

const MAX_XML_BYTES = 3 * 1024 * 1024;
const MAX_TEXT = 60000;
class ImportSizeError extends Error {}

function usableLink(value) {
  return /^(https?:\/\/|mailto:|tel:)/i.test(value || '') ? value : '';
}

// Two independent headings on one baseline mark a split-column body.
// A date or link in the right margin alone remains attached to its entry.
function readingOrder(rows, pageWidth) {
  const ordered = rows.sort((a, b) => b.y - a.y);
  for (const [index, row] of ordered.entries()) {
    const headings = row.items.filter((item) => sectionKind(item.str)).sort((a, b) => a.transform[4] - b.transform[4]);
    if (headings.length !== 2) continue;
    const [first, second] = headings.map((item) => item.transform[4]);
    if (second - first < pageWidth * 0.22) continue;
    const split = second - 6;
    const body = ordered.slice(index);
    const columns = [false, true].flatMap((right) => body.map((line) => ({
      items: line.items.filter((item) => (item.transform[4] >= split) === right),
      links: line.links.filter((link) => (link.x >= split) === right),
    })).filter((line) => line.items.length));
    return [...ordered.slice(0, index), ...columns];
  }
  return ordered;
}

async function pdfLines(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise;
  const lines = [];
  try {
    if (pdf.numPages > 50) throw new ImportSizeError();
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const [content, annotations] = await Promise.all([page.getTextContent(), page.getAnnotations()]);
      const rows = [];
      for (const item of content.items) {
        if (!item.str?.trim()) continue;
        const y = item.transform[5];
        let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
        if (!row) { row = { y, items: [], links: [] }; rows.push(row); }
        row.items.push(item);
      }
      for (const a of annotations) {
        const url = usableLink(a.url || a.unsafeUrl);
        if (!url || !a.rect) continue;
        const row = rows.find((r) => r.y >= a.rect[1] - 2 && r.y <= a.rect[3] + 1);
        if (row) row.links.push({ url, x: a.rect[0] });
      }
      for (const row of readingOrder(rows, page.view[2] - page.view[0])) {
        let text = '', last = null;
        for (const item of row.items.sort((a, b) => a.transform[4] - b.transform[4])) {
          if (last) {
            const gap = item.transform[4] - last.transform[4] - last.width;
            text += gap > 16 ? '\t' : gap > 1.5 ? ' ' : '';
          }
          text += item.str;
          last = item;
        }
        for (const { url } of row.links) if (!text.includes(url)) text += ' ' + url;
        lines.push(text);
      }
      page.cleanup();
    }
  } finally { await pdf.destroy(); }
  return lines;
}

async function xmlPart(zip, path) {
  const file = zip.file(path);
  if (!file) return '';
  const chunks = [];
  let size = 0;
  for await (const chunk of new Readable().wrap(file.nodeStream('nodebuffer'))) {
    size += chunk.length;
    if (size > MAX_XML_BYTES) throw new ImportSizeError();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseXml(xml, { open, close, text }) {
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => { throw new Error('Unsupported document type.'); });
  if (open) parser.on('opentag', open);
  if (close) parser.on('closetag', close);
  if (text) parser.on('text', text);
  parser.write(xml).close();
}

const attribute = (tag, name) => Object.values(tag.attributes).find((a) => a.local === name)?.value;

async function wordPart(zip, path) {
  const rels = new Map();
  const part = path.split('/').pop();
  const relXml = await xmlPart(zip, 'word/_rels/' + part + '.rels');
  if (relXml) parseXml(relXml, { open: (tag) => {
    if (tag.local === 'Relationship') rels.set(attribute(tag, 'Id'), usableLink(attribute(tag, 'Target')));
  } });
  let line = '', inText = false, link = '', bullet = false;
  const lines = [];
  parseXml(await xmlPart(zip, path), {
    open(tag) {
      if (tag.local === 't') inText = true;
      if (tag.local === 'tab') line += '\t';
      if (tag.local === 'br') line += ' ';
      if (tag.local === 'numPr') bullet = true;
      if (tag.local === 'hyperlink') link = rels.get(attribute(tag, 'id')) || '';
    },
    text(value) { if (inText) line += value; },
    close(tag) {
      if (tag.local === 't') inText = false;
      if (tag.local === 'hyperlink') {
        if (link && !line.includes(link)) line += ' ' + link + ' ';
        link = '';
      }
      if (tag.local === 'p') {
        if (line.trim()) lines.push((bullet ? '• ' : '') + line.trim());
        line = ''; bullet = false;
      }
    },
  });
  return lines;
}

async function docxLines(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  if (!zip.file('word/document.xml') || !zip.file('[Content_Types].xml')) throw new Error('Invalid Word document.');
  const headers = Object.keys(zip.files).filter((name) => /^word\/header\d+\.xml$/.test(name)).slice(0, 5);
  const groups = [];
  for (const path of [...headers, 'word/document.xml']) groups.push(await wordPart(zip, path));
  return groups.flat();
}

process.on('message', async ({ id, buffer, format }) => {
  try {
    const lines = format === 'pdf' ? await pdfLines(buffer) : await docxLines(buffer);
    const text = lines.join('\n');
    if (text.length > MAX_TEXT) throw new ImportSizeError();
    process.send({ id, ok: true, text });
  } catch (error) {
    process.send({ id, ok: false, code: error instanceof ImportSizeError ? 'IMPORT_TOO_LONG' : 'IMPORT_UNREADABLE', message: 'Could not import the file.' });
  }
});
process.once('disconnect', () => process.exit(0));
process.send({ ready: true });
