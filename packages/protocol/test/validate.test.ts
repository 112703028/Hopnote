import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_PAYLOAD_CHARS,
  MAX_TEXT_PAYLOAD_CHARS,
  isHex128,
  newItemId,
  validateEnvelope,
} from "../src/index";

const ID = "0123456789abcdef0123456789abcdef";
const PAYLOAD = "A".repeat(54);

describe("isHex128", () => {
  it("accepts 32 lowercase hex chars", () => {
    expect(isHex128(ID)).toBe(true);
  });

  it.each([
    ["uppercase", ID.toUpperCase()],
    ["31 chars", ID.slice(1)],
    ["33 chars", ID + "0"],
    ["non-hex", "g".repeat(32)],
    ["empty", ""],
    ["a number", 42],
    ["null", null],
  ])("rejects %s", (_name, value) => {
    expect(isHex128(value)).toBe(false);
  });
});

describe("newItemId", () => {
  it("returns a different isHex128 value each call", () => {
    const a = newItemId();
    const b = newItemId();
    expect(isHex128(a)).toBe(true);
    expect(isHex128(b)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("validateEnvelope", () => {
  it("accepts a text envelope and an image envelope", () => {
    const text = { id: ID, kind: "text", payload: PAYLOAD };
    const image = { id: ID, kind: "image", payload: PAYLOAD };
    expect(validateEnvelope(text)).toEqual({ ok: true, envelope: text });
    expect(validateEnvelope(image)).toEqual({ ok: true, envelope: image });
  });

  it.each([
    ["a non-object", "nope"],
    ["null", null],
    ["a missing id", { kind: "text", payload: "{}" }],
    ["an id that is not hex128", { id: "abc", kind: "text", payload: "{}" }],
    ["an unknown kind", { id: ID, kind: "video", payload: "{}" }],
    ["a non-string payload", { id: ID, kind: "text", payload: 5 }],
    ["an empty payload", { id: ID, kind: "text", payload: "" }],
  ])("rejects %s as invalid", (_name, raw) => {
    const result = validateEnvelope(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid");
  });

  it.each([
    ["a brace", "{"],
    ["a space", " "],
    ["an accented letter", "é"],
    ["a padding sign", "="],
    ["a plus sign", "+"],
  ])("rejects a payload containing %s as invalid", (_name, ch) => {
    const result = validateEnvelope({ id: ID, kind: "text", payload: "A".repeat(60) + ch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid");
  });

  it("rejects a 53-char payload as invalid and accepts a 54-char one", () => {
    const short = validateEnvelope({ id: ID, kind: "text", payload: "A".repeat(53) });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.code).toBe("invalid");
    expect(validateEnvelope({ id: ID, kind: "text", payload: "A".repeat(54) }).ok).toBe(true);
  });

  it("accepts a text payload of exactly 262144 chars and rejects 262145 as too_large", () => {
    expect(MAX_TEXT_PAYLOAD_CHARS).toBe(262144);
    const at = { id: ID, kind: "text", payload: "A".repeat(262144) };
    const over = { id: ID, kind: "text", payload: "A".repeat(262145) };
    expect(validateEnvelope(at).ok).toBe(true);
    const result = validateEnvelope(over);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("too_large");
  });

  it("accepts an image payload of exactly 1_500_000 chars and rejects 1_500_001 as too_large", () => {
    expect(MAX_IMAGE_PAYLOAD_CHARS).toBe(1_500_000);
    const at = { id: ID, kind: "image", payload: "A".repeat(1_500_000) };
    const over = { id: ID, kind: "image", payload: "A".repeat(1_500_001) };
    expect(validateEnvelope(at).ok).toBe(true);
    const result = validateEnvelope(over);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("too_large");
  });
});
