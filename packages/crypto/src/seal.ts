import type { ItemKind } from "@hopnote/protocol";
import sodium from "libsodium-wrappers";
import type { DerivedKeys } from "./derive";
import { concatBytes, fromBase64Url, toBase64Url } from "./encoding";

const NONCE_BYTES = 24;
const TAG_BYTES = 16;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export class DecryptError extends Error {}

let ready: Promise<void> | undefined;
function sodiumReady(): Promise<void> {
  return (ready ??= sodium.ready);
}

// Authenticated, not secret: ties a ciphertext to its id and kind so the relay cannot move it.
function associatedData(kind: ItemKind, id: string): Uint8Array {
  return new TextEncoder().encode(`hopnote/v1|${kind}|${id}`);
}

/** Test vectors only. Production code must use sealItem, which picks a fresh random nonce. */
export async function sealItemWithNonce(
  keys: DerivedKeys,
  kind: ItemKind,
  id: string,
  plaintext: Uint8Array,
  nonce: Uint8Array,
): Promise<string> {
  await sodiumReady();
  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    associatedData(kind, id),
    null,
    nonce,
    keys.contentKey,
  );
  return toBase64Url(concatBytes(nonce, sealed));
}

export async function sealItem(
  keys: DerivedKeys,
  kind: ItemKind,
  id: string,
  plaintext: Uint8Array,
): Promise<string> {
  await sodiumReady();
  return sealItemWithNonce(keys, kind, id, plaintext, sodium.randombytes_buf(NONCE_BYTES));
}

export async function openItem(
  keys: DerivedKeys,
  kind: ItemKind,
  id: string,
  payload: string,
): Promise<Uint8Array> {
  await sodiumReady();
  if (!BASE64URL.test(payload)) throw new DecryptError("payload is not base64url");
  const raw = fromBase64Url(payload);
  if (raw.length < NONCE_BYTES + TAG_BYTES) throw new DecryptError("payload is too short");
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      raw.subarray(NONCE_BYTES),
      associatedData(kind, id),
      raw.subarray(0, NONCE_BYTES),
      keys.contentKey,
    );
  } catch {
    throw new DecryptError("wrong key or altered data");
  }
}
