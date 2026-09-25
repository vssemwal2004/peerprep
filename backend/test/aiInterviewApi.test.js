import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createAuthoringRouter } from "../src/routes/aiInterviews.js";
import AIInterview from "../src/models/AIInterview.js";
import Resource from "../src/models/AIInterviewResource.js";
import QuestionLibrary from "../src/models/QuestionLibrary.js";

// Dedicated ephemeral MongoDB only. Never loads application setup or .env.
let mongo, server, base;
const adminA = new mongoose.Types.ObjectId().toString(),
  adminB = new mongoose.Types.ObjectId().toString();
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
    createAuthoringRouter((req, _res, next) => {
      req.user = {
        _id: req.get("X-Test-Owner") || adminA,
        role: req.get("X-Test-Role") || "admin",
      };
      next();
    }),
  );
  app.use((err, _req, res, _next) =>
    res.status(500).json({ error: err.message }),
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
  const cap = await call("/capabilities");
  assert.equal(cap.status, 200);
  assert.equal(cap.body.questionGeneration, false);
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
