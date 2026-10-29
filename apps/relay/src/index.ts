import { isHex128 } from "@pc-to-ipad/protocol";

export { Room } from "./room";

const ROUTE = /^\/room\/([^/]+)\/(items|history|ws)$/;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function withCors(response: Response): Response {
  const copy = new Response(response.body, response);
  for (const [name, value] of Object.entries(CORS_HEADERS)) copy.headers.set(name, value);
  return copy;
}

function notFound(): Response {
  return withCors(
    new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const match = ROUTE.exec(new URL(request.url).pathname);
    if (!match || !isHex128(match[1])) return notFound();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const stub = env.ROOM.get(env.ROOM.idFromName(match[1]));
    const response = await stub.fetch(request);
    // A 101 carries the WebSocket; it cannot be rewrapped.
    return response.status === 101 ? response : withCors(response);
  },
} satisfies ExportedHandler<Env>;
