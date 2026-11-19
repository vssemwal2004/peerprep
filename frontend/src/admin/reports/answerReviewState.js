// The colour rule for an MCQ option in the admin report (see AnswerReview.jsx).

/** Index list from the report row (list field, else the older single-index field). */
export function indexList(list, single) {
  if (Array.isArray(list)) return list.map(Number).filter(Number.isInteger);
  const value = Number(single);
  return single !== null && single !== undefined && single !== '' && Number.isInteger(value) ? [value] : [];
}

/** 'hit' = correct and chosen (deep green), 'key' = correct (green), 'miss' = chosen but wrong (red), 'plain'. */
export function optionState(index, correct, chosen) {
  const isCorrect = correct.includes(index);
  const isChosen = chosen.includes(index);
  if (isCorrect && isChosen) return 'hit';
  if (isCorrect) return 'key';
  if (isChosen) return 'miss';
  return 'plain';
}
