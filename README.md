# Hopnote

Send selected text and screenshots from Windows to an iPad notes sidebar.
Full plan: [pc-to-ipad-text-tool-plan.md](pc-to-ipad-text-tool-plan.md). Stage 1 implementation plan:
[docs/superpowers/plans/2026-10-29-stage1-relay-pwa-desktop.md](docs/superpowers/plans/2026-10-29-stage1-relay-pwa-desktop.md).

**Stage 1 is not encrypted.** The relay sees everything you send. Do not send passwords or private content yet.

## How it works

- `Alt+Q`: copies the current selection and sends it as text.
- `Win+Shift+S` (Windows snipping), then `Alt+W`: sends what is on the clipboard (text or image).
- The iPad web app shows cards, newest first. Tap a card to copy it; long-press to select text or drag an image into GoodNotes.

## Layout

```
apps/desktop/      Windows tray app (Tauri v2: Rust + Preact/TypeScript)
apps/relay/        Cloudflare Worker + Durable Object (one SQLite-backed room per secret)
apps/pwa/          iPad web app (Vite + Preact), served by the same Worker
packages/protocol/ shared types, limits, validation
scripts/           new-room-secret.mjs
```

## Develop

Needs Node 22+, pnpm, Rust (MSVC toolchain), Visual Studio C++ build tools, WebView2.

```
pnpm install
pnpm test          # all packages
pnpm typecheck
pnpm --filter desktop tauri dev
```

Run the relay and web app locally:

```
pnpm --filter @hopnote/pwa build
cd apps/relay && pnpm exec wrangler dev     # http://localhost:8787
```

## Deploy and set up

1. Create a free Cloudflare account, then `cd apps/relay && pnpm exec wrangler login`.
2. `pnpm run deploy` builds the web app and deploys the Worker. Note the `https://hopnote.<subdomain>.workers.dev` URL.
3. `pnpm new-room-secret` prints a 32-character room secret. Treat it like a password.
4. Desktop app: open the window, fill in the relay URL and the room secret, Save.
5. iPad Safari: open `https://<your-worker-url>/#<room-secret>`, then Share > Add to Home Screen.
   If the home-screen app asks for the secret, paste it once.
