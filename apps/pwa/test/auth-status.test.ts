import { describe, expect, it } from "vitest";
import { classifyAuthStatus } from "../src/auth-status";

describe("classifyAuthStatus", () => {
  it.each([
    [200, "ok"],
    [204, "ok"],
    [401, "unauthorized"],
    [403, "unauthorized"],
    [500, "unknown"],
    [0, "unknown"],
  ])("maps %i to %s", (status, expected) => {
    expect(classifyAuthStatus(status)).toBe(expected);
  });
});
