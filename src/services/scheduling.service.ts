import { validateReservation, Reservation } from "../../packages/core/src";
import prisma from "@/lib/db";
import { AppError } from "@/lib/errors";
import { scheduleMatches } from "@/engines/scheduling/scheduling-engine";
import {
  ScheduleMatchInput,
  CourtResource,
  SchedulingOptions,
} from "@/engines/scheduling/types";
import { createAuditLog } from "./audit.service";

export interface AutoScheduleParams {
  tournamentId: string;
  startTime: Date | string;
  matchDurationMinutes?: number;
  minRestMinutes?: number;
  userId: string;
}

export class SchedulingService {
  static async autoScheduleTournament(params: AutoScheduleParams) {
    const {
      tournamentId,
      startTime,
      matchDurationMinutes = 60,
      minRestMinutes = 30,
      userId,
    } = params;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        courts: { where: { isActive: true }, orderBy: { priority: "desc" } },
        categories: {
          include: {
            stages: {
              include: {
                matches: {
                  where: { status: "SCHEDULED" },
                  include: {
                    entryA: { include: { players: true } },
                    entryB: { include: { players: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!tournament)
      throw AppError.notFound(`Tournament '${tournamentId}' not found`);

    if (tournament.courts.length === 0) {
      throw AppError.badRequest(
        "No active courts available in this tournament to schedule matches",
      );
    }

    // Collect all scheduled matches across all categories
    const allMatches: ScheduleMatchInput[] = [];
    for (const cat of tournament.categories) {
      for (const st of cat.stages) {
        for (const m of st.matches) {
          const playerIds: string[] = [];
          if (m.entryA?.players)
            playerIds.push(...m.entryA.players.map((p) => p.playerId));
          if (m.entryB?.players)
            playerIds.push(...m.entryB.players.map((p) => p.playerId));

          allMatches.push({
            id: m.id,
            round: m.round,
            matchNumber: m.matchNumber,
            entryAId: m.entryAId,
            entryBId: m.entryBId,
            playerIds,
            dependencyIds: st.matches
              .filter((parent) => {
                const nodes =
                  (
                    st.config as {
                      draw?: {
                        number: number;
                        winnerTo?: [number, string];
                        loserTo?: [number, string];
                      }[];
                    } | null
                  )?.draw ?? [];
                const node = nodes.find((n) => n.number === parent.matchNumber);
                return (
                  parent.nextWinnerMatchId === m.id ||
                  parent.nextLoserMatchId === m.id ||
                  node?.winnerTo?.[0] === m.matchNumber ||
                  node?.loserTo?.[0] === m.matchNumber
                );
              })
              .map((parent) => parent.id),
          });
        }
      }
    }

    if (allMatches.length === 0) {
      throw AppError.badRequest(
        "No scheduled matches found in this tournament to allocate",
      );
    }

    const courtResources: CourtResource[] = tournament.courts.map((c) => ({
      id: c.id,
      name: c.name,
      priority: c.priority,
      venueCourtId: c.venueCourtId,
    }));

    const options: SchedulingOptions = {
      startTime: new Date(startTime),
      matchDurationMinutes,
      minRestMinutes,
    };

    // Save scheduled dates and court assignments in database
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`;
      for (const court of [...tournament.courts].sort((a, b) =>
        a.id.localeCompare(b.id),
      ))
        if (court.venueCourtId)
          await tx.$queryRaw`SELECT id FROM "VenueCourt" WHERE id = ${court.venueCourtId} FOR UPDATE`;
      for (const player of [
        ...new Set(allMatches.flatMap((m) => m.playerIds ?? [])),
      ].sort())
        await tx.$queryRaw`SELECT id FROM players WHERE id = ${player} FOR UPDATE`;
      const ids = allMatches.map((m) => m.id);
      const external = await tx.match.findMany({
        where: {
          id: { notIn: ids },
          status: { not: "CANCELLED" },
          scheduledAt: { not: null },
        },
        include: {
          court: true,
          entryA: { include: { players: true } },
          entryB: { include: { players: true } },
        },
      });
      const reservations: Reservation[] = external.map((m) => ({
        id: m.id,
        courtId: m.court?.venueCourtId ?? m.courtId ?? "",
        playerIds: [
          ...(m.entryA?.players ?? []),
          ...(m.entryB?.players ?? []),
        ].map((p) => p.playerId),
        start: m.scheduledAt!.getTime(),
        end: (
          m.estimatedEndAt ?? new Date(m.scheduledAt!.getTime() + 3600000)
        ).getTime(),
      }));
      const latest = await tx.match.findMany({ where: { id: { in: ids } } });
      if (latest.some((m) => m.status !== "SCHEDULED"))
        throw AppError.conflict(
          "Pertandingan telah dimulai. Muat ulang sebelum menjadwalkan.",
        );
      const schedulePlan = scheduleMatches(allMatches, courtResources, {
        ...options,
        reservations,
      });
      for (const item of schedulePlan.scheduledMatches) {
        const reservation: Reservation = {
          id: item.matchId,
          courtId:
            tournament.courts.find((c) => c.id === item.courtId)
              ?.venueCourtId ?? item.courtId,
          playerIds:
            allMatches.find((m) => m.id === item.matchId)?.playerIds ?? [],
          start: item.scheduledAt.getTime(),
          end: item.estimatedEndAt.getTime(),
        };
        try {
          validateReservation(reservation, reservations, minRestMinutes);
        } catch (error) {
          throw AppError.conflict(
            `Jadwal berbenturan: ${(error as Error).message}. Pilih waktu mulai lain.`,
          );
        }
        reservations.push(reservation);
        await tx.match.update({
          where: { id: item.matchId },
          data: {
            courtId: item.courtId,
            scheduledAt: item.scheduledAt,
            estimatedEndAt: item.estimatedEndAt,
          },
        });
      }

      await createAuditLog(
        {
          userId,
          tournamentId,
          action: "AUTO_SCHEDULE_MATCHES",
          entityType: "Tournament",
          entityId: tournamentId,
          after: {
            scheduledCount: schedulePlan.scheduledMatches.length,
            timelineStart: schedulePlan.timelineStart,
            timelineEnd: schedulePlan.timelineEnd,
          },
        },
        tx,
      );

      return schedulePlan;
    });
  }

  static async getTournamentSchedule(tournamentId: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true },
    });

    if (!tournament) {
      throw AppError.notFound(`Tournament '${tournamentId}' not found`);
    }

    return await prisma.match.findMany({
      where: {
        stage: {
          category: {
            tournamentId,
          },
        },
      },
      include: {
        court: true,
        entryA: {
          include: {
            players: {
              include: { player: true },
            },
          },
        },
        entryB: {
          include: {
            players: {
              include: { player: true },
            },
          },
        },
        winner: true,
        scoreSnapshot: true,
        group: true,
        stage: {
          include: {
            category: true,
          },
        },
      },
      orderBy: [
        { scheduledAt: { sort: "asc", nulls: "last" } },
        { court: { priority: "desc" } },
        { round: "asc" },
        { matchNumber: "asc" },
      ],
    });
  }
}
