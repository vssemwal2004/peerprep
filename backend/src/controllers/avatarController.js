import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import AIAvatar from "../models/AIAvatar.js";
import { AVATAR_LANGUAGES, AVATAR_LIMITS, avatarError, avatarFingerprint, inspectUpload, normalizeAvatar } from "../services/avatarDefinition.js";
import { createAvatarStorage } from "../services/avatarStorage.js";
import { createAvatarProviders } from "../services/avatarProviders.js";

const running = (doc) => ["queued", "processing"].includes(doc.render?.status);
export function createAvatarController({ model = AIAvatar, storage = createAvatarStorage(), providers = createAvatarProviders() } = {}) {
  const owner = (req) => ({ ownerId: req.user._id });
  const filter = (req) => {
    if (!mongoose.isValidObjectId(req.params.id)) avatarError(400, "INVALID_IDENTIFIER", "Invalid avatar identifier.");
    return { ...owner(req), _id: req.params.id };
  };
  const expectedRevision = (req) => {
    const revision = Number(req.body?.revision);
    if (!Number.isSafeInteger(revision) || revision < 1) avatarError(400, "REVISION_REQUIRED", "A valid saved avatar revision is required.");
    return revision;
  };
  async function find(req, expected = false) {
    const doc = await model.findOne(filter(req)).lean();
    if (!doc) avatarError(404, "AVATAR_NOT_FOUND", "Avatar not found.");
    if (expected && doc.revision !== expectedRevision(req)) avatarError(409, "REVISION_CONFLICT", "This avatar changed elsewhere. Reload before applying this action.");
    return doc;
  }
  async function mutate(req, doc, set, unset = {}, extra = {}) {
    const updated = await model.findOneAndUpdate({ ...filter(req), revision: doc.revision, ...extra }, {
      $set: set, $inc: { revision: 1 }, ...(Object.keys(unset).length ? { $unset: unset } : {}),
    }, { new: true, runValidators: true }).lean();
    return updated;
  }
  const conflict = (doc) => { if (!doc) avatarError(409, "REVISION_CONFLICT", "This avatar changed elsewhere. Reload before applying this action."); return doc; };
  function ensureActive(doc) { if (!doc.active) avatarError(409, "AVATAR_ARCHIVED", "Restore this avatar before editing or rendering."); }
  function requireStorage() { if (!storage.ready) avatarError(503, "STORAGE_UNAVAILABLE", storage.reason); }
  function previewVersions(doc) {
    const versions = { ...doc.languagePreviews };
    const asset = doc.assets?.preview;
    const language = asset?.language || doc.render?.input?.language || doc.data.language;
    if (asset?.key && !versions[language]) versions[language] = {
      ...asset, language,
      introduction: asset.introduction ?? doc.render?.input?.text ?? doc.data.introduction,
      sourceKey: asset.sourceKey || doc.render?.input?.source?.key || (!doc.previewStale ? doc.assets?.source?.key : undefined),
    };
    return versions;
  }
  function present(doc) {
    const copy = structuredClone(doc);
    copy._id = String(doc._id);
    delete copy.ownerId; delete copy.activeRenderOwner;
    copy.assets = Object.fromEntries(Object.entries(doc.assets || {}).filter(([, asset]) => asset?.key).map(([name, asset]) => [name, { ...asset, url: storage.ready ? storage.signedUrl(asset.key) : "" }]));
    copy.languagePreviews = Object.fromEntries(Object.entries(previewVersions(doc)).filter(([language, asset]) => AVATAR_LANGUAGES.some((item) => item.value === language) && asset?.key).map(([language, asset]) => [language, {
      ...asset, url: storage.ready ? storage.signedUrl(asset.key) : "",
      stale: !doc.data.consent || asset.sourceKey !== doc.assets?.source?.key || (language === doc.data.language && asset.fingerprint !== avatarFingerprint(doc)),
    }]));
    copy.render = { status: doc.render?.status || "idle", stage: doc.render?.stage || "", error: doc.render?.error || "", inputRevision: doc.render?.inputRevision, jobId: doc.render?.jobId };
    return copy;
  }
  async function cleanup(key) { try { await storage.remove(key); } catch { /* Immutable orphan can be removed by a bucket lifecycle policy. */ } }
  function manifest(doc) {
    const input = doc.render.input;
    return { jobId: doc.render.jobId, sourceUrl: storage.signedUrl(input.source.key, "GET", 3600), sourceKind: input.source.kind,
      ...(input.audio ? { audioUrl: storage.signedUrl(input.audio.key, "GET", 3600) } : {}), text: input.text, language: input.language, voice: input.voice, mode: input.mode, maxIntroSeconds: input.maxIntroSeconds ?? AVATAR_LIMITS.maxIntroSeconds };
  }
  async function finishFailed(req, doc, message) {
    return await mutate(req, doc, { render: { ...doc.render, status: "failed", stage: "failed", error: message }, previewStale: !doc.assets?.preview || doc.assets.preview.fingerprint !== avatarFingerprint(doc) }, { activeRenderOwner: 1 }, { "render.jobId": doc.render.jobId }) || await find(req);
  }
  async function importResult(req, doc) {
    if (doc.render.importToken && Date.now() - new Date(doc.render.importStartedAt).getTime() < 180000) return doc;
    const importToken = randomUUID();
    const claimed = await mutate(req, doc, { "render.importToken": importToken, "render.importStartedAt": new Date(), "render.status": "processing", "render.stage": "saving_preview" }, {}, { "render.jobId": doc.render.jobId });
    if (!claimed) return find(req);
    const key = `avatars/${String(req.user._id)}/${doc._id}/previews/${doc.render.jobId}.mp4`;
    try {
      const bytes = await providers.result(doc.render.jobId);
      if (!bytes) avatarError(502, "RESULT_MISSING", "The renderer result is no longer available. Render again.");
      await storage.write(key, bytes, "video/mp4");
      // Re-read after the external write so edits made during rendering cannot
      // silently turn an old result into the current preview.
      for (let attempt = 0; attempt < 3; attempt++) {
        const latest = await find(req);
        if (latest.render?.jobId !== doc.render.jobId || latest.render?.importToken !== importToken) return latest;
        if (avatarFingerprint(latest) !== doc.render.fingerprint) {
          await cleanup(key);
          return finishFailed(req, latest, "Avatar inputs changed during rendering. Review your saved changes and render again.");
        }
        const preview = { key, mime: "video/mp4", kind: "video", name: "avatar-preview.mp4", size: bytes.length, fingerprint: doc.render.fingerprint, createdAt: new Date(), language: doc.render.input.language, introduction: doc.render.input.text, speechMode: doc.render.input.mode, sourceKey: doc.render.input.source.key };
        const ready = await mutate(req, latest, {
          "assets.preview": preview,
          languagePreviews: { ...previewVersions(latest), [preview.language]: preview },
          render: { ...latest.render, status: "ready", stage: "complete", error: "", importToken: null, importStartedAt: null }, previewStale: false,
        }, { activeRenderOwner: 1 }, { "render.jobId": doc.render.jobId, "render.importToken": importToken });
        if (ready) return ready;
      }
      return find(req);
    } catch (error) {
      const latest = await find(req);
      if (latest.render?.jobId === doc.render.jobId && latest.render?.importToken === importToken) {
        await mutate(req, latest, { "render.importToken": null, "render.importStartedAt": null, "render.stage": "preview_transfer_retry", "render.error": "Could not store the preview. Refresh to retry; your previous preview is unchanged." }, {}, { "render.importToken": importToken });
      }
      throw error;
    }
  }
  return {
    async capabilities(_req, res) {
      const health = await providers.health();
      const ttsReady = providers.tts && Boolean(health?.capabilities?.tts);
      res.json({ storage: { ready: storage.ready, reason: storage.reason }, renderer: { configured: providers.configured, available: Boolean(health?.capabilities?.render) }, languages: AVATAR_LANGUAGES, voices: ttsReady ? [{ value: "default", label: "Default configured voice" }] : [], limits: { maxUploadMB: AVATAR_LIMITS.maxUploadMB, maxIntroSeconds: AVATAR_LIMITS.maxIntroSeconds }, tts: { configured: ttsReady }, stt: { configured: providers.stt && Boolean(health?.capabilities?.stt) }, gemini: { configured: providers.gemini } });
    },
    async list(req, res) {
      const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
      const limit = [12, 24, 25, 50].includes(Number(req.query.limit)) ? Number(req.query.limit) : 12;
      const where = { ...owner(req), ...(req.query.active === "all" ? {} : { active: req.query.active !== "false" }) };
      if (req.query.search) {
        const search = String(req.query.search).slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        where["data.name"] = { $regex: search, $options: "i" };
      }
      const [items, total] = await Promise.all([model.find(where).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), model.countDocuments(where)]);
      res.json({ items: items.map(present), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
    },
    async create(req, res) {
      const doc = await model.create({ ...owner(req), data: normalizeAvatar(req.body?.data) });
      res.status(201).json(present(doc.toObject()));
    },
    async get(req, res) { res.json(present(await find(req))); },
    async save(req, res) {
      const doc = await find(req, true); ensureActive(doc);
      const data = normalizeAvatar(req.body?.data);
      const next = { ...doc, data };
      res.json(present(conflict(await mutate(req, doc, { data, languagePreviews: previewVersions(doc),
        ...(doc.assets?.audio && !doc.assets.audio.language ? { "assets.audio.language": doc.data.language } : {}),
        ...(doc.assets?.preview && !doc.assets.preview.language ? { "assets.preview.language": doc.render?.input?.language || doc.data.language } : {}),
        previewStale: !doc.assets?.preview || doc.assets.preview.fingerprint !== avatarFingerprint(next) }))));
    },
    async upload(req, res) {
      const doc = await find(req, true); ensureActive(doc); requireStorage();
      if (!req.file) avatarError(422, "FILE_REQUIRED", "Choose a media file to upload.");
      if (!doc.data.consent) avatarError(422, "CONSENT_REQUIRED", "Confirm permission to use the person's image and voice before uploading.");
      const { extension, ...asset } = inspectUpload(req.file.buffer, req.body.kind, req.file.originalname);
      const key = `avatars/${String(req.user._id)}/${doc._id}/${req.body.kind}/${randomUUID()}.${extension}`;
      await storage.write(key, req.file.buffer, asset.mime);
      const updated = await mutate(req, doc, { [`assets.${req.body.kind}`]: { ...asset, key, ...(req.body.kind === "audio" ? { language: doc.data.language } : {}), createdAt: new Date() }, previewStale: true });
      if (!updated) await cleanup(key);
      res.json(present(conflict(updated)));
    },
    async render(req, res) {
      const doc = await find(req, true); ensureActive(doc); requireStorage();
      if (running(doc)) return res.status(202).json(present(doc));
      if (doc.assets?.preview && !doc.previewStale && doc.assets.preview.fingerprint === avatarFingerprint(doc)) return res.status(200).json(present(doc));
      const cached = doc.languagePreviews?.[doc.data.language];
      if (cached?.fingerprint === avatarFingerprint(doc)) {
        const restored = conflict(await mutate(req, doc, { "assets.preview": cached, previewStale: false, render: { status: "ready", stage: "complete", error: "" } }));
        return res.status(200).json(present(restored));
      }
      if (!providers.configured) avatarError(503, "RENDERER_UNAVAILABLE", "Configure the private CPU avatar renderer first.");
      if (!doc.data.consent) avatarError(422, "CONSENT_REQUIRED", "Confirm permission to use this person's image and voice.");
      if (!doc.assets?.source) avatarError(422, "SOURCE_REQUIRED", "Upload a portrait image or source video first.");
      if (doc.data.speechMode === "upload" && !doc.assets?.audio) avatarError(422, "AUDIO_REQUIRED", "Upload or record introduction audio first.");
      if (doc.data.speechMode === "upload" && doc.assets.audio.language && doc.assets.audio.language !== doc.data.language) avatarError(422, "AUDIO_LANGUAGE_MISMATCH", "Upload or record audio in the selected introduction language. Changing the language does not translate existing audio.");
      if (doc.data.speechMode === "tts") {
        if (!providers.tts) avatarError(503, "TTS_UNAVAILABLE", "Text to speech has not been configured. Upload audio instead.");
        if (!doc.data.introduction) avatarError(422, "INTRODUCTION_REQUIRED", "Write an introduction before generating speech.");
        if (doc.data.language === "hinglish") avatarError(422, "TTS_LANGUAGE_UNAVAILABLE", "Hinglish currently requires uploaded audio. Text to speech supports English and Hindi.");
      }
      const health = await providers.health();
      if (!health?.capabilities?.render || (doc.data.speechMode === "tts" && !health.capabilities.tts)) avatarError(503, "RENDERER_NOT_READY", "The renderer or selected speech provider is not ready. Check service health and model setup.");
      const fingerprint = avatarFingerprint(doc), jobId = randomUUID();
      const render = { status: "queued", stage: "submitting", error: "", inputRevision: doc.revision, jobId, fingerprint, startedAt: new Date(),
        input: { source: doc.assets.source, ...(doc.data.speechMode === "upload" ? { audio: doc.assets.audio } : {}), text: doc.data.introduction, language: doc.data.language, voice: doc.data.voice, mode: doc.data.speechMode, maxIntroSeconds: AVATAR_LIMITS.maxIntroSeconds } };
      let queued;
      try { queued = conflict(await mutate(req, doc, { render, activeRenderOwner: String(req.user._id) })); }
      catch (error) { if (error.code === 11000) avatarError(409, "RENDER_ALREADY_ACTIVE", "Another avatar is rendering for your account. Finish or refresh that job before starting another."); throw error; }
      try {
        const state = await providers.submit(manifest(queued));
        if (state?.status === "failed") queued = await finishFailed(req, queued, state.error || "Renderer rejected the request.");
        else if (state) queued = await mutate(req, queued, { "render.status": state.status === "ready" ? "processing" : state.status, "render.stage": state.stage || state.status }) || await find(req);
      } catch (error) {
        if (error.status === 422) {
          queued = await finishFailed(req, queued, error.message);
          return res.status(202).json(present(queued));
        }
        // A POST timeout may occur after the worker accepted the job. Keep the
        // same durable job ID; explicit polling reconciles it without duplication.
        queued = await mutate(req, queued, { "render.stage": "awaiting_confirmation", "render.error": "Renderer confirmation is pending. Refresh this job to reconcile its status." }) || await find(req);
      }
      res.status(202).json(present(queued));
    },
    async refresh(req, res) {
      let doc = await find(req);
      if (!running(doc)) return res.json(present(doc));
      requireStorage();
      if (Date.now() - new Date(doc.render.startedAt).getTime() > 2 * 60 * 60 * 1000) return res.json(present(await finishFailed(req, doc, "Rendering exceeded the two-hour job window. Check the worker and try again.")));
      if (avatarFingerprint(doc) !== doc.render.fingerprint) {
        // Keep the owner reservation until the old worker job terminates.
        const state = await providers.status(doc.render.jobId);
        if (!state || ["ready", "failed"].includes(state.status)) return res.json(present(await finishFailed(req, doc, "Avatar inputs changed during rendering. Render again to preview the saved version.")));
        return res.json(present(doc));
      }
      let state = await providers.status(doc.render.jobId);
      if (!state) state = await providers.submit(manifest(doc));
      if (state.status === "ready") doc = await importResult(req, doc);
      else if (state.status === "failed") doc = await finishFailed(req, doc, state.error || `The renderer could not produce a preview. Check that the portrait has a clear face and audio is no longer than ${AVATAR_LIMITS.maxIntroSeconds} seconds.`);
      else if (state.status !== doc.render.status || state.stage !== doc.render.stage || doc.render.error) doc = await mutate(req, doc, { "render.status": state.status, "render.stage": state.stage, "render.error": "" }, {}, { "render.jobId": doc.render.jobId }) || await find(req);
      res.json(present(doc));
    },
    async transcribe(req, res) {
      const doc = await find(req, true); ensureActive(doc); requireStorage();
      if (!doc.data.consent) avatarError(422, "CONSENT_REQUIRED", "Confirm consent before transcribing uploaded audio.");
      if (!doc.assets?.audio) avatarError(422, "AUDIO_REQUIRED", "Upload introduction audio before transcribing.");
      const text = await providers.transcribe(storage.signedUrl(doc.assets.audio.key, "GET", 600), doc.data.language);
      await find(req, true);
      res.json({ text });
    },
    async assist(req, res) {
      const doc = await find(req, true); ensureActive(doc);
      const { action, language = doc.data.language } = req.body;
      if (!["improve", "translate"].includes(action) || !AVATAR_LANGUAGES.some((item) => item.value === language)) avatarError(422, "INVALID_ASSIST_ACTION", "Choose improve or translate and a supported language.");
      if (!doc.data.introduction) avatarError(422, "INTRODUCTION_REQUIRED", "Save an introduction before asking for a suggestion.");
      const text = await providers.assist(doc.data, action, language);
      await find(req, true);
      res.json({ text });
    },
    async archive(req, res) {
      const doc = await find(req, true);
      if (typeof req.body.active !== "boolean") avatarError(422, "INVALID_ACTIVE_STATE", "Specify whether the avatar should be active.");
      if (running(doc)) avatarError(409, "RENDER_IN_PROGRESS", "Wait for the render to finish before archiving this avatar.");
      res.json(present(conflict(await mutate(req, doc, { active: req.body.active }))));
    },
  };
}
