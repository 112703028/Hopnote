# Hopnote

Send selected text and screenshots from Windows to an iPad notes sidebar, end-to-end encrypted.
Full plan: [pc-to-ipad-text-tool-plan.md](pc-to-ipad-text-tool-plan.md). Design of the encryption:
[docs/superpowers/specs/2026-11-04-e2e-encryption-design.md](docs/superpowers/specs/2026-11-04-e2e-encryption-design.md).

## How it works

- `Alt+Q`: copies the current selection and sends it as text.
- `Win+Shift+S` (Windows snipping), then `Alt+W`: sends what is on the clipboard (text or image).
- The iPad web app shows cards, newest first. Tap a card to copy it; long-press to select text or drag an image into GoodNotes.
- Everything is encrypted on the PC and decrypted on the iPad. The relay (a Cloudflare Worker) only stores ciphertext and
  only answers someone who holds the key. It can still see when you send, how large it is, and whether it is text or an image.

## Everyone deploys their own copy

The same Worker stores the ciphertext and serves the iPad web app, so **whoever can deploy that Worker can change the
page** and could make it leak the key. Hopnote therefore assumes you run your own deployment and nobody uses someone
else's. If you want to try it, deploy your own (below); do not point it at a Worker you do not control.

## Layout

```
apps/desktop/      Windows tray app (Tauri v2: Rust + Preact/TypeScript)
apps/relay/        Cloudflare Worker + Durable Object (one SQLite-backed room per key)
apps/pwa/          iPad web app (Vite + Preact), served by the same Worker
packages/crypto/   pairing codes, key derivation, sealing, frames
packages/protocol/ shared types, limits, validation
scripts/           helper scripts
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

## Deploy your own copy

1. Create a free Cloudflare account and **turn on two-factor authentication** for it: taking over the account is the one way
   to ship a malicious page to your own devices.
2. `cd apps/relay && pnpm exec wrangler login`, approve in the browser.
3. `pnpm run deploy` builds the web app and deploys the Worker. Note the `https://hopnote.<subdomain>.workers.dev` URL.

## Pair an iPad

1. Desktop app: paste your Worker URL (only the address, no path and no `#`), Save.
2. Click **產生金鑰並配對**. A QR code and a short fingerprint appear.
3. iPad: scan the QR code with the **Camera app** and open the link in Safari. The page stores the key and shows its fingerprint.
4. Compare the two fingerprints, tap **與電腦端一致**.
5. Add the page to the Home Screen if you like. A home-screen app may not share Safari's storage: if it asks for a code, tap
   **複製配對碼** in Safari, then paste it into the home-screen app (or copy the code from the desktop panel).
6. The pairing link contains the key and may stay in Safari's History. Clear that entry after pairing (Settings > Safari >
   Clear History, or delete the single entry).

To add another iPad, show the same QR code again. To disconnect every device (for example a lost iPad), click
**產生新金鑰** on the PC: it creates a new key, which is a new room, and the old one expires in 7 days.

## Upgrading from the unencrypted version

The unencrypted version is gone: after the upgrade every device pairs once. Old rooms cannot be read.

## Limits

- Text up to about 65,000 Chinese characters; screenshots are shrunk until the PNG is at most about 1.1 MB.
- The relay keeps the latest 100 text items and 20 images for 7 days.
- No forward secrecy: if the key leaks, items still stored can be read. Keys sit unencrypted in browser storage.
