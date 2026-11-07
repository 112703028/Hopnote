import { useState } from "preact/hooks";
import { parsePairingCode } from "@hopnote/crypto";
import { Scanner } from "./Scanner";

export function Setup({
  onKey,
  notice,
  standalone,
}: {
  onKey(master: Uint8Array): void;
  /** Shown above the form, e.g. after an upgrade from the unencrypted version. */
  notice?: string;
  /** Running as a home-screen app: its storage can be separate from Safari's. */
  standalone: boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  function submit(event: Event): void {
    event.preventDefault();
    const master = parsePairingCode(value);
    if (master) {
      onKey(master);
    } else {
      setError("配對碼格式不正確，請重新複製");
    }
  }

  if (scanning) {
    return (
      <main class="setup">
        <h1>Hopnote</h1>
        <Scanner onKey={onKey} onCancel={() => setScanning(false)} />
      </main>
    );
  }

  return (
    <main class="setup">
      <h1>Hopnote</h1>
      {notice && <p class="notice">{notice}</p>}
      <p>在電腦的 Hopnote 視窗按「顯示 QR code」，再用下面的按鈕掃描。</p>
      <button type="button" class="primary" onClick={() => setScanning(true)}>
        掃描 QR code
      </button>
      <p class="hint">
        {standalone
          ? "或是先用 Safari 打開 QR code 的連結完成配對，按「複製配對碼」，再貼到這裡。"
          : "也可以用 iPad 的相機 app 掃描並在 Safari 打開，或貼上配對碼。"}
      </p>
      <form onSubmit={submit}>
        <input
          value={value}
          onInput={(event) => setValue((event.target as HTMLInputElement).value)}
          autocapitalize="off"
          autocomplete="off"
          autocorrect="off"
          spellcheck={false}
          placeholder="配對碼或連結"
        />
        <button type="submit">配對</button>
      </form>
      {error && <p class="error">{error}</p>}
    </main>
  );
}
