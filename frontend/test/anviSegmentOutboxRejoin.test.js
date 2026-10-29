import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// The segment outbox after a new join: the server's segment assembler belongs to the lease holder, so a
// new join starts with an empty one that accepts chunks in index order only. `resend({ full: true })`
// therefore sends every chunk of a held segment again from index 0; a plain resend (same holder) still
// sends only the chunks that were not acknowledged.
let server, outboxModule;

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  outboxModule = await server.ssrLoadModule("/src/student/anvi/anviSegmentOutbox.js");
});

after(async () => { await server?.close(); });

const TURN = "11111111-1111-4111-8111-111111111111";
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const of = (sent, event) => sent.filter((entry) => entry.event === event);

function harness() {
  const sent = [];
  let n = 0;
  const outbox = outboxModule.createAnviSegmentOutbox({
    emit: (event, payload, ack) => sent.push({ event, payload, ack }),
    connected: () => true,
    randomId: () => uuid(++n),
  });
  outbox.setTurn(TURN);
  return { outbox, sent };
}

test("a full resend after a new join sends every chunk again from index 0, same segmentId", () => {
  const { outbox, sent } = harness();
  const id = outbox.send({ turnId: TURN, pcm: new Uint8Array(70000), durationMs: 2000 });
  const chunks = of(sent, "anvi:seg-chunk");
  chunks[0].ack({ ok: true });
  chunks[1].ack({ ok: true });
  sent.length = 0;
  assert.equal(outbox.resend({ full: true }), 1);
  const resent = of(sent, "anvi:seg-chunk");
  assert.deepEqual(resent.map((entry) => entry.payload.index), [0, 1, 2]);
  assert.ok(resent.every((entry) => entry.payload.segmentId === id));
  assert.equal(of(sent, "anvi:seg-commit")[0].payload.totalBytes, 70000);
});

test("a plain resend (same holder) still skips acknowledged chunks", () => {
  const { outbox, sent } = harness();
  outbox.send({ turnId: TURN, pcm: new Uint8Array(70000), durationMs: 2000 });
  of(sent, "anvi:seg-chunk")[0].ack({ ok: true });
  sent.length = 0;
  assert.equal(outbox.resend(), 1);
  assert.deepEqual(of(sent, "anvi:seg-chunk").map((entry) => entry.payload.index), [1, 2]);
});
