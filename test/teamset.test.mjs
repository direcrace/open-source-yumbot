import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

process.env.OWNER_NUMBER = "";
process.env.CREATOR_NUMBERS = "";
process.env.SUDO = "";
process.env.BOT_PREFIX = "#";
process.env.AUDIT_LOG_DIR = path.join(os.tmpdir(), "yum-teamset-logs");

const { attachBotKv } = await import("../src/database/botKv.js");
const { getCommands } = await import("../src/plugins.js");
await import("../src/plugins/team.js");

const store = new Map();
attachBotKv({
  async get(key) { return store.get(key) ?? null; },
  async set(key, value) { store.set(key, value); return true; },
  async del(key) { store.delete(key); return true; },
  async keys() { return [...store.keys()]; },
});

test("teamset assigns a rank from a plain number target", async () => {
  const cmd = getCommands().find((entry) => entry.patternName === "teamset");
  assert.ok(cmd, "teamset command should be registered");

  const sent = [];
  const conn = {
    sendMessage: async (_jid, payload) => {
      sent.push(payload);
      return { key: { id: "sent" } };
    },
  };
  const message = {
    body: "#teamset 1234567890 mod",
    key: { fromMe: true, id: "m1" },
    sender: "1@s.whatsapp.net",
    from: "g@g.us",
    isGroup: true,
    message: { contextInfo: {} },
    quoted: null,
    pushName: "Tester",
  };

  await cmd.function(message, conn);

  assert.deepEqual(store.get("community:ranks"), { "1234567890": "mod" });
  assert.equal(sent.length, 1);
  assert.match(String(sent[0].text), /Moderator/);
});
