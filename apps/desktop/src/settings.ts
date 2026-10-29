import { isHex128 } from "@pc-to-ipad/protocol";

export interface Settings {
  relayUrl: string;
  roomSecret: string;
}

export type SettingsErrors = { relayUrl?: string; roomSecret?: string };

const STORAGE_KEY = "pc-to-ipad.settings";

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

export function validateSettings(input: {
  relayUrl: string;
  roomSecret: string;
}): { ok: true; settings: Settings } | { ok: false; errors: SettingsErrors } {
  const relayUrl = normalizeRelayUrl(input.relayUrl);
  const roomSecret = input.roomSecret.trim().toLowerCase();
  const errors: SettingsErrors = {};
  if (relayUrl === null) errors.relayUrl = "需要 https 網址，例如 https://pc-to-ipad.xxx.workers.dev";
  if (!isHex128(roomSecret)) errors.roomSecret = "房間密碼應為 32 個英數字元（0-9、a-f）";
  if (relayUrl === null || errors.roomSecret) return { ok: false, errors };
  return { ok: true, settings: { relayUrl, roomSecret } };
}

export function loadSettings(storage: Pick<Storage, "getItem">): Settings | null {
  const stored = storage.getItem(STORAGE_KEY);
  if (stored === null) return null;
  try {
    const raw = JSON.parse(stored) as Partial<Settings> | null;
    const result = validateSettings({
      relayUrl: String(raw?.relayUrl ?? ""),
      roomSecret: String(raw?.roomSecret ?? ""),
    });
    return result.ok ? result.settings : null;
  } catch {
    return null;
  }
}

export function saveSettings(storage: Pick<Storage, "setItem">, settings: Settings): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
