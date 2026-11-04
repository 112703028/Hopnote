import { useEffect, useState } from "preact/hooks";
import { Card } from "./components/Card";
import { Setup } from "./components/Setup";
import { startFeedClient, type ConnectionStatus } from "./client";
import { emptyFeed, mergeItems, type FeedState } from "./feed";
import { loadSecret, parseSecretFromHash, saveSecret } from "./room-secret";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "連線中",
  online: "已連線",
  offline: "離線",
};

function initialSecret(): string | null {
  try {
    const fromHash = parseSecretFromHash(location.hash);
    if (fromHash) {
      saveSecret(localStorage, fromHash);
      history.replaceState(null, "", location.pathname);
      return fromHash;
    }
    return loadSecret(localStorage);
  } catch {
    // Storage can be blocked; fall back to whatever the link carried.
    return parseSecretFromHash(location.hash);
  }
}

export function App() {
  const [secret, setSecret] = useState<string | null>(initialSecret);
  const [feed, setFeed] = useState<FeedState>(emptyFeed);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    if (!secret) return;
    const client = startFeedClient({
      secret,
      onItems: (items) => setFeed((current) => mergeItems(current, items)),
      onStatus: setStatus,
    });
    return () => client.stop();
  }, [secret]);

  if (!secret) {
    return (
      <Setup
        onSecret={(value) => {
          try {
            saveSecret(localStorage, value);
          } catch {
            // Not persisted; the next launch asks again.
          }
          setSecret(value);
        }}
      />
    );
  }

  return (
    <main>
      <header>
        <h1>Hopnote</h1>
        <span class={`status ${status}`}>{STATUS_LABEL[status]}</span>
      </header>
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
