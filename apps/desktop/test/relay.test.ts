import { describe, expect, it } from "vitest";
import { isHex128 } from "@pc-to-ipad/protocol";
import { sendItem } from "../src/relay";

const SETTINGS = {
  relayUrl: "https://relay.example.dev",
  roomSecret: "0123456789abcdef0123456789abcdef",
};

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
  it("POSTs an Envelope as JSON to {relayUrl}/room/{secret}/items", async () => {
    const { impl, calls } = fakeFetch([created()]);
    const result = await sendItem(SETTINGS, "text", '{"v":1}', impl);

    expect(result).toEqual({ ok: true, seq: 7 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://relay.example.dev/room/0123456789abcdef0123456789abcdef/items",
    );
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    const body = JSON.parse(String(calls[0].init.body));
    expect(isHex128(body.id)).toBe(true);
    expect(body).toMatchObject({ kind: "text", payload: '{"v":1}' });
  });

  it("retries once after a network error with the same id and returns ok", async () => {
    const { impl, calls } = fakeFetch([new TypeError("fetch failed"), created()]);
    const result = await sendItem(SETTINGS, "text", "x", impl);

    expect(result).toEqual({ ok: true, seq: 7 });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[1].init.body)).id).toBe(JSON.parse(String(calls[0].init.body)).id);
  });

  it("returns ok: false after two network errors", async () => {
    const { impl, calls } = fakeFetch([new TypeError("a"), new TypeError("b")]);
    const result = await sendItem(SETTINGS, "text", "x", impl);

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("aborts a stalled request after the timeout, retries with the same id, then fails", async () => {
    const calls: RequestInit[] = [];
    const stalled = (async (_url: string, init: RequestInit) => {
      calls.push(init);
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;

    const result = await sendItem(SETTINGS, "text", "x", stalled, 20);

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[1].body)).id).toBe(JSON.parse(String(calls[0].body)).id);
  });

  it("maps 413 to an error containing 'too large'", async () => {
    const { impl } = fakeFetch([new Response("{}", { status: 413 })]);
    const result = await sendItem(SETTINGS, "image", "x", impl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("too large");
  });

  it("maps 429 to an error containing 'rate limited'", async () => {
    const { impl } = fakeFetch([new Response("{}", { status: 429 })]);
    const result = await sendItem(SETTINGS, "text", "x", impl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("rate limited");
  });

  it("maps any other failure to 'relay error <status>'", async () => {
    const { impl, calls } = fakeFetch([new Response("{}", { status: 500 })]);
    const result = await sendItem(SETTINGS, "text", "x", impl);
    expect(result).toEqual({ ok: false, error: "relay error 500" });
    expect(calls).toHaveLength(1);
  });
});
