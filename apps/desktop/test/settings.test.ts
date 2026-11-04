import { describe, expect, it } from "vitest";
import {
  loadSettings,
  normalizeRelayUrl,
  saveSettings,
  validateSettings,
} from "../src/settings";

const SECRET = "0123456789abcdef0123456789abcdef";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("normalizeRelayUrl", () => {
  it("trims and strips trailing slashes", () => {
    expect(normalizeRelayUrl("  https://a.dev///  ")).toBe("https://a.dev");
  });

  it.each([
    ["http for a public host", "http://a.dev"],
    ["no scheme", "a.dev"],
    ["a path", "https://a.dev/x"],
    ["a query", "https://a.dev?x=1"],
    ["a space inside the host", "https://a .dev"],
    ["embedded credentials", "https://user:pass@a.dev"],
    ["empty", ""],
  ])("rejects %s", (_name, input) => {
    expect(normalizeRelayUrl(input)).toBeNull();
  });

  it.each(["http://localhost:8787", "http://127.0.0.1:8787"])("accepts %s for local dev", (url) => {
    expect(normalizeRelayUrl(url)).toBe(url);
  });
});

describe("validateSettings", () => {
  it("lowercases and trims the secret and normalizes the URL", () => {
    const result = validateSettings({
      relayUrl: "https://a.dev/",
      roomSecret: `  ${SECRET.toUpperCase()} `,
    });
    expect(result).toEqual({
      ok: true,
      settings: { relayUrl: "https://a.dev", roomSecret: SECRET },
    });
  });

  it("rejects a secret with an inner space or the wrong length", () => {
    const spaced = validateSettings({
      relayUrl: "https://a.dev",
      roomSecret: "0123456789abcdef 0123456789abcdef",
    });
    const short = validateSettings({ relayUrl: "https://a.dev", roomSecret: "abc" });
    expect(spaced.ok).toBe(false);
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.errors.roomSecret).toBeTruthy();
  });

  it("reports the relay URL error separately from the secret error", () => {
    const result = validateSettings({ relayUrl: "nope", roomSecret: SECRET });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.relayUrl).toBeTruthy();
      expect(result.errors.roomSecret).toBeUndefined();
    }
  });
});

describe("loadSettings / saveSettings", () => {
  it("round-trips saved settings", () => {
    const storage = fakeStorage();
    const settings = { relayUrl: "https://a.dev", roomSecret: SECRET };
    saveSettings(storage, settings);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it("returns null when nothing is stored", () => {
    expect(loadSettings(fakeStorage())).toBeNull();
  });

  it("returns null for corrupt JSON or invalid stored values", () => {
    expect(loadSettings(fakeStorage({ "hopnote.settings": "{nope" }))).toBeNull();
    const invalid = JSON.stringify({ relayUrl: "http://a.dev", roomSecret: "x" });
    expect(loadSettings(fakeStorage({ "hopnote.settings": invalid }))).toBeNull();
  });
});
