import type { Envelope } from "@hopnote/protocol";

// A dead connection (sleep/resume, captive portal) must not hold the hotkeys for minutes.
const REQUEST_TIMEOUT_MS = 10_000;

export interface RelayTarget {
  relayUrl: string;
  roomId: string;
  authToken: string;
}

export type SendResult = { ok: true; seq: number } | { ok: false; error: string };

async function interpret(res: Response): Promise<SendResult> {
  if (res.ok) {
    const body = (await res.json()) as { seq: number };
    return { ok: true, seq: body.seq };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "金鑰不符，請在電腦端重新配對 iPad" };
  }
  if (res.status === 413) return { ok: false, error: "內容太大，中繼伺服器拒絕接收" };
  if (res.status === 429) return { ok: false, error: "傳送太頻繁，請稍後再試" };
  return { ok: false, error: `中繼伺服器錯誤 ${res.status}` };
}

// A network error is retried once with the SAME envelope (same id, same ciphertext), so a
// request that did reach the relay is not stored twice.
export async function sendItem(
  target: RelayTarget,
  envelope: Envelope,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<SendResult> {
  const url = `${target.relayUrl}/room/${target.roomId}/items`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.authToken}`,
    },
    body: JSON.stringify(envelope),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      continue;
    }
    return interpret(res);
  }
  return { ok: false, error: "無法連線到中繼伺服器" };
}
