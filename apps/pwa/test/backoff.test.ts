import { describe, expect, it } from "vitest";
import { reconnectDelayMs } from "../src/backoff";

describe("reconnectDelayMs", () => {
  it.each([
    [0, 1000],
    [1, 2000],
    [2, 4000],
    [5, 30000],
    [100, 30000],
    [-3, 1000],
  ])("attempt %i waits %i ms", (attempt, expected) => {
    expect(reconnectDelayMs(attempt)).toBe(expected);
  });
});
