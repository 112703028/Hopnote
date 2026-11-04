import type { ServerMessage, StoredItem } from "@hopnote/protocol";
import { classifyAuthStatus } from "./auth-status";
import { reconnectDelayMs } from "./backoff";
import { historyQuery } from "./history";

export type ConnectionStatus = "connecting" | "online" | "offline" | "unauthorized" | "retired";

export interface FeedClientOptions {
  roomId: string;
  authToken: string;
  onItems(items: StoredItem[]): void;
  onStatus(status: ConnectionStatus): void;
}

const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;

export function startFeedClient(options: FeedClientOptions): { stop(): void } {
  const { roomId, authToken, onItems, onStatus } = options;
  const roomPath = `/room/${roomId}`;
  const wsUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${roomPath}/ws`;
  const authHeaders = { Authorization: `Bearer ${authToken}` };

  let socket: WebSocket | null = null;
  let stopped = false;
  let rejected = false;
  let attempt = 0;
  let lastSeq = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;

  function deliver(items: StoredItem[]): void {
    for (const item of items) lastSeq = Math.max(lastSeq, item.seq);
    onItems(items);
  }

  // The relay does not accept this key (401/403), or the PC retired the room (410): stop retrying
  // and tell the user to pair again.
  function markStopped(status: "unauthorized" | "retired"): void {
    rejected = true;
    clearTimeout(retryTimer);
    stopHeartbeat();
    onStatus(status);
    socket?.close();
  }

  function stopIfRejected(httpStatus: number): boolean {
    const kind = classifyAuthStatus(httpStatus);
    if (kind === "unauthorized" || kind === "retired") {
      markStopped(kind);
      return true;
    }
    return false;
  }

  // One request at a time: a reconnect and a visibility change often ask together.
  let syncing: Promise<void> | null = null;
  function syncHistory(): Promise<void> {
    return (syncing ??= runSync().finally(() => {
      syncing = null;
    }));
  }

  async function runSync(): Promise<void> {
    try {
      const res = await fetch(`${roomPath}/history?${historyQuery(lastSeq)}`, { headers: authHeaders });
      if (stopIfRejected(res.status)) return;
      if (!res.ok) return;
      const body = (await res.json()) as { items: StoredItem[] };
      if (body.items.length > 0) deliver(body.items);
    } catch {
      // Offline: the next reconnect syncs again.
    }
  }

  // A browser hides the HTTP status of a failed WebSocket handshake, so ask the history route.
  async function probeAuth(): Promise<void> {
    try {
      const res = await fetch(`${roomPath}/history?since=0&limit=1`, { headers: authHeaders });
      stopIfRejected(res.status);
    } catch {
      // Network problem, not a key problem.
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
    if (stopped || rejected) return;
    onStatus("connecting");
    const ws = new WebSocket(wsUrl, ["hopnote.v1", `hopnote.auth.${authToken}`]);
    socket = ws;
    let opened = false;

    ws.addEventListener("open", () => {
      opened = true;
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
    ws.addEventListener("close", (event) => {
      if (socket !== ws || stopped || rejected) return;
      // The relay closes with 4000 when the PC retired this room.
      if (event.code === 4000) return markStopped("retired");
      stopHeartbeat();
      onStatus("offline");
      if (!opened) void probeAuth();
      retryTimer = setTimeout(connect, reconnectDelayMs(attempt++));
    });
    ws.addEventListener("error", () => ws.close());
  }

  function onVisibilityChange(): void {
    if (document.visibilityState !== "visible" || stopped || rejected) return;
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
