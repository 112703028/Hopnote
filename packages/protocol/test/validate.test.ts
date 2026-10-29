import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_PAYLOAD_CHARS,
  MAX_TEXT_PAYLOAD_CHARS,
  isHex128,
  newItemId,
  validateEnvelope,
} from "../src/index";

const ID = "0123456789abcdef0123456789abcdef";

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
    const text = { id: ID, kind: "text", payload: "{}" };
    const image = { id: ID, kind: "image", payload: "{}" };
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

  it("accepts a text payload of exactly 65536 chars and rejects 65537 as too_large", () => {
    expect(MAX_TEXT_PAYLOAD_CHARS).toBe(65536);
    const at = { id: ID, kind: "text", payload: "x".repeat(65536) };
    const over = { id: ID, kind: "text", payload: "x".repeat(65537) };
    expect(validateEnvelope(at).ok).toBe(true);
    const result = validateEnvelope(over);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("too_large");
  });

  it("accepts an image payload of exactly 1_500_000 chars and rejects 1_500_001 as too_large", () => {
    expect(MAX_IMAGE_PAYLOAD_CHARS).toBe(1_500_000);
    const at = { id: ID, kind: "image", payload: "x".repeat(1_500_000) };
    const over = { id: ID, kind: "image", payload: "x".repeat(1_500_001) };
    expect(validateEnvelope(at).ok).toBe(true);
    const result = validateEnvelope(over);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("too_large");
  });
});
