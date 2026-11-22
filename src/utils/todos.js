

import { kvGet, kvSet, kvDel } from "../database/botKv.js";
import { normalizeNumber } from "./access.js";

function todoKey(ownerNorm) {
  return `todo:${ownerNorm}`;
}

async function load(ownerNorm) {
  const data = await kvGet(todoKey(ownerNorm));
  return Array.isArray(data) ? data : [];
}

async function save(ownerNorm, items) {
  await kvSet(todoKey(ownerNorm), items);
}

export async function addTodo(ownerId, text) {
  const owner = normalizeNumber(ownerId) || ownerId;
  const items = await load(owner);
  items.push({ text: String(text), createdAt: Date.now() });
  await save(owner, items);
  return items.length;
}

export async function listTodos(ownerId) {
  const owner = normalizeNumber(ownerId) || ownerId;
  return load(owner);
}

export async function removeTodos(ownerId, indices) {
  const owner = normalizeNumber(ownerId) || ownerId;
  const items = await load(owner);
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
  if (removed.length) await save(owner, items);

  return {
    removed: removed.sort((a, b) => a - b),
    missing: missing.sort((a, b) => a - b),
  };
}

export async function removeTodo(ownerId, index1) {
  const { removed } = await removeTodos(ownerId, [index1]);
  return removed.length > 0;
}

export async function clearTodos(ownerId) {
  const owner = normalizeNumber(ownerId) || ownerId;
  await kvDel(todoKey(owner));
  return true;
}

export async function countTodos(ownerId) {
  const owner = normalizeNumber(ownerId) || ownerId;
  return (await load(owner)).length;
}