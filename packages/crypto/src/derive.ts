import { toBase64Url } from "./encoding";

export interface DerivedKeys {
  /** Never leaves the devices. */
  contentKey: Uint8Array;
  /** 32 lowercase hex characters; goes into relay URLs. */
  roomId: string;
  /** base64url, 43 characters; sent to the relay as proof of the key. */
  authToken: string;
  /** For comparing two screens, e.g. "A3F2 91C0 7B44 D8E1". */
  fingerprint: string;
}

const SALT = new TextEncoder().encode("hopnote-v1");

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hkdf(master: Uint8Array, info: string, length: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", new Uint8Array(master), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: new TextEncoder().encode(info) },
    base,
    length * 8,
  );
  return new Uint8Array(bits);
}

export async function deriveKeys(master: Uint8Array): Promise<DerivedKeys> {
  if (master.length !== 32) throw new Error("master key must be 32 bytes");
  const [contentKey, room, auth, fingerprint] = await Promise.all([
    hkdf(master, "hopnote/v1/content", 32),
    hkdf(master, "hopnote/v1/room", 16),
    hkdf(master, "hopnote/v1/auth", 32),
    hkdf(master, "hopnote/v1/fingerprint", 8),
  ]);
  return {
    contentKey,
    roomId: hex(room),
    authToken: toBase64Url(auth),
    fingerprint: hex(fingerprint).toUpperCase().replace(/(.{4})(?=.)/g, "$1 "),
  };
}
