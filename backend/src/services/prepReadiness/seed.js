// Default Prep Readiness policy: 70 canonical coding topics with a weight and a target per track.
// Source: "PBC_SBC_Readiness_Formula_and_Topic_Weights.docx" and the "Overall Target Points &
// Readiness Thresholds" workbook, with the corrections from the 2026-11 product brief:
//   - SBC Hard multiplier 2.5 (was 1.0), so a Hard solve earns at least a Medium's topic credit.
//   - Memoization SBC target 5 (the workbook had 0 while its SBC weight is 1).
// Row: [key, label, category, pbcWeight, pbcTarget, sbcWeight, sbcTarget]
// Keys are stable internal IDs; labels can change without touching stored evidence.

export const CATEGORIES = Object.freeze([
  { key: 'core', label: 'Core Fundamentals & SBC Essentials' },
  { key: 'patterns', label: 'Core DSA Patterns' },
  { key: 'high-signal', label: 'High-Signal PBC Topics' },
  { key: 'mid-tier', label: 'Mid-Tier & Situational Topics' },
  { key: 'advanced', label: 'Advanced / Competitive & Niche Topics' },
]);

const ROWS = [
  ['core', [
    ['array', 'Array', 5, 30, 5, 30],
    ['string', 'String', 5, 25, 5, 30],
    ['hash-table', 'Hash Table', 5, 25, 5, 20],
    ['sorting', 'Sorting', 4, 15, 5, 20],
    ['math', 'Math', 3, 15, 5, 25],
    ['general-programming', 'General Programming', 2, 10, 5, 25],
    ['simulation', 'Simulation', 3, 12, 5, 20],
    ['counting', 'Counting', 3, 10, 4, 15],
    ['database', 'Database', 2, 10, 5, 30],
  ]],
  ['patterns', [
    ['binary-search', 'Binary Search', 5, 25, 4, 15],
    ['two-pointers', 'Two Pointers', 5, 20, 4, 15],
    ['sliding-window', 'Sliding Window', 5, 20, 3, 12],
    ['prefix-sum', 'Prefix Sum', 4, 15, 3, 12],
    ['linked-list', 'Linked List', 4, 20, 4, 18],
    ['stack', 'Stack', 4, 18, 4, 15],
    ['queue', 'Queue', 3, 10, 4, 12],
    ['recursion', 'Recursion', 4, 15, 4, 15],
    ['greedy', 'Greedy', 5, 25, 3, 12],
    ['heap', 'Heap (Priority Queue)', 5, 20, 2, 8],
  ]],
  ['high-signal', [
    ['dynamic-programming', 'Dynamic Programming', 5, 40, 2, 10],
    ['graph', 'Graph', 5, 30, 2, 8],
    ['tree', 'Tree', 5, 25, 3, 12],
    ['binary-tree', 'Binary Tree', 5, 25, 3, 12],
    ['binary-search-tree', 'Binary Search Tree', 4, 18, 3, 10],
    ['breadth-first-search', 'Breadth-First Search', 5, 25, 2, 8],
    ['depth-first-search', 'Depth-First Search', 5, 25, 2, 8],
    ['backtracking', 'Backtracking', 5, 20, 2, 8],
    ['union-find', 'Union-Find', 4, 16, 0, 0],
    ['trie', 'Trie', 4, 14, 0, 0],
    ['design', 'Design', 4, 18, 1, 6],
    ['monotonic-stack', 'Monotonic Stack', 4, 16, 1, 5],
    ['topological-sort', 'Topological Sort', 4, 14, 0, 0],
    ['shortest-path', 'Shortest Path', 4, 16, 0, 0],
    ['memoization', 'Memoization', 4, 16, 1, 5],
  ]],
  ['mid-tier', [
    ['matrix', 'Matrix', 4, 16, 3, 12],
    ['bit-manipulation', 'Bit Manipulation', 3, 14, 2, 8],
    ['divide-and-conquer', 'Divide and Conquer', 3, 12, 2, 6],
    ['merge-sort', 'Merge Sort', 3, 10, 2, 6],
    ['quickselect', 'Quickselect', 3, 8, 1, 4],
    ['doubly-linked-list', 'Doubly-Linked List', 3, 8, 2, 6],
    ['ordered-set', 'Ordered Set', 3, 10, 1, 4],
    ['data-stream', 'Data Stream', 3, 10, 0, 0],
    ['iterator', 'Iterator', 2, 8, 1, 4],
    ['monotonic-queue', 'Monotonic Queue', 3, 10, 0, 0],
    ['string-matching', 'String Matching', 3, 10, 2, 6],
    ['counting-sort', 'Counting Sort', 2, 6, 2, 6],
    ['bucket-sort', 'Bucket Sort', 2, 6, 1, 4],
    ['radix-sort', 'Radix Sort', 1, 4, 1, 4],
    ['number-theory', 'Number Theory', 3, 10, 2, 8],
    ['combinatorics', 'Combinatorics', 2, 8, 1, 4],
    ['probability-and-statistics', 'Probability and Statistics', 2, 6, 1, 4],
    ['brainteaser', 'Brainteaser', 2, 6, 2, 6],
  ]],
  ['advanced', [
    ['segment-tree', 'Segment Tree', 2, 10, 0, 0],
    ['binary-indexed-tree', 'Binary Indexed Tree', 2, 8, 0, 0],
    ['bitmask', 'Bitmask', 2, 10, 0, 0],
    ['line-sweep', 'Line Sweep', 2, 8, 0, 0],
    ['rolling-hash', 'Rolling Hash', 2, 8, 0, 0],
    ['minimum-spanning-tree', 'Minimum Spanning Tree', 2, 8, 0, 0],
    ['strongly-connected-component', 'Strongly Connected Component', 1, 6, 0, 0],
    ['biconnected-component', 'Biconnected Component', 1, 4, 0, 0],
    ['eulerian-circuit', 'Eulerian Circuit', 1, 4, 0, 0],
    ['suffix-array', 'Suffix Array', 1, 6, 0, 0],
    ['game-theory', 'Game Theory', 1, 6, 0, 0],
    ['geometry', 'Geometry', 1, 6, 0, 0],
    ['enumeration', 'Enumeration', 2, 8, 1, 6],
    ['hash-function', 'Hash Function', 1, 4, 0, 0],
    ['interactive', 'Interactive', 1, 4, 0, 0],
    ['randomized', 'Randomized', 1, 4, 0, 0],
    ['rejection-sampling', 'Rejection Sampling', 1, 4, 0, 0],
    ['reservoir-sampling', 'Reservoir Sampling', 1, 4, 0, 0],
  ]],
];

/** Priority 1–5 (5 = highest) per track, initialised from the active weight; 0 when excluded. */
const priorityFrom = (weight) => (weight > 0 ? Math.max(1, Math.min(5, Math.round(weight))) : 0);

export const SEED_TOPICS = Object.freeze(ROWS.flatMap(([category, rows]) => rows.map(([key, label, pbcWeight, pbcTarget, sbcWeight, sbcTarget]) => Object.freeze({
  key, label, category,
  pbc: Object.freeze({ weight: pbcWeight, target: pbcTarget, priority: priorityFrom(pbcWeight) }),
  sbc: Object.freeze({ weight: sbcWeight, target: sbcTarget, priority: priorityFrom(sbcWeight) }),
}))));

export const TRACKS = Object.freeze({
  sbc: Object.freeze({ key: 'sbc', label: 'Service-Based Company', short: 'SBC', cutoff: 70, multipliers: Object.freeze({ Easy: 1.5, Medium: 2.5, Hard: 2.5 }) }),
  pbc: Object.freeze({ key: 'pbc', label: 'Product-Based Company', short: 'PBC', cutoff: 75, multipliers: Object.freeze({ Easy: 0.5, Medium: 2.0, Hard: 4.0 }) }),
});
export const TRACK_KEYS = Object.freeze(['sbc', 'pbc']);

// Expected sums for the default seed (validation only; live denominators come from the policy).
export const SEED_TOTALS = Object.freeze({ pbc: { weight: 215, target: 932 }, sbc: { weight: 128, target: 539 } });

/**
 * Tag aliases → canonical key. Matching first normalises case, punctuation and spacing
 * (normaliseTag), so "Union Find", "union-find" and "UNION_FIND" all meet here.
 * Distinct topics stay distinct: Tree ≠ Binary Tree ≠ BST, Graph ≠ BFS ≠ DFS, DP ≠ Memoization.
 */
export const TOPIC_ALIASES = Object.freeze({
  strings: 'string',
  sort: 'sorting',
  'hash map': 'hash-table', hashmap: 'hash-table', hashing: 'hash-table', 'hash table': 'hash-table',
  'union find': 'union-find', 'disjoint set': 'union-find', 'disjoint set union': 'union-find', dsu: 'union-find',
  graphs: 'graph', 'graph theory': 'graph',
  dp: 'dynamic-programming',
  bfs: 'breadth-first-search', 'breadth first search': 'breadth-first-search',
  dfs: 'depth-first-search', 'depth first search': 'depth-first-search',
  bst: 'binary-search-tree',
  heap: 'heap', 'priority queue': 'heap', 'heap priority queue': 'heap', heaps: 'heap',
  'two pointer': 'two-pointers',
  'linked lists': 'linked-list',
  'doubly linked list': 'doubly-linked-list',
  // "BIT" is ambiguous (bit manipulation vs Binary Indexed Tree), so it is deliberately not an alias.
  'fenwick tree': 'binary-indexed-tree',
  trees: 'tree',
  'binary trees': 'binary-tree',
  'topological sorting': 'topological-sort',
  'shortest paths': 'shortest-path',
  'sql': 'database',
  'number theory': 'number-theory',
  'probability': 'probability-and-statistics', statistics: 'probability-and-statistics',
  'brain teaser': 'brainteaser',
});
