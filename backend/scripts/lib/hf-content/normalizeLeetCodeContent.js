const TRUSTED_IMAGE_HOSTS = [
  'leetcode.com',
  'leetcode.cn',
  'leetcodeusercontent.com',
  's3-lc-upload.s3.amazonaws.com',
];

const SOURCE_FIELDS = Object.freeze({
  direct: [
    'title', 'title_slug', 'frontend_id', 'id', 'url', 'difficulty', 'category',
    'content', 'example_test_cases', 'topic_tags', 'code_snippets', 'solutions',
    'is_paid_only', 'acceptance_rate', 'total_accepted', 'total_submissions',
  ],
  absent: ['company_tags', 'hints', 'anvi_approaches', 'editorial', 'hidden_test_cases'],
});

function cleanScalar(value = '') {
  return Buffer.from(String(value || ''), 'utf8').toString('utf8').replace(/\r\n/g, '\n');
}

export function decodeHtml(value = '') {
  const named = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
    le: '<=', ge: '>=', minus: '-', times: 'x', ndash: '-', mdash: '-',
  };
  return cleanScalar(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, token) => {
    if (token[0] === '#') {
      const radix = token[1]?.toLowerCase() === 'x' ? 16 : 10;
      const raw = radix === 16 ? token.slice(2) : token.slice(1);
      const codePoint = Number.parseInt(raw, radix);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return named[token.toLowerCase()] ?? entity;
  });
}

function attribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

function numericDimension(tag, name) {
  const direct = Number.parseInt(attribute(tag, name), 10);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = attribute(tag, 'style').match(new RegExp(`${name}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'i'));
  return match ? Math.max(1, Math.round(Number(match[1]))) : undefined;
}

export function normalizeLeetCodeImageUrl(value = '') {
  const raw = decodeHtml(value).trim();
  if (!raw || raw.startsWith('data:')) return '';
  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw, 'https://leetcode.com/');
    if (url.protocol !== 'https:') return '';
    const hostname = url.hostname.toLowerCase();
    const trusted = TRUSTED_IMAGE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    const imagePath = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(`${url.pathname}${url.search}`);
    return trusted && imagePath ? url.toString() : '';
  } catch {
    return '';
  }
}

export function htmlToPeerPrepText(value = '') {
  return decodeHtml(cleanScalar(value)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '_$1_')
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, '^$1')
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, '_$1')
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<a\b[^>]*href=(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, '$3')
    .replace(/<\/(?:p|div|ul|ol|pre|table|tr|h[1-6])>/gi, '\n\n')
    .replace(/<(?:p|div|ul|ol|pre|table|tbody|thead|tr|td|th|h[1-6])\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ''))
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n{2,}(?=- )/g, '\n')
    .trim();
}

function markers(content = '') {
  const html = cleanScalar(content);
  const examples = [...html.matchAll(/<strong\b[^>]*>\s*Example\s+(\d+)\s*:\s*<\/strong>/gi)]
    .map((match) => ({ index: match.index, number: Number(match[1]) }));
  const constraints = /<strong\b[^>]*>\s*Constraints\s*:?\s*<\/strong>/i.exec(html);
  return { html, examples, constraintsIndex: constraints?.index ?? -1, constraintsEnd: constraints ? constraints.index + constraints[0].length : -1 };
}

function nextSupplementalSectionIndex(html, fromIndex) {
  const tail = html.slice(fromIndex);
  const match = /<strong\b[^>]*>\s*(?:Follow[- ]?up|Note|Related Topics?)\s*:?\s*<\/strong>/i.exec(tail);
  return match ? fromIndex + match.index : html.length;
}

export function extractDescription(content = '') {
  const { html, examples, constraintsIndex } = markers(content);
  const boundaries = [examples[0]?.index, constraintsIndex].filter((index) => Number.isInteger(index) && index >= 0);
  return htmlToPeerPrepText(boundaries.length ? html.slice(0, Math.min(...boundaries)) : html);
}

export function extractConstraints(content = '') {
  const { html, constraintsEnd } = markers(content);
  if (constraintsEnd < 0) return '';
  const end = nextSupplementalSectionIndex(html, constraintsEnd);
  return htmlToPeerPrepText(html.slice(constraintsEnd, end))
    .replace(/^\*\*Constraints\s*:?\*\*\s*/i, '')
    .trim();
}

function parseExampleSegment(segment, number) {
  const text = htmlToPeerPrepText(segment)
    .replace(/^\*\*Example\s+\d+\s*:\*\*\s*/i, '')
    .trim();
  const input = /(?:\*\*)?Input\s*:?(?:\*\*)?\s*([\s\S]*?)(?=\n(?:\*\*)?Output\s*:?(?:\*\*)?|$)/i.exec(text)?.[1]?.trim() || '';
  const output = /(?:\*\*)?Output\s*:?(?:\*\*)?\s*([\s\S]*?)(?=\n(?:\*\*)?(?:Explanation|Constraints)\s*:?(?:\*\*)?|$)/i.exec(text)?.[1]?.trim() || '';
  const explanation = /(?:\*\*)?Explanation\s*:?(?:\*\*)?\s*([\s\S]*?)$/i.exec(text)?.[1]?.trim() || '';
  return { position: number, input, output, explanation, images: [], marks: 1 };
}

export function extractExamples(content = '') {
  const { html, examples, constraintsIndex } = markers(content);
  return examples.map((marker, index) => {
    const followingExample = examples[index + 1]?.index ?? html.length;
    const end = constraintsIndex >= 0 ? Math.min(followingExample, constraintsIndex) : followingExample;
    return parseExampleSegment(html.slice(marker.index, end), marker.number);
  }).filter((example) => example.input || example.output || example.explanation);
}

export function extractImageCandidates(content = '', title = '') {
  const { html, examples, constraintsIndex } = markers(content);
  const seen = new Set();
  return [...html.matchAll(/<img\b[^>]*>/gi)].flatMap((match, ordinal) => {
    const tag = match[0];
    const sourceUrl = normalizeLeetCodeImageUrl(attribute(tag, 'src') || attribute(tag, 'data-src'));
    if (!sourceUrl) return [];
    const previousExample = [...examples].reverse().find((example) => example.index < match.index);
    const nextExample = examples.find((example) => example.index > match.index);
    const inExample = previousExample && (!nextExample || match.index < nextExample.index)
      && (constraintsIndex < 0 || match.index < constraintsIndex);
    const section = constraintsIndex >= 0 && match.index > constraintsIndex
      ? 'constraints'
      : (inExample ? 'example' : 'description');
    const exampleNumber = section === 'example' ? previousExample.number : null;
    const key = `${sourceUrl}\u0000${section}\u0000${exampleNumber || ''}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const alt = attribute(tag, 'alt') || `${String(title || 'Problem').trim()} ${section === 'example' ? `example ${exampleNumber}` : section} diagram`;
    return [{
      sourceUrl,
      alt: alt.slice(0, 500),
      caption: '',
      width: numericDimension(tag, 'width'),
      height: numericDimension(tag, 'height'),
      section,
      exampleNumber,
      position: ordinal,
      // The importer must populate url/publicId only after a successful managed-media upload.
      url: '',
      publicId: '',
    }];
  });
}

function uniqueText(values = [], maxLength = 80) {
  const seen = new Set();
  return values.flatMap((value) => {
    const clean = cleanScalar(value).trim().replace(/\s+/g, ' ').slice(0, maxLength);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return [];
    seen.add(key);
    return [clean];
  });
}

function sourceExampleInputs(value = '') {
  return cleanScalar(value).split('\n').map((line) => line.trim()).filter(Boolean);
}

export function normalizeLeetCodeContent(row = {}) {
  const title = cleanScalar(row.title).trim().slice(0, 200);
  const description = extractDescription(row.content);
  const constraints = extractConstraints(row.content);
  const examples = extractExamples(row.content);
  const imageCandidates = extractImageCandidates(row.content, title);
  const fallbackInputs = sourceExampleInputs(row.example_test_cases);
  const sourceInputs = examples.map((example) => example.input);
  const tags = uniqueText(Array.isArray(row.topic_tags) ? row.topic_tags : []);
  const difficulty = ['Easy', 'Medium', 'Hard'].includes(row.difficulty) ? row.difficulty : '';
  const category = String(row.category || '').toLowerCase() === 'database' ? 'SQL' : 'DSA';

  const errors = [];
  const review = ['source-license-unknown'];
  if (!title) errors.push('missing-title');
  if (!description) errors.push('missing-description');
  if (!difficulty) errors.push('invalid-difficulty');
  if (!constraints && category !== 'SQL') errors.push('missing-constraints');
  if (!tags.length) errors.push('missing-topic-tags');
  if (!examples.length) errors.push('missing-structured-examples');
  if (examples.some((example) => !example.input || !example.output)) errors.push('incomplete-example-io');
  if (examples.some((example) => !example.explanation)) review.push('example-explanation-missing');
  if (fallbackInputs.length && sourceInputs.length !== fallbackInputs.length) review.push('example-count-mismatch');
  if (!Array.isArray(row.solutions) || !row.solutions.some((solution) => String(solution?.typed_code || '').trim())) {
    review.push('accepted-solution-unavailable');
  }
  if (row.is_paid_only) review.push('premium-source-rights-review');

  return {
    title,
    slug: cleanScalar(row.title_slug).trim().toLowerCase(),
    externalId: cleanScalar(row.frontend_id || row.id).trim(),
    sourceUrl: cleanScalar(row.url).trim(),
    description,
    constraints,
    difficulty,
    category,
    tags,
    sampleTestCases: examples,
    imageCandidates,
    companyTags: [],
    editorial: '',
    hints: [],
    faqs: [],
    provenance: {
      dataset: 'whiskwhite/leetcode-complete',
      license: 'unknown; dataset card requires compliance with LeetCode terms',
      sourceFields: SOURCE_FIELDS,
      derivedFields: ['description', 'constraints', 'sampleTestCases', 'imageCandidates'],
      intentionallyUnset: {
        companyTags: 'No verified company-tag field exists in this dataset.',
        editorial: 'Solution code is not an authored prose editorial.',
        hints: 'The dataset has no approved AnvI approaches.',
        hiddenTestCases: 'example_test_cases are public samples, not hidden validation cases.',
      },
    },
    validation: { errors, review, contentReady: errors.length === 0 },
  };
}

export function attachUploadedImages(content, uploadedBySourceUrl = new Map()) {
  const result = structuredClone(content);
  result.imageCandidates = (result.imageCandidates || []).map((candidate) => {
    const uploaded = uploadedBySourceUrl instanceof Map
      ? uploadedBySourceUrl.get(candidate.sourceUrl)
      : uploadedBySourceUrl?.[candidate.sourceUrl];
    return uploaded?.url && /^https:\/\//i.test(uploaded.url) ? { ...candidate, ...uploaded } : candidate;
  });
  const media = result.imageCandidates.filter((candidate) => candidate.url && /^https:\/\//i.test(candidate.url));
  result.contentImages = media.filter((image) => image.section !== 'example').map(({ exampleNumber, ...image }) => image);
  result.sampleTestCases = (result.sampleTestCases || []).map((example) => ({
    ...example,
    images: media.filter((image) => image.section === 'example' && image.exampleNumber === example.position)
      .map(({ section, exampleNumber, ...image }) => image),
  }));
  result.validation.mediaReady = media.length === (result.imageCandidates || []).length;
  if (!result.validation.mediaReady) result.validation.review = [...result.validation.review, 'image-upload-incomplete'];
  return result;
}

export function contentPublicationGate(content = {}, { requireTenApproaches = true } = {}) {
  const blockers = [...(content.validation?.errors || [])];
  if ((content.imageCandidates || []).some((image) => !image.url)) blockers.push('images-not-mirrored');
  if ((content.sampleTestCases || []).some((example) => !example.explanation)) blockers.push('example-explanations-unreviewed');
  if (!String(content.editorial || '').trim()) blockers.push('editorial-unreviewed');
  const approachCount = Array.isArray(content.hints) ? content.hints.filter((hint) => String(hint || '').trim()).length : 0;
  if (requireTenApproaches && approachCount !== 10) blockers.push('ten-anvi-approaches-not-approved');
  return { publishable: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export { SOURCE_FIELDS, TRUSTED_IMAGE_HOSTS };
