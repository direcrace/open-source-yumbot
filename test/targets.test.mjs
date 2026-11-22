import test from "node:test";
import assert from "node:assert/strict";
import { resolveCommandTarget } from "../src/utils/targets.js";
import { groupCache } from "../src/utils/cache.js";

function makeConn(mapping = {}) {
  return {
    signalRepository: {
      lidMapping: {
        async getPNForLID(lid) {
          return mapping[lid] || null;
        },
      },
    },
  };
}

test("formatted numbers with + and spaces resolve to digits", async () => {
  const message = { sender: "111111111@s.whatsapp.net" };
  const result = await resolveCommandTarget(message, makeConn(), "+49 176 47064538");
  assert.deepEqual(result, {
    number: "4917647064538",
    jid: "+49 176 47064538",
    source: "text",
  });
});

test("a mention display name falls back to mentionedJid", async () => {
  const message = {
    sender: "111111111@s.whatsapp.net",
    message: { contextInfo: { mentionedJid: ["4917647064538@s.whatsapp.net"] } },
  };
  const result = await resolveCommandTarget(message, makeConn(), "@Max");
  assert.equal(result.number, "4917647064538");
  assert.equal(result.source, "mention");
});

test("a mention display name containing digits still uses mentionedJid", async () => {
  const message = {
    sender: "111111111@s.whatsapp.net",
    message: { contextInfo: { mentionedJid: ["4917647064538@s.whatsapp.net"] } },
  };
  const result = await resolveCommandTarget(message, makeConn(), "@Max 12345");
  assert.equal(result.number, "4917647064538");
  assert.equal(result.source, "mention");
});

test("a mentioned LID is mapped to its phone number, not used as one", async () => {
  const message = {
    sender: "111111111@s.whatsapp.net",
    message: { contextInfo: { mentionedJid: ["587349049517@lid"] } },
  };
  const conn = makeConn({
    "587349049517@lid": "216587349049@s.whatsapp.net",
  });
  const result = await resolveCommandTarget(message, conn, "");
  assert.equal(result.number, "216587349049");
  assert.equal(result.source, "mention");
});

test("a replied-to LID is resolved from group metadata", async () => {
  const groupJid = "120363000@g.us";
  groupCache.set(groupJid, {
    participants: [
      { id: "4917647064538@s.whatsapp.net", lid: "998877@lid" },
      { id: "111111111@s.whatsapp.net", lid: "123456@lid" },
    ],
  });
  const message = {
    isGroup: true,
    from: groupJid,
    sender: "123456@lid",
    message: { contextInfo: { participant: "998877@lid" } },
  };
  const result = await resolveCommandTarget(message, makeConn(), "");
  assert.equal(result.number, "4917647064538");
  assert.equal(result.source, "reply");
});

test("an unmappable LID is rejected instead of becoming a fake number", async () => {
  const message = {
    sender: "111111111@s.whatsapp.net",
    message: { contextInfo: { mentionedJid: ["587349049517@lid"] } },
  };
  assert.equal(await resolveCommandTarget(message, makeConn(), ""), null);
});

test("onlySelf ignores mentions and replies and maps the sender LID", async () => {
  const message = {
    sender: "998877@lid",
    message: { contextInfo: { mentionedJid: ["587349049517@lid"], participant: "998877@lid" } },
  };
  const conn = makeConn({ "998877@lid": "4917647064538@s.whatsapp.net" });
  const result = await resolveCommandTarget(message, conn, "", { onlySelf: true });
  assert.equal(result.number, "4917647064538");
  assert.equal(result.source, "self");
});

test("fallback:false refuses to silently target the sender", async () => {
  const message = { sender: "111111111@s.whatsapp.net" };
  assert.equal(
    await resolveCommandTarget(message, makeConn(), "", { fallback: false }),
    null
  );
});
