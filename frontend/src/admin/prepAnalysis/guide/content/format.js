// Small text helpers for guide steps (numbers as the page shows them).
export const num = (value) => Number(value || 0).toLocaleString();
export const plural = (count, word, many = `${word}s`) => `${num(count)} ${Number(count) === 1 ? word : many}`;
export const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
export const maxBy = (list, read) => list.reduce((best, item) => (best === null || read(item) > read(best) ? item : best), null);
export const minBy = (list, read) => list.reduce((best, item) => (best === null || read(item) < read(best) ? item : best), null);
export const indexOfMax = (list, read) => list.reduce((best, item, index) => (best === -1 || read(item) > read(list[best]) ? index : best), -1);
