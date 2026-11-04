import { describe, expect, it } from "vitest";
import { decodePayload, type ItemKind } from "@hopnote/protocol";
import { sendClipboard, sendSelection, type CaptureDeps } from "../src/capture";
import type { SendResult } from "../src/relay";

type Sent = { kind: ItemKind; payload: string };

const IMAGE = { rgba: new Uint8Array(4), width: 1, height: 1 };
const ENCODED = { data: "AAEC", width: 1, height: 1 };

function makeDeps(overrides: Partial<CaptureDeps> = {}) {
  const sent: Sent[] = [];
  const deps: CaptureDeps = {
    copySelection: async () => true,
    readText: async () => null,
    readImage: async () => null,
    encodeScreenshot: async () => ENCODED,
    send: async (kind, payload): Promise<SendResult> => {
      sent.push({ kind, payload });
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

  it("sends a text selection as a text item", async () => {
    const { deps, sent } = makeDeps({ readText: async () => "hello 世界" });
    expect(await sendSelection(deps)).toEqual({ status: "sent", kind: "text", seq: 5 });
    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toBe("text");
    expect(decodePayload("text", sent[0].payload)).toEqual({ v: 1, text: "hello 世界", ts: 1234 });
  });

  it("reports an error when copySelection rejects", async () => {
    const { deps } = makeDeps({
      copySelection: async () => {
        throw new Error("SendInput sent 0 of 4 events");
      },
    });
    expect(await sendSelection(deps)).toEqual({
      status: "error",
      message: "SendInput sent 0 of 4 events",
    });
  });
});

describe("sendClipboard (Alt+W)", () => {
  it("sends the text when text and an image are both on the clipboard", async () => {
    const { deps, sent } = makeDeps({ readText: async () => "cells", readImage: async () => IMAGE });
    expect(await sendClipboard(deps)).toEqual({ status: "sent", kind: "text", seq: 5 });
    expect(sent.map((s) => s.kind)).toEqual(["text"]);
  });

  it("sends an image when there is no text", async () => {
    const { deps, sent } = makeDeps({ readImage: async () => IMAGE });
    expect(await sendClipboard(deps)).toEqual({ status: "sent", kind: "image", seq: 5 });
    expect(sent[0].kind).toBe("image");
    expect(decodePayload("image", sent[0].payload)).toEqual({
      v: 1,
      mime: "image/png",
      data: "AAEC",
      width: 1,
      height: 1,
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
      send: async () => ({ ok: false, error: "rate limited, try again in a few seconds" }),
    });
    expect(await sendClipboard(deps)).toEqual({
      status: "error",
      message: "rate limited, try again in a few seconds",
    });
  });
});
