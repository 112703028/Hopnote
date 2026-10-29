import { describe, expect, it } from "vitest";
import { EDGE_LADDER, fitWithin } from "../src/image";

describe("fitWithin", () => {
  it("leaves an image that already fits unchanged (never upscales)", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("scales a landscape image so the longest edge is the maximum", () => {
    expect(fitWithin(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
  });

  it("scales a portrait image so the longest edge is the maximum", () => {
    expect(fitWithin(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
  });

  it("never returns a side of 0", () => {
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe("EDGE_LADDER", () => {
  it("steps down from 1600 px", () => {
    expect(EDGE_LADDER).toEqual([1600, 1200, 900, 600]);
  });
});
