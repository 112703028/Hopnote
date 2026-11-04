import { RETENTION_MS } from "@hopnote/protocol";
import { concatBytes } from "./encoding";

export class FrameError extends Error {}

/**
 * Largest PNG that still fits MAX_IMAGE_PAYLOAD_CHARS (1,500,000) after the frame header
 * (at most about 84 bytes), the 24-byte nonce, the 16-byte tag and base64: 1,124,800 bytes
 * of PNG give at most 1,499,899 characters.
 */
export const MAX_PNG_BYTES = 1_124_800;

const MAX_FUTURE_MS = 10 * 60 * 1000;

export type Freshness = "ok" | "stale" | "future";

export function checkFreshness(ts: number, now: number): Freshness {
  if (now - ts > RETENTION_MS) return "stale";
  if (ts - now > MAX_FUTURE_MS) return "future";
  return "ok";
}

export function encodeTextFrame(text: string, ts: number): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: 1, text, ts }));
}

function parseJson(bytes: Uint8Array): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new FrameError("frame is not valid JSON");
  }
  if (typeof value !== "object" || value === null) throw new FrameError("frame is not an object");
  return value as Record<string, unknown>;
}

export function decodeTextFrame(frame: Uint8Array): { text: string; ts: number } {
  const value = parseJson(frame);
  if (value.v !== 1 || typeof value.text !== "string" || typeof value.ts !== "number") {
    throw new FrameError("not a version 1 text frame");
  }
  return { text: value.text, ts: value.ts };
}

export function encodeImageFrame(
  img: { png: Uint8Array; width: number; height: number },
  ts: number,
): Uint8Array {
  const meta = new TextEncoder().encode(
    JSON.stringify({ v: 1, mime: "image/png", width: img.width, height: img.height, ts }),
  );
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, meta.length, false);
  return concatBytes(length, meta, img.png);
}

export function decodeImageFrame(frame: Uint8Array): {
  png: Uint8Array;
  width: number;
  height: number;
  ts: number;
} {
  if (frame.length < 4) throw new FrameError("image frame is truncated");
  const metaLength = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0, false);
  if (4 + metaLength > frame.length) throw new FrameError("image meta runs past the frame");
  const meta = parseJson(frame.subarray(4, 4 + metaLength));
  if (
    meta.v !== 1 ||
    meta.mime !== "image/png" ||
    typeof meta.width !== "number" ||
    typeof meta.height !== "number" ||
    typeof meta.ts !== "number"
  ) {
    throw new FrameError("not a version 1 image frame");
  }
  return {
    png: frame.slice(4 + metaLength),
    width: meta.width,
    height: meta.height,
    ts: meta.ts,
  };
}
