import { describe, expect, it } from "vitest";
import { AUTH_TOKEN_PATTERN, hashToken, tokensMatch } from "../src/token";
import { AUTH_TOKEN, TOKEN_HASH } from "./vectors";

describe("hashToken", () => {
  it("returns the known SHA-256 hex of the known token", async () => {
    expect(await hashToken(AUTH_TOKEN)).toBe(TOKEN_HASH);
  });
});

describe("tokensMatch", () => {
  it("is true for equal strings", () => {
    expect(tokensMatch(AUTH_TOKEN, AUTH_TOKEN)).toBe(true);
  });

  it("is false for different strings and for different lengths", () => {
    expect(tokensMatch(AUTH_TOKEN, AUTH_TOKEN.slice(0, 42) + "A")).toBe(false);
    expect(tokensMatch(AUTH_TOKEN, AUTH_TOKEN.slice(0, 42))).toBe(false);
    expect(tokensMatch("", AUTH_TOKEN)).toBe(false);
  });
});

describe("AUTH_TOKEN_PATTERN", () => {
  it("accepts 43 base64url characters", () => {
    expect(AUTH_TOKEN_PATTERN.test(AUTH_TOKEN)).toBe(true);
  });

  it.each([
    ["42 characters", AUTH_TOKEN.slice(1)],
    ["44 characters", AUTH_TOKEN + "A"],
    ["a plus sign", AUTH_TOKEN.slice(0, 42) + "+"],
  ])("rejects %s", (_name, token) => {
    expect(AUTH_TOKEN_PATTERN.test(token)).toBe(false);
  });
});
