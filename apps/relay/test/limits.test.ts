import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { RATE_LIMIT_MAX_ITEMS, RATE_LIMIT_WINDOW_MS, type Envelope } from "@pc-to-ipad/protocol";
import type { Room } from "../src/room";
import { historySeqs, newRoom, post, textEnvelope } from "./helpers";

async function fillWindow(room: string): Promise<Envelope[]> {
  const envelopes = Array.from({ length: RATE_LIMIT_MAX_ITEMS }, (_, i) => textEnvelope(`n${i}`));
  for (const envelope of envelopes) expect((await post(room, envelope)).status).toBe(201);
  return envelopes;
}

describe("rate limit", () => {
  it("rejects the 21st new item inside the window with 429 and keeps 20", async () => {
    const room = newRoom();
    await fillWindow(room);
    const res = await post(room, textEnvelope("one too many"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(await historySeqs(room, "?limit=100")).toHaveLength(20);
  });

  it("answers 200, not 429, for a duplicate id when the window is full", async () => {
    const room = newRoom();
    const envelopes = await fillWindow(room);
    expect((await post(room, envelopes[0])).status).toBe(200);
  });

  it("accepts a new item once the clock is past the window", async () => {
    const room = newRoom();
    await fillWindow(room);
    expect((await post(room, textEnvelope("blocked"))).status).toBe(429);
    const stub = env.ROOM.get(env.ROOM.idFromName(room));
    await runInDurableObject<Room, void>(stub, (instance) => {
      const real = instance.clock;
      instance.clock = () => real() + RATE_LIMIT_WINDOW_MS + 1;
    });
    expect((await post(room, textEnvelope("allowed"))).status).toBe(201);
  });
});
