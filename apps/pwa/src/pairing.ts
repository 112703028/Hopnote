import { encodePairingCode, parsePairingCode } from "@hopnote/crypto";

const KEY = "hopnote.key";
const LEGACY_SECRET = "hopnote.roomSecret";
const CONFIRMED_FINGERPRINT = "hopnote.confirmedFingerprint";

export function parseKeyFromHash(hash: string): Uint8Array | null {
  return hash.startsWith("#") ? parsePairingCode(hash.slice(1)) : null;
}

export function loadKey(storage: Pick<Storage, "getItem">): Uint8Array | null {
  const stored = storage.getItem(KEY);
  return stored === null ? null : parsePairingCode(stored);
}

export function saveKey(storage: Pick<Storage, "setItem">, master: Uint8Array): void {
  storage.setItem(KEY, encodePairingCode(master));
}

export function clearKey(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(KEY);
}

/** Stage 1 stored a plaintext room secret. Returns true if one was found (and removed). */
export function discardLegacySecret(storage: Pick<Storage, "getItem" | "removeItem">): boolean {
  const existed = storage.getItem(LEGACY_SECRET) !== null;
  storage.removeItem(LEGACY_SECRET);
  return existed;
}

export function isFingerprintConfirmed(storage: Pick<Storage, "getItem">, fingerprint: string): boolean {
  return storage.getItem(CONFIRMED_FINGERPRINT) === fingerprint;
}

export function confirmFingerprint(storage: Pick<Storage, "setItem">, fingerprint: string): void {
  storage.setItem(CONFIRMED_FINGERPRINT, fingerprint);
}
