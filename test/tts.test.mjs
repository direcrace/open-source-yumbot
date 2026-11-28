import test from "node:test";
import assert from "node:assert/strict";

process.env.OWNER_NUMBER = "";
process.env.CREATOR_NUMBERS = "";
process.env.SUDO = "";

const { TTS_MAX_CHARS, parseTtsInput, ttsUrl, fetchTtsAudio } = await import("../src/plugins/tts.js");

test("parseTtsInput defaults to German", () => {
  assert.deepEqual(parseTtsInput("hallo zusammen"), { lang: "de", text: "hallo zusammen" });
});

test("parseTtsInput accepts a supported language", () => {
  assert.deepEqual(parseTtsInput("en hello there"), { lang: "en", text: "hello there" });
});

test("parseTtsInput keeps a single short token as text", () => {
  assert.deepEqual(parseTtsInput("ja"), { lang: "de", text: "ja" });
});

test("parseTtsInput ignores an unknown language token", () => {
  assert.deepEqual(parseTtsInput("klingon hello"), { lang: "de", text: "klingon hello" });
});

test("ttsUrl encodes text and language", () => {
  const parsed = new URL(ttsUrl("hallo & hello", "de"));
  assert.equal(`${parsed.origin}${parsed.pathname}`, "https://translate.google.com/translate_tts");
  assert.equal(parsed.searchParams.get("tl"), "de");
  assert.equal(parsed.searchParams.get("q"), "hallo & hello");
  assert.equal(parsed.searchParams.get("client"), "tw-ob");
  assert.equal(parsed.searchParams.get("ie"), "UTF-8");
});

test("fetchTtsAudio rejects non-audio responses", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("nope", { status: 200, headers: { "content-type": "text/html" } });
  try {
    await assert.rejects(() => fetchTtsAudio("hi", "en"), /non-audio/);
  } finally {
    globalThis.fetch = original;
  }
});

test("TTS character limit is documented in code", () => {
  assert.equal(TTS_MAX_CHARS, 180);
});
