import mongoose from 'mongoose';
import MasterData, { MASTER_DATA_CATEGORIES } from '../models/MasterData.js';
import User from '../models/User.js';
import { HttpError } from '../utils/errors.js';
import { logActivity } from './adminActivityController.js';

const CATEGORY_FIELD = {
  campus: 'college',
  branch: 'branch',
  semester: 'semester',
  course: 'course',
};

function validateCategory(category) {
  if (!MASTER_DATA_CATEGORIES.includes(category)) {
    throw new HttpError(400, 'Invalid master-data category.');
  }
  return category;
}

function normalizeName(category, rawName) {
  const name = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new HttpError(400, 'Name is required.');
  if (category === 'semester') {
    const semester = Number(name.replace(/^semester\s*/i, ''));
    if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
      throw new HttpError(400, 'Semester must be an integer between 1 and 8.');
    }
    return String(semester);
  }
  return name;
}

function normalizedKey(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function usageByCategory() {
  const students = await User.find({ role: 'student' })
    .select('college branch semester course')
    .lean();
  const usage = Object.fromEntries(MASTER_DATA_CATEGORIES.map((category) => [category, new Map()]));
  students.forEach((student) => {
    Object.entries(CATEGORY_FIELD).forEach(([category, field]) => {
      const key = normalizedKey(student[field]);
      if (key) usage[category].set(key, (usage[category].get(key) || 0) + 1);
    });
  });
  return usage;
}

function serialize(entry, usage) {
  return {
    _id: entry._id,
    category: entry.category,
    name: entry.name,
    code: entry.code || '',
    order: entry.order || 0,
    isActive: entry.isActive !== false,
    studentCount: usage?.[entry.category]?.get(entry.normalizedName) || 0,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export async function listMasterData(req, res) {
  const category = req.query.category ? validateCategory(String(req.query.category)) : null;
  const query = category ? { category } : {};
  if (req.query.active === 'true') query.isActive = true;
  const [entries, usage] = await Promise.all([
    MasterData.find(query).sort({ category: 1, order: 1, name: 1 }).lean(),
    usageByCategory(),
  ]);
  res.json({
    entries: entries.map((entry) => serialize(entry, usage)),
    categories: MASTER_DATA_CATEGORIES,
  });
}

export async function createMasterData(req, res) {
  const category = validateCategory(String(req.body?.category || ''));
  const name = normalizeName(category, req.body?.name);
  try {
    const entry = await MasterData.create({
      category,
      name,
      normalizedName: normalizedKey(name),
      code: String(req.body?.code || '').trim(),
      order: Number(req.body?.order) || 0,
      isActive: req.body?.isActive !== false,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'CREATE',
      targetType: 'MASTER_DATA',
      targetId: String(entry._id),
      description: `Created ${category} master value: ${entry.name}`,
      metadata: { category, name: entry.name },
      req,
    });
    res.status(201).json({ entry: serialize(entry.toObject()) });
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, `This ${category} already exists.`);
    throw error;
  }
}

export async function updateMasterData(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid master-data ID.');
  const entry = await MasterData.findById(req.params.id);
  if (!entry) throw new HttpError(404, 'Master-data value not found.');
  const previousName = entry.name;
  const field = CATEGORY_FIELD[entry.category];
  const assignedValue = entry.category === 'semester'
    ? Number(previousName)
    : new RegExp(`^${previousName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (req.body?.isActive === false && entry.isActive !== false) {
    const studentCount = await User.countDocuments({ role: 'student', [field]: assignedValue });
    if (studentCount > 0) {
      throw new HttpError(409, `This value is assigned to ${studentCount} students and cannot be deactivated.`);
    }
  }
  const name = req.body?.name === undefined
    ? entry.name
    : normalizeName(entry.category, req.body.name);
  entry.name = name;
  entry.normalizedName = normalizedKey(name);
  if (req.body?.code !== undefined) entry.code = String(req.body.code || '').trim();
  if (req.body?.order !== undefined) entry.order = Number(req.body.order) || 0;
  if (req.body?.isActive !== undefined) entry.isActive = Boolean(req.body.isActive);
  entry.updatedBy = req.user._id;
  try {
    await entry.save();
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, `This ${entry.category} already exists.`);
    throw error;
  }

  let updatedStudents = 0;
  if (previousName !== entry.name) {
    const oldValue = entry.category === 'semester' ? Number(previousName) : new RegExp(`^${previousName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const result = await User.updateMany({ role: 'student', [field]: oldValue }, { $set: { [field]: entry.category === 'semester' ? Number(entry.name) : entry.name } });
    updatedStudents = result.modifiedCount || 0;
  }
  res.json({ entry: serialize(entry.toObject()), updatedStudents });
}

export async function deleteMasterData(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid master-data ID.');
  const entry = await MasterData.findById(req.params.id);
  if (!entry) throw new HttpError(404, 'Master-data value not found.');
  const field = CATEGORY_FIELD[entry.category];
  const value = entry.category === 'semester'
    ? Number(entry.name)
    : new RegExp(`^${entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const studentCount = await User.countDocuments({ role: 'student', [field]: value });
  if (studentCount > 0) {
    throw new HttpError(409, `This value is assigned to ${studentCount} students. Reassign those students before deleting it.`);
  }
  await entry.deleteOne();
  res.json({ deleted: true, deactivated: false, studentCount: 0 });
}

export async function syncMasterDataFromStudents(req, res) {
  const students = await User.find({ role: 'student' })
    .select('college branch semester course')
    .lean();
  const values = new Map();
  students.forEach((student) => {
    Object.entries(CATEGORY_FIELD).forEach(([category, field]) => {
      const raw = student[field];
      if (raw === undefined || raw === null || String(raw).trim() === '') return;
      const name = normalizeName(category, raw);
      const key = `${category}:${normalizedKey(name)}`;
      if (!values.has(key)) values.set(key, { category, name });
    });
  });
  const operations = [...values.values()].map(({ category, name }) => ({
    updateOne: {
      filter: { category, normalizedName: normalizedKey(name) },
      update: {
        $setOnInsert: {
          category,
          name,
          normalizedName: normalizedKey(name),
          order: category === 'semester' ? Number(name) : 0,
          createdBy: req.user._id,
        },
        $set: { isActive: true, updatedBy: req.user._id },
      },
      upsert: true,
    },
  }));
  const result = operations.length ? await MasterData.bulkWrite(operations) : null;
  res.json({
    discovered: operations.length,
    created: result?.upsertedCount || 0,
    matched: result?.matchedCount || 0,
  });
}
