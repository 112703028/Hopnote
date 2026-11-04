import type { StoredItem } from "@hopnote/protocol";

export interface FeedState {
  /** Newest first. */
  items: StoredItem[];
  latestSeq: number;
}

export const emptyFeed: FeedState = { items: [], latestSeq: 0 };

export function mergeItems(state: FeedState, incoming: StoredItem[]): FeedState {
  const bySeq = new Map<number, StoredItem>();
  for (const item of state.items) bySeq.set(item.seq, item);
  for (const item of incoming) bySeq.set(item.seq, item);
  const items = [...bySeq.values()].sort((a, b) => b.seq - a.seq);
  return { items, latestSeq: Math.max(state.latestSeq, items[0]?.seq ?? 0) };
}
