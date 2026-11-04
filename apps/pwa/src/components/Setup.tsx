import { useState } from "preact/hooks";
import { parsePairingCode } from "@hopnote/crypto";

export function Setup({
  onKey,
  notice,
}: {
  onKey(master: Uint8Array): void;
  /** Shown above the form, e.g. after an upgrade from the unencrypted version. */
  notice?: string;
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
      <p>用電腦端畫面上的 QR code 配對：用 iPad 的相機掃描並在 Safari 打開，或貼上配對碼。</p>
      <form onSubmit={submit}>
        <input
          value={value}
          onInput={(event) => setValue((event.target as HTMLInputElement).value)}
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          placeholder="配對碼或連結"
        />
        <button type="submit">配對</button>
      </form>
      {error && <p class="error">{error}</p>}
    </main>
  );
}
