import { describe, expect, it } from "vitest";
import { renderSVG } from "uqr";
import { pairingQrDataUrl } from "../src/qr";

const PREFIX = "data:image/svg+xml;charset=utf-8,";

describe("pairingQrDataUrl", () => {
  it("returns an SVG data URL", () => {
    const url = pairingQrDataUrl("https://a.dev/#abc");
    expect(url.startsWith(PREFIX)).toBe(true);
    expect(decodeURIComponent(url.slice(PREFIX.length))).toContain("<svg");
  });

  it("leaves a 4-module quiet zone (uqr's default is 1 module = 10 units)", () => {
    const link = "https://a.dev/#abc";
    const size = (svg: string) => Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
    const ours = decodeURIComponent(pairingQrDataUrl(link).slice(PREFIX.length));
    expect(size(ours)).toBe(size(renderSVG(link, { border: 1 })) + 60);
  });

  it("gives different images for different links", () => {
    expect(pairingQrDataUrl("https://a.dev/#abc")).not.toBe(pairingQrDataUrl("https://a.dev/#abd"));
  });
});
