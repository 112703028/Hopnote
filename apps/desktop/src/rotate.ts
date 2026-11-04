import { deriveKeys, parsePairingCode } from "@hopnote/crypto";
import { retireRoom } from "./relay";
import type { Settings } from "./settings";

/**
 * Switches to a new key. If there was an old key, its room is retired first (best effort) so a
 * lost or forgotten device is told to pair again and the old items are deleted right away.
 * `retired` is null when there was no old key to retire.
 */
export async function rotateKey(
  before: Settings,
  newCode: string,
  fetchImpl?: typeof fetch,
): Promise<{ settings: Settings; retired: boolean | null }> {
  const settings: Settings = { relayUrl: before.relayUrl, key: newCode };
  const master = before.key ? parsePairingCode(before.key) : null;
  if (!master) return { settings, retired: null };
  const keys = await deriveKeys(master);
  const retired = await retireRoom(
    { relayUrl: before.relayUrl, roomId: keys.roomId, authToken: keys.authToken },
    fetchImpl,
  );
  return { settings, retired };
}
