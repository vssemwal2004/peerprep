function normalizeText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n');
}

export function parseBulkCases(content, delimiter = '###CASE###') {
  const normalizedContent = normalizeText(content);
  const normalizedDelimiter = String(delimiter || '').trim();

  if (!normalizedDelimiter) {
    return [normalizedContent];
  }

  const chunks = normalizedContent
    .split(normalizedDelimiter)
    .map((chunk) => chunk.replace(/^\n+|\n+$/g, ''))
    .filter((chunk) => chunk.length > 0);

  return chunks.length > 0 ? chunks : [normalizedContent];
}

export function parseBulkCasePair(inputsContent, outputsContent, delimiter = '###CASE###') {
  const inputs = parseBulkCases(inputsContent, delimiter);
  const outputs = parseBulkCases(outputsContent, delimiter);

  if (inputs.length !== outputs.length) {
    throw new Error(`Input/output testcase count mismatch (${inputs.length} inputs vs ${outputs.length} outputs).`);
  }

  return inputs.map((input, index) => ({
    position: index + 1,
    input,
    output: outputs[index],
  }));
}
