export function normalizeRichText(value) {
  const normalized = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, '_$1_')
    .replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<li>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<\/(?:p|div|ul|ol)>/gi, '\n\n')
    .replace(/<(?:p|div|ul|ol|span)[^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n');

  let implicitList = false;
  return normalized.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (implicitList && /^(?:return|given|input|output|example|constraints?)\b/i.test(trimmed)) implicitList = false;
    const rendered = implicitList && !/^[-*]\s/.test(trimmed) ? `- ${trimmed}` : line;
    if (/(?:either|following|conditions?|requirements?)\s*:\s*$/i.test(trimmed)) implicitList = true;
    return rendered;
  }).join('\n');
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
