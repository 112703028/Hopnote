import { describe, expect, it } from "vitest";
import {
  loadSecret,
  normalizeSecretInput,
  parseSecretFromHash,
  saveSecret,
} from "../src/room-secret";

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

describe("parseSecretFromHash", () => {
  it("returns the secret from #<secret>", () => {
    expect(parseSecretFromHash(`#${SECRET}`)).toBe(SECRET);
  });

  it("lowercases an uppercase hash", () => {
    expect(parseSecretFromHash(`#${SECRET.toUpperCase()}`)).toBe(SECRET);
  });

  it.each([
    ["no leading #", SECRET],
    ["empty", ""],
    ["too short", "#abc"],
    ["non-hex", `#${"g".repeat(32)}`],
  ])("returns null for %s", (_name, hash) => {
    expect(parseSecretFromHash(hash)).toBeNull();
  });
});

describe("normalizeSecretInput", () => {
  it("trims and lowercases a pasted secret", () => {
    expect(normalizeSecretInput(`  ${SECRET.toUpperCase()}\n`)).toBe(SECRET);
  });

  it("returns null when there is a space inside", () => {
    expect(normalizeSecretInput("0123456789abcdef 0123456789abcdef")).toBeNull();
  });
});

describe("loadSecret / saveSecret", () => {
  it("round-trips a saved secret", () => {
    const storage = fakeStorage();
    saveSecret(storage, SECRET);
    expect(loadSecret(storage)).toBe(SECRET);
  });

  it("returns null when nothing is stored", () => {
    expect(loadSecret(fakeStorage())).toBeNull();
  });

  it("returns null for a stored value that is not a valid secret", () => {
    expect(loadSecret(fakeStorage({ "hopnote.roomSecret": "junk" }))).toBeNull();
  });
});
