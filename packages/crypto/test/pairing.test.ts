import { describe, expect, it } from "vitest";
import {
  buildPairingLink,
  encodePairingCode,
  generateMasterKey,
  parsePairingCode,
} from "../src/index";
import { MASTER, PAIRING_CODE, hex } from "./vectors";

describe("encodePairingCode", () => {
  it("encodes bytes 0..31 as the known 43-character code", () => {
    expect(encodePairingCode(MASTER)).toBe(PAIRING_CODE);
  });
});

describe("parsePairingCode", () => {
  const same = (input: string) => {
    const parsed = parsePairingCode(input);
    expect(parsed === null ? null : hex(parsed)).toBe(hex(MASTER));
  };

  it("accepts the bare code", () => same(PAIRING_CODE));
  it("accepts surrounding whitespace and newlines", () => same(`  \n${PAIRING_CODE}\r\n `));
  it("accepts straight quotes", () => same(`"${PAIRING_CODE}"`));
  it("accepts curly quotes", () => same(`“${PAIRING_CODE}”`));
  it("accepts a code split across lines", () =>
    same(`${PAIRING_CODE.slice(0, 20)}\n${PAIRING_CODE.slice(20)}`));
  it("accepts the full link with a slash before the #", () =>
    same(`https://hopnote.example.dev/#${PAIRING_CODE}`));
  it("accepts the full link without a slash before the #", () =>
    same(`https://hopnote.example.dev#${PAIRING_CODE}`));
  it("accepts a link with surrounding whitespace", () =>
    same(`\n https://hopnote.example.dev/#${PAIRING_CODE}  \n`));

  it.each([
    ["42 characters", PAIRING_CODE.slice(1)],
    ["44 characters", PAIRING_CODE + "A"],
    ["a plus sign", PAIRING_CODE.slice(0, 42) + "+"],
    ["a slash inside the code", PAIRING_CODE.slice(0, 42) + "/"],
    ["a padding sign", PAIRING_CODE.slice(0, 42) + "="],
    ["the empty string", ""],
    ["only whitespace", "   \n"],
  ])("returns null for %s without throwing", (_name, input) => {
    expect(parsePairingCode(input)).toBeNull();
  });
});

describe("buildPairingLink", () => {
  it("puts exactly one slash before the # whether or not the URL ends with one", () => {
    expect(buildPairingLink("https://a.dev/", MASTER)).toBe(`https://a.dev/#${PAIRING_CODE}`);
    expect(buildPairingLink("https://a.dev", MASTER)).toBe(`https://a.dev/#${PAIRING_CODE}`);
  });
});

describe("generateMasterKey", () => {
  it("returns 32 bytes that differ on every call", () => {
    const a = generateMasterKey();
    const b = generateMasterKey();
    expect(a).toHaveLength(32);
    expect(hex(a)).not.toBe(hex(b));
  });
});
