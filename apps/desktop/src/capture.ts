import { encodeImagePayload, encodeTextPayload, type ItemKind } from "@hopnote/protocol";
import type { encodeScreenshot } from "./image";
import type { SendResult } from "./relay";

export interface CaptureDeps {
  copySelection(): Promise<boolean>;
  /** null when the clipboard holds no text. */
  readText(): Promise<string | null>;
  readImage(): Promise<{ rgba: Uint8Array; width: number; height: number } | null>;
  encodeScreenshot: typeof encodeScreenshot;
  send(kind: ItemKind, payload: string): Promise<SendResult>;
  now(): number;
}

export type CaptureOutcome =
  | { status: "sent"; kind: ItemKind; seq: number }
  | { status: "nothing-copied" }
  | { status: "empty" }
  | { status: "too-large" }
  | { status: "error"; message: string };

function hasText(text: string | null): text is string {
  return text !== null && text.trim() !== "";
}

async function deliver(deps: CaptureDeps, kind: ItemKind, payload: string): Promise<CaptureOutcome> {
  const result = await deps.send(kind, payload);
  return result.ok ? { status: "sent", kind, seq: result.seq } : { status: "error", message: result.error };
}

function failure(error: unknown): CaptureOutcome {
  return { status: "error", message: error instanceof Error ? error.message : String(error) };
}

/** Alt+Q: copy the current selection, then send it as text. */
export async function sendSelection(deps: CaptureDeps): Promise<CaptureOutcome> {
  try {
    if (!(await deps.copySelection())) return { status: "nothing-copied" };
    const text = await deps.readText();
    if (!hasText(text)) return { status: "empty" };
    return await deliver(deps, "text", encodeTextPayload(text, deps.now()));
  } catch (error) {
    return failure(error);
  }
}

/** Alt+W: send what is on the clipboard. Text wins over an image. */
export async function sendClipboard(deps: CaptureDeps): Promise<CaptureOutcome> {
  try {
    const text = await deps.readText();
    if (hasText(text)) return await deliver(deps, "text", encodeTextPayload(text, deps.now()));

    const image = await deps.readImage();
    if (!image) return { status: "empty" };
    const encoded = await deps.encodeScreenshot(image.rgba, image.width, image.height);
    if (!encoded) return { status: "too-large" };
    return await deliver(deps, "image", encodeImagePayload(encoded, deps.now()));
  } catch (error) {
    return failure(error);
  }
}
