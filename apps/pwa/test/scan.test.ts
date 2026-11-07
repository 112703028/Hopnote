import { describe, expect, it } from "vitest";
import { encode } from "uqr";
import { encodePairingCode } from "@hopnote/crypto";
import { keyFromFrame, type Frame } from "../src/scan";

const MASTER = Uint8Array.from({ length: 32 }, (_, i) => i);
const CODE = encodePairingCode(MASTER);

// Draws a QR code the way a screen shows it: black modules on white, with a quiet zone.
function render(text: string, scale = 6, border = 4): Frame {
  const { data: matrix, size } = encode(text);
  const dimension = (size + border * 2) * scale;
  const data = new Uint8ClampedArray(dimension * dimension * 4).fill(255);
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = ((y + border) * scale + dy) * dimension + (x + border) * scale + dx;
          data[px * 4] = 0;
          data[px * 4 + 1] = 0;
          data[px * 4 + 2] = 0;
        }
      }
    }),
  );
  return { data, width: dimension, height: dimension };
}

describe("keyFromFrame", () => {
  it("returns the master key from a QR code that holds the pairing link", () => {
    const key = keyFromFrame(render(`https://hopnote.example.dev/#${CODE}`));
    expect(Array.from(key ?? [])).toEqual(Array.from(MASTER));
  });

  it("returns the master key from a QR code that holds just the pairing code", () => {
    const key = keyFromFrame(render(CODE));
    expect(Array.from(key ?? [])).toEqual(Array.from(MASTER));
  });

  it("still reads a small, camera-sized code", () => {
    const key = keyFromFrame(render(`https://hopnote.example.dev/#${CODE}`, 3));
    expect(Array.from(key ?? [])).toEqual(Array.from(MASTER));
  });

  it("returns null for a QR code with other content", () => {
    expect(keyFromFrame(render("https://example.com/"))).toBeNull();
  });

  it("returns null for a link whose code is not a valid key", () => {
    expect(keyFromFrame(render("https://hopnote.example.dev/#not-a-key"))).toBeNull();
  });

  it("returns null for a frame with no QR code", () => {
    const blank = { data: new Uint8ClampedArray(200 * 200 * 4).fill(255), width: 200, height: 200 };
    expect(keyFromFrame(blank)).toBeNull();
  });
});
