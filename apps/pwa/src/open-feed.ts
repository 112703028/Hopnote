import type { StoredItem } from "@hopnote/protocol";
import {
  checkFreshness,
  decodeImageFrame,
  decodeTextFrame,
  openItem,
  type DerivedKeys,
} from "@hopnote/crypto";

export type DisplayItem =
  | { seq: number; kind: "text"; ts: number; text: string }
  | {
      seq: number;
      kind: "image";
      ts: number;
      /** The card that shows it creates and revokes the object URL. */
      blob: Blob;
      width: number;
      height: number;
    };

export interface OpenResult {
  shown: DisplayItem[];
  undecryptable: number;
  stale: number;
  future: number;
}

/** Decrypts items one by one; anything that cannot be shown is counted, never dropped silently. */
export async function openItems(
  keys: DerivedKeys,
  items: StoredItem[],
  now: number,
): Promise<OpenResult> {
  const result: OpenResult = { shown: [], undecryptable: 0, stale: 0, future: 0 };
  for (const item of items) {
    try {
      const plaintext = await openItem(keys, item.kind, item.id, item.payload);
      const display = toDisplay(item, plaintext);
      const freshness = checkFreshness(display.ts, now);
      if (freshness === "stale") result.stale++;
      else if (freshness === "future") result.future++;
      else result.shown.push(display);
    } catch {
      // DecryptError (wrong key, altered data) or FrameError (not a valid frame).
      result.undecryptable++;
    }
  }
  return result;
}

function toDisplay(item: StoredItem, plaintext: Uint8Array): DisplayItem {
  if (item.kind === "text") {
    const { text, ts } = decodeTextFrame(plaintext);
    return { seq: item.seq, kind: "text", ts, text };
  }
  const image = decodeImageFrame(plaintext);
  const blob = new Blob([new Uint8Array(image.png)], { type: "image/png" });
  return {
    seq: item.seq,
    kind: "image",
    ts: image.ts,
    blob,
    width: image.width,
    height: image.height,
  };
}
