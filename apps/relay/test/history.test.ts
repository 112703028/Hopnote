import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MAX_IMAGE_ITEMS, MAX_TEXT_ITEMS, newItemId } from "@pc-to-ipad/protocol";
import { get, historySeqs, newRoom, post, textEnvelope } from "./helpers";
import { insertItem, listItems } from "../src/store";

async function seed(room: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) await post(room, textEnvelope(`item ${i}`));
}

function stubFor(room: string) {
  return env.ROOM.get(env.ROOM.idFromName(room));
}

describe("GET /room/:id/history", () => {
  it("returns items ascending with latestSeq", async () => {
    const room = newRoom();
    await seed(room, 3);
    const body = (await (await get(room, "history")).json()) as {
      items: { seq: number }[];
      latestSeq: number;
    };
    expect(body.items.map((i) => i.seq)).toEqual([1, 2, 3]);
    expect(body.latestSeq).toBe(3);
  });

  it("treats since as exclusive", async () => {
    const room = newRoom();
    await seed(room, 3);
    expect(await historySeqs(room, "?since=1")).toEqual([2, 3]);
  });

  it("returns the newest N ascending when limit is set", async () => {
    const room = newRoom();
    await seed(room, 5);
    expect(await historySeqs(room, "?limit=2")).toEqual([4, 5]);
  });

  it("falls back to defaults for since=-5, since=abc, limit=abc", async () => {
    const room = newRoom();
    await seed(room, 3);
    expect(await historySeqs(room, "?since=-5")).toEqual([1, 2, 3]);
    expect(await historySeqs(room, "?since=abc")).toEqual([1, 2, 3]);
    expect(await historySeqs(room, "?limit=abc")).toEqual([1, 2, 3]);
  });

  it("clamps limit=0 to 1 and limit=9999 to 100", async () => {
    const room = newRoom();
    await seed(room, 3);
    expect(await historySeqs(room, "?limit=0")).toEqual([3]);
    expect(await historySeqs(room, "?limit=9999")).toEqual([1, 2, 3]);
  });

  it("isolates rooms: an item in room A is absent from room B", async () => {
    const a = newRoom();
    const b = newRoom();
    await seed(a, 1);
    expect(await historySeqs(b)).toEqual([]);
  });
});

describe("retention", () => {
  it("keeps only the newest 100 text items (101 inserts leave seq 2..101)", async () => {
    const seqs = await runInDurableObject(stubFor(newRoom()), async (_instance, state) => {
      for (let i = 0; i < MAX_TEXT_ITEMS + 1; i++) {
        insertItem(state.storage.sql, { id: newItemId(), kind: "text", payload: "x" }, Date.now());
      }
      return listItems(state.storage.sql, { since: 0, limit: 1000 }).map((i) => i.seq);
    });
    expect(seqs).toHaveLength(100);
    expect(seqs[0]).toBe(2);
    expect(seqs[99]).toBe(101);
  });

  it("keeps the newest 20 image items regardless of how many text items exist", async () => {
    const kinds = await runInDurableObject(stubFor(newRoom()), async (_instance, state) => {
      const sql = state.storage.sql;
      for (let i = 0; i < 3; i++) {
        insertItem(sql, { id: newItemId(), kind: "text", payload: "t" }, Date.now());
      }
      for (let i = 0; i < MAX_IMAGE_ITEMS + 1; i++) {
        insertItem(sql, { id: newItemId(), kind: "image", payload: "i" }, Date.now());
      }
      return listItems(sql, { since: 0, limit: 1000 }).map((i) => i.kind);
    });
    expect(kinds.filter((k) => k === "image")).toHaveLength(20);
    expect(kinds.filter((k) => k === "text")).toHaveLength(3);
  });

  it("keeps seq increasing after pruning (the 102nd insert gets seq 102)", async () => {
    const seq = await runInDurableObject(stubFor(newRoom()), async (_instance, state) => {
      let last = 0;
      for (let i = 0; i < 102; i++) {
        const envelope = { id: newItemId(), kind: "text" as const, payload: "x" };
        last = insertItem(state.storage.sql, envelope, Date.now()).item.seq;
      }
      return last;
    });
    expect(seq).toBe(102);
  });
});
