import type { ItemKind } from "./validate";

export interface TextPayload {
  v: 1;
  text: string;
  ts: number;
}

export interface ImagePayload {
  v: 1;
  mime: "image/png";
  data: string;
  width: number;
  height: number;
  ts: number;
}

export function encodeTextPayload(text: string, ts: number): string {
  const payload: TextPayload = { v: 1, text, ts };
  return JSON.stringify(payload);
}

export function encodeImagePayload(
  img: { data: string; width: number; height: number },
  ts: number,
): string {
  const payload: ImagePayload = {
    v: 1,
    mime: "image/png",
    data: img.data,
    width: img.width,
    height: img.height,
    ts,
  };
  return JSON.stringify(payload);
}

export function decodePayload(kind: ItemKind, payload: string): TextPayload | ImagePayload | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.v !== 1 || typeof v.ts !== "number") return null;
  if (kind === "text") {
    return typeof v.text === "string" ? { v: 1, text: v.text, ts: v.ts } : null;
  }
  if (
    v.mime === "image/png" &&
    typeof v.data === "string" &&
    typeof v.width === "number" &&
    typeof v.height === "number"
  ) {
    return { v: 1, mime: "image/png", data: v.data, width: v.width, height: v.height, ts: v.ts };
  }
  return null;
}
