import {
  ScheduleMatchInput,
  CourtResource,
  SchedulingOptions,
  ScheduleGenerationResult,
  ScheduledMatchResult,
} from "./types";

export function scheduleMatches(
  matches: ScheduleMatchInput[],
  courts: CourtResource[],
  options: SchedulingOptions,
): ScheduleGenerationResult {
  if (courts.length === 0) {
    throw new Error("At least 1 active court required to schedule matches");
  }

  const { startTime, matchDurationMinutes, minRestMinutes } = options;
  const matchDurationMs = matchDurationMinutes * 60 * 1000;
  const minRestMs = minRestMinutes * 60 * 1000;
  const reservations = options.reservations ?? [];
  if (
    !Number.isFinite(startTime.getTime()) ||
    !Number.isFinite(matchDurationMs) ||
    matchDurationMs <= 0 ||
    !Number.isFinite(minRestMs) ||
    minRestMs < 0
  )
    throw new Error("Waktu pertandingan tidak valid");

  // Sort courts by priority (highest priority first)
  const sortedCourts = [...courts].sort((a, b) => b.priority - a.priority);

  // Group matches by round, then sort by round ascending
  const sortedMatches = [...matches].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return a.matchNumber - b.matchNumber;
  });

  // Track availability timestamp per court
  const courtNextAvailable = new Map<string, Date>();
  for (const c of sortedCourts) {
    courtNextAvailable.set(c.id, new Date(startTime.getTime()));
  }

  // Track when entries / players become available again
  const entityNextAvailable = new Map<string, Date>();

  const scheduledResults: ScheduledMatchResult[] = [];

  const pending = [...sortedMatches];
  while (pending.length) {
    const index = pending.findIndex((m) =>
      (m.dependencyIds ?? []).every((id) =>
        scheduledResults.some((r) => r.matchId === id),
      ),
    );
    if (index < 0)
      throw new Error(
        "Ketergantungan jadwal tidak lengkap atau membentuk siklus",
      );
    const match = pending.splice(index, 1)[0];
    // Collect all involved entities (entry IDs and individual player IDs)
    const participants: string[] = [];
    if (match.entryAId) participants.push(match.entryAId);
    if (match.entryBId) participants.push(match.entryBId);
    if (match.playerIds) participants.push(...match.playerIds);

    // Find the earliest time all participants are rested
    let participantEarliest = new Date(startTime.getTime());
    for (const p of participants) {
      const pAvail = entityNextAvailable.get(p);
      if (pAvail && pAvail.getTime() > participantEarliest.getTime()) {
        participantEarliest = new Date(pAvail.getTime());
      }
    }

    for (const id of match.dependencyIds ?? []) {
      const parent = scheduledResults.find((result) => result.matchId === id)!;
      participantEarliest = new Date(
        Math.max(
          participantEarliest.getTime(),
          parent.estimatedEndAt.getTime() + minRestMs,
        ),
      );
    }

    // Find the court that can host this match at the earliest feasible time
    let bestCourt: CourtResource = sortedCourts[0];
    let earliestMatchStartMs = Infinity;

    for (const court of sortedCourts) {
      const courtAvail = courtNextAvailable.get(court.id)!;
      // Match can start at max(court availability, participants availability)
      let potentialStartMs = Math.max(
        courtAvail.getTime(),
        participantEarliest.getTime(),
      );

      // Move past occupied intervals until both court and players are free.
      // Recheck all reservations after each shift, regardless of input order.
      let shifted: boolean;
      do {
        shifted = false;
        for (const reservation of reservations) {
          if (reservation.id === match.id) continue;
          const sharesPlayer = (match.playerIds ?? []).some((id) =>
            reservation.playerIds.includes(id),
          );
          const sameCourt =
            reservation.courtId === (court.venueCourtId ?? court.id);
          const rest = sharesPlayer ? minRestMs : 0;
          if (
            (sameCourt || sharesPlayer) &&
            potentialStartMs < reservation.end + rest &&
            potentialStartMs + matchDurationMs + rest > reservation.start
          ) {
            potentialStartMs = reservation.end + rest;
            shifted = true;
          }
        }
      } while (shifted);

      if (potentialStartMs < earliestMatchStartMs) {
        earliestMatchStartMs = potentialStartMs;
        bestCourt = court;
      }
    }

    const earliestMatchStart = new Date(earliestMatchStartMs);
    const matchEnd = new Date(earliestMatchStartMs + matchDurationMs);
    const participantFreeAt = new Date(matchEnd.getTime() + minRestMs);

    // Update court availability
    courtNextAvailable.set(bestCourt.id, matchEnd);

    // Update participant availability
    for (const p of participants) {
      entityNextAvailable.set(p, participantFreeAt);
    }

    scheduledResults.push({
      matchId: match.id,
      courtId: bestCourt.id,
      courtName: bestCourt.name,
      scheduledAt: earliestMatchStart,
      estimatedEndAt: matchEnd,
      round: match.round,
    });
  }

  const timelineStart = new Date(
    Math.min(
      ...scheduledResults.map((m) => m.scheduledAt.getTime()),
      startTime.getTime(),
    ),
  );
  const timelineEnd = new Date(
    Math.max(
      ...scheduledResults.map((m) => m.estimatedEndAt.getTime()),
      startTime.getTime(),
    ),
  );

  return {
    scheduledMatches: scheduledResults,
    totalCourtsUsed: new Set(scheduledResults.map((m) => m.courtId)).size,
    timelineStart,
    timelineEnd,
  };
}
