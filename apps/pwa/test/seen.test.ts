import { describe, expect, it } from "vitest";
import type { StoredItem } from "@hopnote/protocol";
import { takeUnseen } from "../src/seen";

function item(seq: number, id = seq.toString(16).padStart(32, "0")): StoredItem {
  return { seq, id, kind: "text", payload: "A".repeat(54), receivedAt: seq };
}

describe("takeUnseen", () => {
  it("returns only items whose id was not seen, and marks them as seen", () => {
    const seen = new Set<string>();
    expect(takeUnseen(seen, [item(1), item(2)]).map((i) => i.seq)).toEqual([1, 2]);
    expect(takeUnseen(seen, [item(2), item(3)]).map((i) => i.seq)).toEqual([3]);
    expect(seen.size).toBe(3);
  });

  it("returns an id once even when it repeats inside one batch", () => {
    const seen = new Set<string>();
    const twice = [item(1), item(1)];
    expect(takeUnseen(seen, twice)).toHaveLength(1);
  });

  it("returns nothing when every id was already seen", () => {
    const seen = new Set<string>();
    takeUnseen(seen, [item(1)]);
    expect(takeUnseen(seen, [item(1)])).toEqual([]);
  });
});
