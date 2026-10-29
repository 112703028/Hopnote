import { MAX_IMAGE_PAYLOAD_CHARS, MAX_TEXT_PAYLOAD_CHARS } from "./limits";

export type ItemKind = "text" | "image";

export interface Envelope {
  id: string;
  kind: ItemKind;
  payload: string;
}

export interface StoredItem extends Envelope {
  seq: number;
  receivedAt: number;
}

export type ServerMessage = { type: "item"; item: StoredItem };

export type EnvelopeResult =
  | { ok: true; envelope: Envelope }
  | { ok: false; error: string; code: "invalid" | "too_large" };

const HEX128 = /^[0-9a-f]{32}$/;

export function isHex128(value: unknown): value is string {
  return typeof value === "string" && HEX128.test(value);
}

export function newItemId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function validateEnvelope(raw: unknown): EnvelopeResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "envelope must be an object", code: "invalid" };
  }
  const { id, kind, payload } = raw as Record<string, unknown>;
  if (!isHex128(id)) {
    return { ok: false, error: "id must be 32 lowercase hex chars", code: "invalid" };
  }
  if (kind !== "text" && kind !== "image") {
    return { ok: false, error: 'kind must be "text" or "image"', code: "invalid" };
  }
  if (typeof payload !== "string" || payload.length === 0) {
    return { ok: false, error: "payload must be a non-empty string", code: "invalid" };
  }
  const max = kind === "text" ? MAX_TEXT_PAYLOAD_CHARS : MAX_IMAGE_PAYLOAD_CHARS;
  if (payload.length > max) {
    return { ok: false, error: `payload exceeds ${max} chars`, code: "too_large" };
  }
  return { ok: true, envelope: { id, kind, payload } };
}
