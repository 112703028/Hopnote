// Payloads are base64url ciphertext. 262144 chars hold about 65K Chinese characters.
export const MAX_TEXT_PAYLOAD_CHARS = 262144;
// nonce (24) + tag (16) = 40 bytes = 54 base64url characters, the smallest valid payload.
export const MIN_PAYLOAD_CHARS = 54;
export const MAX_IMAGE_PAYLOAD_CHARS = 1_500_000;
export const MAX_TEXT_ITEMS = 100;
export const MAX_IMAGE_ITEMS = 20;
export const RETENTION_MS = 604_800_000;
export const RATE_LIMIT_MAX_ITEMS = 20;
export const RATE_LIMIT_WINDOW_MS = 10_000;
export const HISTORY_DEFAULT_LIMIT = 30;
export const HISTORY_MAX_LIMIT = 100;
