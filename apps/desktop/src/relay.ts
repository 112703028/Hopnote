import { newItemId, type Envelope, type ItemKind } from "@pc-to-ipad/protocol";
import type { Settings } from "./settings";

export type SendResult = { ok: true; seq: number } | { ok: false; error: string };

async function interpret(res: Response): Promise<SendResult> {
  if (res.ok) {
    const body = (await res.json()) as { seq: number };
    return { ok: true, seq: body.seq };
  }
  if (res.status === 413) return { ok: false, error: "item too large for the relay" };
  if (res.status === 429) return { ok: false, error: "rate limited, try again in a few seconds" };
  return { ok: false, error: `relay error ${res.status}` };
}

// A network error is retried once with the SAME id, so a request that did reach
// the relay is not stored twice.
export async function sendItem(
  settings: Settings,
  kind: ItemKind,
  payload: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const envelope: Envelope = { id: newItemId(), kind, payload };
  const url = `${settings.relayUrl}/room/${settings.roomSecret}/items`;
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, init);
    } catch {
      continue;
    }
    return interpret(res);
  }
  return { ok: false, error: "network error: could not reach the relay" };
}
