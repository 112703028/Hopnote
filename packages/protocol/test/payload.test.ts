import { describe, expect, it } from "vitest";
import { decodePayload, encodeImagePayload, encodeTextPayload } from "../src/index";

describe("payload codecs", () => {
  it("round-trips a text payload as { v: 1, text, ts }", () => {
    const encoded = encodeTextPayload("hello 世界", 1234);
    expect(decodePayload("text", encoded)).toEqual({ v: 1, text: "hello 世界", ts: 1234 });
  });

  it("round-trips an image payload with mime image/png", () => {
    const encoded = encodeImagePayload({ data: "AAEC", width: 10, height: 20 }, 99);
    expect(decodePayload("image", encoded)).toEqual({
      v: 1,
      mime: "image/png",
      data: "AAEC",
      width: 10,
      height: 20,
      ts: 99,
    });
  });

  it.each([
    ["invalid JSON", "{nope", "text"],
    ["v !== 1", JSON.stringify({ v: 2, text: "a", ts: 1 }), "text"],
    ["missing fields", JSON.stringify({ v: 1, ts: 1 }), "text"],
    ["a text payload decoded as image", encodeTextPayload("a", 1), "image"],
  ] as const)("returns null for %s", (_name, payload, kind) => {
    expect(decodePayload(kind, payload)).toBeNull();
  });
});
