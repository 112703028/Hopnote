import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newRoom, post, textEnvelope } from "./helpers";

const opened: WebSocket[] = [];

afterEach(() => {
  for (const ws of opened.splice(0)) ws.close();
});

async function openSocket(room: string): Promise<{ ws: WebSocket; messages: string[] }> {
  const res = await exports.default.fetch(
    new Request(`https://relay.test/room/${room}/ws`, { headers: { Upgrade: "websocket" } }),
  );
  expect(res.status).toBe(101);
  const ws = res.webSocket as WebSocket;
  ws.accept();
  opened.push(ws);
  const messages: string[] = [];
  ws.addEventListener("message", (event) => messages.push(event.data as string));
  return { ws, messages };
}

describe("GET /room/:id/ws", () => {
  it("pushes { type: item, item } to a connected socket after a POST", async () => {
    const room = newRoom();
    const { messages } = await openSocket(room);
    const envelope = textEnvelope("hello");
    await post(room, envelope);
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(JSON.parse(messages[0])).toMatchObject({
      type: "item",
      item: { id: envelope.id, kind: "text", payload: envelope.payload, seq: 1 },
    });
  });

  it("pushes the item to every connected socket", async () => {
    const room = newRoom();
    const first = await openSocket(room);
    const second = await openSocket(room);
    await post(room, textEnvelope());
    await vi.waitFor(() => {
      expect(first.messages).toHaveLength(1);
      expect(second.messages).toHaveLength(1);
    });
  });

  it("pushes nothing for a duplicate POST: sockets see [A, B] after A, A again, B", async () => {
    const room = newRoom();
    const { messages } = await openSocket(room);
    const a = textEnvelope("a");
    const b = textEnvelope("b");
    await post(room, a);
    await post(room, a);
    await post(room, b);
    await vi.waitFor(() => expect(messages.length).toBeGreaterThanOrEqual(2));
    expect(messages.map((m) => JSON.parse(m).item.id)).toEqual([a.id, b.id]);
  });

  it("answers ping with pong", async () => {
    const { ws, messages } = await openSocket(newRoom());
    ws.send("ping");
    await vi.waitFor(() => expect(messages).toEqual(["pong"]));
  });

  it("returns 426 without an Upgrade header", async () => {
    const res = await exports.default.fetch(new Request(`https://relay.test/room/${newRoom()}/ws`));
    expect(res.status).toBe(426);
  });
});
