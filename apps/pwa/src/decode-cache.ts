import {
  decodePayload,
  type ImagePayload,
  type StoredItem,
  type TextPayload,
} from "@hopnote/protocol";

type Decoded = TextPayload | ImagePayload | null;

// An image payload is megabytes of JSON; parse each stored item once, not on every render.
const cache = new WeakMap<StoredItem, Decoded>();

export function decodeCached(item: StoredItem): Decoded {
  if (!cache.has(item)) cache.set(item, decodePayload(item.kind, item.payload));
  return cache.get(item) ?? null;
}
