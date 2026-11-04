import { MAX_PNG_BYTES } from "@hopnote/crypto";

export const EDGE_LADDER = [1600, 1200, 900, 600];

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

// Encodes RGBA pixels as PNG, shrinking step by step until the PNG fits the relay limit.
export async function encodeScreenshot(
  rgba: Uint8Array,
  width: number,
  height: number,
): Promise<{ png: Uint8Array; width: number; height: number } | null> {
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
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, size.width, size.height);
    const blob = await target.convertToBlob({ type: "image/png" });
    const png = new Uint8Array(await blob.arrayBuffer());
    if (png.length <= MAX_PNG_BYTES) return { png, width: size.width, height: size.height };
  }
  return null;
}
