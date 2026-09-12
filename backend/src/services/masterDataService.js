import MasterData from '../models/MasterData.js';
import { HttpError } from '../utils/errors.js';

const STUDENT_FIELD_CATEGORY = {
  college: 'campus',
  branch: 'branch',
  semester: 'semester',
  course: 'course',
};

const FIELD_LABEL = {
  college: 'Campus / College',
  branch: 'Branch',
  semester: 'Semester',
  course: 'Course',
};

const DEFAULT_MASTER_DATA = [
  { category: 'campus', name: 'GEU', code: 'GEU', order: 1 },
  { category: 'campus', name: 'GEHU', code: 'GEHU', order: 2 },
  { category: 'course', name: 'B.Tech', code: 'BTECH', order: 1 },
  { category: 'branch', name: 'Computer Science', code: 'CSE', order: 1 },
  ...Array.from({ length: 8 }, (_, index) => ({
    category: 'semester',
    name: String(index + 1),
    code: `SEM${index + 1}`,
    order: index + 1,
  })),
];

function normalize(category, value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (category === 'semester') return text.replace(/^semester\s*/i, '');
  return text.toLowerCase();
}

export async function loadStudentMasterMaps() {
  const entries = await MasterData.find({
    category: { $in: Object.values(STUDENT_FIELD_CATEGORY) },
    isActive: true,
  }).select('category name normalizedName').lean();
  const maps = Object.fromEntries(
    Object.values(STUDENT_FIELD_CATEGORY).map((category) => [category, new Map()]),
  );
  entries.forEach((entry) => {
    maps[entry.category].set(normalize(entry.category, entry.name), entry.name);
    maps[entry.category].set(normalize(entry.category, entry.normalizedName), entry.name);
  });
  return maps;
}

export function canonicalizeStudentMasterFields(fields, maps, { partial = false } = {}) {
  const result = {};
  Object.entries(STUDENT_FIELD_CATEGORY).forEach(([field, category]) => {
    const rawValue = fields?.[field];
    if (partial && (rawValue === undefined || rawValue === null || rawValue === '')) return;
    const key = normalize(category, rawValue);
    const canonical = maps[category]?.get(key);
    if (!canonical) {
      throw new HttpError(400, `${FIELD_LABEL[field]} "${String(rawValue || '').trim()}" is not available in Master Data.`);
    }
    result[field] = category === 'semester' ? Number(canonical) : canonical;
  });
  return result;
}

export async function resolveStudentMasterFields(fields, options) {
  const maps = await loadStudentMasterMaps();
  return canonicalizeStudentMasterFields(fields, maps, options);
}

export async function seedDefaultMasterData() {
  const operations = DEFAULT_MASTER_DATA.map((entry) => ({
    updateOne: {
      filter: { category: entry.category, normalizedName: normalize(entry.category, entry.name) },
      update: {
        $setOnInsert: { ...entry, normalizedName: normalize(entry.category, entry.name) },
        $set: { isActive: true },
      },
      upsert: true,
    },
  }));
  await MasterData.bulkWrite(operations, { ordered: false });
}
