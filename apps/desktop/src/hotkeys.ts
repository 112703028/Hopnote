import { invoke } from "@tauri-apps/api/core";
import { readImage, readText } from "@tauri-apps/plugin-clipboard-manager";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { sendClipboard, sendSelection, type CaptureDeps, type CaptureOutcome } from "./capture";
import { encodeScreenshot } from "./image";
import { sendItem } from "./relay";
import { loadSettings } from "./settings";

export type Hotkey = "Alt+Q" | "Alt+W";

// The plugin throws when the clipboard holds no text / no image.
async function readClipboardText(): Promise<string | null> {
  try {
    return await readText();
  } catch {
    return null;
  }
}

async function readClipboardImage(): Promise<{ rgba: Uint8Array; width: number; height: number } | null> {
  try {
    const image = await readImage();
    try {
      const { width, height } = await image.size();
      return { rgba: await image.rgba(), width, height };
    } finally {
      await image.close();
    }
  } catch {
    return null;
  }
}

const deps: CaptureDeps = {
  copySelection: () => invoke<boolean>("copy_selection"),
  readText: readClipboardText,
  readImage: readClipboardImage,
  encodeScreenshot,
  send: async (kind, payload) => {
    const settings = loadSettings(localStorage);
    if (!settings) return { ok: false, error: "請先填寫中繼網址與房間密碼" };
    return sendItem(settings, kind, payload);
  },
  now: () => Date.now(),
};

// Holding the hotkey repeats it; ignore presses while one is still running.
function guarded(run: () => Promise<void>): (event: { state: string }) => void {
  let busy = false;
  return (event) => {
    if (event.state !== "Pressed" || busy) return;
    busy = true;
    void run().finally(() => {
      busy = false;
    });
  };
}

export async function registerHotkeys(
  onOutcome: (hotkey: Hotkey, outcome: CaptureOutcome) => void,
): Promise<() => Promise<void>> {
  await register(
    "Alt+Q",
    guarded(async () => onOutcome("Alt+Q", await sendSelection(deps))),
  );
  try {
    await register(
      "Alt+W",
      guarded(async () => {
        // Stops the app in front from treating the swallowed hotkey as a lone Alt tap.
        await invoke("mask_alt_tap").catch(() => undefined);
        onOutcome("Alt+W", await sendClipboard(deps));
      }),
    );
  } catch (error) {
    await unregister("Alt+Q").catch(() => undefined);
    throw error;
  }
  return async () => {
    await unregister("Alt+Q").catch(() => undefined);
    await unregister("Alt+W").catch(() => undefined);
  };
}
