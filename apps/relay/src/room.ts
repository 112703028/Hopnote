import { DurableObject } from "cloudflare:workers";
import {
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
  MAX_IMAGE_PAYLOAD_CHARS,
  validateEnvelope,
} from "@pc-to-ipad/protocol";
import { initSchema, insertItem, latestSeq, listItems } from "./store";

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
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => initSchema(ctx.storage.sql));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = url.pathname.split("/")[3];
    if (route === "items") return this.handleItems(request);
    if (route === "history") return this.handleHistory(request, url);
    return json({ error: "not found" }, 404);
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

    const { item, duplicate } = insertItem(this.ctx.storage.sql, result.envelope, Date.now());
    return json({ seq: item.seq, receivedAt: item.receivedAt }, duplicate ? 200 : 201);
  }

  private handleHistory(request: Request, url: URL): Response {
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

    const since = digitsOr(url.searchParams.get("since"), 0);
    const requested = digitsOr(url.searchParams.get("limit"), HISTORY_DEFAULT_LIMIT);
    const limit = Math.min(Math.max(requested, 1), HISTORY_MAX_LIMIT);
    const sql = this.ctx.storage.sql;
    return json({ items: listItems(sql, { since, limit }), latestSeq: latestSeq(sql) });
  }
}
