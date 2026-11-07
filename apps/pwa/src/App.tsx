import { useEffect, useState } from "preact/hooks";
import { deriveKeys, encodePairingCode, type DerivedKeys } from "@hopnote/crypto";
import { Card } from "./components/Card";
import { Setup } from "./components/Setup";
import { startFeedClient, type ConnectionStatus } from "./client";
import { copyText } from "./clipboard";
import { emptyFeed, mergeItems, type FeedState } from "./feed";
import { noticeText, type Notice } from "./notice";
import { openItems, type DisplayItem } from "./open-feed";
import {
  clearKey,
  confirmFingerprint,
  discardLegacySecret,
  isFingerprintConfirmed,
  loadKey,
  parseKeyFromHash,
  saveKey,
} from "./pairing";
import { takeUnseen } from "./seen";
import { isStandaloneMode } from "./standalone";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "連線中",
  online: "已連線",
  offline: "離線",
  unauthorized: "金鑰不符，請重新配對",
  retired: "電腦端已更換金鑰，請重新配對",
};

const NO_NOTICE: Notice = { undecryptable: 0, stale: 0, future: 0 };

interface Start {
  master: Uint8Array | null;
  upgraded: boolean;
  badLink: boolean;
}

function readStart(): Start {
  const hadHash = location.hash.length > 1;
  try {
    const upgraded = discardLegacySecret(localStorage);
    const fromHash = parseKeyFromHash(location.hash);
    if (hadHash) history.replaceState(null, "", location.pathname);
    if (fromHash) {
      saveKey(localStorage, fromHash);
      return { master: fromHash, upgraded, badLink: false };
    }
    return { master: loadKey(localStorage), upgraded, badLink: hadHash };
  } catch {
    // Storage can be blocked; use whatever the link carried for this session only.
    return { master: parseKeyFromHash(location.hash), upgraded: false, badLink: false };
  }
}

export function App() {
  const [start] = useState(readStart);
  const [master, setMaster] = useState<Uint8Array | null>(start.master);
  const [keys, setKeys] = useState<DerivedKeys | null>(null);
  const [feed, setFeed] = useState<FeedState<DisplayItem>>(emptyFeed);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [notice, setNotice] = useState<Notice>(NO_NOTICE);
  const [confirmed, setConfirmed] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!master) {
      setKeys(null);
      return;
    }
    let cancelled = false;
    void deriveKeys(master).then((derived) => {
      if (cancelled) return;
      setKeys(derived);
      try {
        setConfirmed(isFingerprintConfirmed(localStorage, derived.fingerprint));
      } catch {
        setConfirmed(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [master]);

  useEffect(() => {
    if (!keys) return;
    // Everything this effect starts belongs to this key; once it is replaced, late results are dropped
    // (item numbers from different rooms collide, so they must never meet in one feed).
    let active = true;
    const seen = new Set<string>();
    setFeed(emptyFeed);
    setNotice(NO_NOTICE);
    setStatus("connecting");
    const client = startFeedClient({
      roomId: keys.roomId,
      authToken: keys.authToken,
      onItems: (items) => {
        const fresh = takeUnseen(seen, items);
        if (fresh.length === 0) return;
        void openItems(keys, fresh, Date.now()).then((result) => {
          if (!active) return;
          setFeed((current) => mergeItems(current, result.shown));
          setNotice((n) => ({
            undecryptable: n.undecryptable + result.undecryptable,
            stale: n.stale + result.stale,
            future: n.future + result.future,
          }));
        });
      },
      onStatus: (next) => {
        if (active) setStatus(next);
      },
    });
    return () => {
      active = false;
      client.stop();
    };
  }, [keys]);

  function pair(next: Uint8Array): void {
    try {
      saveKey(localStorage, next);
    } catch {
      // Not persisted; the next launch asks again.
    }
    setMaster(next);
  }

  function repair(): void {
    try {
      clearKey(localStorage);
    } catch {
      // Storage blocked: nothing was persisted anyway.
    }
    setMaster(null);
    setFeed(emptyFeed);
  }

  function confirm(): void {
    if (!keys) return;
    try {
      confirmFingerprint(localStorage, keys.fingerprint);
    } catch {
      // Not persisted; the banner shows again next launch.
    }
    setConfirmed(true);
  }

  async function copyCode(): Promise<void> {
    if (!master) return;
    try {
      await copyText(encodePairingCode(master));
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1500);
    } catch {
      // Clipboard access denied.
    }
  }

  if (!master) {
    const message = start.badLink
      ? "連結裡的配對碼無效，請重新掃描或貼上配對碼。"
      : start.upgraded
        ? "Hopnote 已升級為加密版，請重新配對。"
        : undefined;
    return <Setup onKey={pair} notice={message} standalone={isStandaloneMode(window)} />;
  }

  const noticeLine = noticeText(notice);

  return (
    <main>
      <header>
        <h1>Hopnote</h1>
        <span class={`status ${status}`}>{STATUS_LABEL[status]}</span>
        {/* Always reachable: a home-screen app has no camera flow, so the code is moved by paste. */}
        <details class="menu">
          <summary aria-label="更多選項">⋯</summary>
          <div class="menu-items">
            <button type="button" class="menu-item" onClick={copyCode}>
              {copiedCode ? "已複製" : "複製配對碼"}
            </button>
            <button type="button" class="menu-item danger" onClick={repair}>
              重新配對
            </button>
          </div>
        </details>
      </header>

      {keys && !confirmed && (
        <section class="banner">
          <p>
            指紋 <strong>{keys.fingerprint}</strong>，請確認和電腦端畫面上的一樣。
          </p>
          <p class="hint">配對後建議到 Safari 清除這筆歷史記錄，連結裡含有金鑰。</p>
          <button type="button" onClick={confirm}>
            與電腦端一致
          </button>
        </section>
      )}

      {noticeLine && <p class="notice">{noticeLine}</p>}
      {feed.items.length === 0 && <p class="empty">還沒有內容。在電腦上選取文字後按 Alt+Q。</p>}
      <ul>
        {feed.items.map((item) => (
          <li key={item.seq}>
            <Card item={item} />
          </li>
        ))}
      </ul>
    </main>
  );
}
