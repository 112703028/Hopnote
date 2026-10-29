import { isHex128 } from "@pc-to-ipad/protocol";

const STORAGE_KEY = "pc-to-ipad.roomSecret";

export function normalizeSecretInput(input: string): string | null {
  const secret = input.trim().toLowerCase();
  return isHex128(secret) ? secret : null;
}

export function parseSecretFromHash(hash: string): string | null {
  return hash.startsWith("#") ? normalizeSecretInput(hash.slice(1)) : null;
}

export function loadSecret(storage: Pick<Storage, "getItem">): string | null {
  const stored = storage.getItem(STORAGE_KEY);
  return stored === null ? null : normalizeSecretInput(stored);
}

export function saveSecret(storage: Pick<Storage, "setItem">, secret: string): void {
  storage.setItem(STORAGE_KEY, secret);
}
