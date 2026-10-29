import { useEffect, useRef, useState } from "preact/hooks";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import "./App.css";

const HOTKEY = "Alt+Q";
const HEARTBEAT_MS = 1000;
// A gap this much longer than the interval means the webview was throttled.
const GAP_THRESHOLD_MS = 3000;

interface Capture {
  at: number;
  text: string;
}

interface Gap {
  at: number;
  ms: number;
}

function App() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [hotkeyStatus, setHotkeyStatus] = useState("registering...");
  const [lastResult, setLastResult] = useState("");
  const [ticks, setTicks] = useState(0);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const lastTick = useRef(Date.now());

  // Spike check 1: Alt+Q reads the clipboard.
  useEffect(() => {
    register(HOTKEY, async (event) => {
      if (event.state !== "Pressed") return;
      try {
        // Rust sends Ctrl+C to the foreground app and waits for the clipboard to change.
        const copied = await invoke<boolean>("copy_selection");
        if (!copied) {
          setLastResult("Nothing copied (no selection?)");
          return;
        }
        const text = await readText();
        setCaptures((prev) => [{ at: Date.now(), text }, ...prev]);
        setLastResult("OK");
      } catch (e) {
        setLastResult(`Error: ${e}`);
      }
    })
      .then(() => setHotkeyStatus(`${HOTKEY} registered`))
      .catch((e) => setHotkeyStatus(`failed: ${e}`));
    return () => {
      unregister(HOTKEY).catch(() => {});
    };
  }, []);

  // Spike check 2: the frontend keeps running while the window is hidden to the tray.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const gap = now - lastTick.current;
      lastTick.current = now;
      setTicks((n) => n + 1);
      if (gap > GAP_THRESHOLD_MS) {
        setGaps((prev) => [{ at: now, ms: gap }, ...prev]);
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <main class="container">
      <h1>pc-to-ipad spike</h1>

      <section>
        <h2>1. Hotkey &rarr; clipboard</h2>
        <p>Status: {hotkeyStatus}</p>
        <p>Select some text in any app, then press {HOTKEY}.</p>
        <p>Last result: {lastResult || "-"}</p>
        <ul>
          {captures.map((c) => (
            <li key={c.at}>
              <small>{new Date(c.at).toLocaleTimeString()}</small>
              <pre>{c.text}</pre>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>2. Hidden-window heartbeat</h2>
        <p>
          Ticks: {ticks} (every {HEARTBEAT_MS} ms). Close the window to hide it to the tray, wait
          a minute, reopen from the tray menu. Throttling shows up as gaps below.
        </p>
        <p>Gaps over {GAP_THRESHOLD_MS} ms: {gaps.length}</p>
        <ul>
          {gaps.map((g) => (
            <li key={g.at}>
              {new Date(g.at).toLocaleTimeString()}: {(g.ms / 1000).toFixed(1)} s
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export default App;
