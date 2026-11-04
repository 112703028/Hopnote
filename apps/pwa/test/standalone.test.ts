import { describe, expect, it } from "vitest";
import { isStandaloneMode } from "../src/standalone";

const win = (standalone: boolean | undefined, matches: boolean) => ({
  navigator: { standalone },
  matchMedia: () => ({ matches }),
});

describe("isStandaloneMode", () => {
  it("is true when iOS reports navigator.standalone", () => {
    expect(isStandaloneMode(win(true, false))).toBe(true);
  });

  it("is true when the display-mode media query matches", () => {
    expect(isStandaloneMode(win(undefined, true))).toBe(true);
  });

  it("is false in an ordinary Safari tab", () => {
    expect(isStandaloneMode(win(false, false))).toBe(false);
    expect(isStandaloneMode(win(undefined, false))).toBe(false);
  });
});
