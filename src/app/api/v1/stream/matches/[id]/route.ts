import { withLegacyAccess } from "@/lib/v2/access";
import { NextRequest } from "next/server";
import { MatchService } from "@/services/match.service";
import { matchEventBus } from "@/lib/events";

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: matchId } = await params;

  let match: Awaited<ReturnType<typeof MatchService.getMatchById>>;
  try {
    match = await MatchService.getMatchById(matchId);
  } catch {
    return new Response("Match not found", { status: 404 });
  }

  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  // Send initial state immediately
  const initialPayload = JSON.stringify({
    matchId: match.id,
    tournamentId: match.stage?.category?.tournament?.id,
    status: match.status,
    snapshot: match.scoreSnapshot,
    server: match.scoreSnapshot?.server || "A",
    version: match.version,
    updatedAt: match.updatedAt,
  });
  void writer
    .write(encoder.encode(`event: initial-state\ndata: ${initialPayload}\n\n`))
    .catch(() => {});

  // Listen for match events from MatchEventBus
  const unsubscribe = matchEventBus.subscribeToMatch(matchId, (payload) => {
    void writer
      .write(
        encoder.encode(
          `event: score-update\ndata: ${JSON.stringify(payload)}\n\n`,
        ),
      )
      .catch(() => {});
  });

  // Keep-alive heartbeat interval every 15 seconds
  const heartbeatInterval = setInterval(() => {
    try {
      void writer.write(encoder.encode(": ping\n\n")).catch(() => {
        clearInterval(heartbeatInterval);
        unsubscribe();
      });
    } catch {
      clearInterval(heartbeatInterval);
      unsubscribe();
    }
  }, 15000);

  // Clean up when client disconnects
  request.signal.addEventListener("abort", () => {
    clearInterval(heartbeatInterval);
    unsubscribe();
    writer.close().catch(() => {});
  });

  return new Response(responseStream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const GET = withLegacyAccess(handleGET);
