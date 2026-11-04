import { env, exports } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { RETENTION_MS } from "@hopnote/protocol";
import { get, newRoom, post, textEnvelope, tokenFor } from "./helpers";

const BASE = "https://relay.test";

// A different token in the accepted format.
function otherToken(room: string): string {
  return tokenFor(room).split("").reverse().join("");
}

function request(room: string, route: string, init: { token?: string; method?: string; ws?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (init.token) {
    if (init.ws) {
      headers.Upgrade = "websocket";
      headers["Sec-WebSocket-Protocol"] = `hopnote.v1, hopnote.auth.${init.token}`;
    } else {
      headers.Authorization = `Bearer ${init.token}`;
    }
  } else if (init.ws) {
    headers.Upgrade = "websocket";
  }
  const body = init.method === "POST" ? JSON.stringify(textEnvelope()) : undefined;
  if (body) headers["Content-Type"] = "application/json";
  return exports.default.fetch(new Request(`${BASE}/room/${room}/${route}`, { method: init.method ?? "GET", headers, body }));
}

describe("token auth", () => {
  it("returns 401 without a token on items, history and ws", async () => {
    const room = newRoom();
    expect((await request(room, "items", { method: "POST" })).status).toBe(401);
    expect((await request(room, "history")).status).toBe(401);
    expect((await request(room, "ws", { ws: true })).status).toBe(401);
  });

  it("returns 401 for a 42-character token", async () => {
    const room = newRoom();
    const short = tokenFor(room).slice(0, 42);
    expect((await request(room, "history", { token: short })).status).toBe(401);
  });

  it("binds the room to the first token: POST 201, then GET history 200 with the same token", async () => {
    const room = newRoom();
    expect((await post(room, textEnvelope())).status).toBe(201);
    expect((await get(room, "history")).status).toBe(200);
  });

  it("returns 403 for another valid token on items, history and ws", async () => {
    const room = newRoom();
    await post(room, textEnvelope());
    const other = otherToken(room);
    expect((await request(room, "items", { token: other, method: "POST" })).status).toBe(403);
    expect((await request(room, "history", { token: other })).status).toBe(403);
    expect((await request(room, "ws", { token: other, ws: true })).status).toBe(403);
  });

  it("binds on a GET with a token for an unused room, then rejects another token on POST", async () => {
    const room = newRoom();
    expect((await get(room, "history")).status).toBe(200);
    expect((await request(room, "items", { token: otherToken(room), method: "POST" })).status).toBe(403);
  });

  it("keeps the binding after the expiry alarm has emptied the room", async () => {
    const room = newRoom();
    await post(room, textEnvelope());
    const stub = env.ROOM.get(env.ROOM.idFromName(room));
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec("UPDATE items SET received_at = ?", Date.now() - RETENTION_MS - 1000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await request(room, "items", { token: otherToken(room), method: "POST" })).status).toBe(403);
    expect((await post(room, textEnvelope("again"))).status).toBe(201);
  });

  it("echoes exactly hopnote.v1 on upgrade and never returns the token", async () => {
    const room = newRoom();
    const token = tokenFor(room);
    const upgrade = await request(room, "ws", { token, ws: true });
    expect(upgrade.status).toBe(101);
    expect(upgrade.headers.get("sec-websocket-protocol")).toBe("hopnote.v1");
    upgrade.webSocket?.accept();
    upgrade.webSocket?.close();

    const seen: string[] = [JSON.stringify([...upgrade.headers])];
    for (const response of [await post(room, textEnvelope()), await get(room, "history")]) {
      seen.push(JSON.stringify([...response.headers]), await response.text());
    }
    for (const text of seen) expect(text).not.toContain(token);
  });

  it("answers 404 for an unknown route even without a token", async () => {
    const room = newRoom();
    const res = await exports.default.fetch(new Request(`${BASE}/room/${room}/nope`));
    expect(res.status).toBe(404);
  });
});
