import { invalidateAdminAnalyticsCache } from './adminAnalytics.cache.js';

let timer = null;
let pendingReasons = new Set();

export function scheduleAdminAnalyticsInvalidation(reason = 'analytics-source-write') {
  pendingReasons.add(reason);
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    pendingReasons = new Set();
    void invalidateAdminAnalyticsCache().catch((error) => {
      if (process.env.NODE_ENV !== 'test') console.warn(`[AdminAnalytics] Cache invalidation failed: ${error.message}`);
    });
  }, 100);
  timer.unref?.();
}

function updatePaths(update) {
  if (!update || Array.isArray(update) || typeof update !== 'object') return null;
  const paths = [];
  const visit = (value, prefix = '') => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    Object.entries(value).forEach(([key, child]) => {
      if (key.startsWith('$')) visit(child, prefix);
      else {
        const path = prefix ? `${prefix}.${key}` : key;
        paths.push(path);
        if (child && typeof child === 'object' && !Array.isArray(child)) visit(child, path);
      }
    });
  };
  visit(update);
  return paths;
}

function touchesRelevantPath(paths, relevantPaths) {
  if (paths === null) return true;
  return paths.some((path) => relevantPaths.some((relevant) => path === relevant || path.startsWith(`${relevant}.`) || relevant.startsWith(`${path}.`)));
}

export function attachAdminAnalyticsInvalidation(schema, {
  source,
  relevantPaths = [],
  documentFilter = () => true,
} = {}) {
  const reason = `${source || 'source'}-write`;
  schema.pre('save', function markAnalyticsInvalidation() {
    const relevant = this.isNew || touchesRelevantPath(this.modifiedPaths(), relevantPaths);
    this.$locals ||= {};
    this.$locals.invalidateAdminAnalytics = relevant && documentFilter(this);
  });
  schema.post('save', function invalidateAfterSave(doc) {
    if (doc?.$locals?.invalidateAdminAnalytics) scheduleAdminAnalyticsInvalidation(reason);
  });
  schema.post('insertMany', function invalidateAfterInsertMany(docs) {
    if ((docs || []).some((doc) => documentFilter(doc))) scheduleAdminAnalyticsInvalidation(reason);
  });

  const updateOperations = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'];
  updateOperations.forEach((operation) => {
    schema.pre(operation, function markAnalyticsQueryInvalidation() {
      this.__invalidateAdminAnalytics = operation === 'replaceOne'
        || touchesRelevantPath(updatePaths(this.getUpdate?.()), relevantPaths);
    });
    schema.post(operation, function invalidateAfterQueryWrite(result) {
      const changed = result && (result.modifiedCount > 0 || result.matchedCount > 0 || result._id || operation === 'findOneAndUpdate');
      if (this.__invalidateAdminAnalytics && changed) scheduleAdminAnalyticsInvalidation(reason);
    });
  });

  ['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((operation) => {
    schema.post(operation, function invalidateAfterDelete(result) {
      const changed = result && (result.deletedCount > 0 || result._id);
      if (changed) scheduleAdminAnalyticsInvalidation(reason);
    });
  });
  schema.post('bulkWrite', function invalidateAfterBulkWrite(result) {
    if (result) scheduleAdminAnalyticsInvalidation(reason);
  });
}

export function resetAdminAnalyticsInvalidationForTests() {
  if (timer) clearTimeout(timer);
  timer = null;
  pendingReasons = new Set();
}
