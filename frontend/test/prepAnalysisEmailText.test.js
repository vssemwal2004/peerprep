import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { emailTextToHtml, htmlToEmailText } from '../src/admin/prepAnalysis/components/emailText.js';

const parser = new new JSDOM('').window.DOMParser();
const TEXT = `# Step up to your first Medium

Hi {{firstName}},

Well done on solving problems.
Placement rounds ask Medium questions.

- Solve one Medium problem
- Write down your approach

[Try a Medium problem]({{dashboardUrl}})

Keep going & good luck.`;

test('plain text becomes the standard email layout and reads back as the same text', () => {
  const html = emailTextToHtml(TEXT, { eyebrow: 'PeerPrep · Prep Coding', accent: '#4f46e5' });
  assert.match(html, /data-pp="title"[^>]*>Step up to your first Medium</);
  assert.match(html, /<li style="margin:4px 0;">Solve one Medium problem<\/li>/);
  assert.match(html, /data-pp="button" href="\{\{dashboardUrl\}\}"[^>]*>Try a Medium problem</);
  assert.match(html, /Well done on solving problems\.<br>Placement rounds/, 'a single line break stays a line break');
  assert.match(html, /Keep going &amp; good luck\./, 'text is escaped');
  assert.match(html, /background-color:#4f46e5/);
  const back = htmlToEmailText(html, parser);
  assert.equal(back.text, TEXT);
  assert.deepEqual(back.meta, { eyebrow: 'PeerPrep · Prep Coding', accent: '#4f46e5' });
});

test('a custom-designed HTML email has no text form', () => {
  assert.equal(htmlToEmailText('<p>Dear {{name}}, hello</p>', parser), null);
  assert.equal(htmlToEmailText('', parser), null);
});

test('markup typed into the text is shown as text, never run as HTML', () => {
  const html = emailTextToHtml('# Hi\n\n<script>alert(1)</script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
