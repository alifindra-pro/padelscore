import { withLegacyAccess } from "@/lib/v2/access";
import { NextRequest } from "next/server";
import { TournamentService } from "@/services/tournament.service";
import prisma from "@/lib/db";
import { matchEventBus } from "@/lib/events";

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tournamentId } = await params;

  try {
    await TournamentService.getTournamentById(tournamentId);
  } catch {
    return new Response("Tournament not found", { status: 404 });
  }

  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  // Fetch initial active/scheduled matches
  const activeMatches = await prisma.match.findMany({
    where: {
      stage: { category: { tournamentId } },
      status: { in: ["IN_PROGRESS", "WARMUP", "FINISHED"] },
    },
    include: {
      court: true,
      entryA: true,
      entryB: true,
      scoreSnapshot: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const initialPayload = JSON.stringify({
    tournamentId,
    activeMatches,
    timestamp: Date.now(),
  });
  void writer
    .write(encoder.encode(`event: initial-state\ndata: ${initialPayload}\n\n`))
    .catch(() => {});

  // Subscribe to all matches within tournament
  const unsubscribe = matchEventBus.subscribeToTournament(
    tournamentId,
    (payload) => {
      void writer
        .write(
          encoder.encode(
            `event: match-update\ndata: ${JSON.stringify(payload)}\n\n`,
          ),
        )
        .catch(() => {});
    },
  );

  // Heartbeat ping every 15s
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

  // Clean up on disconnect
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
