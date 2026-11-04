import { fromBase64Url, toBase64Url } from "./encoding";

const MASTER_KEY_BYTES = 32;
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const QUOTES = /^["'“”‘’「」]+|["'“”‘’「」]+$/g;

export function generateMasterKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(MASTER_KEY_BYTES));
}

export function encodePairingCode(master: Uint8Array): string {
  return toBase64Url(master);
}

/**
 * Accepts the bare code or a pairing link. Tolerates what chat apps and terminals do to
 * pasted text: surrounding whitespace, line breaks inside the code, surrounding quotes.
 */
export function parsePairingCode(input: string): Uint8Array | null {
  let text = input.trim();
  const hash = text.lastIndexOf("#");
  if (hash >= 0) text = text.slice(hash + 1);
  text = text.replace(/\s+/g, "").replace(QUOTES, "").replace(/\/+$/, "");
  if (!CODE_PATTERN.test(text)) return null;
  const bytes = fromBase64Url(text);
  return bytes.length === MASTER_KEY_BYTES ? bytes : null;
}

export function buildPairingLink(relayUrl: string, master: Uint8Array): string {
  return `${relayUrl.replace(/\/+$/, "")}/#${encodePairingCode(master)}`;
}
