// WP0 re-run: non-streaming Gemini TTS now answers with inlineData audio/wav (a RIFF file), not raw L16.
import assert from "node:assert/strict";
import { test } from "node:test";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { createGeminiClient } from "../src/modules/anviInterview/anviInterview.gemini.js";
import { wrapWav } from "../src/modules/anviInterview/anviInterview.wav.js";

const config = anviConfig({ GEMINI_API_KEY: "test-key-wav", ANVI_TTS_FALLBACK_MODEL: "gemini-3.8-flash-lite-tts" });
const wavReply = (data, mimeType = "audio/wav") => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ inlineData: { mimeType, data: data.toString("base64") } }] } }],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 300, totalTokenCount: 312, candidatesTokensDetails: [{ modality: "AUDIO", tokenCount: 300 }] },
}));
const client = (script) => createGeminiClient({
  config,
  sleep: async () => {},
  fetcher: async () => {
    const next = script.shift();
    if (!next) throw new Error("unexpected call");
    return next;
  },
});

test("synthesizeSpeech unwraps an audio/wav reply to its PCM and sample rate", async () => {
  const pcm = Buffer.alloc(4800, 1);
  const clip = await client([wavReply(wrapWav(pcm, { sampleRate: 24000 }))]).synthesizeSpeech({ text: "Question one." });
  assert.equal(clip.sampleRate, 24000);
  assert.equal(clip.pcm.length, pcm.length, "the 44-byte RIFF header is not part of the PCM");
  assert.ok(clip.pcm.equals(pcm));

  const other = await client([wavReply(wrapWav(Buffer.alloc(3200, 2), { sampleRate: 16000 }), "audio/x-wav")]).synthesizeSpeech({ text: "Question two." });
  assert.equal(other.sampleRate, 16000);
  assert.equal(other.pcm.length, 3200);
});

test("a malformed audio/wav reply is an invalid response, not a crash", async () => {
  const bad = Buffer.from("not a riff file at all");
  await assert.rejects(client([wavReply(bad), wavReply(bad)]).synthesizeSpeech({ text: "Hello." }), (error) => error.code === "GEMINI_INVALID_RESPONSE");
});
