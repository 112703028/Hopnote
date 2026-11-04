import { encodePairingCode, parsePairingCode } from "@hopnote/crypto";

export interface Settings {
  relayUrl: string;
  /** The pairing code of the master key, or null before the first pairing. */
  key: string | null;
}

const STORAGE_KEY = "hopnote.settings";

// Only an origin is accepted: https, or http for local development.
export function normalizeRelayUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const localHttp =
    url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localHttp) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname.replace(/\/+$/, "") !== "") return null;
  return url.origin;
}

export function validateRelayUrl(
  input: string,
): { ok: true; relayUrl: string } | { ok: false; error: string } {
  const relayUrl = normalizeRelayUrl(input);
  if (relayUrl === null) {
    return {
      ok: false,
      error: "需要 https 網址本身，例如 https://hopnote.xxx.workers.dev（不要包含 /# 和配對碼）",
    };
  }
  return { ok: true, relayUrl };
}

export function loadSettings(storage: Pick<Storage, "getItem">): Settings | null {
  const stored = storage.getItem(STORAGE_KEY);
  if (stored === null) return null;
  try {
    const raw = JSON.parse(stored) as { relayUrl?: unknown; key?: unknown } | null;
    const relayUrl = normalizeRelayUrl(typeof raw?.relayUrl === "string" ? raw.relayUrl : "");
    if (relayUrl === null) return null;
    // A stage 1 record has no key; a corrupt key is treated as not paired.
    const master = typeof raw?.key === "string" ? parsePairingCode(raw.key) : null;
    return { relayUrl, key: master ? encodePairingCode(master) : null };
  } catch {
    return null;
  }
}

export function saveSettings(storage: Pick<Storage, "setItem">, settings: Settings): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
