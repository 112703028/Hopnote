import { describe, expect, it } from "vitest";
import { newItemId } from "@pc-to-ipad/protocol";
import { get, historySeqs, newRoom, post, textEnvelope } from "./helpers";

describe("POST /room/:id/items", () => {
  it("stores a text item and returns 201 with seq 1", async () => {
    const res = await post(newRoom(), textEnvelope());
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ seq: 1 });
  });

  it("returns 200 with the same seq for a duplicate id and keeps one item", async () => {
    const room = newRoom();
    const envelope = textEnvelope();
    const first = await post(room, envelope);
    const second = await post(room, envelope);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ seq: 1 });
    expect(await historySeqs(room)).toEqual([1]);
  });

  it("returns 400 for invalid JSON", async () => {
    expect((await post(newRoom(), "{not json")).status).toBe(400);
  });

  it("returns 400 for an unknown kind", async () => {
    const res = await post(newRoom(), { id: newItemId(), kind: "video", payload: "x" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a missing payload", async () => {
    expect((await post(newRoom(), { id: newItemId(), kind: "text" })).status).toBe(400);
  });

  it("returns 404 for a bad room id", async () => {
    expect((await post("not-a-room", textEnvelope())).status).toBe(404);
  });

  it("returns 413 for a text payload of 65537 chars and stores nothing", async () => {
    const room = newRoom();
    const res = await post(room, { id: newItemId(), kind: "text", payload: "x".repeat(65537) });
    expect(res.status).toBe(413);
    expect(await historySeqs(room)).toEqual([]);
  });

  it("returns 413 for an image payload of 1_500_001 chars and stores nothing", async () => {
    const room = newRoom();
    const res = await post(room, {
      id: newItemId(),
      kind: "image",
      payload: "x".repeat(1_500_001),
    });
    expect(res.status).toBe(413);
    expect(await historySeqs(room)).toEqual([]);
  });

  it("returns 405 for GET /items", async () => {
    expect((await get(newRoom(), "items")).status).toBe(405);
  });
});
