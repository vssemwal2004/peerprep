function cleanTitle(value) {
  return String(value || 'Problem').trim().replace(/\s+/g, ' ') || 'Problem';
}

export function deriveLegacyImageAlt({ title, owner = 'problem', section = 'description', samplePosition = 1 } = {}) {
  const prefix = cleanTitle(title);
  if (owner === 'sample') {
    const position = Math.max(1, Number(samplePosition) || 1);
    return `${prefix} example ${position} diagram`.slice(0, 500);
  }
  return `${prefix} ${section === 'constraints' ? 'constraints' : 'description'} diagram`.slice(0, 500);
}

export function fillMissingImageAlt(images, context = {}) {
  let changed = 0;
  const patched = (Array.isArray(images) ? images : []).map((image) => {
    if (String(image?.alt || '').trim()) return image;
    changed += 1;
    return {
      ...image,
      alt: deriveLegacyImageAlt(context),
    };
  });
  return { images: patched, changed };
}

