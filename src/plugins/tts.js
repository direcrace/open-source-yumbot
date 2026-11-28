import { command } from "../plugins.js";
import { BOT_INFO } from "../config/constants.js";
import { getCommandArgs, replyFail, tr } from "../utils/message.js";

export const TTS_MAX_CHARS = 180;
export const TTS_ENDPOINT = "https://translate.google.com/translate_tts";

const LANGUAGES = new Set([
  "af", "am", "ar", "az", "bg", "bn", "bs", "ca", "ceb", "co", "cs", "cy", "da", "de", "el",
  "en", "eo", "es", "et", "eu", "fa", "fi", "fr", "fy", "ga", "gd", "gl", "gu", "he", "hi",
  "hr", "ht", "hu", "hy", "id", "is", "it", "iw", "ja", "jv", "ka", "kk", "km", "kn", "ko",
  "ku", "ky", "la", "lb", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt",
  "my", "ne", "nl", "no", "ny", "pa", "pl", "ps", "pt", "ro", "ru", "sd", "si", "sk", "sl",
  "sm", "sn", "so", "sq", "sr", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "tl", "tr",
  "uk", "ur", "uz", "vi", "xh", "yi", "zh", "zu",
]);

export function parseTtsInput(raw) {
  const input = String(raw || "").trim();
  const parts = input.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const first = parts[0].toLowerCase();
    if (LANGUAGES.has(first)) {
      return { lang: first, text: parts.slice(1).join(" ").trim() };
    }
  }
  return { lang: "de", text: input };
}

export function ttsUrl(text, lang) {
  const url = new URL(TTS_ENDPOINT);
  url.searchParams.set("ie", "UTF-8");
  url.searchParams.set("client", "tw-ob");
  url.searchParams.set("tl", lang);
  url.searchParams.set("q", text);
  return url.toString();
}

export async function fetchTtsAudio(text, lang) {
  const res = await fetch(ttsUrl(text, lang), {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = String(res.headers.get("content-type") || "");
  if (!/audio|mpeg|octet-stream/i.test(type)) throw new Error("TTS returned non-audio content");
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error("TTS returned an empty response");
  return buffer;
}

command(
  {
    pattern: "tts",
    fromMe: false,
    desc: "Text to speech via free Google endpoint",
    type: "media",
  },
  async (message, conn) => {
    const raw = getCommandArgs(message.body, "tts") || message.quoted?.text || "";
    const { lang, text } = parseTtsInput(raw);
    if (!text) {
      await replyFail(
        conn,
        message,
        await tr(
          `Usage: \`${BOT_INFO.PREFIX}tts <text>\` or \`${BOT_INFO.PREFIX}tts <lang> <text>\``,
          `Benutzung: \`${BOT_INFO.PREFIX}tts <Text>\` oder \`${BOT_INFO.PREFIX}tts <Sprache> <Text>\``
        )
      );
      return;
    }
    if (Array.from(text).length > TTS_MAX_CHARS) {
      await replyFail(
        conn,
        message,
        await tr(
          `TTS text is limited to ${TTS_MAX_CHARS} characters.`,
          `TTS-Text ist auf ${TTS_MAX_CHARS} Zeichen begrenzt.`
        )
      );
      return;
    }
    try {
      const audio = await fetchTtsAudio(text, lang);
      await conn.sendMessage(
        message.from,
        { audio, mimetype: "audio/mpeg", ptt: false },
        { quoted: { key: message.key, message: message.message } }
      );
    } catch (err) {
      await replyFail(
        conn,
        message,
        await tr(
          `TTS failed: ${err?.message || "unknown error"}`,
          `TTS fehlgeschlagen: ${err?.message || "unbekannter Fehler"}`
        )
      );
    }
  }
);
