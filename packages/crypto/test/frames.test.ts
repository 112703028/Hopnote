import { describe, expect, it } from "vitest";
import { MAX_IMAGE_PAYLOAD_CHARS, RETENTION_MS, validateEnvelope } from "@hopnote/protocol";
import {
  FrameError,
  MAX_PNG_BYTES,
  checkFreshness,
  decodeImageFrame,
  decodeTextFrame,
  deriveKeys,
  encodeImageFrame,
  encodeTextFrame,
  sealItem,
} from "../src/index";
import { ITEM_ID, MASTER } from "./vectors";

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

describe("text frames", () => {
  it("round-trips Chinese, accents and emoji", () => {
    const frame = encodeTextFrame("héllo 世界 🙂", 1234);
    expect(decodeTextFrame(frame)).toEqual({ text: "héllo 世界 🙂", ts: 1234 });
  });

  it.each([
    ["not JSON", new TextEncoder().encode("{nope")],
    ["v other than 1", new TextEncoder().encode('{"v":2,"text":"a","ts":1}')],
    ["a missing text", new TextEncoder().encode('{"v":1,"ts":1}')],
    ["an empty frame", new Uint8Array(0)],
  ])("throws FrameError for %s", (_name, frame) => {
    expect(() => decodeTextFrame(frame)).toThrow(FrameError);
  });
});

describe("image frames", () => {
  it("round-trips PNG bytes with width, height and ts", () => {
    const frame = encodeImageFrame({ png: PNG_SIGNATURE, width: 3, height: 2 }, 99);
    expect(decodeImageFrame(frame)).toEqual({ png: PNG_SIGNATURE, width: 3, height: 2, ts: 99 });
  });

  it("starts with the big-endian meta length", () => {
    const frame = encodeImageFrame({ png: PNG_SIGNATURE, width: 3, height: 2 }, 99);
    const metaLength = new DataView(frame.buffer, frame.byteOffset).getUint32(0, false);
    const meta = JSON.parse(new TextDecoder().decode(frame.subarray(4, 4 + metaLength)));
    expect(meta).toEqual({ v: 1, mime: "image/png", width: 3, height: 2, ts: 99 });
  });

  it.each([
    ["a truncated frame", Uint8Array.from([0, 0])],
    ["a meta length that runs past the end", Uint8Array.from([0, 0, 1, 0, 123, 125])],
    ["meta that is not JSON", Uint8Array.from([0, 0, 0, 4, 110, 111, 112, 101, 1])],
  ])("throws FrameError for %s", (_name, frame) => {
    expect(() => decodeImageFrame(frame)).toThrow(FrameError);
  });

  it("throws FrameError for v other than 1", () => {
    const meta = new TextEncoder().encode('{"v":2,"mime":"image/png","width":1,"height":1,"ts":1}');
    const frame = new Uint8Array(4 + meta.length + 1);
    new DataView(frame.buffer).setUint32(0, meta.length, false);
    frame.set(meta, 4);
    expect(() => decodeImageFrame(frame)).toThrow(FrameError);
  });

  it("keeps a PNG of exactly MAX_PNG_BYTES inside the relay's image limit once sealed", async () => {
    const keys = await deriveKeys(MASTER);
    const frame = encodeImageFrame(
      { png: new Uint8Array(MAX_PNG_BYTES), width: 1600, height: 1600 },
      9_999_999_999_999,
    );
    const payload = await sealItem(keys, "image", ITEM_ID, frame);
    expect(payload.length).toBeLessThanOrEqual(MAX_IMAGE_PAYLOAD_CHARS);
    expect(validateEnvelope({ id: ITEM_ID, kind: "image", payload }).ok).toBe(true);
  });
});

describe("checkFreshness", () => {
  const now = 1_700_000_000_000;
  const TEN_MINUTES = 10 * 60 * 1000;

  it("accepts exactly 7 days old and rejects 7 days and 1 ms as stale", () => {
    expect(RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(checkFreshness(now - RETENTION_MS, now)).toBe("ok");
    expect(checkFreshness(now - RETENTION_MS - 1, now)).toBe("stale");
  });

  it("accepts exactly 10 minutes ahead and rejects 10 minutes and 1 ms as future", () => {
    expect(checkFreshness(now + TEN_MINUTES, now)).toBe("ok");
    expect(checkFreshness(now + TEN_MINUTES + 1, now)).toBe("future");
  });

  it("accepts the present", () => {
    expect(checkFreshness(now, now)).toBe("ok");
  });
});
