import prisma from "@/lib/db";
import { AppError } from "@/lib/errors";
import { validateReservation, Reservation } from "../../../packages/core/src";
import { AuthUser } from "@/middleware/auth.middleware";
import { matchAccess } from "@/lib/v2/access";
export async function scheduleMatch(
  user: AuthUser,
  id: string,
  courtId: string,
  start: Date,
  duration: number,
  restMinutes: number,
) {
  const access = await matchAccess(user, id, true);
  return prisma.$transaction(async (tx) => {
    const court = await tx.court.findUniqueOrThrow({ where: { id: courtId } });
    if (court.tournamentId !== access.stage.category.tournamentId)
      throw AppError.badRequest("Lapangan bukan milik acara ini");
    await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${court.tournamentId} FOR UPDATE`;
    if (court.venueCourtId)
      await tx.$queryRaw`SELECT id FROM "VenueCourt" WHERE id = ${court.venueCourtId} FOR UPDATE`;
    const match = await tx.match.findUniqueOrThrow({
      where: { id },
      include: {
        stage: true,
        entryA: { include: { players: true } },
        entryB: { include: { players: true } },
      },
    });
    if (match.status !== "SCHEDULED")
      throw AppError.conflict("Pertandingan sudah dimulai");
    const playerIds = [
      ...(match.entryA?.players ?? []),
      ...(match.entryB?.players ?? []),
    ].map((p) => p.playerId);
    // Lock shared participants as well as court, preventing two concurrent organizers from booking them.
    for (const pid of [...new Set(playerIds)].sort())
      await tx.$queryRaw`SELECT id FROM players WHERE id = ${pid} FOR UPDATE`;
    const existing = await tx.match.findMany({
      where: {
        id: { not: id },
        status: { not: "CANCELLED" },
        scheduledAt: { not: null },
        OR: [
          { courtId },
          { court: { venueCourtId: court.venueCourtId ?? "__none__" } },
          { entryA: { players: { some: { playerId: { in: playerIds } } } } },
          { entryB: { players: { some: { playerId: { in: playerIds } } } } },
        ],
      },
      include: {
        court: true,
        entryA: { include: { players: true } },
        entryB: { include: { players: true } },
      },
    });
    const reservation: Reservation = {
      id,
      courtId: court.venueCourtId ?? courtId,
      playerIds,
      start: start.getTime(),
      end: start.getTime() + duration * 60000,
    };
    const others = existing.map((m) => ({
      id: m.id,
      courtId: m.court?.venueCourtId ?? m.courtId ?? "",
      playerIds: [
        ...(m.entryA?.players ?? []),
        ...(m.entryB?.players ?? []),
      ].map((p) => p.playerId),
      start: m.scheduledAt!.getTime(),
      end: (
        m.estimatedEndAt ?? new Date(m.scheduledAt!.getTime() + 60 * 60000)
      ).getTime(),
    }));
    try {
      validateReservation(reservation, others, restMinutes);
    } catch (e) {
      throw AppError.conflict((e as Error).message);
    }
    const config = match.stage.config as {
      draw?: {
        number: number;
        winnerTo?: [number, string];
        loserTo?: [number, string];
      }[];
    } | null;
    const feeders =
      config?.draw?.filter(
        (n) =>
          n.winnerTo?.[0] === match.matchNumber ||
          n.loserTo?.[0] === match.matchNumber,
      ) ?? [];
    for (const node of feeders) {
      const parent = await tx.match.findFirst({
        where: { stageId: match.stageId, matchNumber: node.number },
      });
      if (
        parent &&
        parent.approvalStatus !== "APPROVED" &&
        (!parent.estimatedEndAt ||
          start.getTime() <
            parent.estimatedEndAt.getTime() + restMinutes * 60000)
      )
        throw AppError.conflict(
          "Jadwalkan setelah pertandingan penentu dan waktu istirahat",
        );
    }
    const updated = await tx.match.update({
      where: { id },
      data: {
        courtId,
        scheduledAt: start,
        estimatedEndAt: new Date(reservation.end),
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.userId,
        tournamentId: court.tournamentId,
        action: "SCHEDULE_MATCH",
        entityType: "Match",
        entityId: id,
        after: { courtId, start: start.toISOString(), duration, restMinutes },
      },
    });
    return updated;
  });
}
