import test from "node:test";
import assert from "node:assert/strict";
import { command, findCommand, getMenuCommands, rebuildCommandPatterns } from "../src/plugins.js";

const registered = command(
  {
    pattern: "aliasprobe",
    aliases: ["ap"],
    desc: "Alias probe",
    type: "misc",
  },
  async () => {}
);

test("primary pattern and alias resolve to the same command", () => {
  assert.equal(findCommand("#aliasprobe"), registered);
  assert.equal(findCommand("#ap"), registered);
  assert.equal(findCommand("#ap extra"), registered);
});

test("aliases do not create extra menu entries", () => {
  assert.equal(getMenuCommands().filter((cmd) => cmd === registered).length, 1);
});

test("alias patterns survive a prefix rebuild", () => {
  rebuildCommandPatterns();
  assert.equal(findCommand("#ap"), registered);
  assert.equal(findCommand("#aliasprobe"), registered);
});
