import { describe, expect, it } from "vitest";
import { deriveKeys, encodePairingCode } from "@hopnote/crypto";
import { rotateKey } from "../src/rotate";
import type { Settings } from "../src/settings";

const OLD = Uint8Array.from({ length: 32 }, (_, i) => i);
const NEW = Uint8Array.from({ length: 32 }, (_, i) => 31 - i);
const NEW_CODE = encodePairingCode(NEW);
const BEFORE: Settings = { relayUrl: "https://relay.example.dev", key: encodePairingCode(OLD) };

type Call = { url: string; init: RequestInit };

function fakeFetch(response: Response | Error) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response.clone();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("rotateKey", () => {
  it("retires the OLD room with the OLD token, then returns the new key", async () => {
    const { impl, calls } = fakeFetch(new Response("{}", { status: 200 }));
    const oldKeys = await deriveKeys(OLD);
    const result = await rotateKey(BEFORE, NEW_CODE, impl);

    expect(result).toEqual({
      settings: { relayUrl: "https://relay.example.dev", key: NEW_CODE },
      retired: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://relay.example.dev/room/${oldKeys.roomId}/retire`);
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${oldKeys.authToken}`,
    );
  });

  it("still returns the new key, with retired false, when the relay cannot be reached", async () => {
    const { impl } = fakeFetch(new TypeError("fetch failed"));
    const result = await rotateKey(BEFORE, NEW_CODE, impl);
    expect(result.settings.key).toBe(NEW_CODE);
    expect(result.retired).toBe(false);
  });

  it("reports retired false when the relay answers an error", async () => {
    const { impl } = fakeFetch(new Response("{}", { status: 500 }));
    expect((await rotateKey(BEFORE, NEW_CODE, impl)).retired).toBe(false);
  });

  it("sends nothing and reports retired null when there was no old key", async () => {
    const { impl, calls } = fakeFetch(new Response("{}", { status: 200 }));
    const result = await rotateKey({ relayUrl: BEFORE.relayUrl, key: null }, NEW_CODE, impl);
    expect(result).toEqual({ settings: { relayUrl: BEFORE.relayUrl, key: NEW_CODE }, retired: null });
    expect(calls).toHaveLength(0);
  });
});
