import type { ServerMessage, StoredItem } from "@pc-to-ipad/protocol";
import { reconnectDelayMs } from "./backoff";
import { historyQuery } from "./history";

export type ConnectionStatus = "connecting" | "online" | "offline";

export interface FeedClientOptions {
  secret: string;
  onItems(items: StoredItem[]): void;
  onStatus(status: ConnectionStatus): void;
}

const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;

export function startFeedClient(options: FeedClientOptions): { stop(): void } {
  const { secret, onItems, onStatus } = options;
  const roomPath = `/room/${secret}`;
  const wsUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${roomPath}/ws`;

  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let lastSeq = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;

  function deliver(items: StoredItem[]): void {
    for (const item of items) lastSeq = Math.max(lastSeq, item.seq);
    onItems(items);
  }

  async function syncHistory(): Promise<void> {
    try {
      const res = await fetch(`${roomPath}/history?${historyQuery(lastSeq)}`);
      if (!res.ok) return;
      const body = (await res.json()) as { items: StoredItem[] };
      if (body.items.length > 0) deliver(body.items);
    } catch {
      // Offline: the next reconnect syncs again.
    }
  }

  // A socket that went quiet in the background looks open; a missing pong tells us.
  function probe(ws: WebSocket): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send("ping");
    clearTimeout(pongTimer);
    pongTimer = setTimeout(() => ws.close(), PONG_TIMEOUT_MS);
  }

  function stopHeartbeat(): void {
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
  }

  function connect(): void {
    if (stopped) return;
    onStatus("connecting");
    const ws = new WebSocket(wsUrl);
    socket = ws;

    ws.addEventListener("open", () => {
      attempt = 0;
      onStatus("online");
      void syncHistory();
      stopHeartbeat();
      pingTimer = setInterval(() => probe(ws), PING_INTERVAL_MS);
    });
    ws.addEventListener("message", (event) => {
      if (event.data === "pong") {
        clearTimeout(pongTimer);
        return;
      }
      try {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === "item") deliver([message.item]);
      } catch {
        // Ignore anything that is not a ServerMessage.
      }
    });
    ws.addEventListener("close", () => {
      if (socket !== ws || stopped) return;
      stopHeartbeat();
      onStatus("offline");
      retryTimer = setTimeout(connect, reconnectDelayMs(attempt++));
    });
    ws.addEventListener("error", () => ws.close());
  }

  function onVisibilityChange(): void {
    if (document.visibilityState !== "visible" || stopped) return;
    const state = socket?.readyState;
    if (state === WebSocket.OPEN && socket) {
      probe(socket);
    } else if (state !== WebSocket.CONNECTING) {
      clearTimeout(retryTimer);
      connect();
    }
    void syncHistory();
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  connect();

  return {
    stop() {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearTimeout(retryTimer);
      stopHeartbeat();
      socket?.close();
    },
  };
}
