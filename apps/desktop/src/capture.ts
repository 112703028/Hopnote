import { encodeImageFrame, encodeTextFrame } from "@hopnote/crypto";
import type { ItemKind } from "@hopnote/protocol";
import type { encodeScreenshot } from "./image";
import type { SendResult } from "./relay";

export interface CaptureDeps {
  /** Presses Ctrl+C in the app in front. True when the clipboard changed. */
  copySelection(): Promise<boolean>;
  /** Opens the Windows snipping overlay. Resolves true once a snip reached the clipboard,
   *  false when it was cancelled (Esc) or timed out. */
  captureScreenshot(): Promise<boolean>;
  /** null when the clipboard holds no text. */
  readText(): Promise<string | null>;
  readImage(): Promise<{ rgba: Uint8Array; width: number; height: number } | null>;
  encodeScreenshot: typeof encodeScreenshot;
  sleep(ms: number): Promise<void>;
  /** Receives the plaintext frame; sealing and posting happen behind it. */
  send(kind: ItemKind, plaintext: Uint8Array): Promise<SendResult>;
  now(): number;
}

export type CaptureOutcome =
  | { status: "sent"; kind: ItemKind; seq: number }
  // Alt+Q: Ctrl+C changed nothing, so nothing was selected.
  | { status: "nothing-copied" }
  // Alt+Q: Ctrl+C changed the clipboard but it holds no text (the app in front copied an image).
  | { status: "no-text" }
  // Alt+W: the snip was cancelled (Esc) or nobody finished it in time.
  | { status: "cancelled" }
  // Alt+W: a snip reached the clipboard but no image could be read from it.
  | { status: "no-image" }
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

// Right after a snip the snipping tool and Windows' clipboard history may still hold the
// clipboard open, which makes a read fail for a moment.
const IMAGE_READ_ATTEMPTS = 20;
const IMAGE_READ_PAUSE_MS = 100;

async function readImageWhenReady(deps: CaptureDeps) {
  for (let attempt = 1; ; attempt++) {
    const image = await deps.readImage();
    if (image || attempt >= IMAGE_READ_ATTEMPTS) return image;
    await deps.sleep(IMAGE_READ_PAUSE_MS);
  }
}

/** Alt+Q: copy the current selection and send it as text. */
export async function sendSelection(deps: CaptureDeps): Promise<CaptureOutcome> {
  try {
    if (!(await deps.copySelection())) return { status: "nothing-copied" };
    const text = await deps.readText();
    if (!hasText(text)) return { status: "no-text" };
    return await deliver(deps, "text", encodeTextFrame(text, deps.now()));
  } catch (error) {
    return failure(error);
  }
}

/** Alt+W: open the snipping overlay and send the snip as an image. */
export async function sendScreenshot(deps: CaptureDeps): Promise<CaptureOutcome> {
  try {
    if (!(await deps.captureScreenshot())) return { status: "cancelled" };
    const image = await readImageWhenReady(deps);
    if (!image) return { status: "no-image" };
    const encoded = await deps.encodeScreenshot(image.rgba, image.width, image.height);
    if (!encoded) return { status: "too-large" };
    return await deliver(deps, "image", encodeImageFrame(encoded, deps.now()));
  } catch (error) {
    return failure(error);
  }
}
