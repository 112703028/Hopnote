import { MAX_IMAGE_ITEMS, MAX_TEXT_ITEMS, type ItemKind, type StoredItem } from "@hopnote/protocol";

export interface FeedItem {
  seq: number;
  kind: ItemKind;
}

export interface FeedState<T extends FeedItem = StoredItem> {
  /** Newest first. */
  items: T[];
  latestSeq: number;
}

export const emptyFeed: FeedState<never> = { items: [], latestSeq: 0 };

export function mergeItems<T extends FeedItem>(state: FeedState<T>, incoming: T[]): FeedState<T> {
  const bySeq = new Map<number, T>();
  for (const item of state.items) bySeq.set(item.seq, item);
  for (const item of incoming) bySeq.set(item.seq, item);
  const sorted = [...bySeq.values()].sort((a, b) => b.seq - a.seq);
  // The same per-kind caps as the relay, so a long session cannot grow the page without bound.
  const caps = { text: MAX_TEXT_ITEMS, image: MAX_IMAGE_ITEMS };
  const seen = { text: 0, image: 0 };
  const items = sorted.filter((item) => ++seen[item.kind] <= caps[item.kind]);
  return { items, latestSeq: Math.max(state.latestSeq, sorted[0]?.seq ?? 0) };
}
