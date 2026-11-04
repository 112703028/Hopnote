import { beforeAll, describe, expect, it } from "vitest";
import { RETENTION_MS, type ItemKind, type StoredItem } from "@hopnote/protocol";
import {
  deriveKeys,
  encodeImageFrame,
  encodeTextFrame,
  sealItem,
  type DerivedKeys,
} from "@hopnote/crypto";
import { openItems } from "../src/open-feed";

const NOW = 1_700_000_000_000;
const TEN_MINUTES = 10 * 60 * 1000;
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

let keys: DerivedKeys;
let otherKeys: DerivedKeys;

beforeAll(async () => {
  keys = await deriveKeys(Uint8Array.from({ length: 32 }, (_, i) => i));
  otherKeys = await deriveKeys(Uint8Array.from({ length: 32 }, (_, i) => 255 - i));
});

async function stored(
  seq: number,
  kind: ItemKind,
  plaintext: Uint8Array,
  sealWith: DerivedKeys = keys,
): Promise<StoredItem> {
  const id = seq.toString(16).padStart(32, "0");
  return { seq, id, kind, payload: await sealItem(sealWith, kind, id, plaintext), receivedAt: seq };
}

describe("openItems", () => {
  it("shows a sealed text item with its text and timestamp", async () => {
    const item = await stored(1, "text", encodeTextFrame("hello 世界", NOW));
    const result = await openItems(keys, [item], NOW);
    expect(result.shown).toEqual([{ seq: 1, kind: "text", ts: NOW, text: "hello 世界" }]);
    expect(result).toMatchObject({ undecryptable: 0, stale: 0, future: 0 });
  });

  it("shows a sealed image item with a PNG Blob and a blob: URL", async () => {
    const item = await stored(2, "image", encodeImageFrame({ png: PNG, width: 3, height: 2 }, NOW));
    const { shown } = await openItems(keys, [item], NOW);
    expect(shown).toHaveLength(1);
    const image = shown[0];
    expect(image.kind).toBe("image");
    if (image.kind === "image") {
      expect(image.blob.type).toBe("image/png");
      expect(image.blob.size).toBe(PNG.length);
      expect(image.url.startsWith("blob:")).toBe(true);
      expect([image.width, image.height]).toEqual([3, 2]);
    }
  });

  it("counts an item sealed with another key as undecryptable", async () => {
    const item = await stored(3, "text", encodeTextFrame("secret", NOW), otherKeys);
    const result = await openItems(keys, [item], NOW);
    expect(result.shown).toEqual([]);
    expect(result.undecryptable).toBe(1);
  });

  it("counts an item whose plaintext is not a valid frame as undecryptable", async () => {
    const item = await stored(4, "text", new TextEncoder().encode("not a frame"));
    const result = await openItems(keys, [item], NOW);
    expect(result.shown).toEqual([]);
    expect(result.undecryptable).toBe(1);
  });

  it("counts a timestamp 7 days and 1 ms old as stale and 10 minutes and 1 ms ahead as future", async () => {
    const old = await stored(5, "text", encodeTextFrame("old", NOW - RETENTION_MS - 1));
    const ahead = await stored(6, "text", encodeTextFrame("ahead", NOW + TEN_MINUTES + 1));
    const edgeOld = await stored(7, "text", encodeTextFrame("edge", NOW - RETENTION_MS));
    const result = await openItems(keys, [old, ahead, edgeOld], NOW);
    expect(result.stale).toBe(1);
    expect(result.future).toBe(1);
    expect(result.shown.map((i) => i.seq)).toEqual([7]);
  });

  it("keeps the input order", async () => {
    const items = [
      await stored(30, "text", encodeTextFrame("c", NOW)),
      await stored(10, "text", encodeTextFrame("a", NOW)),
      await stored(20, "text", encodeTextFrame("b", NOW)),
    ];
    const { shown } = await openItems(keys, items, NOW);
    expect(shown.map((i) => i.seq)).toEqual([30, 10, 20]);
  });
});
