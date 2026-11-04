import { useState } from "preact/hooks";
import { normalizeSecretInput } from "../room-secret";

export function Setup({ onSecret }: { onSecret(secret: string): void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function submit(event: Event): void {
    event.preventDefault();
    const secret = normalizeSecretInput(value);
    if (secret) {
      onSecret(secret);
    } else {
      setError("房間密碼應為 32 個英數字元（0-9、a-f）");
    }
  }

  return (
    <main class="setup">
      <h1>Hopnote</h1>
      <p>貼上房間密碼，或用電腦端給的連結開啟。</p>
      <form onSubmit={submit}>
        <input
          value={value}
          onInput={(event) => setValue((event.target as HTMLInputElement).value)}
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          placeholder="房間密碼"
        />
        <button type="submit">儲存</button>
      </form>
      {error && <p class="error">{error}</p>}
    </main>
  );
}
