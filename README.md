# Hopnote

Send selected text and screenshots from Windows to an iPad notes sidebar, end-to-end encrypted.

You read a paper on your PC, select a sentence, press `Alt+Q`, and it shows up as a card on the iPad next to your
handwritten notes. Tap the card to copy it, or drag it into GoodNotes.

- Full plan and decisions: [pc-to-ipad-text-tool-plan.md](pc-to-ipad-text-tool-plan.md)
- Design of the encryption: [docs/superpowers/specs/2026-11-04-e2e-encryption-design.md](docs/superpowers/specs/2026-11-04-e2e-encryption-design.md)

## Status

Stages 1 and 2 of the plan are built and deployed. Stages 3 and 4 have not been started.

| Area | State |
|---|---|
| Send selected text (`Alt+Q`) and clipboard text or a screenshot (`Alt+W`) | Works |
| End-to-end encryption (XChaCha20-Poly1305), key derivation, tamper and replay checks | Works, covered by tests |
| Pairing by QR code: in-app scanner, Camera app, or pasting the code; fingerprint check | Works |
| New key retires the old room and tells paired devices to pair again | Works |
| iPad web app: live push, catch-up after the app was in the background, reconnect, tap to copy | Works |
| Relay on Cloudflare: token auth, rate limit, 7-day retention | Works, deployed |
| Dragging a card into GoodNotes | Does not work (tested on an iPad, 2026-11). Tap a card to copy it, then paste |
| Custom hotkeys | Not yet: the hotkeys are fixed to `Alt+Q` and `Alt+W` |
| Start at login, pause and resume from the tray menu | Not yet |
| Show which window a snippet came from | Not yet |
| Skip clipboards from password managers | Not yet |
| Double `Ctrl+C` mode | Not yet |
| Cleaning PDF text (line breaks, hyphens, two columns) and measuring it | Not yet (stage 3) |
| CI, latency numbers, screenshots and a demo GIF | Not yet (stage 4) |

Automated checks: 239 tests (protocol 25, crypto 56, desktop 53, pwa 55, relay 50) and the type check pass.
The parts that need real hardware (hotkeys in other apps, the QR scanner, installing to the Home Screen) are checked by hand.

## How it works

- `Alt+Q`: copies the current selection and sends it as text.
- `Win+Shift+S` (Windows snipping), then `Alt+W`: sends what is on the clipboard (text or image).
- The iPad web app shows cards, newest first. Tap a card to copy it, then paste it into GoodNotes (dragging into GoodNotes
  does not work).
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
docs/superpowers/  design documents and implementation plans
```

## Develop

Needs Node 22+, pnpm, Rust (MSVC toolchain), Visual Studio C++ build tools, WebView2.

```
pnpm install
pnpm test          # all packages
pnpm typecheck
pnpm --filter desktop tauri dev
```

The desktop app is not deployed anywhere: it runs on your PC. Only the relay and the iPad web app go to Cloudflare.

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

Use `pnpm run deploy`, not `pnpm deploy`: the second one is a different built-in pnpm command that only happens to work here.
Deploying replaces the code, not the data: paired devices keep working.
`wrangler deployments list` shows the versions, and `wrangler rollback <version-id>` goes back to an earlier one.

## Pair an iPad

1. Desktop app: paste your Worker URL (only the address, no path and no `#`), Save.
2. Click **產生金鑰並配對**. A short fingerprint and a QR code appear. The QR code contains the key, so it hides itself
   after a minute; **顯示 QR code** brings it back.
3. iPad: open Hopnote (in Safari or from the Home Screen) and tap **掃描 QR code**, then point the camera at the desktop
   screen. The page stores the key and shows its fingerprint. You can also scan with the **Camera app** and open the link in
   Safari.
4. Compare the two fingerprints, tap **與電腦端一致**.
5. Add the page to the Home Screen if you like. A home-screen app may not share Safari's storage, so pair it on its own:
   open it and tap **掃描 QR code** again. If the camera is not allowed or not available, open Hopnote in Safari, tap
   **複製配對碼** (always in the header) and paste it into the home-screen app. The code is the key: move it only through your
   own devices, not through a chat app.
6. The pairing link contains the key and may stay in Safari's History. Clear that entry after pairing (Settings > Safari >
   Clear History, or delete the single entry).

To add another iPad, click **顯示 QR code** again. To disconnect every device (for example a lost iPad), click
**產生新金鑰** on the PC: it creates a new key, which is a new room, and tells the relay to retire the old room. Connected
devices then show "電腦端已更換金鑰，請重新配對" and the old items are deleted at once. If the PC cannot reach the relay at that
moment, the panel says so: the old devices keep their old content and the old room expires in 7 days.

## Troubleshooting

| What you see | Why, and what to do |
|---|---|
| The iPad shows an old screen, or there is no scan button | You are probably on an old URL or an old Home Screen icon, which never updates. Delete the icon, open your current Worker URL in Safari, and add it again. If the URL is right, close the app completely and open it twice: the new version downloads in the background first |
| 「金鑰不符，請重新配對」 | The iPad's key is not the one this room uses. Pair again |
| 「電腦端已更換金鑰，請重新配對」 | The PC made a new key. Pair again |
| The status stays on "離線" or "連線中" | Check the network. The app retries by itself and catches up when it is back in front |
| `Alt+Q` does nothing, or the window shows 「失敗：…」 | Read the message in the window. A hotkey may already be taken by another app. The app in front may run as administrator, and Windows does not let another program send keys to it |
| Chrome's toolbar lights up after `Alt+Q` | The app sends a harmless key while Alt is held to prevent this. A very quick tap of Alt can still be too early for it |
| The camera does not open on the iPad | Allow it in iPad Settings, or paste the pairing code instead |
| `curl` to the Worker fails with a TLS error on Windows | A quirk of Windows' own curl. A browser, Node, or `wrangler` work |
| After an upgrade the Home Screen app shows "離線" | It is running a cached older version. Close it completely and open it again |

## Upgrading from the unencrypted version

The unencrypted version is gone: after the upgrade every device pairs once. Old rooms cannot be read.

## Limits

- Text up to about 65,000 Chinese characters; screenshots are shrunk until the PNG is at most about 1.1 MB.
- Tables copied from a PDF arrive as plain lines: a PDF has no real table structure, so the columns are lost. For tables,
  take a screenshot (`Win+Shift+S`, then `Alt+W`).
- The relay keeps the latest 100 text items and 20 images for 7 days, and accepts 20 items per 10 seconds per room.
- No forward secrecy: if the key leaks, items still stored can be read. Keys sit unencrypted in browser storage.
- The relay sees metadata: when you send, how large it is, text or image, and how often.
- Windows and an iPad only. No macOS, Linux, Android, or native iOS app, and nothing flows from the iPad back to the PC.

## What is next

Stage 3 of the plan: clean up text copied from PDFs (broken lines, hyphenated words, two-column pages) before it is
encrypted, measure how well that works on a set of arXiv papers, and add the double `Ctrl+C` mode. Stage 4: CI,
latency measurements, screenshots, and trials with classmates. Details are in the plan.

## Acknowledgements

The security model (pairing, fingerprint check, using libsodium rather than home-made cryptography, an explicit threat
model) follows the ideas of [Clipp](https://github.com/martona/clipp) (MIT). Hopnote shares no code with it: Clipp has no
server, while Hopnote treats its relay as an untrusted third party.
