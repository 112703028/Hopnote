import { exports } from "cloudflare:workers";
import { encodeTextPayload, newItemId, type Envelope } from "@hopnote/protocol";

const BASE = "https://relay.test";

export function newRoom(): string {
  return newItemId();
}

export function textEnvelope(text = "hi", id = newItemId()): Envelope {
  return { id, kind: "text", payload: encodeTextPayload(text, 1) };
}

export function post(room: string, body: unknown): Promise<Response> {
  return exports.default.fetch(
    new Request(`${BASE}/room/${room}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

export function get(room: string, route: string): Promise<Response> {
  return exports.default.fetch(new Request(`${BASE}/room/${room}/${route}`));
}

export async function historySeqs(room: string, query = ""): Promise<number[]> {
  const res = await get(room, `history${query}`);
  const body = (await res.json()) as { items: { seq: number }[] };
  return body.items.map((i) => i.seq);
}
