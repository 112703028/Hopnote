import type { StoredItem } from "@hopnote/protocol";

/**
 * Returns the items whose id has not been seen and marks them as seen. The same item can arrive
 * twice (a history fetch racing a live push); decrypting and counting it twice would duplicate
 * work, notices and image data.
 */
export function takeUnseen(seen: Set<string>, items: StoredItem[]): StoredItem[] {
  const fresh: StoredItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    fresh.push(item);
  }
  return fresh;
}
