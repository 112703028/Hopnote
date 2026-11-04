# Hopnote Stage 2: End-to-End Encryption — Design

Date: 2026-11-04. Status: draft for the builder check, then the owner's review.
Builds on: stage 1 (deployed, unencrypted), `pc-to-ipad-text-tool-plan.md` §7, and the stage 1 plan in `docs/superpowers/plans/2026-10-29-stage1-relay-pwa-desktop.md`.

## Intent

Hopnote sends text and screenshots from a Windows PC to an iPad through a Cloudflare relay. In stage 1 the relay and anyone who learns a room's URL can read everything. Stage 2 makes the relay unable to read content: the owner copies text and screenshots from papers and web pages into iPad notes, and the content may be unpublished work or private. The relay is treated as an untrusted third party that only forwards and stores ciphertext.

Success: the relay, its operator, and Cloudflare logs never see plaintext or any key; a tampered or replayed message is rejected; the daily flow (`Alt+Q` / `Alt+W`, tap on the iPad) is unchanged; pairing a new iPad takes under a minute.

## Goals

- G1. Content (text and screenshots) is encrypted on the PC and decrypted on the iPad; the relay only handles ciphertext.
- G2. Pairing a device is "scan a QR code and compare a fingerprint". No password to remember.
- G3. Wrong key, altered ciphertext, a swapped `id` or `kind`, and stale messages are rejected, with tests.
- G4. The relay requires proof of the key (an auth token derived from it) for every request, so knowing a room ID alone is useless.
- G5. The threat model in plan §7.4 is rewritten to describe what this stage does and does not protect, including who serves the app (see "Trust boundary").
- G6. The README explains how anyone can deploy their own copy, so nobody has to trust someone else's deployment.

## Non-goals

- No password-based key ("group name + password") in this stage; pairing is by random key only.
- No in-app QR scanner on the iPad; the iPad's built-in Camera app opens the QR link.
- No forward secrecy and no automatic key rotation.
- No iPad → PC direction, no multiple rooms per device, no file transfer.
- Text cleaning, window titles, and the double-Ctrl+C mode are stage 3.

## Anti-goals (a failure even if it technically works)

- The key or token is sent to any server, appears in relay or Cloudflare logs, or is committed to git. (Safari's own History may keep the pairing link; see "My calls" and the threat model.)
- Encryption makes the daily flow slower or needs extra taps.
- Images get larger on the wire than today (no double base64).
- A silent failure: a message that cannot be decrypted simply vanishes with no hint.

## Decided by the owner (approved in chat, 2026-11-04)

1. The PC generates one random master key. Pairing: the PC window shows a QR code and a short fingerprint; the iPad scans it, stores the key, shows its fingerprint; the owner compares the two and confirms.
2. The QR code carries a link with the key after `#`, which browsers never send to a server; the iPad page stores it and cleans the address bar (as stage 1 does with the room secret).
3. From the master key, four things are derived one-way: a content key, a room ID, an auth token, and a fingerprint. The relay only ever gets the room ID and the token, never the content key.
4. Each message is encrypted with XChaCha20-Poly1305 (libsodium.js, the same library on the PC and the iPad), a random nonce per message, and the existing `id` and timestamp kept for replay protection. Images are encrypted as raw bytes, not as JSON-wrapped base64.
5. A second or new iPad is paired by showing the same key's QR again. If an iPad is lost, the PC generates a new master key, which is a new room; the old room's data expires in 7 days.
6. Existing plaintext rooms stop working after the upgrade; every device pairs once.
7. A text form of the pairing code must exist (paste instead of scan), because a home-screen web app on iOS may not share Safari's storage.
8. The relay drops all plaintext handling: it stores `{id, kind, payload}` where `payload` is ciphertext.

Not answered: whether a new device ever has to be paired with no computer at hand. Assumption: no; the PC can always show the QR or the copyable code.

## My calls (the owner has not seen these as decisions; veto any)

- **Key format.** Master key = 32 random bytes (`crypto.getRandomValues`). Shared as base64url without padding (43 chars). The "pairing code" is that string; the "pairing link" is `https://<relay>/#<code>`. Parsing accepts either, and ignores surrounding whitespace.
- **Derivation.** HKDF-SHA256 via WebCrypto (`crypto.subtle`), fixed salt `hopnote-v1`, info strings `hopnote/v1/content` (32 bytes), `hopnote/v1/room` (16 bytes, shown as 32 lowercase hex so it is the same shape as today's room ID and the relay routes do not change), `hopnote/v1/auth` (32 bytes, base64url), `hopnote/v1/fingerprint` (8 bytes, shown as `A3F2 91C0 7B44 D8E1`). Argon2id is not used: the key is random, not a human password.
- **Message format.** Envelope on the relay stays `{id, kind, payload}`. `payload = base64url(nonce(24) || ciphertext || tag)`. AEAD associated data = UTF-8 `hopnote/v1|<kind>|<id>`, so the relay cannot move a ciphertext to another `id` or change its `kind`.
  Plaintext, text: UTF-8 JSON `{"v":1,"text":…,"ts":…}`. Plaintext, image: `u32be metaLength || meta JSON {"v":1,"mime":"image/png","width":W,"height":H,"ts":T} || raw PNG bytes`.
- **Staleness.** The receiver drops items whose `ts` (inside the ciphertext) is older than 7 days or more than 10 minutes in the future.
- **Relay auth.** `Authorization: Bearer <token>` on HTTP routes. For the WebSocket, the token travels in `Sec-WebSocket-Protocol: hopnote.v1, hopnote.auth.<token>` (browsers cannot set headers on a WebSocket; base64url characters are valid in a subprotocol) so it never appears in a URL; the client offers two subprotocols, `hopnote.v1` and `hopnote.auth.<token>`, and the relay selects and echoes `hopnote.v1`, so the token never appears in any response. If this does not work on iOS Safari or Workers, fall back to authenticating with the first WebSocket message.
- **Token binding.** The first authenticated request for a room stores SHA-256(token) in the Room Durable Object; every later request must match (constant-time compare). Missing token: 401. Mismatch: 403. The token is never logged.
- **New package.** `packages/crypto` (`@hopnote/crypto`): key generation, derivation, encrypt/decrypt, fingerprint, pairing code/link parsing. The relay imports only the token-hash helper, so the Worker does not bundle libsodium. Clients use `libsodium-wrappers` for the AEAD; HKDF and SHA-256 use WebCrypto.
- **Key storage.** PC: `localStorage` key `hopnote.key` in the WebView2 profile (stage 2 default; Windows DPAPI via Rust is a later hardening). iPad: `localStorage`. The stage 1 setting `roomSecret` is dropped; settings become `{relayUrl, key}`.
- **Safari History.** The pairing link may stay in Safari's History (and iCloud-synced history) after the Camera app opens it; `replaceState` only rewrites the current entry. Decision 2 (QR link) wins over a history-free flow: anyone who can read the owner's Safari history already has the unlocked iPad, where the stored key and the decrypted cards are equally readable. The threat model records this; the app tells the owner to clear that history entry after pairing; the text code remains for those who prefer it.
- **Fingerprint UX.** Both screens show it; the iPad has a "matches the PC" confirm button that only records that the owner checked. It is a sanity check against a wrong or misread QR, not a defence against an active attacker, because the key itself travels in the QR.
- **Items that cannot be shown.** The iPad shows one small notice, for example "2 items could not be decrypted (wrong key?), 1 was too old or from a wrong clock", instead of dropping any item silently. The same applies to items rejected as stale or clock-skewed.
- **Text capacity.** Today's limit is 64K characters of JSON, which holds about 64K Chinese characters. After encryption a Chinese character is 3 bytes and base64 adds a third, so keep today's capacity in characters by raising `MAX_TEXT_PAYLOAD_CHARS` to 262,144 (about 65K Chinese characters, 196 KB of plaintext; still far below the 2 MB SQLite row limit). The image limit stays 1,500,000 payload characters, about 1.1 MB of PNG.
- **CORS.** `*` is acceptable once the token (not the URL) is the credential; tightening to the desktop webview origins is optional and must be checked against the real `Origin` header first.

## Constraints (how the current system works)

- Monorepo (pnpm): `packages/protocol`, `apps/relay` (Worker + `Room` Durable Object, SQLite), `apps/pwa` (Vite + Preact, served by the same Worker), `apps/desktop` (Tauri v2: Rust + Preact/TypeScript). Tests: vitest 5 everywhere, `@cloudflare/vitest-plugin` for the relay; `pnpm test` and `pnpm typecheck` at the root.
- The relay routes today: `POST /room/{id}/items`, `GET /room/{id}/history`, `GET /room/{id}/ws`; room ID = 32 lowercase hex (`isHex128`); limits and retention live in `packages/protocol/src/limits.ts`; the relay already treats `payload` as an opaque string and learns `kind` (needed for retention), size, and time.
- Desktop: hotkey handlers build a plaintext frame in `src/capture.ts` and send through `src/relay.ts`; settings are in `localStorage` (`hopnote.settings`). The webview CSP already allows `'wasm-unsafe-eval'` (libsodium WASM) and `https:` for `connect-src`.
- PWA: reads the secret from `location.hash`, stores it, then `history.replaceState`; cards decode payloads through `decodeCached`.
- Deployed at `https://hopnote.pc-to-ipad-relay.workers.dev` (Cloudflare free plan). Wrangler auth is the owner's. Deploying and pushing need the owner's go-ahead.

## Trust boundary: who serves the app

The same Cloudflare Worker stores ciphertext and serves the iPad web app. So the key is safe from a relay that only reads what it stores, and from logs, but whoever can deploy that Worker (the owner, anyone holding the owner's Wrangler or Cloudflare credentials, Cloudflare) can ship a page that reads the key from `localStorage` or `location.hash`. The success line therefore means: the relay's stored data and logs never contain plaintext or keys. A web app cannot offer more than that unless the app is hosted somewhere more trusted than the relay.

**Decided by the owner (2026-11-04):** everyone deploys their own copy; nobody uses another person's deployment (this includes classmates in stage 4). So each user is the sole operator of their own Worker, and plan §7.4 states that the party who serves the app is trusted. The README must document self-deployment step by step, and should recommend two-factor authentication on the Cloudflare account, since an account takeover is the remaining way to ship a malicious page.

## Things to verify first on a real iPad (before building on them)

1. Does opening the QR link from the Camera app keep the `#` fragment into Safari?
2. After Safari stores the key, does a home-screen web app created from that page see it? (Expected: no. The paste fallback then becomes the main path.)
3. Does a home-screen app keep its storage across weeks? (iOS can clear Safari website data after long disuse.)
4. Does `Sec-WebSocket-Protocol` carrying the token work on iOS Safari against the Worker?
5. Does `libsodium-wrappers` load under the Tauri CSP and on iOS Safari, and what does it cost in bundle size and start-up time?

## Security tests that must exist

- Known-answer vectors for the derivation (fixed key → fixed room ID, token, fingerprint, content key) and for one fixed-nonce encryption.
- Round trip for text and for image bytes; wrong key fails; one flipped ciphertext byte fails; changing `id` or `kind` (associated data) fails.
- The receiver rejects `ts` older than 7 days and more than 10 minutes ahead.
- Relay: no token → 401; wrong token → 403; first token binds the room; the stored `payload` of a real encrypted item does not contain the plaintext; token never appears in any response or log line.
- The existing stage 1 behaviors still hold (duplicate `id`, rate limit, retention, size limits, history catch-up).

## Left to the builder

Package layout and file names; the QR library; UI copy and layout for pairing and the fingerprint; where the encryption seam sits between `capture.ts` and `relay.ts`; the exact text payload limit; the WebSocket auth mechanism if the subprotocol route fails; the migration screen for existing devices; how vectors are generated; rewriting plan §7 and §7.4 to match; DPAPI as a later task.
