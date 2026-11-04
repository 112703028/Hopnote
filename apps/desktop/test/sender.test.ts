import { describe, expect, it } from "vitest";
import {
  deriveKeys,
  encodePairingCode,
  encodeTextFrame,
  fromBase64Url,
  openItem,
} from "@hopnote/crypto";
import { makeSender } from "../src/sender";
import type { Settings } from "../src/settings";

const MASTER = Uint8Array.from({ length: 32 }, (_, i) => i);
const SETTINGS: Settings = { relayUrl: "https://relay.example.dev", key: encodePairingCode(MASTER) };
const PAIRING_MESSAGE = "請先填寫中繼網址並配對 iPad";
const frame = () => encodeTextFrame("hello", 1_700_000_000_000);

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

const created = () => new Response(JSON.stringify({ seq: 9, receivedAt: 1 }), { status: 201 });

describe("makeSender", () => {
  it("asks to pair when there are no settings, and sends nothing", async () => {
    const { impl, calls } = fakeFetch([]);
    const send = makeSender({ loadSettings: () => null, fetchImpl: impl });
    expect(await send("text", frame())).toEqual({ ok: false, error: PAIRING_MESSAGE });
    expect(calls).toHaveLength(0);
  });

  it("asks to pair when the settings have no key, and sends nothing", async () => {
    const { impl, calls } = fakeFetch([]);
    const send = makeSender({
      loadSettings: () => ({ relayUrl: "https://relay.example.dev", key: null }),
      fetchImpl: impl,
    });
    expect(await send("text", frame())).toEqual({ ok: false, error: PAIRING_MESSAGE });
    expect(calls).toHaveLength(0);
  });

  it("sends with the derived room and token, and the payload decrypts back to the plaintext", async () => {
    const { impl, calls } = fakeFetch([created()]);
    const send = makeSender({ loadSettings: () => SETTINGS, fetchImpl: impl });
    const result = await send("text", frame());
    const keys = await deriveKeys(MASTER);

    expect(result).toEqual({ ok: true, seq: 9 });
    expect(calls[0].url).toBe(`https://relay.example.dev/room/${keys.roomId}/items`);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${keys.authToken}`,
    );
    const envelope = JSON.parse(String(calls[0].init.body));
    expect(envelope.kind).toBe("text");
    const text = new TextDecoder().decode(fromBase64Url(envelope.payload));
    expect(text).not.toContain("hello");
    expect(await openItem(keys, "text", envelope.id, envelope.payload)).toEqual(frame());
  });

  it("resends the identical ciphertext after a network error", async () => {
    const { impl, calls } = fakeFetch([new TypeError("fetch failed"), created()]);
    const send = makeSender({ loadSettings: () => SETTINGS, fetchImpl: impl });
    const result = await send("text", frame());

    expect(result).toEqual({ ok: true, seq: 9 });
    expect(calls).toHaveLength(2);
    expect(calls[1].init.body).toBe(calls[0].init.body);
  });
});
