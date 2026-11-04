import { useState } from "preact/hooks";
import { parsePairingCode } from "@hopnote/crypto";

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

  function submit(event: Event): void {
    event.preventDefault();
    const master = parsePairingCode(value);
    if (master) {
      onKey(master);
    } else {
      setError("配對碼格式不正確，請重新複製");
    }
  }

  return (
    <main class="setup">
      <h1>Hopnote</h1>
      {notice && <p class="notice">{notice}</p>}
      {standalone ? (
        <p>
          這是主畫面 app，沒辦法直接掃描。請先在 Safari 打開電腦端 QR code 的連結完成配對，在那裡按「複製配對碼」，再回到這裡貼上。
        </p>
      ) : (
        <p>用電腦端畫面上的 QR code 配對：用 iPad 的相機掃描並在 Safari 打開，或貼上配對碼。</p>
      )}
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
