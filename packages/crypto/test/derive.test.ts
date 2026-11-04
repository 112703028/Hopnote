import { describe, expect, it } from "vitest";
import { AUTH_TOKEN_PATTERN, deriveKeys } from "../src/index";
import { AUTH_TOKEN, CONTENT_KEY_HEX, FINGERPRINT, MASTER, ROOM_ID, hex } from "./vectors";

describe("deriveKeys", () => {
  it("reproduces the known answers for master bytes 0..31", async () => {
    const keys = await deriveKeys(MASTER);
    expect(hex(keys.contentKey)).toBe(CONTENT_KEY_HEX);
    expect(keys.roomId).toBe(ROOM_ID);
    expect(keys.authToken).toBe(AUTH_TOKEN);
    expect(keys.fingerprint).toBe(FINGERPRINT);
  });

  it("is deterministic for equal keys and different for different keys", async () => {
    const a = await deriveKeys(MASTER);
    const b = await deriveKeys(new Uint8Array(MASTER));
    const other = new Uint8Array(MASTER);
    other[0] ^= 1;
    const c = await deriveKeys(other);
    expect(b.roomId).toBe(a.roomId);
    expect(c.roomId).not.toBe(a.roomId);
    expect(c.authToken).not.toBe(a.authToken);
    expect(hex(c.contentKey)).not.toBe(hex(a.contentKey));
  });

  it("produces values in the formats the relay and the UI expect", async () => {
    const keys = await deriveKeys(MASTER);
    expect(keys.roomId).toMatch(/^[0-9a-f]{32}$/);
    expect(keys.authToken).toMatch(AUTH_TOKEN_PATTERN);
    expect(keys.fingerprint).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/);
    expect(keys.contentKey).toHaveLength(32);
  });

  it("rejects a master key that is not 32 bytes", async () => {
    await expect(deriveKeys(new Uint8Array(31))).rejects.toThrow();
  });
});
