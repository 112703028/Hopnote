import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listItems } from "../src/store";
import { get, newRoom, post, textEnvelope, tokenFor } from "./helpers";

const BASE = "https://relay.test";
const opened: WebSocket[] = [];

afterEach(() => {
  for (const ws of opened.splice(0)) ws.close();
});

function retire(room: string, token: string | null = tokenFor(room), method = "POST") {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return exports.default.fetch(new Request(`${BASE}/room/${room}/retire`, { method, headers }));
}

function upgrade(room: string) {
  return exports.default.fetch(
    new Request(`${BASE}/room/${room}/ws`, {
      headers: {
        Upgrade: "websocket",
        "Sec-WebSocket-Protocol": `hopnote.v1, hopnote.auth.${tokenFor(room)}`,
      },
    }),
  );
}

const stubFor = (room: string) => env.ROOM.get(env.ROOM.idFromName(room));

describe("POST /room/:id/retire", () => {
  it("needs the token: none is 401, another valid one is 403", async () => {
    const room = newRoom();
    await post(room, textEnvelope());
    expect((await retire(room, null)).status).toBe(401);
    const other = tokenFor(room).split("").reverse().join("");
    expect((await retire(room, other)).status).toBe(403);
    expect((await get(room, "history")).status).toBe(200);
  });

  it("deletes the items and answers 200", async () => {
    const room = newRoom();
    await post(room, textEnvelope("a"));
    await post(room, textEnvelope("b"));
    expect((await retire(room)).status).toBe(200);
    const left = await runInDurableObject(stubFor(room), async (_instance, state) =>
      listItems(state.storage.sql, { since: 0, limit: 100 }).length,
    );
    expect(left).toBe(0);
  });

  it("makes items, history and ws answer 410 afterwards, even with the right token", async () => {
    const room = newRoom();
    await post(room, textEnvelope());
    await retire(room);
    const items = await post(room, textEnvelope("again"));
    expect(items.status).toBe(410);
    expect(await items.json()).toEqual({ error: "retired" });
    expect((await get(room, "history")).status).toBe(410);
    expect((await upgrade(room)).status).toBe(410);
  });

  it("is idempotent: a second retire also answers 200", async () => {
    const room = newRoom();
    await post(room, textEnvelope());
    expect((await retire(room)).status).toBe(200);
    expect((await retire(room)).status).toBe(200);
  });

  it("closes open sockets with code 4000", async () => {
    const room = newRoom();
    const res = await upgrade(room);
    const ws = res.webSocket as WebSocket;
    ws.accept();
    opened.push(ws);
    let closeCode = 0;
    ws.addEventListener("close", (event) => {
      closeCode = event.code;
    });
    await retire(room);
    await vi.waitFor(() => expect(closeCode).toBe(4000));
  });

  it("stays retired after the Durable Object is evicted", async () => {
    const room = newRoom();
    // Read every body: an unread response keeps the object "in use" and it cannot be evicted.
    await (await post(room, textEnvelope())).text();
    await (await retire(room)).text();
    await evictDurableObject(stubFor(room));
    const after = await post(room, textEnvelope("after"));
    expect(after.status).toBe(410);
    await after.text();
  });

  it("rejects GET with 405", async () => {
    const room = newRoom();
    await post(room, textEnvelope());
    expect((await retire(room, tokenFor(room), "GET")).status).toBe(405);
  });

  it("answers the CORS preflight like the other routes", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/room/${newRoom()}/retire`, { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
