import { timingSafeEqual } from "node:crypto";
import { createRealtime } from "@neon/realtime/server";
import { scoreQuery } from "../src/lib/neon/score-query";

const secret = process.env.PADEL_FUNCTION_SECRET;
if (!secret) throw new Error("PADEL_FUNCTION_SECRET is required");
const expected = Buffer.from(secret);

const scorefeed = {
  async fetch(request: Request): Promise<Response> {
    const provided = Buffer.from(request.headers.get("x-padel-secret") ?? "");
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "POST" },
      });
    }
    const body = await request.text();
    if (body.length > 2048)
      return new Response("Payload too large", { status: 413 });
    let input: { kind?: unknown; id?: unknown; userId?: unknown };
    try {
      input = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (
      !input ||
      (input.kind !== "matches" && input.kind !== "tournaments") ||
      typeof input.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,128}$/.test(input.id) ||
      !(
        input.userId === null ||
        (typeof input.userId === "string" &&
          /^[a-zA-Z0-9-]{1,128}$/.test(input.userId))
      )
    ) {
      return new Response("Invalid score subscription", { status: 400 });
    }
    const url = process.env.PADEL_REALTIME_URL;
    const realtimeSecret = process.env.PADEL_REALTIME_SECRET;
    const database = process.env.DATABASE_URL;
    if (!url || !realtimeSecret || !database) {
      return new Response("Realtime is not configured", { status: 503 });
    }
    const realtime = createRealtime({
      secret: realtimeSecret,
      db: decodeURIComponent(new URL(database).pathname.slice(1)),
    });
    const sealedQuery = await realtime.seal({
      query: scoreQuery(input.kind, input.id, input.userId),
    });
    return Response.json(
      { url, sealedQuery },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
};

export default scorefeed;
