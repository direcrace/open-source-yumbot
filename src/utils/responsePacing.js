import { AsyncLocalStorage } from "node:async_hooks";

const KEY = "response_pace";

const DEFAULTS = {
  enabled: true,
  indicatorMs: 900,
  minDelayMs: 600,
  maxDelayMs: 1000,
  skipCommands: [
    "menu",
    "help",
    "ping",
    "status",
    "uptime",
    "version",
    "whoami",
    "session",
    "sessions",
  ],
  skipPrivileged: true,
  groups: true,
  dms: true,
  replaceAck: false,
};

const storage = new AsyncLocalStorage();
let cache = null;
let shown = 0;
let skipped = 0;
let delayTotalMs = 0;

function int(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function bool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function normalize(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const skipCommands = Array.isArray(src.skipCommands)
    ? src.skipCommands
        .filter((v) => typeof v === "string")
        .map((v) => v.toLowerCase().trim())
        .filter(Boolean)
    : DEFAULTS.skipCommands;
  const minDelayMs = int(src.minDelayMs, 0, 10_000, DEFAULTS.minDelayMs);
  const maxDelayMs = int(src.maxDelayMs, minDelayMs, 10_000, DEFAULTS.maxDelayMs);
  const indicatorMs = int(src.indicatorMs, minDelayMs, maxDelayMs, DEFAULTS.indicatorMs);
  return {
    enabled: bool(src.enabled, DEFAULTS.enabled),
    indicatorMs,
    minDelayMs,
    maxDelayMs,
    delayMs: indicatorMs,
    skipCommands,
    skipPrivileged: bool(src.skipPrivileged, DEFAULTS.skipPrivileged),
    groups: bool(src.groups, DEFAULTS.groups),
    dms: bool(src.dms, DEFAULTS.dms),
    replaceAck: bool(src.replaceAck, DEFAULTS.replaceAck),
  };
}

async function loadConfig() {
  if (cache) return cache;
  let raw = null;
  try {
    const { kvGet } = await import("../database/botKv.js");
    raw = await kvGet(KEY);
  } catch {
    raw = null;
  }
  cache = normalize(raw);
  return cache;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bump(name, value) {
  try {
    const { recordMetric } = await import("../enterprise/metrics.js");
    recordMetric(name, value);
  } catch {
   
  }
}

function isEligible(config, { message, name, privileged }) {
  const command = String(name || "").toLowerCase();
  return (
    config.enabled &&
    !config.skipCommands.includes(command) &&
    !(config.skipPrivileged && privileged) &&
    (message?.isGroup ? config.groups : config.dms)
  );
}

export function invalidateResponsePaceConfig() {
  cache = null;
}

export function isPacingActive() {
  return Boolean(storage.getStore());
}

export function getResponsePacingStatus() {
  return {
    shown,
    skipped,
    avgDelayMs: shown ? Math.round(delayTotalMs / shown) : 0,
    active: isPacingActive(),
  };
}

async function runPaced(conn, jid, config, fn) {
  return await storage.run(Object.create(null), async () => {
    let cleared = false;
    const clear = async () => {
      if (cleared) return;
      cleared = true;
      try {
        await conn?.sendPresenceUpdate?.("paused", jid);
      } catch {
       
      }
    };

    try {
      await conn?.sendPresenceUpdate?.("composing", jid);
    } catch {
     
    }

    const timer = setTimeout(() => {
      clear().catch(() => {});
    }, config.indicatorMs);
    shown += 1;

    try {
      await sleep(config.delayMs);
      delayTotalMs += config.delayMs;
      return await fn();
    } finally {
      clearTimeout(timer);
      await clear();
      bump("response_pace_shown", 1).catch(() => {});
      bump("response_pace_delay_ms", config.delayMs).catch(() => {});
    }
  });
}

export async function isResponsePacingEligible(params) {
  return isEligible(await loadConfig(), params);
}

export async function prepareResponsePacing({ message, name, privileged }) {
  const config = await loadConfig();

  if (!isEligible(config, { message, name, privileged })) {
    skipped += 1;
    return {
      replaceAck: false,
      run: async (_conn, fn) => await fn(),
    };
  }

  return {
    replaceAck: config.replaceAck === true,
    run: async (conn, fn) => await runPaced(conn, message?.from, config, fn),
  };
}
