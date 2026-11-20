
import { kvGet, kvSet } from "../database/botKv.js";
import { normalizeNumber } from "./access.js";

export const DEV_TODOS_KEY = "devtodo:list";
export const MAX_DEV_TODOS = 200;
export const MAX_DEV_TODO_TEXT = 500;

let queue = Promise.resolve();

function serialized(task) {
  const result = queue.then(task, task);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

function normalizeText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_DEV_TODO_TEXT);
}

function normalizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item.text === "string")
    .slice(0, MAX_DEV_TODOS)
    .map((item) => ({
      text: item.text.slice(0, MAX_DEV_TODO_TEXT),
      createdAt: Number(item.createdAt) || Date.now(),
      author: item.author ? String(item.author) : "",
    }));
}

async function load() {
  return normalizeItems(await kvGet(DEV_TODOS_KEY));
}

async function save(items) {
  const next = normalizeItems(items);
  await kvSet(DEV_TODOS_KEY, next);
  return next;
}

export async function addDevTodo(authorId, text) {
  return serialized(async () => {
    const clean = normalizeText(text);
    if (!clean) return { ok: false, reason: "empty" };
    const items = await load();
    if (items.length >= MAX_DEV_TODOS) return { ok: false, reason: "full" };
    items.push({
      text: clean,
      createdAt: Date.now(),
      author: normalizeNumber(authorId) || String(authorId || ""),
    });
    await save(items);
    return { ok: true, count: items.length };
  });
}

export async function listDevTodos() {
  return serialized(load);
}

export async function removeDevTodos(indices) {
  return serialized(async () => {
    const items = await load();
    const unique = [...new Set((Array.isArray(indices) ? indices : []).map(Number))]
      .filter((n) => Number.isInteger(n) && n >= 1)
      .sort((a, b) => b - a);

    const removed = [];
    const missing = [];
    for (const n of unique) {
      const idx = n - 1;
      if (items[idx]) {
        items.splice(idx, 1);
        removed.push(n);
      } else {
        missing.push(n);
      }
    }
    if (removed.length) await save(items);

    return {
      removed: removed.sort((a, b) => a - b),
      missing: missing.sort((a, b) => a - b),
    };
  });
}

export async function removeDevTodo(index1) {
  const { removed } = await removeDevTodos([index1]);
  return removed.length > 0;
}

export async function clearDevTodos() {
  return serialized(async () => {
    await save([]);
    return true;
  });
}
