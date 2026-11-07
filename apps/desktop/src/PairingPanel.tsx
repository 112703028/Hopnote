import { useEffect, useState } from "preact/hooks";
import {
  buildPairingLink,
  deriveKeys,
  encodePairingCode,
  generateMasterKey,
  parsePairingCode,
} from "@hopnote/crypto";
import { pairingQrDataUrl } from "./qr";

const CONFIRM_NEW_KEY =
  "產生新金鑰會讓所有已配對的裝置失效（會通知中繼伺服器作廢舊房間），需要重新配對。繼續？";

// The QR code and the link are the key itself, so they are shown on request and hide again.
const REVEAL_MS = 60_000;

export function PairingPanel({
  relayUrl,
  keyCode,
  note,
  onKeyChange,
}: {
  /** The saved relay URL, or null until one is saved. */
  relayUrl: string | null;
  /** The pairing code, or null before the first pairing. */
  keyCode: string | null;
  /** What happened to the old room after a new key was made. */
  note: string | null;
  onKeyChange(code: string): void;
}) {
  const [fingerprint, setFingerprint] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const master = keyCode ? parsePairingCode(keyCode) : null;

  useEffect(() => {
    if (!master) {
      setFingerprint("");
      return;
    }
    let cancelled = false;
    void deriveKeys(master).then((keys) => {
      if (!cancelled) setFingerprint(keys.fingerprint);
    });
    return () => {
      cancelled = true;
    };
  }, [keyCode]);

  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [revealed]);

  function generate(): void {
    onKeyChange(encodePairingCode(generateMasterKey()));
    setRevealed(true);
  }

  function generateNew(): void {
    if (window.confirm(CONFIRM_NEW_KEY)) generate();
  }

  async function copyCode(): Promise<void> {
    if (!keyCode) return;
    try {
      await navigator.clipboard.writeText(keyCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied.
    }
  }

  if (!relayUrl) {
    return (
      <section>
        <h2>配對 iPad</h2>
        <p>請先儲存中繼網址。</p>
      </section>
    );
  }

  if (!master) {
    return (
      <section>
        <h2>配對 iPad</h2>
        <p>產生一把只有你的裝置知道的金鑰，再用 iPad 掃描。</p>
        <button type="button" onClick={generate}>
          產生金鑰並配對
        </button>
        {note && <p class="notice">{note}</p>}
      </section>
    );
  }

  const link = buildPairingLink(relayUrl, master);
  return (
    <section>
      <h2>配對 iPad</h2>
      <p>
        指紋 <strong>{fingerprint}</strong>
      </p>
      {note && <p class="notice">{note}</p>}
      {revealed ? (
        <>
          <p>用 iPad 的相機掃描，在 Safari 打開，再核對指紋。這個畫面含有金鑰，一分鐘後自動隱藏。</p>
          <img class="qr" src={pairingQrDataUrl(link)} width={240} height={240} alt="配對 QR code" />
          <label>
            配對連結
            <input
              value={link}
              readOnly
              spellcheck={false}
              onFocus={(e) => (e.target as HTMLInputElement).select()}
            />
          </label>
        </>
      ) : (
        <p>QR code 和連結含有金鑰，需要配對新裝置時再顯示。</p>
      )}
      <div class="row">
        <button type="button" onClick={() => setRevealed(!revealed)}>
          {revealed ? "隱藏 QR code" : "顯示 QR code"}
        </button>
        <button type="button" class="secondary" onClick={copyCode}>
          {copied ? "已複製" : "複製配對碼"}
        </button>
        <button type="button" class="danger" onClick={generateNew}>
          產生新金鑰
        </button>
      </div>
    </section>
  );
}
