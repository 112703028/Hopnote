import { describe, expect, it } from "vitest";
import type { Envelope } from "@hopnote/protocol";
import { sendItem, type RelayTarget } from "../src/relay";

const TARGET: RelayTarget = {
  relayUrl: "https://relay.example.dev",
  roomId: "0123456789abcdef0123456789abcdef",
  authToken: "MdOfclbT9y5EMDiVqp_I2g4uyiHwR7F7hIFDD2_2t4g",
};
const ENVELOPE: Envelope = { id: "a".repeat(32), kind: "text", payload: "A".repeat(60) };

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next === undefined) throw new Error("no more fake responses");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const created = () => new Response(JSON.stringify({ seq: 7, receivedAt: 1 }), { status: 201 });

describe("sendItem", () => {
  it("POSTs the envelope to the room with the Bearer token", async () => {
    const { impl, calls } = fakeFetch([created()]);
    const result = await sendItem(TARGET, ENVELOPE, impl);

    expect(result).toEqual({ ok: true, seq: 7 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://relay.example.dev/room/0123456789abcdef0123456789abcdef/items",
    );
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe(`Bearer ${TARGET.authToken}`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual(ENVELOPE);
  });

  it("retries once after a network error with a byte-identical body", async () => {
    const { impl, calls } = fakeFetch([new TypeError("fetch failed"), created()]);
    const result = await sendItem(TARGET, ENVELOPE, impl);

    expect(result).toEqual({ ok: true, seq: 7 });
    expect(calls).toHaveLength(2);
    expect(calls[1].init.body).toBe(calls[0].init.body);
  });

  it("returns ok: false after two network errors", async () => {
    const { impl, calls } = fakeFetch([new TypeError("a"), new TypeError("b")]);
    const result = await sendItem(TARGET, ENVELOPE, impl);

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("aborts a stalled request after the timeout, retries the same body, then fails", async () => {
    const calls: RequestInit[] = [];
    const stalled = (async (_url: string, init: RequestInit) => {
      calls.push(init);
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;

    const result = await sendItem(TARGET, ENVELOPE, stalled, 20);

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toBe(calls[0].body);
  });

  it.each([401, 403])("maps %i to a message about pairing again", async (status) => {
    const { impl } = fakeFetch([new Response("{}", { status })]);
    const result = await sendItem(TARGET, ENVELOPE, impl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("配對");
  });

  it("maps 413 to an error containing '太大'", async () => {
    const { impl } = fakeFetch([new Response("{}", { status: 413 })]);
    const result = await sendItem(TARGET, ENVELOPE, impl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("太大");
  });

  it("maps 429 to an error containing '太頻繁'", async () => {
    const { impl } = fakeFetch([new Response("{}", { status: 429 })]);
    const result = await sendItem(TARGET, ENVELOPE, impl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("太頻繁");
  });

  it("maps any other failure to '中繼伺服器錯誤 <status>'", async () => {
    const { impl, calls } = fakeFetch([new Response("{}", { status: 500 })]);
    const result = await sendItem(TARGET, ENVELOPE, impl);
    expect(result).toEqual({ ok: false, error: "中繼伺服器錯誤 500" });
    expect(calls).toHaveLength(1);
  });
});
