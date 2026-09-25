import mongoose from "mongoose";
import AIInterview from "../models/AIInterview.js";
import Resource from "../models/AIInterviewResource.js";
import QuestionLibrary from "../models/QuestionLibrary.js";
import {
  AuthoringError,
  CAPABILITIES,
  cleanText,
  normalizedName,
  normalizeDefinition,
  normalizeProfile,
  inspectDefinition,
  literalSearch,
} from "../services/aiInterviewDefinition.js";

const error = (status, code, message, details) => {
  throw new AuthoringError(status, code, message, details);
};
const objectId = (value) => {
  if (!mongoose.isValidObjectId(value))
    error(400, "INVALID_IDENTIFIER", "Invalid identifier.");
  return value;
};
const owner = (req) => ({ ownerId: req.user._id });
const filter = (req) => ({ ...owner(req), _id: objectId(req.params.id) });
const revision = (req) => {
  const n = req.body?.revision;
  if (!Number.isSafeInteger(n) || n < 1)
    error(400, "REVISION_REQUIRED", "A valid saved revision is required.");
  return n;
};
const key = (req) => {
  const value = req.get("Idempotency-Key");
  if (!value || !/^[a-zA-Z0-9_-]{8,100}$/.test(value))
    error(
      400,
      "IDEMPOTENCY_REQUIRED",
      "A valid creation request key is required.",
    );
  return value;
};
const pageParams = (req) => ({
  page: Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1)),
  limit: [25, 50, 100].includes(Number(req.query.limit))
    ? Number(req.query.limit)
    : 25,
});
const pagination = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
});
const resourceKind = (req) => {
  if (!["companies", "profiles"].includes(req.params.kind))
    error(404, "RESOURCE_NOT_FOUND", "Resource not found.");
  return req.params.kind;
};
const audit = (req, action, rev) => ({
  action,
  revision: rev,
  actorId: String(req.user._id),
  at: new Date(),
});
async function find(req) {
  const doc = await AIInterview.findOne(filter(req)).lean();
  if (!doc) error(404, "RESOURCE_NOT_FOUND", "Interview not found.");
  return doc;
}
async function cas(req, update, editable = true) {
  const expected = revision(req);
  const doc = await AIInterview.findOneAndUpdate(
    {
      ...filter(req),
      revision: expected,
      ...(editable ? { lifecycle: "draft" } : {}),
    },
    update,
    { new: true, runValidators: true },
  ).lean();
  if (doc) return doc;
  const current = await find(req);
  if (editable && current.lifecycle !== "draft")
    error(409, "INVALID_LIFECYCLE", "Restore this interview before editing.");
  error(
    409,
    "REVISION_CONFLICT",
    "This interview changed elsewhere. Your edits have not been discarded.",
    { currentRevision: current.revision },
  );
}
async function references(req, data, previous) {
  if (data.companyId) {
    const company = await Resource.findOne({
      _id: objectId(data.companyId),
      ...owner(req),
      kind: "companies",
    }).lean();
    if (!company || (!company.active && previous?.companyId !== data.companyId))
      error(422, "INVALID_COMPANY", "Select an available company.");
    data.companyName =
      previous?.companyId === data.companyId
        ? previous.companyName
        : company.name;
  } else data.companyName = "";
  if (data.interviewer) {
    const profile = await Resource.findOne({
      _id: objectId(data.interviewer.profileId),
      ...owner(req),
      kind: "profiles",
    }).lean();
    if (
      !profile ||
      (!profile.active &&
        previous?.interviewer?.profileId !== data.interviewer.profileId)
    )
      error(422, "INVALID_PROFILE", "Select an available interviewer profile.");
    const same =
      previous?.interviewer?.profileId === data.interviewer.profileId &&
      previous?.interviewer?.profileRevision ===
        data.interviewer.profileRevision;
    if (!same)
      data.interviewer = {
        ...profile.data,
        profileId: String(profile._id),
        profileRevision: profile.revision,
      };
    else data.interviewer = previous.interviewer;
  }
  // Imported provenance is validated against accessible Library entries, never trusted as an ACL.
  const imported = data.sections.flatMap((s) =>
    s.groups.flatMap((g) =>
      (g.questions ?? [])
        .map((q) => q.provenance?.libraryQuestionId)
        .filter(Boolean),
    ),
  );
  const prior = new Set(
    previous?.sections.flatMap((s) =>
      s.groups.flatMap((g) =>
        (g.questions ?? [])
          .map((q) => q.provenance?.libraryQuestionId)
          .filter(Boolean),
      ),
    ) ?? [],
  );
  const fresh = [...new Set(imported.filter((id) => !prior.has(id)))];
  if (fresh.length) {
    fresh.forEach(objectId);
    const available = await QuestionLibrary.countDocuments({
      _id: { $in: fresh },
      questionType: "short",
      $or: [
        { createdBy: req.user._id },
        { visibility: "public", status: "published" },
      ],
    });
    if (available !== fresh.length)
      error(
        422,
        "INVALID_LIBRARY_SOURCE",
        "Some Library questions are no longer available.",
      );
  }
}
export const capabilities = (_req, res) => res.json(CAPABILITIES);
export async function listInterviews(req, res) {
  const { page, limit } = pageParams(req);
  const where = {
    ...owner(req),
    lifecycle: req.query.status === "archived" ? "archived" : "draft",
  };
  if (req.query.status === "complete") where["validation.complete"] = true;
  if (req.query.status === "incomplete")
    where["validation.complete"] = { $ne: true };
  if (req.query.company) where["data.companyId"] = objectId(req.query.company);
  const search = literalSearch(req.query.search);
  if (search)
    where.$or = ["title", "role", "companyName"].map((field) => ({
      [field]: { $regex: search, $options: "i" },
    }));
  const sort =
    req.query.sort === "oldest"
      ? { updatedAt: 1, _id: 1 }
      : req.query.sort === "title"
        ? { title: 1, _id: 1 }
        : { updatedAt: -1, _id: -1 };
  const [items, total] = await Promise.all([
    AIInterview.find(where)
      .select(
        "title role companyName revision lifecycle summary validation.complete updatedAt",
      )
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AIInterview.countDocuments(where),
  ]);
  res.json({ items, pagination: pagination(page, limit, total) });
}
export async function createInterview(req, res) {
  const creationKey = key(req);
  const existing = await AIInterview.findOne({
    ...owner(req),
    creationKey,
  }).lean();
  if (existing) return res.json(existing);
  const data = normalizeDefinition(req.body.data);
  await references(req, data);
  const checked = inspectDefinition(data);
  try {
    const doc = await AIInterview.create({
      ...owner(req),
      creationKey,
      data,
      title: data.title,
      role: data.role,
      companyName: data.companyName,
      summary: checked.summary,
      validation: { complete: false },
      history: [audit(req, "created", 1)],
    });
    res.status(201).json(doc);
  } catch (err) {
    if (err.code !== 11000) throw err;
    res.json(await AIInterview.findOne({ ...owner(req), creationKey }).lean());
  }
}
export async function getInterview(req, res) {
  const doc = await find(req);
  delete doc.validatedSnapshot;
  res.json(doc);
}
export async function saveInterview(req, res) {
  const previous = await find(req);
  const data = normalizeDefinition(req.body.data);
  await references(req, data, previous.data);
  const checked = inspectDefinition(data);
  const doc = await cas(req, {
    $set: {
      data,
      title: data.title,
      role: data.role,
      companyName: data.companyName,
      summary: checked.summary,
      validation: { complete: false },
    },
    $inc: { revision: 1 },
    $push: {
      history: {
        $each: [audit(req, "saved", revision(req) + 1)],
        $slice: -100,
      },
    },
  });
  delete doc.validatedSnapshot;
  res.json(doc);
}
export async function validateInterview(req, res) {
  const current = await find(req);
  if (current.revision !== revision(req))
    error(
      409,
      "REVISION_CONFLICT",
      "Save or reload the latest revision before validation.",
    );
  const checked = inspectDefinition(current.data);
  const next = revision(req) + 1;
  const set = {
    validation: {
      complete: checked.complete,
      issues: checked.issues,
      validatedRevision: next,
      checkedAt: new Date(),
      validatorVersion: 1,
    },
    summary: checked.summary,
  };
  if (checked.complete)
    set.validatedSnapshot = {
      data: current.data,
      revision: next,
      at: new Date(),
    };
  const doc = await cas(req, {
    $set: set,
    $inc: { revision: 1 },
    $push: {
      history: { $each: [audit(req, "validated", next)], $slice: -100 },
    },
  });
  delete doc.validatedSnapshot;
  res.json(doc);
}
export async function lifecycleInterview(req, res) {
  const action = req.params.action;
  if (!["archive", "restore"].includes(action))
    error(404, "RESOURCE_NOT_FOUND", "Action not found.");
  const current = await find(req);
  if ((action === "archive") !== (current.lifecycle === "draft"))
    error(409, "INVALID_LIFECYCLE", "This action is not available.");
  const doc = await cas(
    req,
    {
      $set: {
        lifecycle: action === "archive" ? "archived" : "draft",
        archivedAt: action === "archive" ? new Date() : null,
        validation: { complete: false },
      },
      $inc: { revision: 1 },
      $push: {
        history: {
          $each: [audit(req, action, revision(req) + 1)],
          $slice: -100,
        },
      },
    },
    false,
  );
  delete doc.validatedSnapshot;
  res.json(doc);
}
export async function duplicateInterview(req, res) {
  const source = await find(req);
  if (source.revision !== revision(req))
    error(
      409,
      "REVISION_CONFLICT",
      "Reload before duplicating this interview.",
    );
  const creationKey = key(req);
  const data = structuredClone(source.data);
  data.title = `${data.title.slice(0, 150)} (copy)`;
  const doc = await AIInterview.findOneAndUpdate(
    { ...owner(req), creationKey },
    {
      $setOnInsert: {
        ...owner(req),
        creationKey,
        data,
        title: data.title,
        role: data.role,
        companyName: data.companyName,
        summary: inspectDefinition(data).summary,
        validation: { complete: false },
        history: [audit(req, "duplicated", 1)],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  res.status(201).json(doc);
}
export async function deleteInterview(req, res) {
  const current = await find(req);
  if (req.body.title !== current.title)
    error(
      422,
      "CONFIRMATION_REQUIRED",
      "Type the exact interview title to delete.",
    );
  if (current.lifecycle !== "draft")
    error(409, "INVALID_LIFECYCLE", "Restore before deleting.");
  const result = await AIInterview.deleteOne({
    ...filter(req),
    revision: revision(req),
    lifecycle: "draft",
  });
  if (!result.deletedCount)
    error(
      409,
      "REVISION_CONFLICT",
      "This interview changed. Reload before deleting.",
    );
  res.json({ deleted: true });
}
export async function listResources(req, res) {
  const kind = resourceKind(req),
    { page, limit } = pageParams(req);
  const where = { ...owner(req), kind };
  if (req.query.active === "true") where.active = true;
  const search = literalSearch(req.query.search);
  if (search) where.name = { $regex: search, $options: "i" };
  const [items, total] = await Promise.all([
    Resource.find(where)
      .sort({ name: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Resource.countDocuments(where),
  ]);
  res.json({ items, pagination: pagination(page, limit, total) });
}
export async function saveResource(req, res) {
  const kind = resourceKind(req),
    name = cleanText(req.body.name ?? "", 120);
  if (!name) error(422, "VALIDATION_FAILED", "A name is required.");
  const data =
    kind === "profiles" ? normalizeProfile({ ...req.body.data, name }) : {};
  if (kind === "profiles" && !data.displayName)
    error(422, "VALIDATION_FAILED", "Add an interviewer display name.");
  const fields = { name, normalizedName: normalizedName(name), data };
  if (!req.params.id) {
    const doc = await Resource.findOneAndUpdate(
      { ...owner(req), kind, normalizedName: fields.normalizedName },
      { $setOnInsert: { ...owner(req), kind, ...fields } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    if (!doc.active)
      error(
        409,
        "RESOURCE_INACTIVE",
        "This name is inactive. Restore it from management.",
      );
    return res.status(201).json(doc);
  }
  if (typeof req.body.active !== "boolean")
    error(422, "VALIDATION_FAILED", "Specify whether this resource is active.");
  const doc = await Resource.findOneAndUpdate(
    { ...filter(req), kind, revision: revision(req) },
    { $set: { ...fields, active: req.body.active }, $inc: { revision: 1 } },
    { new: true },
  ).lean();
  if (!doc)
    error(
      409,
      "REVISION_CONFLICT",
      "Resource changed or is no longer available. Reload and retry.",
    );
  res.json(doc);
}
export async function library(req, res) {
  const { page, limit } = pageParams(req);
  const where = {
    questionType: "short",
    $or: [
      { createdBy: req.user._id },
      { visibility: "public", status: "published" },
    ],
  };
  const search = literalSearch(req.query.search);
  if (search) where.questionText = { $regex: search, $options: "i" };
  const [items, total] = await Promise.all([
    QuestionLibrary.find(where)
      .select(
        "questionText difficulty tags updatedAt questionData.expectedAnswer",
      )
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    QuestionLibrary.countDocuments(where),
  ]);
  res.json({ items, pagination: pagination(page, limit, total) });
}
