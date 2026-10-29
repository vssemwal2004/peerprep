import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createAuthoringRouter } from "../src/routes/aiInterviews.js";
import AIInterview from "../src/models/AIInterview.js";
import Resource from "../src/models/AIInterviewResource.js";
import QuestionLibrary from "../src/models/QuestionLibrary.js";
import { AnviAttempt, AnviResumeContext } from "../src/modules/anviInterview/anviInterview.models.js";
import { AnviAssignment, AnviAssignmentTarget, AnviBooking, AnviSlot } from "../src/modules/anviInterview/anviInterview.scheduling.models.js";

// Dedicated ephemeral MongoDB only. Never loads application setup or .env.
let mongo, server, base;
const adminA = new mongoose.Types.ObjectId().toString(),
  adminB = new mongoose.Types.ObjectId().toString();
// Fake Gemini for generate-questions: never calls the real API.
const geminiCalls = [];
let geminiReply = async () => ({ questions: [] });
const fakeGemini = {
  generateJson: async (request) => {
    geminiCalls.push(request);
    return geminiReply(request);
  },
};
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "ai_authoring_test" });
  await Promise.all([
    AIInterview.init(),
    Resource.init(),
    QuestionLibrary.init(),
  ]);
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(
    "/api/ai-interviews",
    createAuthoringRouter(
      (req, _res, next) => {
        req.user = {
          _id: req.get("X-Test-Owner") || adminA,
          role: req.get("X-Test-Role") || "admin",
        };
        next();
      },
      { gemini: fakeGemini },
    ),
  );
  app.use((err, _req, res, _next) =>
    res.status(err.status || 500).json({ code: err.code, error: err.message }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/ai-interviews`;
});
after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose.disconnect();
  await mongo?.stop();
});
const call = async (path = "", method = "GET", body, headers = {}) => {
  const result = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: result.status, body: await result.json() };
};
// ANVI readiness is GEMINI_API_KEY; tests set or clear it explicitly and restore it afterwards.
const withGeminiKey = async (value, work) => {
  const old = process.env.GEMINI_API_KEY;
  if (value === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = value;
  try {
    return await work();
  } finally {
    if (old === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = old;
  }
};
const create = (title = "Interview") =>
  call(
    "",
    "POST",
    { data: { title } },
    { "Idempotency-Key": crypto.randomUUID() },
  );
test("only administrators can use authoring endpoints", async () => {
  for (const role of ["student", "coordinator"])
    assert.equal(
      (await call("/capabilities", "GET", undefined, { "X-Test-Role": role }))
        .status,
      403,
    );
  const cap = await withGeminiKey(undefined, () => call("/capabilities"));
  assert.equal(cap.status, 200);
  assert.equal(cap.body.questionGeneration, true);
  assert.equal(cap.body.aiConfigured, false);
  const ready = await withGeminiKey("test-gemini-key", () => call("/capabilities"));
  assert.equal(ready.body.aiConfigured, true);
});
test("companies persist, normalize duplicates and are owner scoped", async () => {
  const [a, b] = await Promise.all([
    call("/resources/companies", "POST", { name: "Trilok Steel" }),
    call("/resources/companies", "POST", { name: "  TRILOK  Steel " }),
  ]);
  assert.ok([201, 409].includes(a.status));
  assert.ok([201, 409].includes(b.status));
  const listed = await call("/resources/companies");
  assert.equal(listed.body.items.length, 1);
  const other = await call("/resources/companies", "GET", undefined, {
    "X-Test-Owner": adminB,
  });
  assert.equal(other.body.items.length, 0);
});
test("creation retries are idempotent and save uses atomic parent revision", async () => {
  const headers = { "Idempotency-Key": crypto.randomUUID() };
  const a = await call(
      "",
      "POST",
      { data: { title: "Retry-safe draft" } },
      headers,
    ),
    b = await call(
      "",
      "POST",
      { data: { title: "Retry-safe draft" } },
      headers,
    );
  assert.equal(a.status, 201);
  assert.equal(a.body._id, b.body._id);
  const path = `/${a.body._id}`;
  const updates = await Promise.all(
    ["First", "Second"].map((title) =>
      call(path, "PUT", { revision: 1, data: { ...a.body.data, title } }),
    ),
  );
  assert.deepEqual(updates.map((x) => x.status).sort(), [200, 409]);
  assert.equal((await call(path)).body.revision, 2);
  assert.equal(
    (await call(path, "GET", undefined, { "X-Test-Owner": adminB })).status,
    404,
  );
  assert.equal(
    (
      await call(
        path,
        "PUT",
        { revision: 2, data: a.body.data },
        { "X-Test-Owner": adminB },
      )
    ).status,
    404,
  );
});
test("validate, edit invalidation, archive, restore and typed deletion work", async () => {
  let doc = (await create("Lifecycle")).body;
  let value = await call(`/${doc._id}/validate`, "POST", {
    revision: doc.revision,
  });
  assert.equal(value.status, 200);
  assert.equal(value.body.validation.complete, false);
  doc = value.body;
  value = await call(`/${doc._id}/archive`, "POST", { revision: doc.revision });
  assert.equal(value.status, 200);
  doc = value.body;
  assert.equal(
    (
      await call(`/${doc._id}`, "PUT", {
        revision: doc.revision,
        data: doc.data,
      })
    ).status,
    409,
  );
  value = await call(`/${doc._id}/restore`, "POST", { revision: doc.revision });
  assert.equal(value.status, 200);
  doc = value.body;
  assert.equal(
    (
      await call(`/${doc._id}`, "DELETE", {
        revision: doc.revision,
        title: "wrong",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await call(`/${doc._id}`, "DELETE", {
        revision: doc.revision,
        title: doc.title,
      })
    ).status,
    200,
  );
  assert.equal((await call(`/${doc._id}`)).status, 404);
});
test("profiles snapshot on selection, validation is atomic, subsequent edits invalidate it", async () => {
  const profile = (
    await call("/resources/profiles", "POST", {
      name: "Professional",
      data: { displayName: "ANNU" },
    })
  ).body;
  const data = {
    title: "Complete example",
    role: "Engineer",
    experience: "junior",
    difficulty: "easy",
    interviewer: {
      profileId: profile._id,
      profileRevision: profile.revision,
      displayName: "Fake override",
    },
    sections: [
      {
        id: "s1",
        name: "Technical",
        weight: 100,
        groups: [
          {
            id: "g1",
            name: "REST",
            weight: 100,
            source: "annu",
            annu: { requirements: "Test REST", targetCount: 2 },
          },
        ],
      },
    ],
    rubric: [{ id: "r1", name: "Correctness", weight: 100 }],
  };
  let doc = (
    await call("", "POST", { data }, { "Idempotency-Key": crypto.randomUUID() })
  ).body;
  assert.equal(doc.data.interviewer.displayName, "ANNU");
  doc = (await call(`/${doc._id}/validate`, "POST", { revision: doc.revision }))
    .body;
  assert.equal(doc.validation.complete, true);
  assert.equal(doc.validation.validatedRevision, doc.revision);
  const stored = await AIInterview.findById(doc._id).lean();
  assert.equal(stored.validatedSnapshot.data.title, data.title);
  await call(`/resources/profiles/${profile._id}`, "PUT", {
    ...profile,
    data: { ...profile.data, displayName: "Updated name" },
  });
  doc = (
    await call(`/${doc._id}`, "PUT", {
      revision: doc.revision,
      data: { ...doc.data, description: "Changed" },
    })
  ).body;
  assert.equal(doc.data.interviewer.displayName, "ANNU");
  assert.equal(doc.validation.complete, false);
});
test("release requires a validated revision and keeps the student snapshot stable through draft edits", async () => {
  const profile = (await call("/resources/profiles", "POST", { name: `Release ${crypto.randomUUID()}`, data: { displayName: "ANNU" } })).body;
  const data = {
    title: "Release flow", role: "Engineer", experience: "junior", difficulty: "easy",
    interviewer: { profileId: profile._id, profileRevision: profile.revision },
    sections: [{ id: "s1", name: "Technical", weight: 100, groups: [{
      id: "g1", name: "APIs", weight: 100, source: "manual",
      questions: [{ id: "q1", kind: "topic", prompt: "REST", maxFollowUps: 2 }],
    }] }],
    rubric: [{ id: "r1", name: "Clarity", weight: 100 }],
  };
  let doc = (await call("", "POST", { data }, { "Idempotency-Key": crypto.randomUUID() })).body;
  assert.equal((await call(`/${doc._id}/publish`, "POST", { revision: doc.revision })).status, 422);
  doc = (await call(`/${doc._id}/validate`, "POST", { revision: doc.revision })).body;
  const blocked = await withGeminiKey(undefined, () => call(`/${doc._id}/publish`, "POST", { revision: doc.revision }));
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.code, "AI_NOT_CONFIGURED");
  assert.match(blocked.body.error, /GEMINI_API_KEY/);
  await withGeminiKey("test-gemini-key", async () => {
    doc = (await call(`/${doc._id}/publish`, "POST", { revision: doc.revision })).body;
    assert.equal(doc.publishedRevision, doc.revision);
    doc = (await call(`/${doc._id}`, "PUT", { revision: doc.revision, data: { ...doc.data, description: "New draft" } })).body;
    assert.equal(doc.validation.complete, false);
    assert.equal((await AIInterview.findById(doc._id).lean()).publishedSnapshot.data.description, "");
    doc = (await call(`/${doc._id}/validate`, "POST", { revision: doc.revision })).body;
    doc = (await call(`/${doc._id}/publish`, "POST", { revision: doc.revision })).body;
    assert.equal((await AIInterview.findById(doc._id).lean()).publishedSnapshot.data.description, "New draft");
    doc = (await call(`/${doc._id}/archive`, "POST", { revision: doc.revision })).body;
    assert.equal(doc.publishedAt, undefined);
    assert.equal((await AIInterview.findById(doc._id).lean()).publishedSnapshot, undefined);
  });
});
test("deleting a draft also deletes its schedules and finished student data", async () => {
  const doc = (await create("Attempted")).body;
  const studentId = new mongoose.Types.ObjectId();
  const assignment = await AnviAssignment.create({
    ownerId: adminA, interviewId: doc._id, snapshotRevision: 1, snapshotData: { title: doc.title }, title: doc.title,
    audience: { source: "selected", studentCount: 1 },
    window: { opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 60_000) },
    status: "open",
  });
  const attempt = await AnviAttempt.create({
    studentId, interviewId: doc._id, assignmentId: assignment._id, snapshotRevision: 1,
    hardDeadline: new Date(Date.now() + 60_000), status: "ready",
  });
  await Promise.all([
    AnviAssignmentTarget.create({ assignmentId: assignment._id, studentId, outcome: "completed", attemptsUsed: 1, lastAttemptId: attempt._id }),
    AnviSlot.create({ assignmentId: assignment._id, startsAt: new Date(Date.now() + 10_000), endsAt: new Date(Date.now() + 50_000), capacity: 1 }),
    AnviBooking.create({ assignmentId: assignment._id, studentId, startsAt: new Date(Date.now() - 60_000), endsAt: new Date(), status: "completed", active: false, attemptId: attempt._id }),
    AnviResumeContext.create({ studentId, interviewId: doc._id, assignmentId: assignment._id, source: "upload", text: "Redacted resume", expiresAt: new Date(Date.now() + 60_000) }),
    mongoose.connection.collection("aiinterviewsessions").insertOne({ interviewId: new mongoose.Types.ObjectId(doc._id), studentId }),
  ]);
  const result = await call(`/${doc._id}`, "DELETE", { revision: doc.revision, title: doc.title });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.deleted, true);
  assert.equal(await AIInterview.exists({ _id: doc._id }), null);
  assert.equal(await AnviAssignment.countDocuments({ interviewId: doc._id }), 0);
  assert.equal(await AnviAssignmentTarget.countDocuments({ assignmentId: assignment._id }), 0);
  assert.equal(await AnviSlot.countDocuments({ assignmentId: assignment._id }), 0);
  assert.equal(await AnviBooking.countDocuments({ assignmentId: assignment._id }), 0);
  assert.equal(await AnviAttempt.countDocuments({ interviewId: doc._id }), 0);
  assert.equal(await AnviResumeContext.countDocuments({ interviewId: doc._id }), 0);
  assert.equal(await mongoose.connection.collection("aiinterviewsessions").countDocuments({ interviewId: new mongoose.Types.ObjectId(doc._id) }), 0);
});
test("a genuinely live attempt must end before its interview can be deleted", async () => {
  const doc = (await create("Live attempt")).body;
  await AnviAttempt.create({
    studentId: new mongoose.Types.ObjectId(), interviewId: doc._id, snapshotRevision: 1,
    hardDeadline: new Date(Date.now() + 60_000), status: "in_progress",
  });
  const result = await call(`/${doc._id}`, "DELETE", { revision: doc.revision, title: doc.title });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "INTERVIEW_IN_PROGRESS");
  assert.ok(await AIInterview.exists({ _id: doc._id }));
});
test("directory is paginated and excludes prompts and internal snapshots", async () => {
  const seed = Array.from({ length: 30 }, (_, i) => ({
    ownerId: adminA,
    creationKey: `seed_${i}`,
    title: `Page item ${i}`,
    data: { secret: "Never in directory" },
  }));
  await AIInterview.insertMany(seed);
  const result = await call("?page=2&limit=25");
  assert.equal(result.status, 200);
  assert.equal(result.body.pagination.page, 2);
  assert.ok(result.body.items.length <= 25);
  assert.ok(result.body.pagination.total >= 30);
  for (const item of result.body.items) {
    assert.equal(item.data, undefined);
    assert.equal(item.validatedSnapshot, undefined);
    assert.equal(item.history, undefined);
  }
  assert.equal((await call("?search=.*")).body.items.length, 0);
});
test("Library adapter exposes only compatible authorized short-answer content", async () => {
  await QuestionLibrary.create([
    {
      sourceKey: "private-other",
      questionType: "short",
      questionText: "Secret",
      questionData: {},
      visibility: "private",
      createdBy: adminB,
    },
    {
      sourceKey: "own",
      questionType: "short",
      questionText: "Own question",
      questionData: {},
      visibility: "private",
      createdBy: adminA,
    },
    {
      sourceKey: "coding",
      questionType: "coding",
      questionData: {},
      visibility: "public",
      status: "published",
    },
  ]);
  const result = await call("/library");
  assert.deepEqual(
    result.body.items.map((x) => x.questionText),
    ["Own question"],
  );
});

test("malformed nested payloads fail validation, not internal server errors", async () => {
  for (const data of [
    { title: "Broken", sections: [null] },
    { title: "Broken", rules: null },
    { title: "Broken", rubric: [null] },
    {
      title: "Broken",
      sections: [
        {
          id: "s1",
          groups: [
            {
              id: "g1",
              source: "manual",
              questions: [{ id: "q1", subquestions: [null] }],
            },
          ],
        },
      ],
    },
  ]) {
    const result = await call(
      "",
      "POST",
      { data },
      { "Idempotency-Key": crypto.randomUUID() },
    );
    assert.equal(result.status, 422);
    assert.equal(result.body.code, "VALIDATION_FAILED");
  }
});

test("foreign companies and profiles cannot be attached to an owned interview", async () => {
  const otherCompany = (
    await call(
      "/resources/companies",
      "POST",
      { name: "Private company" },
      { "X-Test-Owner": adminB },
    )
  ).body;
  const result = await call(
    "",
    "POST",
    { data: { title: "Owned", companyId: otherCompany._id } },
    { "Idempotency-Key": crypto.randomUUID() },
  );
  assert.equal(result.status, 422);
});

test("new question fields and anvi settings round-trip through save with defaults", async () => {
  const data = {
    title: "ANVI settings",
    sections: [{ id: "s1", name: "Technical", weight: 100, groups: [{
      id: "g1", name: "APIs", weight: 100, source: "manual",
      questions: [{ id: "q1", prompt: "Explain REST.", marks: 30, competency: "API design", skippable: false, maxFollowUps: 5 }],
    }] }],
    anvi: { persona: { tone: "friendly", introduction: "Hi {name}" }, turns: { silenceSeconds: 3, maxNudges: 9 } },
  };
  const doc = (await call("", "POST", { data }, { "Idempotency-Key": crypto.randomUUID() })).body;
  assert.equal(doc.data.sections[0].groups[0].questions[0].marks, 30);
  assert.equal(doc.data.sections[0].groups[0].questions[0].skippable, false);
  assert.equal(doc.data.sections[0].groups[0].questions[0].maxFollowUps, 5);
  assert.deepEqual(doc.data.anvi, {
    liveQuestionCount: null,
    persona: { tone: "friendly", pace: "normal", acknowledgements: true, introduction: "Hi {name}", closing: "" },
    turns: { silenceSeconds: 3, nudgeSeconds: 45, maxNudges: 3, voiceCommands: true },
    conduct: { endByVoice: false, finishAllQuestions: true, noPersonalQuestions: true, termsText: "", requireTermsAcceptance: false },
    warmup: { enabled: true, icebreakers: 2, tellMeAboutYourself: true, scored: false },
    resume: { mode: "none", sources: ["builder", "upload"], questionCount: 2 },
    language: { primary: "English", studentChoice: [], strict: true, onOtherLanguage: "remind_and_flag" },
    voice: { name: "", languageCode: "" },
    avatar: { enabled: false, avatarId: "" },
    proctoring: {
      enabled: false, fullscreen: "off", pauseOutsideFullscreen: true, tabSwitch: "off", refresh: "off",
      blockRightClick: true, blockCopyPaste: true, blockShortcuts: true, warnings: 3, maxViolations: 0, onLimit: "end",
      ai: {
        enabled: false, detectMobile: true, detectMultiplePersons: true, detectNoFace: true, detectFaceOutOfFrame: true,
        faceOutOfFrameGraceSec: 10, detectLookingAway: true, detectionIntervalMs: 500, ignoreLimit: 5, violationCooldownSec: 20,
        criticalAutoFlag: true,
      },
    },
  });
  assert.equal(doc.summary.totalMarks, 30);
  assert.equal(doc.summary.proctoring.enabled, false);
  // Invalid proctoring settings are refused with 422; valid ones round-trip.
  const invalid = await call("", "POST", { data: { ...data, anvi: { proctoring: { maxViolations: 99 } } } }, { "Idempotency-Key": crypto.randomUUID() });
  assert.equal(invalid.status, 422);
  const proctored = (await call("", "POST", { data: { ...data, anvi: { proctoring: { enabled: true, fullscreen: "required", maxViolations: 2 } } } }, { "Idempotency-Key": crypto.randomUUID() })).body;
  assert.equal(proctored.data.anvi.proctoring.maxViolations, 2);
  assert.equal(proctored.summary.proctoring.fullscreen, "required");
  assert.deepEqual(doc.summary.language, { primary: "English", choices: ["English"], strict: true, onOtherLanguage: "remind_and_flag" });
  const old = (await create("No anvi yet")).body;
  assert.equal(old.data.anvi.turns.silenceSeconds, 2);

  // Every interview is English only (DECISIONS #0): another language or a student choice is saved as English.
  const path = `/${doc._id}`;
  let saved = (await call(path, "PUT", { revision: doc.revision, data: {
    ...doc.data, anvi: { ...doc.data.anvi, language: { primary: "Hindi", studentChoice: ["English", "Hindi"], strict: false, onOtherLanguage: "remind" } },
  } })).body;
  assert.deepEqual(saved.data.anvi.language, { primary: "English", studentChoice: [], strict: true, onOtherLanguage: "remind_and_flag" });
  assert.equal(saved.data.rules.language, "English");
  assert.deepEqual(saved.summary.language.choices, ["English"]);
  saved = (await call(path, "PUT", { revision: saved.revision, data: { ...saved.data, rules: { ...saved.data.rules, language: "Hinglish" } } })).body;
  assert.equal(saved.data.anvi.language.primary, "English");
  assert.equal(saved.data.rules.language, "English");
  assert.deepEqual(saved.data.anvi.language.studentChoice, []);
  saved = (await call(path, "PUT", { revision: saved.revision, data: {
    ...saved.data, rules: { ...saved.data.rules, language: "Hindi" }, anvi: { ...saved.data.anvi, language: { ...saved.data.anvi.language, primary: "English" } },
  } })).body;
  assert.equal(saved.data.anvi.language.primary, "English");
  assert.equal(saved.data.rules.language, "English");
  const bad = await call(path, "PUT", { revision: saved.revision, data: { ...saved.data, anvi: { ...saved.data.anvi, language: { primary: "Tamil" } } } });
  assert.equal(bad.status, 422);
  const cap = await call("/capabilities");
  assert.equal(cap.body.limits.followUps, 5);
  assert.equal(cap.body.limits.generateQuestions, 20);
});

const generationDraft = (owner) =>
  call(
    "",
    "POST",
    {
      data: {
        title: "Generate", role: "Backend developer", experience: "fresher", difficulty: "easy",
        rules: { language: "Hinglish" },
        sections: [{ id: "s1", name: "Technical", instructions: "Keep it practical.", weight: 100, groups: [
          { id: "g1", name: "APIs", weight: 100, source: "annu", annu: { requirements: "Ask about REST APIs.", skills: ["HTTP"], exclusions: "GraphQL", targetCount: 2 } },
        ] }],
      },
    },
    { "X-Test-Owner": owner, "Idempotency-Key": crypto.randomUUID() },
  );

test("generate-questions drafts reviewable questions with a fake Gemini and saves nothing", async () => {
  const owner = new mongoose.Types.ObjectId().toString();
  const headers = { "X-Test-Owner": owner };
  const doc = (await generationDraft(owner)).body;
  const generate = (body, extra = headers) =>
    withGeminiKey("test-gemini-key", () => call(`/${doc._id}/generate-questions`, "POST", body, extra));
  geminiCalls.length = 0;
  geminiReply = async () => ({
    questions: [
      { text: "Question 1: What is the difference between PUT and PATCH?", keyPoints: ["PUT replaces the resource", "PATCH updates part of it", " "] },
      { text: "What is the difference between PUT and PATCH?", keyPoints: [] },
      { text: "<b>How</b> would you version a REST API?", keyPoints: ["URL or header versioning"] },
      { text: "A third question beyond the requested count?", keyPoints: [] },
    ],
  });
  const result = await generate({ groupId: "g1", count: 2 });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.questions, [
    {
      prompt: "What is the difference between PUT and PATCH?",
      expectedAnswer: "PUT replaces the resource\nPATCH updates part of it",
      keyPoints: ["PUT replaces the resource", "PATCH updates part of it"],
    },
    { prompt: "How would you version a REST API?", expectedAnswer: "URL or header versioning", keyPoints: ["URL or header versioning"] },
  ]);
  assert.equal(geminiCalls.length, 1);
  const sent = geminiCalls[0];
  // The draft asked for Hinglish; the interview language is always English (DECISIONS #0).
  for (const content of ["Ask about REST APIs.", "Backend developer", "English", "GraphQL", "Keep it practical."])
    assert.ok(sent.parts[0].text.includes(content), `Prompt includes ${content}`);
  assert.match(sent.systemText, /exactly 2 questions/);
  assert.ok(sent.schema);
  const stored = await AIInterview.findById(doc._id).lean();
  assert.equal(stored.revision, doc.revision, "Generation never saves the draft");
  assert.equal(stored.data.sections[0].groups[0].source, "annu");

  // A topic staged in the drawer but not saved yet is described by the request body.
  const unsaved = await generate({ groupId: "stagedTopic", count: 1, requirements: "Ask about caching.", skills: ["Redis"], difficulty: "hard" });
  assert.equal(unsaved.status, 200);
  const staged = JSON.parse(geminiCalls.at(-1).parts[0].text.match(/<context>(.*)<\/context>/)[1]);
  assert.equal(staged.difficulty, "hard");
  assert.deepEqual(staged.skills, ["Redis"]);
  assert.match(geminiCalls.at(-1).parts[0].text, /Ask about caching\./);

  for (const body of [
    { count: 2 },
    { groupId: "g1", count: 0 },
    { groupId: "g1", count: 21 },
    { groupId: "bad id!", count: 1 },
    { groupId: "missing", count: 1 },
    { groupId: "g1", count: 1, difficulty: "extreme" },
  ]) {
    const invalid = await generate(body);
    assert.equal(invalid.status, 422, JSON.stringify(body));
    assert.equal(invalid.body.code, "VALIDATION_FAILED");
  }
  assert.equal(geminiCalls.length, 2, "Invalid requests never reach Gemini");

  geminiReply = async () => {
    throw new Error("upstream unavailable");
  };
  const failed = await generate({ groupId: "g1", count: 1 });
  assert.equal(failed.status, 502);
  assert.equal(failed.body.code, "GENERATION_FAILED");

  const foreign = await generate({ groupId: "g1", count: 1 }, { "X-Test-Owner": adminB });
  assert.equal(foreign.status, 404);
  const student = await generate({ groupId: "g1", count: 1 }, { ...headers, "X-Test-Role": "student" });
  assert.equal(student.status, 403);
});

test("generate-questions returns 503 without GEMINI_API_KEY and never calls Gemini", async () => {
  const owner = new mongoose.Types.ObjectId().toString();
  const doc = (await generationDraft(owner)).body;
  geminiCalls.length = 0;
  const blocked = await withGeminiKey(undefined, () =>
    call(`/${doc._id}/generate-questions`, "POST", { groupId: "g1", count: 2 }, { "X-Test-Owner": owner }),
  );
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.code, "AI_NOT_CONFIGURED");
  assert.match(blocked.body.error, /GEMINI_API_KEY/);
  assert.equal(geminiCalls.length, 0);
});

test("generate-questions is limited to 10 requests per minute per admin", async () => {
  const owner = new mongoose.Types.ObjectId().toString(),
    other = new mongoose.Types.ObjectId().toString();
  const [doc, otherDoc] = [(await generationDraft(owner)).body, (await generationDraft(other)).body];
  geminiReply = async () => ({ questions: [{ text: "Explain idempotent HTTP methods.", keyPoints: ["GET", "PUT"] }] });
  await withGeminiKey("test-gemini-key", async () => {
    const send = (id, as) =>
      fetch(`${base}/${id}/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Test-Owner": as },
        body: JSON.stringify({ groupId: "g1", count: 1 }),
      });
    for (let i = 0; i < 10; i += 1) assert.equal((await send(doc._id, owner)).status, 200);
    const limited = await send(doc._id, owner);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) >= 1);
    const body = await limited.json();
    assert.equal(body.code, "RATE_LIMITED");
    assert.ok(body.retryAfterSeconds >= 1);
    assert.equal((await send(otherDoc._id, other)).status, 200, "Limits are per admin");
  });
});
