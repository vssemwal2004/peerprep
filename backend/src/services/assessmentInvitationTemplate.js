import sanitizeHtml from 'sanitize-html';

const allowedTags = [
  ...sanitizeHtml.defaults.allowedTags,
  'div', 'span', 'h1', 'h2', 'h3', 'h4', 'img', 'table', 'thead', 'tbody', 'tfoot',
  'tr', 'th', 'td', 'center', 'section', 'header', 'footer',
];

const allowedAttributes = {
  '*': ['style', 'class', 'align', 'valign', 'width', 'height', 'role', 'cellpadding', 'cellspacing', 'border'],
  a: ['href', 'target', 'title', 'style', 'class'],
  img: ['src', 'alt', 'width', 'height', 'style', 'class'],
};

export function normalizeAssessmentInvitationHtml(value) {
  let html = String(value ?? '').trim();
  // Earlier requests passed through xss-clean, which stored tags as &lt;div&gt;.
  if (/&lt;\s*\/?\s*(?:div|table|p|span|h[1-6]|a|img)\b/i.test(html)) {
    html = html.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  }
  if (/<\s*(?:script|iframe|object|embed|form|input|svg|math)\b|\bon\w+\s*=|javascript\s*:|data\s*:|expression\s*\(|url\s*\(|@import|@supports/i.test(html)) {
    throw new Error('Remove scripts, embedded content, event handlers, and unsafe URLs from the email HTML.');
  }
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes,
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    enforceHtmlBoundary: true,
  });
}

export function validateAssessmentInvitationTemplate(input) {
  const subject = String(input?.subject || '').trim();
  const source = String(input?.htmlContent || '').trim();
  if (!subject || subject.length > 250) throw new Error('Subject is required and must be under 250 characters.');
  if (!source || source.length > 50000) throw new Error('Email HTML is required and must be under 50,000 characters.');
  const htmlContent = normalizeAssessmentInvitationHtml(source);
  if (!htmlContent.includes('{{credentialsSection}}') || !htmlContent.includes('{{passwordSection}}')) {
    throw new Error('Keep {{credentialsSection}} and {{passwordSection}} in the email so students receive required access details.');
  }
  return { subject, htmlContent };
}
