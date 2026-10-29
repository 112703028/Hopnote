import { describe, expect, it } from "vitest";
import { historyQuery } from "../src/history";

describe("historyQuery", () => {
  it("asks for the default newest page on the first open", () => {
    expect(historyQuery(0)).toBe("since=0");
  });

  it("asks for the maximum page when catching up, so a long absence loses nothing", () => {
    expect(historyQuery(12)).toBe("since=12&limit=100");
  });
});
