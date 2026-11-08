import { encodeImageFrame, encodeTextFrame } from "@hopnote/crypto";
import type { ItemKind } from "@hopnote/protocol";
import type { encodeScreenshot } from "./image";
import type { SendResult } from "./relay";

export interface CaptureDeps {
  copySelection(): Promise<boolean>;
  /** Opens the Windows snipping overlay. Resolves true once a snip reached the clipboard,
   *  false when it was cancelled (Esc) or timed out. */
  captureScreenshot(): Promise<boolean>;
  /** null when the clipboard holds no text. */
  readText(): Promise<string | null>;
  readImage(): Promise<{ rgba: Uint8Array; width: number; height: number } | null>;
  encodeScreenshot: typeof encodeScreenshot;
  /** Receives the plaintext frame; sealing and posting happen behind it. */
  send(kind: ItemKind, plaintext: Uint8Array): Promise<SendResult>;
  now(): number;
}

export type CaptureOutcome =
  | { status: "sent"; kind: ItemKind; seq: number }
  | { status: "cancelled" }
  | { status: "empty" }
  | { status: "too-large" }
  | { status: "error"; message: string };

function hasText(text: string | null): text is string {
  return text !== null && text.trim() !== "";
}

async function deliver(
  deps: CaptureDeps,
  kind: ItemKind,
  plaintext: Uint8Array,
): Promise<CaptureOutcome> {
  const result = await deps.send(kind, plaintext);
  return result.ok
    ? { status: "sent", kind, seq: result.seq }
    : { status: "error", message: result.error };
}

function failure(error: unknown): CaptureOutcome {
  return { status: "error", message: error instanceof Error ? error.message : String(error) };
}

async function deliverClipboardImage(deps: CaptureDeps): Promise<CaptureOutcome> {
  const image = await deps.readImage();
  if (!image) return { status: "empty" };
  const encoded = await deps.encodeScreenshot(image.rgba, image.width, image.height);
  if (!encoded) return { status: "too-large" };
  return await deliver(deps, "image", encodeImageFrame(encoded, deps.now()));
}

/** Alt+Q: send the current selection as text; with no selection, start a screenshot and send that. */
export async function sendSelection(deps: CaptureDeps): Promise<CaptureOutcome> {
  try {
    if (await deps.copySelection()) {
      const text = await deps.readText();
      if (!hasText(text)) return { status: "empty" };
      return await deliver(deps, "text", encodeTextFrame(text, deps.now()));
    }
    if (!(await deps.captureScreenshot())) return { status: "cancelled" };
    return await deliverClipboardImage(deps);
  } catch (error) {
    return failure(error);
  }
}

/** Alt+W: send what is on the clipboard. Text wins over an image. */
export async function sendClipboard(deps: CaptureDeps): Promise<CaptureOutcome> {
  try {
    const text = await deps.readText();
    if (hasText(text)) return await deliver(deps, "text", encodeTextFrame(text, deps.now()));
    return await deliverClipboardImage(deps);
  } catch (error) {
    return failure(error);
  }
}
