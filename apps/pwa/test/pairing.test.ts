import { describe, expect, it } from "vitest";
import { encodePairingCode } from "@hopnote/crypto";
import {
  clearKey,
  confirmFingerprint,
  discardLegacySecret,
  isFingerprintConfirmed,
  loadKey,
  parseKeyFromHash,
  saveKey,
} from "../src/pairing";

const MASTER = Uint8Array.from({ length: 32 }, (_, i) => i);
const CODE = encodePairingCode(MASTER);

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe("parseKeyFromHash", () => {
  it("returns the 32 bytes from #<code>", () => {
    expect(Array.from(parseKeyFromHash(`#${CODE}`) ?? [])).toEqual(Array.from(MASTER));
  });

  it.each([
    ["no leading #", CODE],
    ["a wrong length", `#${CODE.slice(1)}`],
    ["a plus sign", `#${CODE.slice(0, 42)}+`],
    ["nothing after the #", "#"],
  ])("returns null for %s", (_name, hash) => {
    expect(parseKeyFromHash(hash)).toBeNull();
  });
});

describe("loadKey / saveKey / clearKey", () => {
  it("round-trips a saved key", () => {
    const storage = fakeStorage();
    saveKey(storage, MASTER);
    expect(Array.from(loadKey(storage) ?? [])).toEqual(Array.from(MASTER));
  });

  it("stores the pairing code under hopnote.key", () => {
    const storage = fakeStorage();
    saveKey(storage, MASTER);
    expect(storage.getItem("hopnote.key")).toBe(CODE);
  });

  it("returns null for a missing or corrupt value", () => {
    expect(loadKey(fakeStorage())).toBeNull();
    expect(loadKey(fakeStorage({ "hopnote.key": "junk" }))).toBeNull();
  });

  it("forgets the key after clearKey", () => {
    const storage = fakeStorage();
    saveKey(storage, MASTER);
    clearKey(storage);
    expect(loadKey(storage)).toBeNull();
  });
});

describe("discardLegacySecret", () => {
  it("returns true and removes hopnote.roomSecret when it exists", () => {
    const storage = fakeStorage({ "hopnote.roomSecret": "0123456789abcdef0123456789abcdef" });
    expect(discardLegacySecret(storage)).toBe(true);
    expect(storage.getItem("hopnote.roomSecret")).toBeNull();
  });

  it("returns false when there is nothing to discard", () => {
    expect(discardLegacySecret(fakeStorage())).toBe(false);
  });
});

describe("fingerprint confirmation", () => {
  it("is confirmed for the fingerprint that was confirmed and not for another", () => {
    const storage = fakeStorage();
    expect(isFingerprintConfirmed(storage, "A3F2 91C0 7B44 D8E1")).toBe(false);
    confirmFingerprint(storage, "A3F2 91C0 7B44 D8E1");
    expect(isFingerprintConfirmed(storage, "A3F2 91C0 7B44 D8E1")).toBe(true);
    expect(isFingerprintConfirmed(storage, "0000 0000 0000 0000")).toBe(false);
  });
});
