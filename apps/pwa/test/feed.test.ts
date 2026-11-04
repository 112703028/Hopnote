import { describe, expect, it } from "vitest";
import type { StoredItem } from "@hopnote/protocol";
import { emptyFeed, mergeItems } from "../src/feed";

function item(seq: number, kind: "text" | "image" = "text"): StoredItem {
  return { seq, id: seq.toString(16).padStart(32, "0"), kind, payload: "{}", receivedAt: seq };
}

describe("mergeItems", () => {
  it("dedupes by seq", () => {
    const state = mergeItems(emptyFeed, [item(1), item(2)]);
    const merged = mergeItems(state, [item(2), item(3)]);
    expect(merged.items.map((i) => i.seq)).toEqual([3, 2, 1]);
  });

  it("sorts newest first even when history arrives after a live item", () => {
    const afterLive = mergeItems(emptyFeed, [item(5)]);
    const afterHistory = mergeItems(afterLive, [item(3), item(4)]);
    expect(afterHistory.items.map((i) => i.seq)).toEqual([5, 4, 3]);
  });

  it("tracks latestSeq as the max seq seen", () => {
    const state = mergeItems(mergeItems(emptyFeed, [item(7)]), [item(2)]);
    expect(state.latestSeq).toBe(7);
  });

  it("keeps only the newest 100 text items", () => {
    const items = Array.from({ length: 105 }, (_, i) => item(i + 1));
    const state = mergeItems(emptyFeed, items);
    expect(state.items).toHaveLength(100);
    expect(state.items[0].seq).toBe(105);
    expect(state.items[99].seq).toBe(6);
  });

  it("keeps only the newest 20 images, independent of the text items", () => {
    const texts = Array.from({ length: 3 }, (_, i) => item(i + 1));
    const images = Array.from({ length: 25 }, (_, i) => item(i + 4, "image"));
    const state = mergeItems(emptyFeed, [...texts, ...images]);
    expect(state.items.filter((i) => i.kind === "image")).toHaveLength(20);
    expect(state.items.filter((i) => i.kind === "text")).toHaveLength(3);
    expect(state.latestSeq).toBe(28);
  });

  it("does not mutate the input state", () => {
    const state = mergeItems(emptyFeed, [item(1)]);
    const snapshot = JSON.stringify(state);
    mergeItems(state, [item(2)]);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(JSON.stringify(emptyFeed)).toBe(JSON.stringify({ items: [], latestSeq: 0 }));
  });
});
