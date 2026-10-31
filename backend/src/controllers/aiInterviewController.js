import mongoose from "mongoose";
import { currentTenant } from "../platform/tenantContext.js";
import AIInterview from "../models/AIInterview.js";
import Resource from "../models/AIInterviewResource.js";
import QuestionLibrary from "../models/QuestionLibrary.js";
import { anviConfig, anviConfigured } from "../modules/anviInterview/anviInterview.config.js";
import { createAudioStorage } from "../modules/anviInterview/anviInterview.audioStorage.js";
import { anviPricing } from "../modules/anviInterview/anviInterview.pricing.js";
import { createGeminiClient } from "../modules/anviInterview/anviInterview.gemini.js";
import { poolGenerationPrompt, questionGenerationPrompt } from "../modules/anviInterview/anviInterview.prompts.js";
import { defaultUsageLedger } from "../modules/anviInterview/anviInterview.usage.js";
import { defaultAudioPregen, pendingOutbox } from "../modules/anviInterview/anviInterview.audioPregen.js";
import {
  AuthoringError,
  CAPABILITIES,
  LIMITS,
  QUESTION_CATEGORIES,
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
// Scheduled assignments pin the published snapshot, so an interview with a live one stays published.
// Loaded on first use (the scheduling service imports ANVI modules); tests replace the method.
let schedulingModule;
export const assignmentGuard = {
  activeAssignmentFor: async (interviewId) =>
    (await (schedulingModule ||= import("../modules/anviInterview/anviInterview.scheduling.service.js"))).activeAssignmentFor(interviewId),
  deleteInterviewData: async (admin, interviewId) =>
    (await (schedulingModule ||= import("../modules/anviInterview/anviInterview.scheduling.service.js"))).anviScheduling().deleteInterviewData(admin, interviewId),
  completeInterview: async (admin, interviewId) =>
    (await (schedulingModule ||= import("../modules/anviInterview/anviInterview.scheduling.service.js"))).anviScheduling().completeInterview(admin, interviewId),
};
async function assertNoActiveAssignment(interviewId, verb) {
  const active = await assignmentGuard.activeAssignmentFor(interviewId);
  if (!active) return;
  const name = cleanText(active.title || "", 120);
  error(
    409,
    "ASSIGNMENT_ACTIVE",
    `${name ? `The schedule "${name}"` : "A schedule"} is still ${active.status || "active"} for this interview. Close or cancel it before you ${verb} the interview.`,
    { assignmentId: active.id || active._id ? String(active.id || active._id) : null },
  );
}
// PeerPrep's company catalog (problem tags, central library, approved names, benchmarks), the same list
// students pick from when reporting interview questions. A university reads it from the control plane.
// Loaded on first use; tests replace `names`.
export const companyCatalogSource = {
  names: async () => {
    const [{ isUniversity }, { controlRequest }, { interviewReportOptions }, { default: CompanyBenchmark }] = await Promise.all([
      import("../platform/deployment.js"),
      import("../platform/client.js"),
      import("../platform/interviewQuestionReports.js"),
      import("../models/CompanyBenchmark.js"),
    ]);
    const [shared, local] = await Promise.all([
      (isUniversity() ? controlRequest("question-interviews/options") : interviewReportOptions())
        .then((options) => options?.companies || [])
        .catch(() => []),
      isUniversity() ? CompanyBenchmark.distinct("companyName").catch(() => []) : [],
    ]);
    return [...shared, ...local];
  },
};
// Publish-time question audio (ANVI hybrid); tests replace `pregen`. A publish never awaits it.
export const audioPregenHooks = { pregen: () => defaultAudioPregen() };
function kickAudioPregen(interviewId, rev) {
  try {
    Promise.resolve(audioPregenHooks.pregen().kick(String(interviewId), rev)).catch(() => {});
  } catch {
    // Question audio is optional: the interview falls back to text.
  }
}
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
  if (!["companies", "profiles", "jobNames", "jobRoles"].includes(req.params.kind))
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
    error(409, "INVALID_LIFECYCLE", current.lifecycle === "completed" ? "Reopen this interview before editing." : "Restore this interview before editing.");
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
/**
 * Whether students can start ANVI interviews on this server: { mode, ready, missing }. Hybrid needs the
 * Gemini key, every hybrid price with the USD-INR rate, and audio storage; without them attempts run Live.
 * `missing` names settings only, never their values.
 */
export function runtimeReadiness(config = anviConfig(), env = process.env) {
  if (!config.hybridEnabled) return { mode: "live", ready: anviConfigured(), missing: anviConfigured() ? [] : ["GEMINI_API_KEY"] };
  const missing = [];
  if (!anviConfigured()) missing.push("GEMINI_API_KEY");
  try {
    missing.push(...anviPricing(env, config).missingHybridPrices());
  } catch {
    missing.push("ANVI_PRICE_*");
  }
  if (!createAudioStorage({ env, config }).ready) missing.push("R2 audio storage (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, ANVI_AUDIO_R2_BUCKET or R2_BUCKET_NAME)");
  // Without every hybrid setting an attempt runs Live (the rollout falls back), so only the key is required.
  const live = missing.length > 0;
  return { mode: live ? "live" : "hybrid", ready: anviConfigured(), missing };
}
export const capabilities = (_req, res) =>
  res.json({ ...CAPABILITIES, aiConfigured: anviConfigured(), runtime: runtimeReadiness() });
export async function listInterviews(req, res) {
  const { page, limit } = pageParams(req);
  // "All" lists drafts and completed interviews; the draft filters and the schedulable picker list drafts only.
  const status = req.query.status;
  const where = {
    ...owner(req),
    lifecycle: status === "archived" || status === "completed" ? status
      : status || req.query.published === "true" ? "draft" : { $in: ["draft", "completed"] },
  };
  if (req.query.status === "complete") where["validation.complete"] = true;
  if (req.query.status === "incomplete")
    where["validation.complete"] = { $ne: true };
  // Published (schedulable) interviews, including ones whose draft was edited after publishing.
  if (req.query.published === "true") where.publishedAt = { $ne: null };
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
        "title role companyName revision lifecycle summary validation.complete publishedAt completedAt updatedAt",
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
  delete doc.publishedSnapshot;
  res.json(doc);
}
export async function saveInterview(req, res) {
  const previous = await find(req);
  const data = normalizeDefinition(req.body.data, { previous: previous.data });
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
// The lifecycle each action starts from. "complete" keeps the published snapshot and reports; students can no
// longer see or start the interview. "reopen" makes a completed interview available again.
const LIFECYCLE_FROM = { archive: ["draft", "completed"], restore: ["archived"], complete: ["draft"], reopen: ["completed"] };
export async function lifecycleInterview(req, res) {
  const action = req.params.action;
  if (!LIFECYCLE_FROM[action])
    error(404, "RESOURCE_NOT_FOUND", "Action not found.");
  const current = await find(req);
  // Completing again finishes closing schedules a first try left open (it is safe to repeat).
  if (action === "complete" && current.lifecycle === "completed") {
    const closing = await assignmentGuard.completeInterview(req.user, current._id);
    delete current.validatedSnapshot;
    delete current.publishedSnapshot;
    return res.json({ ...current, closing });
  }
  if (!LIFECYCLE_FROM[action].includes(current.lifecycle))
    error(409, "INVALID_LIFECYCLE", "This action is not available.");
  if (action === "complete" && !current.publishedAt)
    error(409, "INTERVIEW_NOT_PUBLISHED", "Only a published interview can be marked complete.");
  if (action === "archive") await assertNoActiveAssignment(current._id, "archive");
  if (action === "complete" || action === "reopen") {
    const doc = await cas(
      req,
      {
        $set: { lifecycle: action === "complete" ? "completed" : "draft", completedAt: action === "complete" ? new Date() : null },
        $inc: { revision: 1 },
        $push: { history: { $each: [audit(req, action, revision(req) + 1)], $slice: -100 } },
      },
      false,
    );
    // Starts are refused from here on (they need a draft interview); then running interviews end and schedules close.
    const closing = action === "complete" ? await assignmentGuard.completeInterview(req.user, current._id) : null;
    delete doc.validatedSnapshot;
    delete doc.publishedSnapshot;
    return res.json(closing ? { ...doc, closing } : doc);
  }
  const doc = await cas(
    req,
    {
      $set: {
        lifecycle: action === "archive" ? "archived" : "draft",
        archivedAt: action === "archive" ? new Date() : null,
        completedAt: null,
        validation: { complete: false },
        // Archive only stops the audio outbox; clips pinned by assignments or attempts stay.
        ...(action === "archive" && current.audioPregen ? { "audioPregen.status": "inactive" } : {}),
      },
      ...(action === "archive" ? { $unset: { publishedSnapshot: "", publishedAt: "", publishedRevision: "", requiresResume: "" } } : {}),
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
export async function releaseInterview(req, res) {
  const action = req.params.action;
  if (!["publish", "unpublish"].includes(action))
    error(404, "RESOURCE_NOT_FOUND", "Action not found.");
  const current = await find(req);
  if (current.revision !== revision(req)) error(409, "REVISION_CONFLICT", "Reload the latest interview revision.");
  if (current.lifecycle !== "draft") error(409, "INVALID_LIFECYCLE", "Restore the interview first.");
  if (action === "publish" && (!current.validation?.complete || current.validation.validatedRevision !== current.revision))
    error(422, "VALIDATION_REQUIRED", "Finish and validate the latest setup before making it available to students.");
  if (action === "publish" && !anviConfigured())
    error(503, "AI_NOT_CONFIGURED", "Set GEMINI_API_KEY on the backend before making AI interviews available.");
  // Republishing is fine: an assignment keeps the snapshot it was scheduled with.
  if (action === "unpublish") await assertNoActiveAssignment(current._id, "unpublish");
  const next = current.revision + 1;
  const update = {
    $inc: { revision: 1 },
    $push: { history: { $each: [audit(req, action, next)], $slice: -100 } },
  };
  if (action === "publish") update.$set = {
    publishedSnapshot: { data: current.data, revision: next, at: new Date() },
    publishedAt: new Date(),
    publishedRevision: next,
    requiresResume: current.data.sections.some((section) => section.groups.some((group) => (group.questions || []).some((question) => question.kind === "resume"))),
    "validation.validatedRevision": next,
    // The question audio outbox for this revision, committed with the snapshot.
    audioPregen: pendingOutbox(next),
  };
  else {
    update.$unset = { publishedSnapshot: "", publishedAt: "", publishedRevision: "", requiresResume: "" };
    if (current.validation?.complete && current.validation.validatedRevision === current.revision)
      update.$set = { "validation.validatedRevision": next };
    if (current.audioPregen) update.$set = { ...update.$set, "audioPregen.status": "inactive" };
  }
  const doc = await cas(req, update);
  // Fire-and-forget: the publish has already succeeded whatever happens to the audio.
  if (action === "publish") kickAudioPregen(doc._id, next);
  delete doc.validatedSnapshot;
  delete doc.publishedSnapshot;
  res.json(doc);
}
async function published(req) {
  const doc = await find(req);
  if (doc.lifecycle !== "draft" || !doc.publishedAt)
    error(409, "INTERVIEW_NOT_PUBLISHED", "Publish this interview before generating its question audio.");
  return doc;
}
// Re-queues the published revision's question audio (failed clips retry now). Rate-limited per interview.
export async function regenerateInterviewAudio(req, res) {
  const doc = await published(req);
  const result = await audioPregenHooks.pregen().regenerate(doc._id);
  if (!result.ok && result.code === "RATE_LIMITED") {
    const seconds = Math.max(1, Math.ceil((new Date(result.retryAt).getTime() - Date.now()) / 1000));
    res.set("Retry-After", String(seconds));
    error(429, "RATE_LIMITED", "Question audio was requested a moment ago. Try again shortly.", { retryAfterSeconds: seconds });
  }
  if (!result.ok) error(409, "INTERVIEW_NOT_PUBLISHED", "Publish this interview before generating its question audio.");
  res.status(202).json(await audioPregenHooks.pregen().status(doc._id));
}
// ANVI's voice for the speed preview in ANVI settings: one cached template clip (synthesized once per tenant,
// then served from storage), sent as base64 s16le PCM. Tests replace `load`.
const VOICE_SAMPLE_ID = "small_talk.how_are_you";
export const voiceSampleSource = {
  load: async () => {
    const [{ defaultAudioAssets }, { templateAssetSpec }, { pregenTemplates }] = await Promise.all([
      import("../modules/anviInterview/anviInterview.audioAssets.js"),
      import("../modules/anviInterview/anviInterview.audioPregen.js"),
      import("../modules/anviInterview/anviInterview.templates.js"),
    ]);
    const template = pregenTemplates(["English"]).find((entry) => entry.id === VOICE_SAMPLE_ID);
    const assets = defaultAudioAssets();
    const asset = template ? await assets.ensure(templateAssetSpec(template, anviConfig().ttsVoice)) : null;
    const clip = asset ? await assets.load(asset.assetId, null) : null;
    return clip?.pcm ? { pcm: clip.pcm, sampleRate: clip.sampleRate || 24000, text: template.text } : null;
  },
};
export async function voiceSample(req, res) {
  const clip = await Promise.resolve().then(() => voiceSampleSource.load()).catch(() => null);
  if (!clip)
    return res.status(503).json({
      code: "VOICE_SAMPLE_UNAVAILABLE",
      error: "ANVI's voice sample isn't available right now. Check that ANVI audio is set up on the server.",
    });
  res.json({ sampleRate: clip.sampleRate, text: clip.text, pcm: Buffer.from(clip.pcm).toString("base64") });
}
export async function interviewAudioStatus(req, res) {
  const doc = await find(req);
  res.json(await audioPregenHooks.pregen().status(doc._id));
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
  const expected = revision(req);
  if (current.revision !== expected)
    error(409, "REVISION_CONFLICT", "This interview changed. Reload before deleting.");
  // A confirmed permanent delete owns the whole interview aggregate. Linked schedules and finished
  // student work are removed with it; only an attempt that is live right now remains a blocker.
  await assignmentGuard.deleteInterviewData(req.user, current._id);
  await (currentTenant()?.connection || mongoose.connection).collection("aiinterviewsessions").deleteMany({
    interviewId: { $in: [current._id, String(current._id)] },
  });
  const result = await AIInterview.deleteOne({
    ...filter(req),
    revision: expected,
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
// Job names and roles that admins type are shared by every admin of the tenant; companies and profiles stay
// per owner because interviews reference them by id.
const SHARED_KINDS = new Set(["jobNames", "jobRoles"]);
export async function listResources(req, res) {
  const kind = resourceKind(req),
    { page, limit } = pageParams(req);
  const where = SHARED_KINDS.has(kind) ? { kind } : { ...owner(req), kind };
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
export async function companyCatalog(req, res) {
  const names = new Map();
  for (const value of await companyCatalogSource.names()) {
    const name = cleanText(typeof value === "string" ? value.slice(0, 120) : "", 120).replace(/\s+/g, " ");
    if (name.length >= 2 && !names.has(normalizedName(name))) names.set(normalizedName(name), name);
  }
  res.json({ companies: [...names.values()].sort((a, b) => a.localeCompare(b)) });
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

// Generate & review: ANVI drafts questions for one ANVI-prompt topic. Nothing is saved here; the
// admin edits and approves them in the builder, which saves them as manual questions.
const TOPIC_ID = /^[a-zA-Z0-9_-]{1,80}$/;
const GENERATE_PER_MINUTE = 10;
const GENERATED_KEY_POINTS = 6;
const generatedText = (value, max) =>
  cleanText(typeof value === "string" ? value.slice(0, max) : "", max)
    .replace(/\s+/g, " ")
    .trim();
// "Generate with ANVI": the admin's question pool, written once and asked to every student. The count is
// shared out across the topics (earlier topics get the remainder) and each topic is one model call of at
// most POOL_PER_CALL questions, POOL_CONCURRENCY at a time; nothing is saved here.
const POOL_TOPICS = 12;
const POOL_PER_CALL = 15;
const POOL_CONCURRENCY = 4;
const POOL_DIFFICULTIES = ["mixed", "easy", "medium", "hard"];
async function generatePool(doc, body, gemini, usage) {
  // Topics once each, case-insensitively, in the admin's first spelling.
  const named = new Map();
  for (const topic of Array.isArray(body.topics) ? body.topics : []) {
    const name = generatedText(topic, 80);
    if (name && !named.has(name.toLowerCase())) named.set(name.toLowerCase(), name);
  }
  const topics = [...named.values()];
  if (!topics.length || topics.length > POOL_TOPICS)
    error(422, "VALIDATION_FAILED", `Add 1–${POOL_TOPICS} topics for ANVI.`);
  const count = body.count;
  if (!Number.isInteger(count) || count < topics.length || count > LIMITS.generateQuestions)
    error(422, "VALIDATION_FAILED", `Choose ${topics.length}–${LIMITS.generateQuestions} questions to generate (at least one per topic).`);
  const category = QUESTION_CATEGORIES.includes(body.category) ? body.category : "Technical";
  const difficulty = POOL_DIFFICULTIES.includes(body.difficulty) ? body.difficulty : "mixed";
  const followUps = Number.isInteger(body.followUps) ? Math.min(LIMITS.followUpLimit, Math.max(0, body.followUps)) : 1;
  const requirements = generatedText(body.requirements ?? "", 4000);
  const data = doc.data || {};
  const avoid = (data.sections || [])
    .flatMap((s) => s.groups || [])
    .flatMap((g) => g.questions || [])
    .filter((q) => q.kind !== "resume" && q.prompt)
    .map((q) => q.prompt);
  // One call per topic share; a share above POOL_PER_CALL is split into several calls.
  const calls = [];
  topics.forEach((topic, i) => {
    let share = Math.floor(count / topics.length) + (i < count % topics.length ? 1 : 0);
    while (share > 0) {
      calls.push({ topic, count: Math.min(POOL_PER_CALL, share) });
      share -= POOL_PER_CALL;
    }
  });
  const onUsage = (usage || defaultUsageLedger()).recorder({ interviewId: doc._id });
  const results = new Array(calls.length);
  let next = 0;
  const worker = async () => {
    while (next < calls.length) {
      const index = next++;
      const call = calls[index];
      const { systemText, userText, schema } = poolGenerationPrompt({
        ...call, category, difficulty, followUps, requirements,
        // The interview name is the job name (picked from the job names list).
        jobName: data.title, role: data.role, companyName: data.companyName, experience: data.experience,
        avoid: avoid.slice(-60),
      });
      try {
        const result = await gemini.generateJson({
          model: anviConfig().generateModel, systemText, parts: [{ text: userText }], schema,
          temperature: 0.6, timeoutMs: 45000, usageKind: "generate", onUsage,
        });
        results[index] = { call, questions: Array.isArray(result?.questions) ? result.questions : [] };
      } catch {
        results[index] = { call, questions: [] };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL_CONCURRENCY, calls.length) }, worker));
  const seen = new Set(avoid.map((text) => text.toLowerCase()));
  const questions = [];
  for (const { call, questions: list } of results) {
    let kept = 0;
    for (const entry of list) {
      if (kept >= call.count) break;
      const prompt = generatedText(entry?.text, 1200).replace(/^(?:question|q)\s*\d{1,3}\s*[:.)-]\s*/i, "");
      if (prompt.length < 8 || seen.has(prompt.toLowerCase())) continue;
      seen.add(prompt.toLowerCase());
      kept += 1;
      const keyPoints = (Array.isArray(entry.keyPoints) ? entry.keyPoints : [])
        .map((point) => generatedText(point, 200))
        .filter(Boolean)
        .slice(0, GENERATED_KEY_POINTS);
      questions.push({
        prompt,
        expectedAnswer: keyPoints.join("\n"),
        keyPoints,
        topic: call.topic,
        category,
        difficulty: ["easy", "medium", "hard"].includes(entry.difficulty) ? entry.difficulty : difficulty === "mixed" ? "medium" : difficulty,
        followUps: (Array.isArray(entry.followUps) ? entry.followUps : [])
          .map((text) => generatedText(text, 300))
          .filter((text) => text.length >= 8)
          .slice(0, followUps),
        followUpLimit: followUps,
      });
    }
  }
  return questions;
}
export function createGenerateQuestions({
  gemini,
  usage,
  now = Date.now,
  limit = GENERATE_PER_MINUTE,
  windowMs = 60_000,
} = {}) {
  // In-memory sliding window per admin. Per process, which is enough to stop accidental bursts.
  const recent = new Map();
  const retryAfter = (adminId) => {
    const at = now();
    const kept = (recent.get(adminId) || []).filter((t) => at - t < windowMs);
    if (kept.length >= limit) {
      recent.set(adminId, kept);
      return Math.max(1, Math.ceil((kept[0] + windowMs - at) / 1000));
    }
    kept.push(at);
    recent.set(adminId, kept);
    if (recent.size > 1000)
      for (const [key, times] of recent)
        if (!times.some((t) => at - t < windowMs)) recent.delete(key);
    return 0;
  };
  return async function generateQuestions(req, res) {
    if (!anviConfigured())
      return res.status(503).json({
        code: "AI_NOT_CONFIGURED",
        error: "Set GEMINI_API_KEY on the backend before generating questions.",
      });
    const wait = retryAfter(String(req.user._id));
    if (wait) {
      res.set("Retry-After", String(wait));
      error(
        429,
        "RATE_LIMITED",
        "Too many generation requests. Wait a minute and try again.",
        { retryAfterSeconds: wait },
      );
    }
    const doc = await find(req);
    if (doc.lifecycle !== "draft")
      error(409, "INVALID_LIFECYCLE", "Restore this interview before editing.");
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.mode === "pool") {
      const pool = await generatePool(doc, body, gemini ?? createGeminiClient(), usage);
      if (!pool.length)
        return res.status(502).json({
          code: "GENERATION_FAILED",
          error: "ANVI could not generate questions right now. Try again in a moment.",
        });
      return res.json({ questions: pool });
    }
    if (typeof body.groupId !== "string" || !TOPIC_ID.test(body.groupId))
      error(422, "VALIDATION_FAILED", "Choose the topic to generate questions for.");
    const count = body.count;
    if (!Number.isInteger(count) || count < 1 || count > LIMITS.generateQuestions)
      error(
        422,
        "VALIDATION_FAILED",
        `Choose 1–${LIMITS.generateQuestions} questions to generate.`,
      );
    if (
      body.skills !== undefined &&
      (!Array.isArray(body.skills) || body.skills.length > 30)
    )
      error(422, "VALIDATION_FAILED", "Expected a list of at most 30 skills.");
    if (
      body.difficulty !== undefined &&
      !["", "easy", "medium", "hard"].includes(body.difficulty)
    )
      error(422, "VALIDATION_FAILED", "Invalid difficulty.");
    // The topic may be unsaved (staged in the topic drawer); then only the request body describes it.
    const data = doc.data || {};
    let section = null,
      group = null;
    for (const s of data.sections || []) {
      group = (s.groups || []).find((g) => g.id === body.groupId) || null;
      if (group) {
        section = s;
        break;
      }
    }
    const annu = group?.source === "annu" && group.annu ? group.annu : {};
    const requirements = cleanText(body.requirements ?? annu.requirements ?? "");
    if (!requirements)
      error(
        422,
        "VALIDATION_FAILED",
        "Describe what ANVI should ask before generating questions.",
      );
    const skills = (body.skills ?? annu.skills ?? [])
      .map((skill) => cleanText(skill, 80))
      .filter(Boolean);
    const avoid = (data.sections || [])
      .flatMap((s) => s.groups || [])
      .flatMap((g) => g.questions || [])
      .filter((q) => q.kind !== "resume" && q.prompt)
      .map((q) => q.prompt)
      .slice(0, 40);
    const { systemText, userText, schema } = questionGenerationPrompt({
      kind: "annu",
      count,
      role: data.role,
      companyName: data.companyName,
      experience: data.experience,
      difficulty: body.difficulty || group?.difficulty || data.difficulty,
      language: data.rules?.language,
      sectionName: section?.name,
      sectionInstructions: section?.instructions,
      groupName: group?.name,
      requirements,
      skills,
      exclusions: annu.exclusions,
      avoid,
    });
    let result;
    try {
      result = await (gemini ?? createGeminiClient()).generateJson({
        model: anviConfig().generateModel,
        systemText,
        parts: [{ text: userText }],
        schema,
        temperature: 0.5,
        timeoutMs: 30000,
        // Metered against the interview (an admin action: no student or attempt).
        usageKind: "generate",
        onUsage: (usage || defaultUsageLedger()).recorder({ interviewId: doc._id }),
      });
    } catch {
      result = null;
    }
    const seen = new Set(),
      questions = [];
    for (const entry of Array.isArray(result?.questions) ? result.questions : []) {
      const prompt = generatedText(entry?.text, 1200).replace(
        /^(?:question|q)\s*\d{1,3}\s*[:.)-]\s*/i,
        "",
      );
      if (prompt.length < 8 || seen.has(prompt.toLowerCase())) continue;
      seen.add(prompt.toLowerCase());
      const keyPoints = (Array.isArray(entry.keyPoints) ? entry.keyPoints : [])
        .map((point) => generatedText(point, 200))
        .filter(Boolean)
        .slice(0, GENERATED_KEY_POINTS);
      questions.push({ prompt, expectedAnswer: keyPoints.join("\n"), keyPoints });
      if (questions.length === count) break;
    }
    if (!questions.length)
      return res.status(502).json({
        code: "GENERATION_FAILED",
        error: "ANVI could not generate questions right now. Try again in a moment.",
      });
    res.json({ questions });
  };
}
export const generateQuestions = createGenerateQuestions();
