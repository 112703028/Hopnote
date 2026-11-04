import { deriveKeys, parsePairingCode, sealItem, type DerivedKeys } from "@hopnote/crypto";
import { newItemId, type ItemKind } from "@hopnote/protocol";
import { sendItem, type SendResult } from "./relay";
import type { Settings } from "./settings";

const NOT_PAIRED = "請先填寫中繼網址並配對 iPad";

/**
 * Encrypts a plaintext frame and posts it. The item is sealed once, so a retry after a network
 * error resends the identical ciphertext instead of creating a second card.
 */
export function makeSender(deps: {
  loadSettings(): Settings | null;
  fetchImpl?: typeof fetch;
}): (kind: ItemKind, plaintext: Uint8Array) => Promise<SendResult> {
  let cached: { key: string; keys: DerivedKeys } | null = null;

  async function keysFor(code: string): Promise<DerivedKeys | null> {
    if (cached?.key === code) return cached.keys;
    const master = parsePairingCode(code);
    if (!master) return null;
    const keys = await deriveKeys(master);
    cached = { key: code, keys };
    return keys;
  }

  return async (kind, plaintext) => {
    const settings = deps.loadSettings();
    if (!settings || !settings.key) return { ok: false, error: NOT_PAIRED };
    const keys = await keysFor(settings.key);
    if (!keys) return { ok: false, error: NOT_PAIRED };

    const id = newItemId();
    const payload = await sealItem(keys, kind, id, plaintext);
    return sendItem(
      { relayUrl: settings.relayUrl, roomId: keys.roomId, authToken: keys.authToken },
      { id, kind, payload },
      deps.fetchImpl,
    );
  };
}
