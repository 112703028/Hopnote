import jsQR from "jsqr";
import { parsePairingCode } from "@hopnote/crypto";

/** The shape of an ImageData, so a camera frame and a test image look the same. */
export interface Frame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Looks for a QR code in one camera frame and returns the master key if it holds a pairing link
 * or a pairing code. Anything else (another QR code, no QR code) gives null, so the camera keeps
 * looking.
 */
export function keyFromFrame(frame: Frame): Uint8Array | null {
  // The desktop shows dark modules on white, so inverted codes need not be tried.
  const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" });
  return code ? parsePairingCode(code.data) : null;
}
