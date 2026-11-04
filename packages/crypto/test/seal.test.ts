import { beforeAll, describe, expect, it } from "vitest";
import {
  DecryptError,
  deriveKeys,
  encodeTextFrame,
  fromBase64Url,
  openItem,
  sealItem,
  sealItemWithNonce,
  type DerivedKeys,
} from "../src/index";
import { ITEM_ID, MASTER, NONCE, SEALED_PAYLOAD, TEXT_FRAME_TS, containsBytes } from "./vectors";

let keys: DerivedKeys;
const frame = () => encodeTextFrame("hello", TEXT_FRAME_TS);

beforeAll(async () => {
  keys = await deriveKeys(MASTER);
});

describe("sealItem / openItem", () => {
  it("reproduces the known 108-character payload with the fixed nonce", async () => {
    const payload = await sealItemWithNonce(keys, "text", ITEM_ID, frame(), NONCE);
    expect(payload).toBe(SEALED_PAYLOAD);
    expect(payload).toHaveLength(108);
  });

  it("round-trips a text frame", async () => {
    const payload = await sealItem(keys, "text", ITEM_ID, frame());
    expect(await openItem(keys, "text", ITEM_ID, payload)).toEqual(frame());
  });

  it("round-trips arbitrary bytes", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(5000));
    const payload = await sealItem(keys, "image", ITEM_ID, bytes);
    expect(await openItem(keys, "image", ITEM_ID, payload)).toEqual(bytes);
  });

  it("produces a different payload every time for the same input", async () => {
    const a = await sealItem(keys, "text", ITEM_ID, frame());
    const b = await sealItem(keys, "text", ITEM_ID, frame());
    expect(a).not.toBe(b);
  });

  it("emits base64url whose decoded length is 24 + plaintext + 16", async () => {
    const plaintext = frame();
    const payload = await sealItem(keys, "text", ITEM_ID, plaintext);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(payload)).toHaveLength(24 + plaintext.length + 16);
  });

  it("does not contain the plaintext bytes", async () => {
    const payload = await sealItem(keys, "text", ITEM_ID, frame());
    expect(containsBytes(fromBase64Url(payload), new TextEncoder().encode("hello"))).toBe(false);
  });
});

describe("openItem rejects with DecryptError", () => {
  let payload: string;
  beforeAll(async () => {
    payload = await sealItem(keys, "text", ITEM_ID, frame());
  });

  it("for a wrong key", async () => {
    const other = await deriveKeys(Uint8Array.from({ length: 32 }, (_, i) => 255 - i));
    await expect(openItem(other, "text", ITEM_ID, payload)).rejects.toBeInstanceOf(DecryptError);
  });

  it("for one changed character", async () => {
    const i = 50;
    const swapped = payload.slice(0, i) + (payload[i] === "A" ? "B" : "A") + payload.slice(i + 1);
    await expect(openItem(keys, "text", ITEM_ID, swapped)).rejects.toBeInstanceOf(DecryptError);
  });

  it("for a different id", async () => {
    await expect(openItem(keys, "text", "f".repeat(32), payload)).rejects.toBeInstanceOf(
      DecryptError,
    );
  });

  it("for a different kind", async () => {
    await expect(openItem(keys, "image", ITEM_ID, payload)).rejects.toBeInstanceOf(DecryptError);
  });

  it("for a payload shorter than 40 decoded bytes", async () => {
    await expect(openItem(keys, "text", ITEM_ID, "A".repeat(50))).rejects.toBeInstanceOf(
      DecryptError,
    );
  });

  it("for a character outside base64url", async () => {
    await expect(openItem(keys, "text", ITEM_ID, payload + "=")).rejects.toBeInstanceOf(
      DecryptError,
    );
  });
});
