import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { get, newRoom, post, textEnvelope } from "./helpers";

describe("CORS", () => {
  it("answers OPTIONS /items with 204 and the allow headers", async () => {
    const res = await exports.default.fetch(
      new Request(`https://relay.test/room/${newRoom()}/items`, { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type");
  });

  it("lets the browser cache the preflight for two hours", async () => {
    const res = await exports.default.fetch(
      new Request(`https://relay.test/room/${newRoom()}/items`, { method: "OPTIONS" }),
    );
    expect(res.headers.get("access-control-max-age")).toBe("7200");
  });

  it("adds access-control-allow-origin to POST and GET responses", async () => {
    const room = newRoom();
    expect((await post(room, textEnvelope())).headers.get("access-control-allow-origin")).toBe("*");
    expect((await get(room, "history")).headers.get("access-control-allow-origin")).toBe("*");
  });
});
