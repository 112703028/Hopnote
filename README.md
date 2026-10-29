# pc-to-ipad

Send selected text from Windows to an iPad notes sidebar. See
[pc-to-ipad-text-tool-plan.md](pc-to-ipad-text-tool-plan.md) for the full plan.

## Layout

```
apps/desktop/     Windows tray app (Tauri v2: Rust backend + Preact/TypeScript frontend)
packages/         (planned) shared protocol + crypto, text cleaner
```

`apps/pwa` (iPad web app) and the Cloudflare relay are not created yet.

## Prerequisites (Windows)

- Node + pnpm
- Rust (https://rustup.rs) with the MSVC toolchain
- Visual Studio C++ build tools, WebView2 (preinstalled on Windows 11)

## Run the stage-0 spike

```
pnpm install
cd apps/desktop
pnpm tauri dev
```

Checks:
1. Copy some text anywhere, press `Alt+Q`: it appears in the window.
2. Close the window (hides to tray), wait about a minute, reopen from the tray menu:
   the "gaps" list should be empty. Gaps mean the hidden webview was throttled.
3. Tray menu "結束" exits the app.
