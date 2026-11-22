import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { attachBotKv } from "../src/database/botKv.js";
import { parseIndexList } from "../src/utils/validation.js";

const store = new Map();

beforeEach(() => {
  store.clear();
  attachBotKv({
    async get(key) {
      return store.has(key) ? structuredClone(store.get(key)) : null;
    },
    async set(key, value) {
      store.set(key, structuredClone(value));
    },
  });
});

const { addTodo, listTodos, removeTodos, removeTodo } = await import("../src/utils/todos.js");
const {
  addDevTodo,
  listDevTodos,
  removeDevTodos,
  MAX_DEV_TODOS,
} = await import("../src/utils/devTodos.js");

test("parseIndexList accepts commas and spaces, dedupes and sorts", () => {
  assert.deepEqual(parseIndexList("3,1,2,2"), [1, 2, 3]);
  assert.deepEqual(parseIndexList("2 5 1"), [1, 2, 5]);
  assert.deepEqual(parseIndexList(""), []);
  assert.deepEqual(parseIndexList("abc,-2"), []);
});

test("todo multi-delete removes the displayed numbers, not shifted ones", async () => {
  for (const text of ["one", "two", "three", "four"]) await addTodo("1", text);

  const result = await removeTodos("1", [1, 3]);
  assert.deepEqual(result, { removed: [1, 3], missing: [] });
  assert.deepEqual(
    (await listTodos("1")).map((item) => item.text),
    ["two", "four"]
  );
});

test("todo multi-delete reports missing indices and dedupes", async () => {
  await addTodo("1", "one");
  await addTodo("1", "two");

  const result = await removeTodos("1", [1, 1, 9]);
  assert.deepEqual(result, { removed: [1], missing: [9] });
  assert.deepEqual((await listTodos("1")).map((item) => item.text), ["two"]);
});

test("single removeTodo still works", async () => {
  await addTodo("1", "one");
  await addTodo("1", "two");
  assert.equal(await removeTodo("1", 2), true);
  assert.deepEqual((await listTodos("1")).map((item) => item.text), ["one"]);
});

test("dev todo multi-delete is shared and serialized", async () => {
  await Promise.all([
    addDevTodo("111", "first"),
    addDevTodo("222", "second"),
    addDevTodo("333", "third"),
  ]);

  const result = await removeDevTodos([1, 3]);
  assert.deepEqual(result, { removed: [1, 3], missing: [] });
  assert.deepEqual(
    (await listDevTodos()).map((item) => item.text),
    ["second"]
  );
  assert.equal((await listDevTodos())[0].author, "222");
});

test("dev todo list caps text and items", async () => {
  store.set(
    "devtodo:list",
    Array.from({ length: MAX_DEV_TODOS }, (_, i) => ({ text: `task ${i}`, createdAt: 1, author: "1" }))
  );
  assert.equal((await addDevTodo("1", "more")).reason, "full");
  assert.equal((await listDevTodos()).length, MAX_DEV_TODOS);
});
