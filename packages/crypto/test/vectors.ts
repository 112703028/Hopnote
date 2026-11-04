// Known-answer values. Master key = bytes 0..31; nonce = bytes 0..23.
export const MASTER = Uint8Array.from({ length: 32 }, (_, i) => i);
export const PAIRING_CODE = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
export const CONTENT_KEY_HEX = "83b724a6af7050f0b152990bde2ad6f506fc334ec238516f5ce945743ff7a9a7";
export const ROOM_ID = "c08bda6d6ab05719d0ad8fc565b91009";
export const AUTH_TOKEN = "MdOfclbT9y5EMDiVqp_I2g4uyiHwR7F7hIFDD2_2t4g";
export const FINGERPRINT = "F1EF F3AE BC29 DBBD";
export const ITEM_ID = "00112233445566778899aabbccddeeff";
export const NONCE = Uint8Array.from({ length: 24 }, (_, i) => i);
export const SEALED_PAYLOAD =
  "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXVO4Zv1SPXUjPU8Xq3qJiwj3n7Q-ElmhVdk_84blUM_D9yQsXyEUkJfjWhb_ARdzez9sJvnAK-KPM";
export const TOKEN_HASH = "0c7fd2ceaa7c736e65257b376ab73ee143d48baee414a3add87fc30a0e217ad6";
export const TEXT_FRAME_TS = 1700000000000;

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}
