# Stage 2: End-to-End Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Text and screenshots are encrypted on the PC and decrypted on the iPad; the relay only stores ciphertext and only talks to holders of the key.

**Architecture:** One random 32-byte master key is shared once by QR code. Each device derives a content key, room ID, auth token and fingerprint from it with HKDF. Every item is sealed with XChaCha20-Poly1305 with `kind` and `id` bound as associated data. The relay stores `{id, kind, payload}` unchanged, requires the auth token, and binds a room to the first token it sees. A new `@hopnote/crypto` package holds all of it; the Worker imports only its libsodium-free `token` entry.

**Tech Stack:** TypeScript, `libsodium-wrappers` 0.8.x (AEAD only), WebCrypto (HKDF, SHA-256), `uqr` (QR as SVG), existing pnpm workspace, vitest 5, Cloudflare Workers + Durable Objects, Vite 8 + Preact, Tauri v2.

**Spec:** `docs/superpowers/specs/2026-11-04-e2e-encryption-design.md` (read it first; it records what the owner decided and which calls are mine).

## Global Constraints

- Master key: 32 random bytes from `crypto.getRandomValues`; shared as base64url without padding (43 chars), the "pairing code". Pairing link: `<relayUrl>/#<code>`.
- HKDF-SHA256 via WebCrypto, salt `hopnote-v1` (UTF-8). Info and length: `hopnote/v1/content` 32 bytes; `hopnote/v1/room` 16 bytes shown as 32 lowercase hex; `hopnote/v1/auth` 32 bytes as base64url (43 chars); `hopnote/v1/fingerprint` 8 bytes as `A3F2 91C0 7B44 D8E1` (uppercase hex, groups of 4).
- Item payload: `base64url(nonce(24) || ciphertext || tag(16))`; AEAD is XChaCha20-Poly1305-IETF; associated data is UTF-8 `hopnote/v1|<kind>|<id>`.
- Text plaintext: UTF-8 JSON `{"v":1,"text":…,"ts":…}`. Image plaintext: `u32be metaLength || meta JSON {"v":1,"mime":"image/png","width":W,"height":H,"ts":T} || raw PNG bytes`.
- Freshness: reject `ts` older than 7 days or more than 10 minutes ahead; rejected items are counted and explained, never dropped silently.
- Relay auth: `Authorization: Bearer <token>` on HTTP; WebSocket offers `Sec-WebSocket-Protocol: hopnote.v1, hopnote.auth.<token>` and the relay echoes only `hopnote.v1`. The relay stores SHA-256(token) per room on first contact; no token or a malformed one = 401, wrong token = 403; compare in constant time; never log or echo the token.
- Limits: `MAX_TEXT_PAYLOAD_CHARS = 262144`; `MAX_IMAGE_PAYLOAD_CHARS = 1_500_000` (unchanged); the relay accepts only base64url payloads of at least 54 characters.
- Storage: `localStorage` key `hopnote.key` (the pairing code) on PC and iPad; desktop settings become `{relayUrl, key}`.
- The Worker must never import libsodium (Workers refuse to compile WASM from bytes at runtime); it imports `@hopnote/crypto/token` only.
- Do not deploy before Task 8: until then the live relay and the live clients still speak stage 1. After the deploy every device re-pairs once.

## Review Focus

1. A device with a wrong or old key (the PC made a new key; an old QR was scanned): the iPad says the key does not match and offers re-pairing, instead of looping on "connecting". (Tasks 3, 4, 5)
2. A pairing code pasted with whitespace, line breaks, surrounding quotes, or as the full link is accepted; a wrong length or a character outside base64url is rejected with a message and never throws. (Task 2)
3. A screenshot whose PNG is right at the size limit: after framing, encryption and base64 the payload must still be at most 1,500,000 characters. (Task 2)
4. A PC or iPad clock off by more than 10 minutes, or items older than 7 days: counted and explained in the notice. (Tasks 2, 4)
5. A retry after a network error resends the identical ciphertext (same `id`, same nonce); re-encrypting would store two cards. Also: leftover stage 1 data (old `hopnote.roomSecret`, old settings) must not crash and must lead to a clear "pair again" prompt. (Tasks 4, 6)

## Calls I made (veto any)

- `libsodium` is only in the clients; the relay uses WebCrypto and a libsodium-free subpath, so its tests can run inside workerd.
- `sealItemWithNonce` is exported for known-answer tests only; production code uses `sealItem`.
- The relay now validates payloads (base64url, at least 54 characters). This also closes the stage 1 review's note about non-ASCII payloads.
- The pairing code is case-sensitive (it is base64url); the parser accepts a bare code or a link, trims whitespace and one pair of surrounding quotes, and removes line breaks inside the code.
- Browsers hide the HTTP status of a failed WebSocket handshake, so when the socket never opens the iPad probes `history` to read 401/403.
- Generating a new key on the PC asks for confirmation, because it disconnects every paired device.
- The stage 1 plaintext payload codecs are deleted in Task 8, after every consumer has moved.
- QR codes use `uqr` (no dependencies), rendered as an SVG data URL.

## File Structure

```
packages/crypto/             new: pairing, derive, seal, frames, token (+ tests)
packages/protocol/           limits and payload validation (payload codecs removed in Task 8)
apps/relay/src/{index,room,store}.ts   token auth, binding, subprotocol, CORS header
apps/pwa/src/                pairing.ts, open-feed.ts, notice.ts, auth-status.ts; feed.ts generic;
                             client.ts, App.tsx, Card.tsx, Setup.tsx updated
                             (room-secret.ts and decode-cache.ts deleted)
apps/desktop/src/            settings.ts, relay.ts, capture.ts, image.ts, hotkeys.ts updated;
                             sender.ts, qr.ts, PairingPanel.tsx new
```

---

### Task 0: Device checks on the live stage 1 app (owner, about 3 minutes)

These need the owner and an iPad. Ask the owner to run them now; build Tasks 1–3 without waiting; read the answers before Task 4.

- [ ] **Step 1:** Run `pnpm new-room-secret`, then `npx --yes qrcode-terminal "https://hopnote.pc-to-ipad-relay.workers.dev/#<that secret>"`. The terminal prints a QR code.
- [ ] **Step 2 (owner):** Scan it with the iPad **Camera app** and open the link in Safari. Record: does the page show "已連線" (the `#` survived and was stored)?
- [ ] **Step 3 (owner):** Share > Add to Home Screen, open the new icon. Record: does it show the feed (storage shared with Safari) or the setup screen (not shared)?
- [ ] **Step 4 (owner):** Safari > History. Record: is the visited address listed with the `#...` part?
- [ ] **Step 5:** Ledger the three answers. If step 2 fails (the `#` is lost), stop and ask the owner: the QR-link design needs rework. Step 3 "not shared" needs no code change (the paste path already exists); it only changes README and UI wording. Step 4 only feeds the threat-model text.

---

### Task 1: Protocol limits and payload validation

**Files:**
- Modify: `packages/protocol/src/limits.ts`, `packages/protocol/src/validate.ts`
- Modify: `apps/relay/test/helpers.ts`, `apps/relay/test/items.test.ts`
- Test: `packages/protocol/test/validate.test.ts`

**Interfaces:**
- Produces: `MAX_TEXT_PAYLOAD_CHARS = 262144`; `MIN_PAYLOAD_CHARS = 54`; `validateEnvelope` checks in this order: structure (`invalid`), size (`too_large`, unchanged), then `payload` characters and length: a character outside `[A-Za-z0-9_-]` or fewer than 54 characters gives `{ ok: false, code: "invalid" }`. Relay test helper: `payloadFor(text: string): string` (base64url of the UTF-8 text, right-padded with `A` to at least 54 chars); `textEnvelope(text, id)` uses it.

- [ ] **Step 1: Write the failing tests.** In `validate.test.ts`, change the text boundary test to 262144 accepted and 262145 `too_large` (payload `"A".repeat(n)`), the image boundary test to use `"A".repeat`, and the "accepts" cases to use a 54+ char base64url payload. Add: `rejects a payload containing "{", a space, "é" or "=" as invalid`; `rejects a 53-char payload as invalid and accepts a 54-char one`. In relay `items.test.ts` change the 413 cases to `"A".repeat(262145)` and `"A".repeat(1_500_001)`, and add `POST a payload with a character outside base64url returns 400` (Review Focus: malformed input).
- [ ] **Step 2:** Run `pnpm --filter @hopnote/protocol test` and `pnpm --filter @hopnote/relay test`. Expected: the new and changed tests FAIL.
- [ ] **Step 3:** Implement the two constants and the payload checks in `validateEnvelope` (in the order above); update the relay helper to `payloadFor`.
- [ ] **Step 4:** Run `pnpm test`. Expected: all PASS (the payload codecs in protocol still exist; they are removed in Task 8).
- [ ] **Step 5:** Commit `feat(protocol): larger text limit, base64url payload validation`.

---

### Task 2: `@hopnote/crypto` package

**Files:**
- Create: `packages/crypto/package.json`, `tsconfig.json`, `src/index.ts`, `src/pairing.ts`, `src/derive.ts`, `src/seal.ts`, `src/frames.ts`, `src/token.ts`
- Test: `packages/crypto/test/pairing.test.ts`, `derive.test.ts`, `seal.test.ts`, `frames.test.ts`, `token.test.ts`

Package: name `@hopnote/crypto`, `"type": "module"`, scripts `test`/`typecheck` like `@hopnote/protocol`, `exports` for `"."` → `src/index.ts` and `"./token"` → `src/token.ts` (each with `types` and `default`), dependencies `@hopnote/protocol: workspace:*`, `libsodium-wrappers: ^0.8.4`, devDependencies `vitest ^5.0.5`, `typescript ~6.0.3`. `token.ts` must not import libsodium, directly or through another module.

**Interfaces:**
- Produces:
  - `generateMasterKey(): Uint8Array`; `encodePairingCode(master: Uint8Array): string`; `parsePairingCode(input: string): Uint8Array | null`; `buildPairingLink(relayUrl: string, master: Uint8Array): string` (exactly one `/` before `#`)
  - `interface DerivedKeys { contentKey: Uint8Array; roomId: string; authToken: string; fingerprint: string }`; `deriveKeys(master: Uint8Array): Promise<DerivedKeys>` (throws if `master.length !== 32`)
  - `sealItem(keys: DerivedKeys, kind: ItemKind, id: string, plaintext: Uint8Array): Promise<string>`; `sealItemWithNonce(keys, kind, id, plaintext, nonce: Uint8Array): Promise<string>` (known-answer tests only); `openItem(keys, kind, id, payload: string): Promise<Uint8Array>`; `class DecryptError extends Error`
  - `encodeTextFrame(text: string, ts: number): Uint8Array`; `decodeTextFrame(frame): { text: string; ts: number }`; `encodeImageFrame(img: { png: Uint8Array; width: number; height: number }, ts: number): Uint8Array`; `decodeImageFrame(frame): { png: Uint8Array; width: number; height: number; ts: number }`; `class FrameError extends Error`; `MAX_PNG_BYTES = 1_124_800`
  - `type Freshness = "ok" | "stale" | "future"`; `checkFreshness(ts: number, now: number): Freshness`
  - `token.ts`: `AUTH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/`; `hashToken(token: string): Promise<string>` (SHA-256, lowercase hex); `tokensMatch(a: string, b: string): boolean` (constant time)

Known-answer values (master = bytes `0..31`; id `00112233445566778899aabbccddeeff`; kind `text`; nonce = bytes `0..23`; frame `{"v":1,"text":"hello","ts":1700000000000}`):

| Item | Value |
|---|---|
| pairing code | `AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8` |
| content key (hex) | `83b724a6af7050f0b152990bde2ad6f506fc334ec238516f5ce945743ff7a9a7` |
| room ID | `c08bda6d6ab05719d0ad8fc565b91009` |
| auth token | `MdOfclbT9y5EMDiVqp_I2g4uyiHwR7F7hIFDD2_2t4g` |
| fingerprint | `F1EF F3AE BC29 DBBD` |
| payload (108 chars) | `AAECAwQFBgcICQoLDA0ODxAREhMUFRYXVO4Zv1SPXUjPU8Xq3qJiwj3n7Q-ElmhVdk_84blUM_D9yQsXyEUkJfjWhb_ARdzez9sJvnAK-KPM` |
| SHA-256(token), hex | `0c7fd2ceaa7c736e65257b376ab73ee143d48baee414a3add87fc30a0e217ad6` |

- [ ] **Step 1: Write the failing tests.**
  - `pairing.test.ts`: `encodePairingCode of bytes 0..31 equals the table value`; `parsePairingCode accepts the bare code, the code with surrounding whitespace and newlines, the code in straight or curly quotes, the code split across lines, and https://x.dev/#<code> with or without a trailing slash`; `returns null for 42 or 44 characters, for + / =, and for the empty string` (Review Focus 2); `buildPairingLink("https://a.dev/", master)` and without the slash both give `https://a.dev/#<code>`; `generateMasterKey returns 32 bytes that differ per call`.
  - `derive.test.ts`: the five derived values equal the table; deterministic for equal keys, different for different keys; `roomId` matches `/^[0-9a-f]{32}$/`, `authToken` matches `AUTH_TOKEN_PATTERN`, `fingerprint` matches `/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/`; a 31-byte master throws.
  - `seal.test.ts`: `sealItemWithNonce reproduces the 108-char payload`; round trip of a text frame and of random bytes; two `sealItem` calls on the same input differ; payload is base64url and its decoded length is `24 + plaintext + 16`; the base64url-decoded payload does not contain the bytes of `hello`; `openItem rejects, with DecryptError`: a wrong key, one changed character, a different `id`, a different `kind`, a payload shorter than 40 decoded bytes, and a payload with a character outside base64url.
  - `frames.test.ts`: text frame round trip with `"héllo 世界 🙂"`; image frame round trip with PNG signature bytes and width 3, height 2; `decode*Frame throws FrameError` for a truncated frame, a meta length that runs past the end, non-JSON meta, and `v` other than 1; a PNG of exactly `MAX_PNG_BYTES` with width 1600, height 1600, `ts` 9999999999999 sealed with real keys has payload length at most 1,500,000 (Review Focus 3); `checkFreshness`: exactly 7 days old is `ok`, 7 days and 1 ms is `stale`, `now + 10 minutes` is `ok`, `now + 10 minutes + 1 ms` is `future`.
  - `token.test.ts`: `hashToken(<table token>)` equals the table hash; `tokensMatch` is true for equal strings, false for different strings and for different lengths; `AUTH_TOKEN_PATTERN` accepts 43 base64url characters and rejects 42, 44, and a `+`.
- [ ] **Step 2:** Run `pnpm --filter @hopnote/crypto test`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the interfaces. HKDF through `crypto.subtle.deriveBits`; AEAD through `libsodium-wrappers` (`await sodium.ready` once, cached); `tokensMatch` compares byte by byte over the longer length without early exit.
- [ ] **Step 4:** Run `pnpm --filter @hopnote/crypto test` and `typecheck`. Expected: all PASS.
- [ ] **Step 5:** Commit `feat(crypto): pairing, key derivation, sealed items, frames, token helpers`.

---

### Task 3: Relay token auth

**Files:**
- Modify: `apps/relay/package.json` (add `@hopnote/crypto: workspace:*`), `apps/relay/src/index.ts`, `apps/relay/src/room.ts`, `apps/relay/src/store.ts`, `apps/relay/test/helpers.ts`, `apps/relay/test/ws.test.ts`, `apps/relay/test/cors.test.ts`
- Test: `apps/relay/test/auth.test.ts`

**Interfaces:**
- Consumes: `AUTH_TOKEN_PATTERN`, `hashToken`, `tokensMatch` from `@hopnote/crypto/token` (import the subpath only).
- Produces:
  - `store.ts`: a `meta(key TEXT PRIMARY KEY, value TEXT)` table created in `initSchema`; `getAuthHash(sql: SqlStorage): string | null`; `setAuthHash(sql: SqlStorage, hash: string): void`.
  - `Room.fetch` checks auth before routing `items`, `history`, `ws`: token from `Authorization: Bearer <t>`, or for `ws` from the `hopnote.auth.<t>` entry of `Sec-WebSocket-Protocol`. Missing or not matching `AUTH_TOKEN_PATTERN` → `401 {"error":"unauthorized"}`; no binding yet → store `hashToken(token)` and continue; binding differs → `403 {"error":"wrong_key"}`. The binding is never cleared (the alarm only deletes items).
  - A successful `ws` upgrade responds with header `Sec-WebSocket-Protocol: hopnote.v1`.
  - CORS: `Access-Control-Allow-Headers` becomes `Content-Type, Authorization`.
  - Test helpers: `tokenFor(room: string): string` = `(room + room).slice(0, 43)`; `post`/`get` send `Authorization: Bearer ${tokenFor(room)}`; `openSocket` sends `Sec-WebSocket-Protocol: hopnote.v1, hopnote.auth.${tokenFor(room)}`.

- [ ] **Step 1: Write the failing tests.** `auth.test.ts`: `no Authorization header returns 401 on items, history and ws`; `a 42-character token returns 401`; `the first token binds the room: POST 201, then GET history 200 with the same token`; `another valid token returns 403 on items, history and ws`; `a GET with a token on an unused room binds it, then a POST with another token is 403`; `the binding survives the expiry alarm: after runDurableObjectAlarm empties the room, another token is still 403`; `a successful upgrade echoes exactly "hopnote.v1" in Sec-WebSocket-Protocol and no response body or header contains the token`; `an unknown route stays 404 without a token`. Update `cors.test.ts` to expect `Content-Type, Authorization`. Update `ws.test.ts` to open sockets with the subprotocol header and the 426 test to send a token.
- [ ] **Step 2:** Run `pnpm --filter @hopnote/relay test`. Expected: the new and updated tests FAIL.
- [ ] **Step 3:** Implement the auth check, binding storage and subprotocol echo; update `CORS_HEADERS`; keep the OPTIONS path unauthenticated.
- [ ] **Step 4:** Run `pnpm --filter @hopnote/relay test` and `typecheck`. Expected: all PASS (stage 1 behaviors included).
- [ ] **Step 5:** Manual check against `wrangler dev` with a Node script: a WebSocket created as `new WebSocket(url, ["hopnote.v1", "hopnote.auth.<token>"])` opens and receives a pushed item; without the token the open fails. Kill the whole `wrangler dev` process tree afterwards (check port 8787 is free).
- [ ] **Step 6:** Commit `feat(relay): token auth with first-contact binding`.

---

### Task 4: PWA logic (pairing storage, decrypting feed, notices)

**Files:**
- Create: `apps/pwa/src/pairing.ts`, `apps/pwa/src/open-feed.ts`, `apps/pwa/src/notice.ts`, `apps/pwa/src/auth-status.ts`
- Modify: `apps/pwa/package.json` (add `@hopnote/crypto: workspace:*`), `apps/pwa/src/feed.ts`
- Test: `apps/pwa/test/pairing.test.ts`, `open-feed.test.ts`, `notice.test.ts`, `auth-status.test.ts`, `feed.test.ts`

**Interfaces:**
- Consumes: Task 2 exports.
- Produces:
  - `pairing.ts`: `parseKeyFromHash(hash: string): Uint8Array | null` (uses `parsePairingCode` on the text after `#`); `loadKey(storage: Pick<Storage,"getItem">): Uint8Array | null`; `saveKey(storage: Pick<Storage,"setItem">, master: Uint8Array): void` (key `hopnote.key`, value the pairing code); `clearKey(storage: Pick<Storage,"removeItem">): void`; `discardLegacySecret(storage: Pick<Storage,"getItem"|"removeItem">): boolean` (removes `hopnote.roomSecret`, true if it existed); `isFingerprintConfirmed(storage, fingerprint: string): boolean`; `confirmFingerprint(storage, fingerprint: string): void` (key `hopnote.confirmedFingerprint`).
  - `open-feed.ts`: `type DisplayItem = { seq: number; kind: "text"; ts: number; text: string } | { seq: number; kind: "image"; ts: number; blob: Blob; url: string; width: number; height: number }`; `interface OpenResult { shown: DisplayItem[]; undecryptable: number; stale: number; future: number }`; `openItems(keys: DerivedKeys, items: StoredItem[], now: number): Promise<OpenResult>` (an image gets a `Blob` of type `image/png` and a `blob:` object URL created once).
  - `notice.ts`: `interface Notice { undecryptable: number; stale: number; future: number }`; `noticeText(n: Notice): string | null`.
  - `auth-status.ts`: `classifyAuthStatus(status: number): "ok" | "unauthorized" | "unknown"`.
  - `feed.ts`: `FeedState<T extends { seq: number; kind: ItemKind }>`, `emptyFeed`, and `mergeItems<T>(state, incoming: T[])` with the same dedupe, order and per-kind caps as before.

- [ ] **Step 1: Write the failing tests.**
  - `pairing.test.ts`: `parseKeyFromHash("#<code>") returns the 32 bytes`; null for no `#`, a wrong length, and `+`; `loadKey/saveKey` round trip; `loadKey` returns null for a missing or corrupt value; `clearKey` forgets it; `discardLegacySecret returns true and removes hopnote.roomSecret when present, false otherwise` (Review Focus 5); `confirmFingerprint` makes `isFingerprintConfirmed` true for that fingerprint and false for another.
  - `open-feed.test.ts` (real crypto, keys from `deriveKeys`): a sealed text frame is shown with its text and `ts`; a sealed image frame is shown with a Blob of type `image/png` and a `blob:` URL; an item sealed with another key counts as `undecryptable`; an item whose plaintext is not a valid frame counts as `undecryptable`; a `ts` 7 days and 1 ms old counts as `stale`, one 10 minutes and 1 ms ahead as `future` (Review Focus 4); `shown` keeps input order.
  - `notice.test.ts`: all zeros give `null`; `{undecryptable: 2}` gives `2 則無法解密（金鑰不符？）`; all three give `2 則無法解密（金鑰不符？）；1 則已超過 7 天；3 則的時間比現在晚（請檢查電腦或 iPad 的時鐘）`.
  - `auth-status.test.ts`: 200 and 204 are `ok`; 401 and 403 are `unauthorized`; 500 and 0 are `unknown`.
  - `feed.test.ts`: the existing merge and cap tests keep passing for a generic item type.
- [ ] **Step 2:** Run `pnpm --filter @hopnote/pwa test`. Expected: FAIL.
- [ ] **Step 3:** Implement the modules; `openItems` decodes with the frame functions and classifies with `checkFreshness`. `room-secret.ts` and `decode-cache.ts` stay until Task 5, because `App.tsx` and `Card.tsx` still use them.
- [ ] **Step 4:** Run `pnpm --filter @hopnote/pwa test` and `typecheck`. Expected: PASS (the generic `mergeItems` still accepts `StoredItem`).
- [ ] **Step 5:** Commit `feat(pwa): pairing storage, decrypting feed and notices`.

---

### Task 5: PWA client and UI

**Files:**
- Modify: `apps/pwa/src/client.ts`, `apps/pwa/src/App.tsx`, `apps/pwa/src/components/Card.tsx`, `apps/pwa/src/components/Setup.tsx`, `apps/pwa/src/clipboard.ts`, `apps/pwa/src/styles.css`
- Modify: `apps/pwa/test/clipboard.test.ts`
- Delete: `apps/pwa/src/room-secret.ts`, `apps/pwa/src/decode-cache.ts`, `apps/pwa/test/room-secret.test.ts`, `apps/pwa/test/decode-cache.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 4.
- Produces:
  - `startFeedClient(opts: { roomId: string; authToken: string; onItems(items: StoredItem[]): void; onStatus(status: ConnectionStatus): void }): { stop(): void }`; `ConnectionStatus` gains `"unauthorized"`. HTTP calls send `Authorization: Bearer <token>`; the WebSocket is created with subprotocols `["hopnote.v1", "hopnote.auth." + token]`. When a socket closes without ever opening, the client probes `GET history?since=0&limit=1`; if `classifyAuthStatus` says `unauthorized`, it sets that status and stops reconnecting.
  - `copyPng(blob: Blob): Promise<void>` (the Blob already exists; no conversion inside the tap); `base64ToBlob` and its test are removed.
  - `App`: at start `discardLegacySecret`; read the key from `location.hash` (then `replaceState`) or `loadKey`; no key shows `Setup` with a paste field (`parsePairingCode`; an invalid code shows `配對碼格式不正確，請重新複製`) and, if a legacy secret was discarded, the line `Hopnote 已升級為加密版，請重新配對`. With a key: derive keys once; decrypt arriving items with `openItems` and merge `DisplayItem`s; accumulate a `Notice` and show `noticeText`; a banner shows the fingerprint, a button `與電腦端一致` (calls `confirmFingerprint`), a button `複製配對碼`, and the text `配對後建議到 Safari 清除這筆歷史記錄` until confirmed; the status pill maps `unauthorized` to `金鑰不符，請重新配對`; the existing `更換房間` button becomes `重新配對` (clears the key).
  - `Card` takes a `DisplayItem`: text as before; image `<img src={url}>`; tap on an image calls `copyPng(blob)` before any `await`.

- [ ] **Step 1:** Update `clipboard.test.ts` to remove the `base64ToBlob` test (the function is deleted); there is nothing new to unit test here beyond Task 4's pure modules.
- [ ] **Step 2:** Run `pnpm --filter @hopnote/pwa test`. Expected: PASS (nothing references the removed function after step 3).
- [ ] **Step 3:** Implement the client, App, Card, Setup, clipboard and styles per the interfaces, then delete the replaced modules and their tests.
- [ ] **Step 4:** Run `pnpm --filter @hopnote/pwa typecheck` and `pnpm --filter @hopnote/pwa build`. Expected: no errors; the build succeeds (the bundle grows to roughly 450 kB because of libsodium; check `dist` and the PWA precache stay under Workbox's 2 MiB file limit).
- [ ] **Step 5:** Commit `feat(pwa): authenticated client, decrypting UI, pairing banner`.

---

### Task 6: Desktop logic (settings, sealed sending)

**Files:**
- Modify: `apps/desktop/package.json` (add `@hopnote/crypto: workspace:*`), `apps/desktop/src/settings.ts`, `apps/desktop/src/relay.ts`, `apps/desktop/src/capture.ts`, `apps/desktop/src/image.ts`, `apps/desktop/src/hotkeys.ts`, `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/sender.ts`
- Test: `apps/desktop/test/settings.test.ts`, `relay.test.ts`, `capture.test.ts`, `sender.test.ts`

**Interfaces:**
- Consumes: Task 2 exports.
- Produces:
  - `settings.ts`: `Settings { relayUrl: string; key: string | null }` (`key` is the pairing code); `normalizeRelayUrl` unchanged; `validateRelayUrl(input: string): { ok: true; relayUrl: string } | { ok: false; error: string }`; `loadSettings(storage): Settings | null` (null if there is no valid `relayUrl`; a stored `key` that `parsePairingCode` rejects becomes `null`; a stage 1 record with `roomSecret` loads as `{relayUrl, key: null}`); `saveSettings(storage, settings)` (key `hopnote.settings`).
  - `relay.ts`: `type RelayTarget = { relayUrl: string; roomId: string; authToken: string }`; `sendItem(target: RelayTarget, envelope: Envelope, fetchImpl?: typeof fetch, timeoutMs?: number): Promise<SendResult>`. It POSTs `envelope` with `Authorization: Bearer <authToken>`; a network error retries once with the same envelope; 401 or 403 gives `金鑰不符，請在電腦端重新配對 iPad`; the other messages are unchanged.
  - `capture.ts`: `CaptureDeps.send(kind: ItemKind, plaintext: Uint8Array): Promise<SendResult>`; text is built with `encodeTextFrame(text, deps.now())`, images with `encodeImageFrame(encoded, deps.now())`; `encodeScreenshot` returns `{ png: Uint8Array; width: number; height: number } | null`.
  - `image.ts`: `encodeScreenshot` returns PNG bytes and `null` when none of the sizes in `EDGE_LADDER` gives `png.length <= MAX_PNG_BYTES`.
  - `sender.ts`: `makeSender(deps: { loadSettings(): Settings | null; fetchImpl?: typeof fetch }): (kind: ItemKind, plaintext: Uint8Array) => Promise<SendResult>`. With no settings or no key it returns `{ ok: false, error: "請先填寫中繼網址並配對 iPad" }`. Otherwise it derives keys (cached per key string), creates one `id`, seals once with `sealItem`, and calls `sendItem` with the resulting envelope. `hotkeys.ts` uses `makeSender`.
  - `App.tsx` (interim, so the typecheck stays green): the form keeps only the relay URL field, validated with `validateRelayUrl` and saved with `saveSettings` (preserving any stored `key`); the room-secret field is removed. Task 7 adds the pairing panel.

- [ ] **Step 1: Write the failing tests.**
  - `settings.test.ts`: `validateRelayUrl` keeps the existing URL cases; `loadSettings` round-trips `{relayUrl, key}`; `a stage 1 record with roomSecret loads as { relayUrl, key: null }` (Review Focus 5); `a corrupt key becomes null`; `missing or corrupt JSON gives null`.
  - `relay.test.ts` (fake fetch): the request carries `Authorization: Bearer <token>` and the envelope as the body; `a network error then success sends byte-identical bodies twice` (Review Focus 5); two network errors fail; 401 and 403 map to the `金鑰不符` message; 413, 429, 500 keep their messages; the stalled-request timeout test still passes.
  - `capture.test.ts`: `send` receives bytes; `decodeTextFrame(sent.plaintext)` equals `{ text: "hello 世界", ts: 1234 }`; `decodeImageFrame` gives the PNG bytes, width and height; every other case from stage 1 (nothing-copied, empty, too-large, error mapping) still holds.
  - `sender.test.ts` (real crypto, fake fetch): with no settings, or settings with `key: null`, it returns the pairing message and sends nothing; the POST carries the token derived from the key and a payload that does not contain the plaintext; `openItem` with the same keys, `id` and `kind` recovers the plaintext; on a network error then success the second body equals the first byte for byte.
- [ ] **Step 2:** Run `pnpm --filter desktop test`. Expected: FAIL.
- [ ] **Step 3:** Implement per the interfaces.
- [ ] **Step 4:** Run `pnpm --filter desktop test` and `pnpm --filter desktop typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(desktop): sealed sending and key-based settings`.

---

### Task 7: Desktop pairing UI

**Files:**
- Modify: `apps/desktop/package.json` (add `uqr`), `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/qr.ts`, `apps/desktop/src/PairingPanel.tsx`
- Test: `apps/desktop/test/qr.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 6.
- Produces: `qr.ts`: `pairingQrDataUrl(link: string): string` (an SVG from `uqr`'s `renderSVG`, returned as `data:image/svg+xml;charset=utf-8,<encoded svg>`). `PairingPanel` props: `{ relayUrl: string | null; keyCode: string | null; onKeyChange(code: string): void }`; it is disabled until `relayUrl` is valid; with no key it offers `產生金鑰並配對`; with a key it shows the QR image, the pairing link text, the fingerprint (`deriveKeys(...).fingerprint`), `複製配對碼`, and `產生新金鑰` which first calls `window.confirm("產生新金鑰會讓所有已配對的裝置失效，需要重新配對。繼續？")`. `App` shows the relay URL field plus `PairingPanel`, saves settings with `saveSettings`, and keeps the hotkey log.

- [ ] **Step 1: Write the failing test.** `qr.test.ts`: `pairingQrDataUrl starts with "data:image/svg+xml;charset=utf-8," and the decoded text contains "<svg"`; `different links give different images`.
- [ ] **Step 2:** Run `pnpm --filter desktop test`. Expected: the new test FAILS.
- [ ] **Step 3:** Implement `qr.ts`, `PairingPanel.tsx` and the `App.tsx` changes.
- [ ] **Step 4:** Run `pnpm --filter desktop test`, `typecheck`, then `pnpm --filter desktop exec vite build` (delete `dist` afterwards) and `cargo check` in `apps/desktop/src-tauri`. Expected: PASS, build succeeds, no Rust warnings.
- [ ] **Step 5:** Commit `feat(desktop): pairing panel with QR code`.

---

### Task 8: Cleanup, docs, deploy, device checks

**Files:**
- Delete: `packages/protocol/src/payload.ts`, `packages/protocol/test/payload.test.ts`; remove its export from `packages/protocol/src/index.ts`
- Modify: `README.md`, `pc-to-ipad-text-tool-plan.md`

- [ ] **Step 1:** Remove the stage 1 payload codecs (`encodeTextPayload`, `encodeImagePayload`, `decodePayload`, `TextPayload`, `ImagePayload`). Run `pnpm test` and `pnpm typecheck`. Expected: PASS everywhere (any remaining import is a missed migration; fix it).
- [ ] **Step 2:** Update `README.md`: how to deploy your own copy step by step; turn on two-factor authentication on the Cloudflare account; pairing with the QR code and the paste fallback; the fingerprint check; that the pairing link may stay in Safari History and how to clear it; that upgrading makes every device pair again; the "everyone deploys their own" rule.
- [ ] **Step 3:** Rewrite `pc-to-ipad-text-tool-plan.md` §7 and §7.4 to match the design: random master key and HKDF (not Argon2id), the four derived values, message format with bound `kind` and `id`, auth token binding, who serves the app is trusted, metadata still visible (kind, size, time, frequency), no forward secrecy, keys stored unencrypted in browser storage, Safari History; bump the version to v0.5.
- [ ] **Step 4:** Ask the owner to approve the deploy (it publishes to their Cloudflare account and breaks stage 1 clients until they re-pair). Then `pnpm run deploy`; smoke-test with a Node script: no token gives 401 on the live URL; after the first authenticated request another token gives 403; `GET history` returns a payload that is base64url with no readable text.
- [ ] **Step 5 (owner, with the iPad):** pair a device by scanning the QR from the desktop panel; compare fingerprints and confirm; `Alt+Q` shows a card; `Alt+W` after `Win+Shift+S` shows an image card; tap-to-copy pastes into GoodNotes; long-press drag into GoodNotes works or not (record it in plan §6.3); generate a new key on the PC and check that the old iPad shows `金鑰不符，請重新配對`; paste a deliberately wrong code and check the message; turn the iPad's network off and on and check it recovers. Ledger every result.
- [ ] **Step 6:** Commit `docs: encryption docs, plan v0.5`; do not push without the owner's go-ahead.
