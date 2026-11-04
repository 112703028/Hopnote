import { describe, expect, it } from "vitest";
import type { ItemKind } from "@hopnote/protocol";
import { decodeImageFrame, decodeTextFrame } from "@hopnote/crypto";
import { sendClipboard, sendSelection, type CaptureDeps } from "../src/capture";
import type { SendResult } from "../src/relay";

type Sent = { kind: ItemKind; plaintext: Uint8Array };

const IMAGE = { rgba: new Uint8Array(4), width: 1, height: 1 };
const ENCODED = { png: Uint8Array.from([137, 80, 78, 71]), width: 7, height: 5 };

function makeDeps(overrides: Partial<CaptureDeps> = {}) {
  const sent: Sent[] = [];
  const deps: CaptureDeps = {
    copySelection: async () => true,
    readText: async () => null,
    readImage: async () => null,
    encodeScreenshot: async () => ENCODED,
    send: async (kind, plaintext): Promise<SendResult> => {
      sent.push({ kind, plaintext });
      return { ok: true, seq: 5 };
    },
    now: () => 1234,
    ...overrides,
  };
  return { deps, sent };
}

describe("sendSelection (Alt+Q)", () => {
  it("returns nothing-copied and never sends when copySelection is false", async () => {
    const { deps, sent } = makeDeps({ copySelection: async () => false });
    expect(await sendSelection(deps)).toEqual({ status: "nothing-copied" });
    expect(sent).toEqual([]);
  });

  it("returns empty for a whitespace-only selection and sends nothing", async () => {
    const { deps, sent } = makeDeps({ readText: async () => " \n\t " });
    expect(await sendSelection(deps)).toEqual({ status: "empty" });
    expect(sent).toEqual([]);
  });

  it("sends a text selection as a text frame", async () => {
    const { deps, sent } = makeDeps({ readText: async () => "hello 世界" });
    expect(await sendSelection(deps)).toEqual({ status: "sent", kind: "text", seq: 5 });
    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toBe("text");
    expect(decodeTextFrame(sent[0].plaintext)).toEqual({ text: "hello 世界", ts: 1234 });
  });

  it("reports an error when copySelection rejects", async () => {
    const { deps } = makeDeps({
      copySelection: async () => {
        throw new Error("SendInput 只送出 0/4 個按鍵事件");
      },
    });
    expect(await sendSelection(deps)).toEqual({
      status: "error",
      message: "SendInput 只送出 0/4 個按鍵事件",
    });
  });
});

describe("sendClipboard (Alt+W)", () => {
  it("sends the text when text and an image are both on the clipboard", async () => {
    const { deps, sent } = makeDeps({ readText: async () => "cells", readImage: async () => IMAGE });
    expect(await sendClipboard(deps)).toEqual({ status: "sent", kind: "text", seq: 5 });
    expect(sent.map((s) => s.kind)).toEqual(["text"]);
  });

  it("sends an image frame when there is no text", async () => {
    const { deps, sent } = makeDeps({ readImage: async () => IMAGE });
    expect(await sendClipboard(deps)).toEqual({ status: "sent", kind: "image", seq: 5 });
    expect(sent[0].kind).toBe("image");
    expect(decodeImageFrame(sent[0].plaintext)).toEqual({
      png: ENCODED.png,
      width: 7,
      height: 5,
      ts: 1234,
    });
  });

  it("falls back to the image when the text is only whitespace", async () => {
    const { deps, sent } = makeDeps({ readText: async () => "   ", readImage: async () => IMAGE });
    expect(await sendClipboard(deps)).toEqual({ status: "sent", kind: "image", seq: 5 });
    expect(sent.map((s) => s.kind)).toEqual(["image"]);
  });

  it("returns empty when the clipboard has neither text nor an image", async () => {
    const { deps, sent } = makeDeps();
    expect(await sendClipboard(deps)).toEqual({ status: "empty" });
    expect(sent).toEqual([]);
  });

  it("returns too-large without sending when the screenshot cannot be shrunk enough", async () => {
    const { deps, sent } = makeDeps({ readImage: async () => IMAGE, encodeScreenshot: async () => null });
    expect(await sendClipboard(deps)).toEqual({ status: "too-large" });
    expect(sent).toEqual([]);
  });

  it("returns the relay's message when send fails", async () => {
    const { deps } = makeDeps({
      readText: async () => "hi",
      send: async () => ({ ok: false, error: "傳送太頻繁，請稍後再試" }),
    });
    expect(await sendClipboard(deps)).toEqual({
      status: "error",
      message: "傳送太頻繁，請稍後再試",
    });
  });
});
