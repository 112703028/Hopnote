import { describe, expect, it } from "vitest";
import { encodeTextPayload, type StoredItem } from "@hopnote/protocol";
import { decodeCached } from "../src/decode-cache";

function item(text: string): StoredItem {
  return {
    seq: 1,
    id: "0".repeat(32),
    kind: "text",
    payload: encodeTextPayload(text, 1),
    receivedAt: 1,
  };
}

describe("decodeCached", () => {
  it("decodes the payload", () => {
    expect(decodeCached(item("hi"))).toEqual({ v: 1, text: "hi", ts: 1 });
  });

  it("returns the very same object on a second call, so a render does not re-parse", () => {
    const stored = item("hi");
    expect(decodeCached(stored)).toBe(decodeCached(stored));
  });

  it("returns null for an item whose payload cannot be decoded", () => {
    const broken: StoredItem = { ...item("x"), payload: "{nope" };
    expect(decodeCached(broken)).toBeNull();
  });
});
