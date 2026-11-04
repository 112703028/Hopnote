import { useEffect, useState } from "preact/hooks";
import type { CaptureOutcome } from "./capture";
import { registerHotkeys, type Hotkey } from "./hotkeys";
import { loadSettings, saveSettings, validateSettings, type SettingsErrors } from "./settings";
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

function App() {
  const initial = loadSettings(localStorage);
  const [relayUrl, setRelayUrl] = useState(initial?.relayUrl ?? "");
  const [roomSecret, setRoomSecret] = useState(initial?.roomSecret ?? "");
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [saved, setSaved] = useState(initial !== null);
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

  function save(event: Event): void {
    event.preventDefault();
    const result = validateSettings({ relayUrl, roomSecret });
    if (!result.ok) {
      setErrors(result.errors);
      setSaved(false);
      return;
    }
    saveSettings(localStorage, result.settings);
    setRelayUrl(result.settings.relayUrl);
    setRoomSecret(result.settings.roomSecret);
    setErrors({});
    setSaved(true);
  }

  return (
    <main class="container">
      <h1>Hopnote</h1>

      <section>
        <h2>設定</h2>
        <form onSubmit={save}>
          <label>
            中繼網址
            <input
              value={relayUrl}
              onInput={(e) => setRelayUrl((e.target as HTMLInputElement).value)}
              placeholder="https://hopnote.xxx.workers.dev"
              spellcheck={false}
            />
          </label>
          {errors.relayUrl && <p class="error">{errors.relayUrl}</p>}
          <label>
            房間密碼
            <input
              value={roomSecret}
              onInput={(e) => setRoomSecret((e.target as HTMLInputElement).value)}
              spellcheck={false}
            />
          </label>
          {errors.roomSecret && <p class="error">{errors.roomSecret}</p>}
          <button type="submit">儲存</button>
          {saved && <span class="ok">已儲存</span>}
        </form>
      </section>

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
