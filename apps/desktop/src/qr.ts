import { renderSVG } from "uqr";

/** The pairing link as a QR code, in a form an <img src> accepts. A 4-module quiet zone, as the QR spec asks. */
export function pairingQrDataUrl(link: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSVG(link, { border: 4 }))}`;
}
