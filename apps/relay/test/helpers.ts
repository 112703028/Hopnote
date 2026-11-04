import { exports } from "cloudflare:workers";
import { MIN_PAYLOAD_CHARS, newItemId, type Envelope } from "@hopnote/protocol";

const BASE = "https://relay.test";

export function newRoom(): string {
  return newItemId();
}

// A token in the relay's accepted format (43 base64url characters), derived from the room id.
export function tokenFor(room: string): string {
  return (room + room).slice(0, 43);
}

// A valid-looking payload: base64url of the text, padded with "A" to the minimum length.
export function payloadFor(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return encoded.padEnd(MIN_PAYLOAD_CHARS, "A");
}

export function textEnvelope(text = "hi", id = newItemId()): Envelope {
  return { id, kind: "text", payload: payloadFor(text) };
}

export function post(room: string, body: unknown): Promise<Response> {
  return exports.default.fetch(
    new Request(`${BASE}/room/${room}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenFor(room)}` },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

export function get(room: string, route: string): Promise<Response> {
  return exports.default.fetch(
    new Request(`${BASE}/room/${room}/${route}`, {
      headers: { Authorization: `Bearer ${tokenFor(room)}` },
    }),
  );
}

export async function historySeqs(room: string, query = ""): Promise<number[]> {
  const res = await get(room, `history${query}`);
  const body = (await res.json()) as { items: { seq: number }[] };
  return body.items.map((i) => i.seq);
}
