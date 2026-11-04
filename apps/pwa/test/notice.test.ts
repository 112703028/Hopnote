import { describe, expect, it } from "vitest";
import { noticeText } from "../src/notice";

describe("noticeText", () => {
  it("is null when nothing was rejected", () => {
    expect(noticeText({ undecryptable: 0, stale: 0, future: 0 })).toBeNull();
  });

  it("explains undecryptable items", () => {
    expect(noticeText({ undecryptable: 2, stale: 0, future: 0 })).toBe("2 則無法解密（金鑰不符？）");
  });

  it("joins all three reasons", () => {
    expect(noticeText({ undecryptable: 2, stale: 1, future: 3 })).toBe(
      "2 則無法解密（金鑰不符？）；1 則已超過 7 天；3 則的時間比現在晚（請檢查電腦或 iPad 的時鐘）",
    );
  });
});
