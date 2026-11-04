import { useEffect, useState } from "preact/hooks";
import type { CaptureOutcome } from "./capture";
import { registerHotkeys, type Hotkey } from "./hotkeys";
import { PairingPanel } from "./PairingPanel";
import { rotateKey } from "./rotate";
import { loadSettings, saveSettings, validateRelayUrl, type Settings } from "./settings";
import "./App.css";

const MAX_LOG = 10;

interface LogEntry {
  at: number;
  hotkey: Hotkey;
  text: string;
}

function describe(outcome: CaptureOutcome): string {
  switch (outcome.status) {
    case "sent":
      return `已送出（${outcome.kind === "text" ? "文字" : "圖片"}，#${outcome.seq}）`;
    case "nothing-copied":
      return "沒有複製到內容（有選取文字嗎？）";
    case "empty":
      return "剪貼簿裡沒有文字或圖片";
    case "too-large":
      return "圖片縮小後仍超過上限";
    case "error":
      return `失敗：${outcome.message}`;
  }
}

function retiredNote(retired: boolean | null): string | null {
  if (retired === true) return "已通知中繼伺服器作廢舊房間，舊裝置會顯示「請重新配對」，舊內容已刪除。";
  if (retired === false) {
    return "無法通知舊房間作廢（網路問題？）。舊裝置會停在舊內容，舊房間 7 天後自動過期。";
  }
  return null;
}

function App() {
  const [settings, setSettings] = useState<Settings | null>(() => loadSettings(localStorage));
  const [relayUrl, setRelayUrl] = useState(settings?.relayUrl ?? "");
  const [relayError, setRelayError] = useState("");
  const [saved, setSaved] = useState(settings !== null);
  const [pairingNote, setPairingNote] = useState<string | null>(null);
  const [hotkeyStatus, setHotkeyStatus] = useState("註冊快捷鍵中…");
  const [log, setLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    let unregister: (() => Promise<void>) | undefined;
    registerHotkeys((hotkey, outcome) =>
      setLog((prev) => [{ at: Date.now(), hotkey, text: describe(outcome) }, ...prev].slice(0, MAX_LOG)),
    )
      .then((cleanup) => {
        if (cancelled) void cleanup();
        else {
          unregister = cleanup;
          setHotkeyStatus("Alt+Q 傳送選取的文字，Alt+W 傳送剪貼簿（文字或截圖）");
        }
      })
      .catch((error) => setHotkeyStatus(`快捷鍵註冊失敗：${error}`));
    return () => {
      cancelled = true;
      void unregister?.();
    };
  }, []);

  function persist(next: Settings): void {
    saveSettings(localStorage, next);
    setSettings(next);
  }

  function saveRelayUrl(event: Event): void {
    event.preventDefault();
    const result = validateRelayUrl(relayUrl);
    if (!result.ok) {
      setRelayError(result.error);
      setSaved(false);
      return;
    }
    // A different relay is a different room: keep the key, which decides the room.
    persist({ relayUrl: result.relayUrl, key: settings?.key ?? null });
    setRelayUrl(result.relayUrl);
    setRelayError("");
    setSaved(true);
  }

  async function changeKey(code: string): Promise<void> {
    if (!settings) return;
    const result = await rotateKey(settings, code);
    persist(result.settings);
    setPairingNote(retiredNote(result.retired));
  }

  return (
    <main class="container">
      <h1>Hopnote</h1>

      <section>
        <h2>中繼網址</h2>
        <form onSubmit={saveRelayUrl}>
          <label>
            你部署的 Worker 網址
            <input
              value={relayUrl}
              onInput={(e) => {
                setRelayUrl((e.target as HTMLInputElement).value);
                setSaved(false);
              }}
              placeholder="https://hopnote.xxx.workers.dev"
              spellcheck={false}
            />
          </label>
          {relayError && <p class="error">{relayError}</p>}
          <button type="submit">儲存</button>
          {saved && <span class="ok">已儲存</span>}
        </form>
      </section>

      <PairingPanel
        relayUrl={settings?.relayUrl ?? null}
        keyCode={settings?.key ?? null}
        note={pairingNote}
        onKeyChange={(code) => void changeKey(code)}
      />

      <section>
        <h2>快捷鍵</h2>
        <p>{hotkeyStatus}</p>
        <ul>
          {log.map((entry) => (
            <li key={entry.at}>
              <small>
                {new Date(entry.at).toLocaleTimeString()} · {entry.hotkey}
              </small>{" "}
              {entry.text}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export default App;
