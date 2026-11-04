import { describe, expect, it } from "vitest";
import { encodePairingCode } from "@hopnote/crypto";
import { loadSettings, normalizeRelayUrl, saveSettings, validateRelayUrl } from "../src/settings";

const CODE = encodePairingCode(Uint8Array.from({ length: 32 }, (_, i) => i));

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
    ["a pasted pairing link", `https://a.dev/#${CODE}`],
    ["empty", ""],
  ])("rejects %s", (_name, input) => {
    expect(normalizeRelayUrl(input)).toBeNull();
  });

  it.each(["http://localhost:8787", "http://127.0.0.1:8787"])("accepts %s for local dev", (url) => {
    expect(normalizeRelayUrl(url)).toBe(url);
  });
});

describe("validateRelayUrl", () => {
  it("returns the normalized URL", () => {
    expect(validateRelayUrl(" https://a.dev/ ")).toEqual({ ok: true, relayUrl: "https://a.dev" });
  });

  it("explains a rejected URL", () => {
    const result = validateRelayUrl("a.dev");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });
});

describe("loadSettings / saveSettings", () => {
  it("round-trips settings with a key", () => {
    const storage = fakeStorage();
    saveSettings(storage, { relayUrl: "https://a.dev", key: CODE });
    expect(loadSettings(storage)).toEqual({ relayUrl: "https://a.dev", key: CODE });
  });

  it("round-trips settings that are not paired yet", () => {
    const storage = fakeStorage();
    saveSettings(storage, { relayUrl: "https://a.dev", key: null });
    expect(loadSettings(storage)).toEqual({ relayUrl: "https://a.dev", key: null });
  });

  it("loads a stage 1 record with roomSecret as { relayUrl, key: null }", () => {
    const legacy = JSON.stringify({
      relayUrl: "https://a.dev",
      roomSecret: "0123456789abcdef0123456789abcdef",
    });
    const storage = fakeStorage({ "hopnote.settings": legacy });
    expect(loadSettings(storage)).toEqual({ relayUrl: "https://a.dev", key: null });
  });

  it("turns a corrupt key into null", () => {
    const stored = JSON.stringify({ relayUrl: "https://a.dev", key: "junk" });
    expect(loadSettings(fakeStorage({ "hopnote.settings": stored }))).toEqual({
      relayUrl: "https://a.dev",
      key: null,
    });
  });

  it("returns null for nothing stored, corrupt JSON, or an invalid relay URL", () => {
    expect(loadSettings(fakeStorage())).toBeNull();
    expect(loadSettings(fakeStorage({ "hopnote.settings": "{nope" }))).toBeNull();
    const badUrl = JSON.stringify({ relayUrl: "http://a.dev", key: CODE });
    expect(loadSettings(fakeStorage({ "hopnote.settings": badUrl }))).toBeNull();
  });
});
