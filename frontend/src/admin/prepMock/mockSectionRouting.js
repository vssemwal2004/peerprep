const DEFAULT_SECTION_NAMES = {
  mcq: 'MCQ Questions',
  short: 'Short Questions',
  one_line: 'One-word Questions',
  coding: 'Coding Questions',
};

// An explicit choice only accepts questions of its type. Automatic imports use the
// standard section, even when a custom section of the same type appears first.
export function mockQuestionSectionIndex(sections, type, targetIndex = -1) {
  const chosen = sections[Number(targetIndex)];
  if (Number.isInteger(Number(targetIndex)) && Number(targetIndex) >= 0 && chosen?.type === type) {
    return Number(targetIndex);
  }
  const defaultName = DEFAULT_SECTION_NAMES[type];
  return defaultName
    ? sections.findIndex((section) => section.type === type && section.sectionName === defaultName)
    : -1;
}

export function mockSectionNameExists(sections, name) {
  const normalized = String(name || '').trim().toLocaleLowerCase();
  return sections.some((section) => String(section.sectionName || '').trim().toLocaleLowerCase() === normalized);
}
