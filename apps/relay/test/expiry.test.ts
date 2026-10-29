import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { RETENTION_MS } from "@pc-to-ipad/protocol";
import { historySeqs, newRoom, post, textEnvelope } from "./helpers";

function stubFor(room: string) {
  return env.ROOM.get(env.ROOM.idFromName(room));
}

async function ageItem(room: string, seq: number): Promise<void> {
  await runInDurableObject(stubFor(room), async (_instance, state) => {
    state.storage.sql.exec(
      "UPDATE items SET received_at = ? WHERE seq = ?",
      Date.now() - RETENTION_MS - 1000,
      seq,
    );
  });
}

describe("expiry alarm", () => {
  it("is scheduled when an item is inserted", async () => {
    const room = newRoom();
    await post(room, textEnvelope());
    const alarm = await runInDurableObject(stubFor(room), (_instance, state) =>
      state.storage.getAlarm(),
    );
    expect(alarm).not.toBeNull();
  });

  it("removes items older than 7 days, keeps newer ones and reschedules", async () => {
    const room = newRoom();
    await post(room, textEnvelope("old"));
    const keep = await (await post(room, textEnvelope("new"))).json() as { receivedAt: number };
    await ageItem(room, 1);

    expect(await runDurableObjectAlarm(stubFor(room))).toBe(true);

    expect(await historySeqs(room)).toEqual([2]);
    const next = await runInDurableObject(stubFor(room), (_instance, state) =>
      state.storage.getAlarm(),
    );
    expect(next).toBe(keep.receivedAt + RETENTION_MS);
  });

  it("empties an expired room, schedules nothing, and the next seq continues", async () => {
    const room = newRoom();
    await post(room, textEnvelope("only"));
    await ageItem(room, 1);

    expect(await runDurableObjectAlarm(stubFor(room))).toBe(true);

    expect(await historySeqs(room)).toEqual([]);
    const next = await runInDurableObject(stubFor(room), (_instance, state) =>
      state.storage.getAlarm(),
    );
    expect(next).toBeNull();
    const res = await post(room, textEnvelope("after"));
    expect(await res.json()).toMatchObject({ seq: 2 });
  });
});
