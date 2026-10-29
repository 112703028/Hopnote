import { DurableObject } from "cloudflare:workers";
import {
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
  MAX_IMAGE_PAYLOAD_CHARS,
  RATE_LIMIT_MAX_ITEMS,
  RATE_LIMIT_WINDOW_MS,
  RETENTION_MS,
  validateEnvelope,
  type ServerMessage,
  type StoredItem,
} from "@pc-to-ipad/protocol";
import {
  findItemById,
  initSchema,
  insertItem,
  latestSeq,
  listItems,
  oldestReceivedAt,
  pruneItems,
} from "./store";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Anything that is not plain digits (negative, "abc", empty) falls back.
function digitsOr(value: string | null, fallback: number): number {
  return value !== null && /^\d+$/.test(value) ? Number(value) : fallback;
}

export class Room extends DurableObject<Env> {
  // Overridable so tests can move time.
  clock: () => number = () => Date.now();

  private acceptedAt: number[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => initSchema(ctx.storage.sql));
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = url.pathname.split("/")[3];
    if (route === "items") return this.handleItems(request);
    if (route === "history") return this.handleHistory(request, url);
    if (route === "ws") return this.handleWebSocket(request);
    return json({ error: "not found" }, 404);
  }

  webSocketMessage(): void {
    // Clients only listen; "ping" is answered by the auto-response.
  }

  webSocketClose(ws: WebSocket): void {
    try {
      ws.close(1000, "closing");
    } catch {
      // already closed
    }
  }

  async alarm(): Promise<void> {
    const sql = this.ctx.storage.sql;
    pruneItems(sql, this.clock());
    // An empty room schedules nothing. The table stays so AUTOINCREMENT keeps seq increasing.
    const oldest = oldestReceivedAt(sql);
    if (oldest !== null) await this.ctx.storage.setAlarm(oldest + RETENTION_MS);
  }

  private async handleItems(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

    const body = await request.text();
    if (body.length > MAX_IMAGE_PAYLOAD_CHARS + 1024) {
      return json({ error: "request too large" }, 413);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const result = validateEnvelope(raw);
    if (!result.ok) return json({ error: result.error }, result.code === "too_large" ? 413 : 400);

    const sql = this.ctx.storage.sql;
    // A retried send is answered from storage and does not count against the limit.
    const existing = findItemById(sql, result.envelope.id);
    if (existing) return json({ seq: existing.seq, receivedAt: existing.receivedAt });

    const now = this.clock();
    this.acceptedAt = this.acceptedAt.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (this.acceptedAt.length >= RATE_LIMIT_MAX_ITEMS) {
      return json({ error: "rate_limited" }, 429);
    }
    this.acceptedAt.push(now);

    const { item } = insertItem(sql, result.envelope, now);
    await this.ctx.storage.setAlarm(now + RETENTION_MS);
    this.broadcast(item);
    return json({ seq: item.seq, receivedAt: item.receivedAt }, 201);
  }

  private handleHistory(request: Request, url: URL): Response {
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

    const since = digitsOr(url.searchParams.get("since"), 0);
    const requested = digitsOr(url.searchParams.get("limit"), HISTORY_DEFAULT_LIMIT);
    const limit = Math.min(Math.max(requested, 1), HISTORY_MAX_LIMIT);
    const sql = this.ctx.storage.sql;
    return json({ items: listItems(sql, { since, limit }), latestSeq: latestSeq(sql) });
  }

  private handleWebSocket(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response(null, { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(item: StoredItem): void {
    const message: ServerMessage = { type: "item", item };
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // the socket closed between getWebSockets and send
      }
    }
  }
}
