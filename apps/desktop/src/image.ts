import { MAX_IMAGE_PAYLOAD_CHARS } from "@hopnote/protocol";

export const EDGE_LADDER = [1600, 1200, 900, 600];

// Room for the JSON wrapper around the base64 data.
const WRAPPER_ALLOWANCE = 512;

export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Encodes RGBA pixels as PNG, shrinking step by step until the base64 fits the relay limit.
export async function encodeScreenshot(
  rgba: Uint8Array,
  width: number,
  height: number,
): Promise<{ data: string; width: number; height: number } | null> {
  const source = new OffscreenCanvas(width, height);
  const sourceContext = source.getContext("2d");
  if (!sourceContext) return null;
  sourceContext.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);

  let previous = "";
  for (const edge of EDGE_LADDER) {
    const size = fitWithin(width, height, edge);
    const key = `${size.width}x${size.height}`;
    if (key === previous) continue;
    previous = key;

    const target = new OffscreenCanvas(size.width, size.height);
    const context = target.getContext("2d");
    if (!context) return null;
    context.drawImage(source, 0, 0, size.width, size.height);
    const blob = await target.convertToBlob({ type: "image/png" });
    const data = toBase64(new Uint8Array(await blob.arrayBuffer()));
    if (data.length <= MAX_IMAGE_PAYLOAD_CHARS - WRAPPER_ALLOWANCE) {
      return { data, width: size.width, height: size.height };
    }
  }
  return null;
}
