import { HttpError } from './errors.js';

const checked = new WeakMap();
export async function requireEngagementUniqueIndex(model, fields) {
  if (process.env.NODE_ENV !== 'production') return;
  const previous = checked.get(model.collection);
  if (previous && Date.now() - previous < 30000) return;
  let indexes = [];
  try { indexes = await model.collection.listIndexes().toArray(); } catch (error) { if (error.code !== 26) throw error; }
  if (!indexes.some((index) => index.unique && JSON.stringify(index.key) === JSON.stringify(fields))) {
    throw new HttpError(503, 'Challenge rewards require the student-engagement index migration. Ask your administrator to run it.');
  }
  checked.set(model.collection, Date.now());
}
