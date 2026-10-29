# Stage 1: Relay + iPad PWA + Desktop Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Text selected on Windows (`Alt+Q`) and screenshots taken with `Win+Shift+S` (`Alt+W`) show up as cards in an iPad web app, through a Cloudflare relay, unencrypted (stage 1).

**Architecture:** The Tauri desktop app POSTs items over HTTPS to a Cloudflare Worker. The Worker routes by room ID to one SQLite-backed Durable Object per room, which stores items and pushes them over hibernatable WebSockets to the iPad PWA. The same Worker serves the PWA as static assets. All three apps share a TypeScript `protocol` package. An item's `payload` is an opaque string (plain JSON now, ciphertext in stage 2), so stage 2 does not change the relay.

**Tech Stack:** TypeScript, pnpm workspace, Cloudflare Workers + Durable Objects (SQLite), wrangler 4, vitest 5 + `@cloudflare/vitest-plugin`, Vite 8 + Preact + `vite-plugin-pwa`, Tauri v2 (existing app), Rust for one new Win32 command.

**Spec:** `pc-to-ipad-text-tool-plan.md` §6.2–6.3 (v0.3) plus the design approved in chat on 2026-10-29, condensed in "Approved Design" below.

## Approved Design (condensed)

- Three pieces: relay (Worker + Durable Object), iPad web app, desktop wiring.
- Use: select text, `Alt+Q` sends it. Take a screenshot with `Win+Shift+S`, then `Alt+W` sends the current clipboard (text or image). iPad shows cards, newest first: tap copies, long-press drags into GoodNotes. When the iPad app returns to the foreground it fetches what it missed.
- Setup once: a long random room secret; the desktop settings take relay URL + secret; the iPad opens a link carrying the secret, then adds it to the home screen. If the home-screen app has empty storage it asks for the secret again.
- No encryption in stage 1 (text and images). Do not send passwords or private content until stage 2.
- Retention: 100 text items, about 20 images, 7 days.

## Global Constraints

- Text payload ≤ 64 KB: `MAX_TEXT_PAYLOAD_CHARS = 65536`.
- Keep 100 text items and 20 image items per room; delete anything older than 7 days.
- Item id and room secret: 128-bit random, 32 lowercase hex characters.
- Hotkeys: `Alt+Q` = copy selection and send; `Alt+W` = send current clipboard.
- Screenshot longest edge ≤ 1600 px.
- Durable Objects must be SQLite-backed (`new_sqlite_classes`); a SQLite row/string is ≤ 2 MB.
- Node ≥ 22; Workers `compatibility_date` `2026-10-28`.
- iOS Safari clipboard accepts only `image/png` for images.

## Review Focus

Inputs the spec implies but no feature task would otherwise exercise. Each is pinned by a test in the named task.

1. Desktop retries a send after a network error, so the relay sees the same item id twice: must not create a second item or a second push. (Task 2, Task 3, Task 6)
2. Oversized payload (text over 64 KB, image over the image limit): rejected with 413, nothing stored. (Task 1, Task 2)
3. Malformed requests (bad JSON, unknown kind, wrong types, bad room id): 400/404, never 500. (Task 1, Task 2)
4. Empty or whitespace-only clipboard, or a clipboard with neither text nor image: nothing is sent, the user sees why. (Task 7)
5. Relay URL typed with a trailing slash, `http://`, a path, or inner spaces; secret pasted with surrounding whitespace or uppercase. (Task 4, Task 6)

## Calls I made (veto any of these)

- **Desktop sends by HTTP POST, not WebSocket.** Stateless, and it avoids the unresolved question of WebSocket throttling while the window is hidden. WebSocket is receive-only, used by the iPad. Plan §5 drew WebSocket on both sides.
- **Screenshots are sent as PNG, not WebP.** iOS clipboard writes accept only PNG; a WebP-to-PNG conversion on the iPad inside a tap handler risks losing the user gesture. The desktop shrinks (1600 → 1200 → 900 → 600 px) until the PNG fits.
- **Relay allows CORS from any origin.** The desktop webview is a different origin from the Worker. The room secret is the only credential in stage 1.
- **The PWA is served by the same Worker** (Workers static assets, `run_worker_first: ["/room/*"]`): one deploy, same origin, no CORS for the iPad.
- **History returns the newest 30 items by default** (`limit`, max 100), so opening the app on cellular does not download 20 images.
- **`git init`** in Task 0. The workspace is not a git repository yet.
- **The spike's heartbeat section is removed** from the desktop UI (POST makes it moot).

## File Structure

```
package.json                      root scripts (test, typecheck, deploy)
scripts/new-room-secret.mjs       prints a 32-hex room secret
packages/protocol/                shared types, limits, validation, payload codecs
apps/relay/                       Worker + Room Durable Object
  src/index.ts                    routing, CORS, forwards to the room
  src/room.ts                     Room DO: HTTP handlers, WebSocket push, rate limit, alarm
  src/store.ts                    SQL helpers (schema, insert, list, prune)
apps/pwa/                         iPad web app
  src/room-secret.ts  src/feed.ts  src/backoff.ts   pure logic
  src/client.ts                   WebSocket + history sync
  src/clipboard.ts                copy helpers
  src/App.tsx  src/components/    UI
apps/desktop/                     existing Tauri app
  src/settings.ts  src/relay.ts   settings + HTTP client
  src/image.ts  src/capture.ts    screenshot encoding, send orchestration
  src/hotkeys.ts                  registers Alt+Q / Alt+W
  src-tauri/src/selection.rs      + mask_alt_tap command
```

---

### Task 0: Git baseline and workspace scripts

**Files:**
- Create: `package.json` (root)
- Modify: none

**Interfaces:**
- Produces: root scripts `test` (`pnpm -r --if-present test`) and `typecheck` (`pnpm -r --if-present typecheck`) that later tasks' packages plug into.

- [ ] **Step 1:** Run `git init -b main` in the repo root.
- [ ] **Step 2:** Create root `package.json`: `{ "name": "pc-to-ipad", "private": true, "engines": { "node": ">=22" }, "scripts": { "test": "pnpm -r --if-present test", "typecheck": "pnpm -r --if-present typecheck" } }`.
- [ ] **Step 3:** Run `pnpm install`. Expected: completes, no errors.
- [ ] **Step 4:** Run `git status --short`. Expected: no entries under `node_modules/`, `target/`, `dist/`, and no `*.bak` (all ignored).
- [ ] **Step 5:** Commit: `git add -A && git commit -m "chore: baseline workspace with desktop spike"`.

---

### Task 1: `@pc-to-ipad/protocol` package

**Files:**
- Create: `packages/protocol/package.json`, `tsconfig.json`, `src/index.ts`, `src/limits.ts`, `src/validate.ts`, `src/payload.ts`
- Test: `packages/protocol/test/validate.test.ts`, `packages/protocol/test/payload.test.ts`

Package: name `@pc-to-ipad/protocol`, `"type": "module"`, `"main"` and `"types"` both `src/index.ts` (consumers bundle the TS directly), scripts `test: "vitest run"`, `typecheck: "tsc --noEmit"`, devDependencies `vitest ^5.0.5`, `typescript ~6.0.3`.

**Interfaces:**
- Produces (all exported from `src/index.ts`):
  - limits: `MAX_TEXT_PAYLOAD_CHARS = 65536`, `MAX_IMAGE_PAYLOAD_CHARS = 1_500_000`, `MAX_TEXT_ITEMS = 100`, `MAX_IMAGE_ITEMS = 20`, `RETENTION_MS = 604_800_000`, `RATE_LIMIT_MAX_ITEMS = 20`, `RATE_LIMIT_WINDOW_MS = 10_000`, `HISTORY_DEFAULT_LIMIT = 30`, `HISTORY_MAX_LIMIT = 100`
  - types: `ItemKind = "text" | "image"`; `Envelope { id: string; kind: ItemKind; payload: string }`; `StoredItem extends Envelope { seq: number; receivedAt: number }`; `ServerMessage = { type: "item"; item: StoredItem }`; `TextPayload { v: 1; text: string; ts: number }`; `ImagePayload { v: 1; mime: "image/png"; data: string; width: number; height: number; ts: number }` (`data` is base64)
  - `isHex128(value: unknown): value is string` (32 lowercase hex chars)
  - `newItemId(): string` (16 bytes from `crypto.getRandomValues`, hex)
  - `validateEnvelope(raw: unknown): { ok: true; envelope: Envelope } | { ok: false; error: string; code: "invalid" | "too_large" }`
  - `encodeTextPayload(text: string, ts: number): string`
  - `encodeImagePayload(img: { data: string; width: number; height: number }, ts: number): string`
  - `decodePayload(kind: ItemKind, payload: string): TextPayload | ImagePayload | null`

- [ ] **Step 1: Write failing tests.** `validate.test.ts`:
  - `isHex128 accepts 32 lowercase hex; rejects uppercase, 31 chars, 33 chars, non-hex, empty, non-string`
  - `newItemId returns a different isHex128 value each call`
  - `validateEnvelope accepts a text envelope and an image envelope`
  - `validateEnvelope rejects non-object, missing id, id not hex128, unknown kind "video", non-string payload, empty payload` — each `{ ok: false, code: "invalid" }` (Review Focus 3)
  - `validateEnvelope accepts a text payload of exactly 65536 chars and rejects 65537 with code "too_large"` (Review Focus 2)
  - `validateEnvelope accepts an image payload of exactly 1_500_000 chars and rejects 1_500_001 with code "too_large"`

  `payload.test.ts`:
  - `text payload round-trips through encodeTextPayload/decodePayload as { v: 1, text, ts }`
  - `image payload round-trips with mime "image/png"`
  - `decodePayload returns null for invalid JSON, v !== 1, missing fields, and a kind/shape mismatch (text payload decoded as "image")`
- [ ] **Step 2:** Run `pnpm --filter @pc-to-ipad/protocol test`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the signatures above in the named files; `index.ts` re-exports everything. `validateEnvelope` checks structure first, then size by `kind`.
- [ ] **Step 4:** Run `pnpm --filter @pc-to-ipad/protocol test` and `pnpm --filter @pc-to-ipad/protocol typecheck`. Expected: all PASS, no type errors.
- [ ] **Step 5:** Commit `feat(protocol): shared types, limits, validation, payload codecs`.

---

### Task 2: Relay: storage and HTTP routes

**Files:**
- Create: `apps/relay/package.json`, `tsconfig.json`, `wrangler.jsonc`, `wrangler.test.jsonc`, `vitest.config.ts`, `src/index.ts`, `src/room.ts`, `src/store.ts`
- Test: `apps/relay/test/items.test.ts`, `apps/relay/test/history.test.ts`, `apps/relay/test/cors.test.ts`

Package: name `@pc-to-ipad/relay`, scripts `test: "vitest run"`, `typecheck: "tsc --noEmit"`, `deploy: "wrangler deploy"`; dependencies `@pc-to-ipad/protocol: workspace:*`; devDependencies `wrangler ^4.155.0`, `vitest ^5.0.5`, `@cloudflare/vitest-plugin ^1.4.10`, `typescript ~6.0.3`.

`wrangler.jsonc` values: `name: "pc-to-ipad"`, `main: "src/index.ts"`, `compatibility_date: "2026-10-28"`, `assets: { directory: "../pwa/dist", not_found_handling: "single-page-application", run_worker_first: ["/room/*"] }`, `durable_objects.bindings: [{ name: "ROOM", class_name: "Room" }]`, `migrations: [{ tag: "v1", new_sqlite_classes: ["Room"] }]`.

`wrangler.test.jsonc`: same without `assets` (the PWA build may not exist while testing). `vitest.config.ts`: `defineConfig({ plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.test.jsonc" } })] })` using `cloudflareTest` from `@cloudflare/vitest-plugin`. If the plugin tolerates a missing assets directory, delete `wrangler.test.jsonc` and point at `wrangler.jsonc`.

Run `pnpm --filter @pc-to-ipad/relay exec wrangler types` to generate `worker-configuration.d.ts`; tsconfig includes it plus `@cloudflare/vitest-plugin/types`.

**Interfaces:**
- Consumes: Task 1 exports.
- Produces:
  - `store.ts`: `initSchema(sql: SqlStorage): void`; `insertItem(sql: SqlStorage, envelope: Envelope, now: number): { item: StoredItem; duplicate: boolean }`; `listItems(sql: SqlStorage, opts: { since: number; limit: number }): StoredItem[]` (seq > since, newest `limit`, returned ascending); `latestSeq(sql: SqlStorage): number`; `pruneItems(sql: SqlStorage, now: number): void`.
  - Table: `items(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, payload TEXT NOT NULL, received_at INTEGER NOT NULL)`. `AUTOINCREMENT` keeps `seq` increasing after rows are pruned.
  - `insertItem` prunes after inserting: per kind keep the newest `MAX_TEXT_ITEMS` / `MAX_IMAGE_ITEMS`, drop rows older than `RETENTION_MS`.
  - Routes (Worker validates the path with `^/room/([^/]+)/(items|history|ws)$` and `isHex128(roomId)`, else 404 JSON `{ error }`; forwards to `env.ROOM.get(env.ROOM.idFromName(roomId))`):
    - `POST /room/{id}/items` body `Envelope` JSON → `201 { seq, receivedAt }` new, `200` same body for an existing id; `400 { error }` invalid, `413 { error }` too large; other methods `405`.
    - `GET /room/{id}/history?since=&limit=` → `200 { items: StoredItem[], latestSeq: number }`; `since` default 0 and `limit` default 30, clamped to 1..100; non-numeric or negative values fall back to the defaults.
    - `OPTIONS` → `204`; every non-101 response carries `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`.
  - `Room extends DurableObject<Env>` (import from `cloudflare:workers`) with `fetch(request: Request): Promise<Response>`.

Tests call the Worker with `exports.default.fetch(...)` (`import { exports } from "cloudflare:workers"`; `SELF` is deprecated).

- [ ] **Step 1: Write failing tests.** `items.test.ts`:
  - `POST text item returns 201 with seq 1`
  - `POST the same id twice returns 200 with the same seq and history holds one item` (Review Focus 1)
  - `POST invalid JSON returns 400`, `unknown kind returns 400`, `missing payload returns 400`, `bad room id returns 404` (Review Focus 3)
  - `POST text payload of 65537 chars returns 413 and history stays empty`; same for image payload of 1_500_001 chars (Review Focus 2)
  - `GET /room/{id}/items returns 405`

  `history.test.ts`:
  - `history returns items ascending with latestSeq`
  - `since is exclusive`
  - `limit returns the newest N, ascending`
  - `since=-5, since=abc, limit=0, limit=9999 do not error and use defaults or clamps`
  - `rooms are isolated: an item in room A is absent from room B`
  - `101 text items leave seq 2..101`; `21 image items leave the newest 20 regardless of text items`; `the next insert after pruning gets seq 102` (use small payloads)

  `cors.test.ts`:
  - `OPTIONS /room/{id}/items returns 204 with allow-origin *, allow-methods, allow-headers`
  - `POST and GET responses carry access-control-allow-origin *`
- [ ] **Step 2:** Run `pnpm --filter @pc-to-ipad/relay test`. Expected: FAIL.
- [ ] **Step 3:** Implement `store.ts`, `room.ts` (call `initSchema` in the constructor via `ctx.blockConcurrencyWhile`), `index.ts` per the interfaces. In `Room.fetch`, reject request bodies longer than `MAX_IMAGE_PAYLOAD_CHARS + 1024` characters with 413 before parsing.
- [ ] **Step 4:** Run `pnpm --filter @pc-to-ipad/relay test` and `typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(relay): room storage, items/history routes, CORS`.

---

### Task 3: Relay: live push, keepalive, rate limit, expiry

**Files:**
- Modify: `apps/relay/src/room.ts`
- Test: `apps/relay/test/ws.test.ts`, `apps/relay/test/limits.test.ts`, `apps/relay/test/expiry.test.ts`

**Interfaces:**
- Consumes: Task 2 `Room`, `store.ts`.
- Produces:
  - `GET /room/{id}/ws`: with `Upgrade: websocket` → `101`, accepted with `ctx.acceptWebSocket(server)` (hibernation API); without it → `426`.
  - After a **new** item is stored, send `JSON.stringify({ type: "item", item })` (`ServerMessage`) to every socket from `ctx.getWebSockets()`; a duplicate id sends nothing.
  - `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"))`; `webSocketMessage` ignores any other message.
  - Rate limit: more than `RATE_LIMIT_MAX_ITEMS` new items in `RATE_LIMIT_WINDOW_MS` (room-wide) → `429 { error: "rate_limited" }`; duplicates do not count. The Room has a public field `clock: () => number = () => Date.now()` used for the window so tests can move time.
  - Alarm: every new item calls `ctx.storage.setAlarm(now + RETENTION_MS)`; `alarm()` runs `pruneItems`, then `ctx.storage.deleteAll()` if no items remain, otherwise reschedules to the oldest item's `received_at + RETENTION_MS`.

- [ ] **Step 1: Write failing tests.** `ws.test.ts` (open sockets by fetching with `Upgrade: websocket` and reading `response.webSocket`, then `accept()`):
  - `a connected socket receives { type: "item", item } after POST`
  - `two sockets both receive the item`
  - `a duplicate POST pushes nothing: sockets see [A, B] after POST A, POST A again, POST B` (the second distinct item is the sentinel, no sleeps)
  - `sending "ping" gets "pong"`
  - `GET /ws without Upgrade returns 426`

  `limits.test.ts`:
  - `the 21st new item inside the window returns 429 and 20 items are stored`
  - `a duplicate of an existing id inside a full window returns 200, not 429` (Review Focus 1)
  - `after clock advances by RATE_LIMIT_WINDOW_MS + 1 a new item is accepted` (set `instance.clock` through `runInDurableObject`)

  `expiry.test.ts`:
  - `inserting schedules an alarm` (`state.storage.getAlarm()` is non-null)
  - `alarm removes items older than 7 days and keeps newer ones` (age rows via `runInDurableObject` + SQL, then `runDurableObjectAlarm`)
  - `alarm clears all storage when nothing remains`
- [ ] **Step 2:** Run `pnpm --filter @pc-to-ipad/relay test`. Expected: new tests FAIL.
- [ ] **Step 3:** Implement the behaviors above in `room.ts`.
- [ ] **Step 4:** Run `pnpm --filter @pc-to-ipad/relay test` and `typecheck`. Expected: all PASS.
- [ ] **Step 5:** Commit `feat(relay): websocket push, rate limit, expiry alarm`.

---

### Task 4: PWA scaffold and pure logic

**Files:**
- Create: `apps/pwa/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/room-secret.ts`, `src/feed.ts`, `src/backoff.ts`
- Test: `apps/pwa/test/room-secret.test.ts`, `apps/pwa/test/feed.test.ts`, `apps/pwa/test/backoff.test.ts`

Package: name `@pc-to-ipad/pwa`, scripts `dev: "vite"`, `build: "tsc --noEmit && vite build"`, `test: "vitest run"`, `typecheck: "tsc --noEmit"`; dependencies `preact`, `@pc-to-ipad/protocol: workspace:*`; devDependencies `vite ^8`, `@preact/preset-vite ^2.10.6`, `vite-plugin-pwa ^2.0.0`, `vitest ^5.0.5`, `typescript ~6.0.3`. `vite.config.ts`: Preact preset, dev server proxy `/room` → `http://localhost:8787` with `ws: true`. `src/main.tsx` renders a placeholder until Task 5.

**Interfaces:**
- Consumes: Task 1 `isHex128`, `StoredItem`.
- Produces:
  - `parseSecretFromHash(hash: string): string | null` — `"#<secret>"` → lowercased secret if hex128, else null.
  - `normalizeSecretInput(input: string): string | null` — trim + lowercase, hex128 or null.
  - `loadSecret(storage: Pick<Storage, "getItem">): string | null`; `saveSecret(storage: Pick<Storage, "setItem">, secret: string): void` (key `pc-to-ipad.roomSecret`).
  - `interface FeedState { items: StoredItem[]; latestSeq: number }` (items newest first); `emptyFeed: FeedState`; `mergeItems(state: FeedState, incoming: StoredItem[]): FeedState`.
  - `reconnectDelayMs(attempt: number): number`.

- [ ] **Step 1: Write failing tests.**
  - room-secret: `parseSecretFromHash("#" + secret) returns the secret`; `uppercase hash is lowercased`; `missing "#", wrong length, non-hex return null`; `normalizeSecretInput trims and lowercases " ABC…32 "`; `inner space returns null`; `loadSecret returns null for missing or invalid stored value` (Review Focus 5)
  - feed: `mergeItems dedupes by seq`; `sorts newest first even when history arrives after a live item`; `latestSeq is the max seq seen`; `does not mutate the input state`
  - backoff: `reconnectDelayMs(0) = 1000`, `(1) = 2000`, `(2) = 4000`, `(5) = 30000`, `(100) = 30000`, `(-3) = 1000`
- [ ] **Step 2:** Run `pnpm --filter @pc-to-ipad/pwa test`. Expected: FAIL.
- [ ] **Step 3:** Implement the three modules.
- [ ] **Step 4:** Run `pnpm --filter @pc-to-ipad/pwa test` and `typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pwa): scaffold, room secret parsing, feed merge, backoff`.

---

### Task 5: PWA client, UI, installable shell

**Files:**
- Create: `apps/pwa/src/client.ts`, `src/clipboard.ts`, `src/App.tsx`, `src/components/Card.tsx`, `src/components/Setup.tsx`, `src/styles.css`, `public/icon-192.png`, `public/icon-512.png`
- Modify: `apps/pwa/src/main.tsx`, `apps/pwa/vite.config.ts`, `apps/pwa/index.html`
- Test: `apps/pwa/test/clipboard.test.ts`

**Interfaces:**
- Consumes: Task 4 modules, Task 2/3 relay routes.
- Produces:
  - `startFeedClient(opts: { secret: string; onItems(items: StoredItem[]): void; onStatus(status: "connecting" | "online" | "offline"): void }): { stop(): void }` — opens `{wss on https pages, ws on http}://{location.host}/room/{secret}/ws`; on every open fetches `/room/{secret}/history?since={lastSeq}` and calls `onItems`; forwards `{type:"item"}` messages; sends `"ping"` every 25 s and reconnects if no `"pong"` within 10 s; on close reconnects after `reconnectDelayMs(attempt)`; on `visibilitychange` to visible, if the socket is not open reconnect immediately, and in all cases fetch history since `lastSeq`.
  - `base64ToBlob(data: string, mime: string): Blob`; `copyText(text: string): Promise<void>`; `copyPng(data: string): Promise<void>` — builds the Blob **synchronously**, then calls `navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])` so the call stays inside the tap gesture.
  - `App` behavior: at startup read the secret from `location.hash` (then `history.replaceState(null, "", location.pathname)`), else from `loadSecret`, else show `Setup` (input → `normalizeSecretInput` → `saveSecret`). Cards list newest first with a status pill.
  - Card rules (the iOS drag risk in plan §6.3): text is a plain selectable text node; **no** `touchstart`/`touchend`/`contextmenu` handlers and no custom long-press; tap uses `onClick` and shows "已複製" for ~1.5 s. Image cards use a plain `<img>` (`data:image/png;base64,…`), default draggable; tap calls `copyPng`.
  - PWA config in `vite.config.ts`: `registerType: "autoUpdate"`, manifest `name: "pc-to-ipad"`, `display: "standalone"`, `start_url: "/"`, the two icons; Workbox `navigateFallbackDenylist: [/^\/room\//]` so the service worker never answers `/room/*`. `index.html` gets the `apple-mobile-web-app-capable` meta tag and a touch icon link.

- [ ] **Step 1: Write failing test** `clipboard.test.ts`: `base64ToBlob returns a Blob with the given type and the decoded byte length` (use a known 3-byte input).
- [ ] **Step 2:** Run `pnpm --filter @pc-to-ipad/pwa test`. Expected: the new test FAILS.
- [ ] **Step 3:** Implement `clipboard.ts`, `client.ts`, components, App, PWA config. Generate two solid-color placeholder PNG icons.
- [ ] **Step 4:** Run `pnpm --filter @pc-to-ipad/pwa test`, `typecheck`, then `pnpm --filter @pc-to-ipad/pwa build`. Expected: tests PASS, build succeeds and `apps/pwa/dist/` contains `index.html` and the manifest.
- [ ] **Step 5:** Manual check (browser): run `pnpm --filter @pc-to-ipad/relay exec wrangler dev` after the build, open `http://localhost:8787/#<secret>`. Expected: status pill "online"; `curl -X POST` an item to `/room/<secret>/items` (body `{"id":"<32 hex>","kind":"text","payload":"{\"v\":1,\"text\":\"hi\",\"ts\":1}"}`, header `Content-Type: application/json`) makes a card appear within a second.
- [ ] **Step 6:** Commit `feat(pwa): live feed client, cards, installable shell`.

---

### Task 6: Desktop settings and relay client

**Files:**
- Create: `apps/desktop/src/settings.ts`, `apps/desktop/src/relay.ts`
- Modify: `apps/desktop/package.json` (add `@pc-to-ipad/protocol: workspace:*`, devDependency `vitest ^5.0.5`, scripts `test: "vitest run"`, `typecheck: "tsc --noEmit"`)
- Test: `apps/desktop/test/settings.test.ts`, `apps/desktop/test/relay.test.ts`

**Interfaces:**
- Consumes: Task 1 exports, Task 2 `POST /room/{id}/items`.
- Produces:
  - `interface Settings { relayUrl: string; roomSecret: string }`
  - `normalizeRelayUrl(input: string): string | null` — trims; accepts only an origin (no path, query, hash); `https:` any host, `http:` only for `localhost` and `127.0.0.1`; returns the origin without trailing slash.
  - `validateSettings(input: { relayUrl: string; roomSecret: string }): { ok: true; settings: Settings } | { ok: false; errors: { relayUrl?: string; roomSecret?: string } }` (secret trimmed + lowercased, must be hex128).
  - `loadSettings(storage: Pick<Storage, "getItem">): Settings | null`; `saveSettings(storage: Pick<Storage, "setItem">, settings: Settings): void` (key `pc-to-ipad.settings`, JSON).
  - `type SendResult = { ok: true; seq: number } | { ok: false; error: string }`
  - `sendItem(settings: Settings, kind: ItemKind, payload: string, fetchImpl?: typeof fetch): Promise<SendResult>` — creates one `newItemId()`, POSTs `{ id, kind, payload }` as JSON; on a network error retries **once with the same id**; maps 413 → error containing "too large", 429 → containing "rate limited", other non-2xx → `"relay error <status>"`.

- [ ] **Step 1: Write failing tests.**
  - settings: `normalizeRelayUrl trims and strips trailing slashes ("  https://a.dev/// " → "https://a.dev")`; `rejects "http://a.dev", "a.dev", "https://a.dev/x", "https://a.dev?x=1", "https://a .dev"`; `accepts "http://localhost:8787" and "http://127.0.0.1:8787"` (Review Focus 5); `validateSettings lowercases and trims the secret and rejects inner spaces and wrong length`; `loadSettings returns null for missing or corrupt JSON`
  - relay (fake `fetchImpl`): `POSTs to {relayUrl}/room/{secret}/items with Content-Type application/json and an Envelope body`; `network error then success sends the same id twice and returns ok` (Review Focus 1); `two network errors return { ok: false }`; `413 maps to an error containing "too large"`; `429 maps to "rate limited"`; `500 maps to "relay error 500"`
- [ ] **Step 2:** Run `pnpm --filter desktop test`. Expected: FAIL.
- [ ] **Step 3:** Implement both modules.
- [ ] **Step 4:** Run `pnpm --filter desktop test` and `pnpm --filter desktop typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(desktop): settings and relay client`.

---

### Task 7: Desktop image pipeline and send orchestration

**Files:**
- Create: `apps/desktop/src/image.ts`, `apps/desktop/src/capture.ts`
- Test: `apps/desktop/test/image.test.ts`, `apps/desktop/test/capture.test.ts`

**Interfaces:**
- Consumes: Task 1 (`encodeTextPayload`, `encodeImagePayload`, `MAX_IMAGE_PAYLOAD_CHARS`), Task 6 (`SendResult`).
- Produces:
  - `EDGE_LADDER = [1600, 1200, 900, 600]`
  - `fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number }` — keeps aspect ratio, never upscales, each side ≥ 1.
  - `encodeScreenshot(rgba: Uint8Array, width: number, height: number): Promise<{ data: string; width: number; height: number } | null>` — draws the RGBA into an `OffscreenCanvas`, tries each edge in `EDGE_LADDER`, encodes PNG with `convertToBlob({ type: "image/png" })`, returns base64 `data` for the first result with `data.length <= MAX_IMAGE_PAYLOAD_CHARS - 512` (room for the JSON wrapper), else `null`.
  - `interface CaptureDeps { copySelection(): Promise<boolean>; readText(): Promise<string | null>; readImage(): Promise<{ rgba: Uint8Array; width: number; height: number } | null>; encodeScreenshot: typeof encodeScreenshot; send(kind: ItemKind, payload: string): Promise<SendResult>; now(): number }`
  - `type CaptureOutcome = { status: "sent"; kind: ItemKind; seq: number } | { status: "nothing-copied" } | { status: "empty" } | { status: "too-large" } | { status: "error"; message: string }`
  - `sendSelection(deps: CaptureDeps): Promise<CaptureOutcome>` (`Alt+Q`): `copySelection()` false → `nothing-copied`; text null or whitespace-only → `empty`; else send as text.
  - `sendClipboard(deps: CaptureDeps): Promise<CaptureOutcome>` (`Alt+W`): non-whitespace text wins even if an image is also on the clipboard; otherwise try the image via `encodeScreenshot` (`null` → `too-large`); neither → `empty`; `send` returning `ok: false` → `error` with its message.

- [ ] **Step 1: Write failing tests.** `image.test.ts`: `fitWithin(800, 600, 1600) is unchanged`; `(3200, 1600, 1600) → 1600×800`; `(1000, 4000, 1600) → 400×1600`; `(10000, 1, 1600) → 1600×1` (never 0). `capture.test.ts` (fake deps): `sendSelection: copySelection false → nothing-copied and send is never called`; `whitespace-only selection → empty, send not called` (Review Focus 4); `text selection → send("text", payload decoding to the text)`; `sendClipboard: text and image both present → sends text`; `text null + image → encodeScreenshot then send("image", …)`; `whitespace text + image → image`; `nothing on the clipboard → empty`; `encodeScreenshot returns null → too-large, send not called`; `send fails → error with the message`.
- [ ] **Step 2:** Run `pnpm --filter desktop test`. Expected: FAIL.
- [ ] **Step 3:** Implement `image.ts` and `capture.ts`. `encodeScreenshot` has no unit test (canvas); it is covered by Task 8's manual check.
- [ ] **Step 4:** Run `pnpm --filter desktop test` and `typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(desktop): screenshot encoding and send orchestration`.

---

### Task 8: Desktop Rust mask command, hotkeys, settings UI

**Files:**
- Modify: `apps/desktop/src-tauri/src/selection.rs`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/capabilities/default.json`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/hotkeys.ts`

**Interfaces:**
- Consumes: Tasks 6–7, existing `copy_selection`.
- Produces:
  - Rust: `#[tauri::command] pub fn mask_alt_tap() -> Result<(), String>` — if Alt is down, injects `MASK_KEY` down+up; no-op otherwise. `send_copy_and_wait` calls the same helper instead of its inline check. Registered in `lib.rs` next to `copy_selection`.
  - Permission `clipboard-manager:allow-read-image` added to `capabilities/default.json`; CSP `connect-src` in `tauri.conf.json` gains `https:` (the production CSP currently blocks `fetch` to the relay).
  - `registerHotkeys(onOutcome: (hotkey: "Alt+Q" | "Alt+W", outcome: CaptureOutcome) => void): Promise<() => Promise<void>>` in `hotkeys.ts`: builds `CaptureDeps` from `invoke("copy_selection")`, `readText`, `readImage` (`rgba()` and `size()`), `encodeScreenshot`, and `sendItem(loadSettings(localStorage))`. `Alt+W` calls `invoke("mask_alt_tap")` before `sendClipboard` (otherwise Chrome focuses its toolbar after the swallowed `W`). Returns the unregister function. If settings are missing, the outcome is `error` with a message asking for settings.
  - `App.tsx`: settings form (relay URL, room secret, Save → `validateSettings`, field errors shown inline), a status line, and a list of the last 10 outcomes. The heartbeat section from the spike is removed.

- [ ] **Step 1:** Implement the Rust command and registration; add the permission and CSP change.
- [ ] **Step 2:** Run `cargo check` in `apps/desktop/src-tauri`. Expected: `Finished`, no warnings.
- [ ] **Step 3:** Implement `hotkeys.ts` and the `App.tsx` changes.
- [ ] **Step 4:** Run `pnpm --filter desktop test` and `pnpm --filter desktop typecheck`. Expected: PASS.
- [ ] **Step 5:** Manual check (needs a reachable relay: `wrangler dev` with `relayUrl` `http://localhost:8787`, or the deployed one from Task 9). In Chrome select text, press `Alt+Q`: status shows sent, and the Chrome toolbar does not light up. Press `Win+Shift+S`, capture a region, press `Alt+W`: status shows sent with kind image, and the toolbar does not light up. With nothing selected, `Alt+Q` shows nothing-copied. After restarting the app the settings are still filled in.
- [ ] **Step 6:** Commit `feat(desktop): Alt+Q/Alt+W send to relay, settings UI, mask command`.

---

### Task 9: Deploy, end-to-end verification, docs

**Files:**
- Create: `scripts/new-room-secret.mjs`
- Modify: `package.json` (root, add `deploy` script), `README.md`, `pc-to-ipad-text-tool-plan.md`

**Interfaces:**
- Produces: `node scripts/new-room-secret.mjs` prints one 32-character lowercase hex string (16 bytes from `crypto.getRandomValues`). Root script `deploy`: `pnpm --filter @pc-to-ipad/pwa build && pnpm --filter @pc-to-ipad/relay deploy`.

- [ ] **Step 1:** Create the script and the root `deploy` script. Run `node scripts/new-room-secret.mjs`. Expected: output matches `^[0-9a-f]{32}$`.
- [ ] **Step 2 (needs the user):** The user runs `pnpm --filter @pc-to-ipad/relay exec wrangler login` and approves in the browser, with a free Cloudflare account. The executor cannot do this step.
- [ ] **Step 3:** Run `pnpm deploy`. Expected: wrangler prints a `https://pc-to-ipad.<subdomain>.workers.dev` URL. Record it in `README.md`.
- [ ] **Step 4: End-to-end checks** (record pass/fail for each):
  1. iPad Safari opens `https://<url>/#<secret>`: status "online"; add to home screen; the home-screen app opens (asks for the secret if storage is empty).
  2. Desktop settings filled with the URL and secret. Select text in Chrome, `Alt+Q`: card appears on the iPad within about 2 s.
  3. `Win+Shift+S` then `Alt+W`: image card appears; tap it, paste into GoodNotes: the image pastes.
  4. Long-press the image card and drag it into GoodNotes; long-press text on a text card, select, and drag the selection into GoodNotes. **Record the result of both: it settles the plan §6.3 drag question.**
  5. Send the iPad app to the background for 2 minutes, send two items, return: both appear.
  6. iPad airplane mode on, then off: status goes offline then online, and items sent meanwhile appear.
  7. Press `Alt+Q` 25 times quickly (a selection each time): some responses are "rate limited", nothing breaks.
  8. Send the same text twice: two cards (distinct ids), no duplicate of a single send.
- [ ] **Step 5:** Update `pc-to-ipad-text-tool-plan.md`: §3.2 images are now in scope (text and screenshots, still no files); §5 and §6.2 desktop sends by HTTP POST and WebSocket is receive-only, add the `items`/`history`/`ws` routes, the limits and CORS; §6.3 record the drag result from step 4; bump the version to v0.4. Update `README.md` with the deploy and setup steps.
- [ ] **Step 6:** Commit `docs: stage 1 deploy notes and plan v0.4`.
