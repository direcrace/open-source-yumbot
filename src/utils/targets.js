
import { normalizeNumber } from "./access.js";
import { groupCache } from "./cache.js";
import { getPNFromLID, isLID } from "./lid.js";

const PN_DOMAIN = "@s.whatsapp.net";
const MIN_NUMBER_DIGITS = 7;

function digitsOf(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function looksExplicit(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  // WhatsApp renders mentions as "@Display Name", which may contain digits.
  // Such text must never win over contextInfo.mentionedJid.
  if (text.startsWith("@") && !text.includes("@lid") && !text.includes(PN_DOMAIN)) {
    return false;
  }
  return (
    /[0-9]{5,}/.test(text) ||
    text.includes("@lid") ||
    text.includes(PN_DOMAIN) ||
    text.startsWith("+")
  );
}

function quotedParticipant(message) {
  const contextInfo = message?.message?.contextInfo || {};
  return contextInfo.participantAlt || contextInfo.participant || null;
}

async function pnFromLid(lidRef, message, conn) {
  const groupJid = message?.isGroup ? message.from : null;
  const metadata = groupJid ? groupCache.get(groupJid) : null;
  const participant = (metadata?.participants || []).find((entry) =>
    [entry?.id, entry?.lid, entry?.phoneNumber].some(
      (value) => value && String(value) === String(lidRef)
    )
  );

  const fromGroup = participant?.id || participant?.phoneNumber || null;
  if (fromGroup) {
    const number = normalizeNumber(fromGroup);
    if (number) return number;
  }

  const mapped = await getPNFromLID(conn, lidRef);
  if (mapped) {
    const number = normalizeNumber(mapped);
    if (number) return number;
  }

  return null;
}

/**
 * Resolve a command target to a canonical phone number.
 *
 * Accepts plain numbers (with or without `+`, spaces, dashes or parentheses),
 * full JIDs, @mentions and replied-to messages. LIDs are mapped back to phone
 * numbers instead of being mistaken for phone numbers themselves.
 *
 * @returns {Promise<{number: string, jid: string, source: string}|null>}
 */
export async function resolveCommandTarget(message, conn, rawRef, options = {}) {
  const mentions = message?.message?.contextInfo?.mentionedJid || [];
  const raw = String(rawRef ?? "").trim();
  const replyRef = quotedParticipant(message);

  let ref = null;
  let source = null;

  if (options.onlySelf) {
    ref = message?.sender || message?.participantAlt || message?.participant || null;
    source = "self";
  } else if (raw && looksExplicit(raw)) {
    ref = raw;
    source = "text";
  } else if (mentions.length) {
    ref = mentions[0];
    source = "mention";
  } else if (raw) {
    ref = raw;
    source = "text";
  } else if (replyRef) {
    ref = replyRef;
    source = "reply";
  } else if (options.fallback !== false) {
    ref = message?.sender || message?.participantAlt || message?.participant || null;
    source = "self";
  }

  if (!ref) return null;

  let number = null;
  if (isLID(ref)) {
    number = await pnFromLid(ref, message, conn);
  } else {
    number = normalizeNumber(ref);
  }

  if (!number || digitsOf(number).length < MIN_NUMBER_DIGITS) return null;

  return { number, jid: String(ref), source };
}
