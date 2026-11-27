import test from "node:test";
import assert from "node:assert/strict";

process.env.OWNER_NUMBER = "";
process.env.CREATOR_NUMBERS = "";
process.env.SUDO = "";

const { attachBotKv } = await import("../src/database/botKv.js");
const {
  prepareResponsePacing,
  invalidateResponsePaceConfig,
  isPacingActive,
  isResponsePacingEligible,
  getResponsePacingStatus,
} = await import("../src/utils/responsePacing.js");
const { withTyping } = await import("../src/utils/message.js");
const { processGroupGuards } = await import("../src/messages/groupGuards.js");

let groupSettingsOverride = null;

let override = {
  enabled: true,
  indicatorMs: 6,
  minDelayMs: 4,
  maxDelayMs: 10,
  skipCommands: ["ping"],
  skipPrivileged: true,
  groups: true,
  dms: true,
  replaceAck: false,
};

attachBotKv({
  async get(key) {
    if (key === "response_pace") return override;
    if (key.startsWith("gset:")) return groupSettingsOverride;
    return null;
  },
  async set() {
    return false;
  },
  async del() {
    return false;
  },
});
invalidateResponsePaceConfig();

function fakeConn() {
  const calls = [];
  return {
    calls,
    async sendPresenceUpdate(state, jid) {
      calls.push([state, jid]);
    },
  };
}

function groupMessage() {
  return { from: "120363099999999999@g.us", isGroup: true };
}

test("paced command sets composing and paused once", async () => {
  const conn = fakeConn();
  const pace = await prepareResponsePacing({
    message: groupMessage(),
    name: "testcmd",
    privileged: false,
  });
  let activeInside = false;
  const result = await pace.run(conn, async () => {
    activeInside = isPacingActive();
    return 42;
  });
  assert.equal(result, 42);
  assert.equal(activeInside, true);
  assert.deepEqual(
    conn.calls.map((call) => call[0]),
    ["composing", "paused"]
  );
  assert.equal(conn.calls[0][1], "120363099999999999@g.us");
});

test("withTyping does not duplicate presence during pacing", async () => {
  const conn = fakeConn();
  const pace = await prepareResponsePacing({
    message: groupMessage(),
    name: "testcmd",
    privileged: false,
  });
  const result = await pace.run(conn, async () =>
    withTyping(conn, "120363099999999999@g.us", async () => "ok")
  );
  assert.equal(result, "ok");
  assert.deepEqual(
    conn.calls.map((call) => call[0]),
    ["composing", "paused"]
  );
});

test("withTyping outside pacing keeps its own presence", async () => {
  const conn = fakeConn();
  const result = await withTyping(conn, "1234567890@s.whatsapp.net", async () => "ok");
  assert.equal(result, "ok");
  assert.deepEqual(
    conn.calls.map((call) => call[0]),
    ["composing", "paused"]
  );
});

test("skipped command runs without delay or presence", async () => {
  const conn = fakeConn();
  const pace = await prepareResponsePacing({
    message: groupMessage(),
    name: "ping",
    privileged: false,
  });
  const start = Date.now();
  const result = await pace.run(conn, async () => "pong");
  const elapsed = Date.now() - start;
  assert.equal(result, "pong");
  assert.ok(elapsed < 50, `unexpected delay: ${elapsed}ms`);
  assert.equal(conn.calls.length, 0);
  assert.equal(pace.replaceAck, false);
});

test("privileged commands skip when configured", async () => {
  const conn = fakeConn();
  const pace = await prepareResponsePacing({
    message: groupMessage(),
    name: "testcmd",
    privileged: true,
  });
  await pace.run(conn, async () => "ok");
  assert.equal(conn.calls.length, 0);
});

test("replaceAck comes from config and status stays aggregate", async () => {
  override = { ...override, replaceAck: true };
  invalidateResponsePaceConfig();
  const pace = await prepareResponsePacing({
    message: groupMessage(),
    name: "testcmd",
    privileged: false,
  });
  assert.equal(pace.replaceAck, true);
  const status = getResponsePacingStatus();
  assert.equal(typeof status.shown, "number");
  assert.equal(typeof status.skipped, "number");
  assert.equal(typeof status.avgDelayMs, "number");
  assert.equal(status.active, false);
});

test("eligibility helper reflects skip list and privilege", async () => {
  const message = groupMessage();
  assert.equal(
    await isResponsePacingEligible({ message, name: "testcmd", privileged: false }),
    true
  );
  assert.equal(
    await isResponsePacingEligible({ message, name: "ping", privileged: false }),
    false
  );
  assert.equal(
    await isResponsePacingEligible({ message, name: "testcmd", privileged: true }),
    false
  );
});

function guardConn() {
  return {
    ...fakeConn(),
    async groupMetadata() {
      return { participants: [] };
    },
    async sendMessage() {
      return null;
    },
  };
}

function guardMessage(body) {
  return {
    isGroup: true,
    key: { fromMe: false },
    body,
    from: "120363099999999999@g.us",
    sender: "9999999999@s.whatsapp.net",
    participant: "9999999999@s.whatsapp.net",
    message: { conversation: body },
  };
}

test("autotyping is deferred for paced commands", async () => {
  groupSettingsOverride = { autotyping: true };
  const conn = guardConn();
  const blocked = await processGroupGuards(
    { message: guardMessage("#testcmd"), conn },
    () => {}
  );
  assert.equal(blocked, false);
  assert.equal(conn.calls.length, 0);
});

test("autotyping still runs for non-command group messages", async () => {
  groupSettingsOverride = { autotyping: true };
  const conn = guardConn();
  const blocked = await processGroupGuards(
    { message: guardMessage("hello there"), conn },
    () => {}
  );
  assert.equal(blocked, false);
  assert.deepEqual(
    conn.calls.map((call) => call[0]),
    ["composing"]
  );
});
