import { describe, expect, it } from "vitest";
import { pairingQrDataUrl } from "../src/qr";

const PREFIX = "data:image/svg+xml;charset=utf-8,";

describe("pairingQrDataUrl", () => {
  it("returns an SVG data URL", () => {
    const url = pairingQrDataUrl("https://a.dev/#abc");
    expect(url.startsWith(PREFIX)).toBe(true);
    expect(decodeURIComponent(url.slice(PREFIX.length))).toContain("<svg");
  });

  it("gives different images for different links", () => {
    expect(pairingQrDataUrl("https://a.dev/#abc")).not.toBe(pairingQrDataUrl("https://a.dev/#abd"));
  });
});
