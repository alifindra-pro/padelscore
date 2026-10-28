import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "@/lib/db";
import { PlayerStatsService } from "@/services/player-stats.service";
import { MatchStatus, TournamentStatus, StageType } from "@prisma/client";

describe("Player Statistics & Career History Integration", () => {
  let player1Id: string;
  let player2Id: string;
  let tournamentId: string;
  let organizationId: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: `Stats test ${Date.now()}` },
    });
    organizationId = organization.id;
    // Include more than the former 100-player cutoff to protect full ranking.
    await prisma.player.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        fullName: `Unranked ${index}`,
        organizationId,
      })),
    });
    // 1. Create 2 test players
    const p1 = await prisma.player.create({
      data: {
        organizationId,
        fullName: `Career Tester 1 ${Date.now()}`,
        email: `tester1_${Date.now()}@test.com`,
        rating: 6.0,
      },
    });
    const p2 = await prisma.player.create({
      data: {
        organizationId,
        fullName: `Career Tester 2 ${Date.now()}`,
        email: `tester2_${Date.now()}@test.com`,
        rating: 5.5,
      },
    });

    player1Id = p1.id;
    player2Id = p2.id;

    // 2. Create tournament and category
    const tournament = await prisma.tournament.create({
      data: {
        name: `Stats Open ${Date.now()}`,
        slug: `stats-open-${Date.now()}`,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        status: TournamentStatus.COMPLETED,
      },
    });
    tournamentId = tournament.id;

    const category = await prisma.category.create({
      data: {
        tournamentId: tournament.id,
        name: "Open A",
        format: "SINGLE_ELIMINATION",
      },
    });

    // 3. Create entries
    const entry1 = await prisma.entry.create({
      data: {
        categoryId: category.id,
        name: "Team Alpha",
        players: {
          create: [{ playerId: player1Id }],
        },
      },
    });

    const entry2 = await prisma.entry.create({
      data: {
        categoryId: category.id,
        name: "Team Beta",
        players: {
          create: [{ playerId: player2Id }],
        },
      },
    });

    // 4. Create Stage and finished Match
    const stage = await prisma.stage.create({
      data: {
        categoryId: category.id,
        name: "Final Stage",
        type: StageType.SINGLE_ELIMINATION,
        order: 1,
        config: {},
      },
    });

    await prisma.match.create({
      data: {
        stageId: stage.id,
        entryAId: entry1.id,
        entryBId: entry2.id,
        winnerId: entry1.id, // Team Alpha wins
        status: MatchStatus.APPROVED,
        matchNumber: 1,
        round: 2, // Final round
        finishedAt: new Date(),
        sets: {
          create: [
            { setNumber: 1, gamesA: 6, gamesB: 3, winnerId: entry1.id },
            { setNumber: 2, gamesA: 6, gamesB: 4, winnerId: entry1.id },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    if (tournamentId)
      await prisma.tournament.delete({ where: { id: tournamentId } });
    if (organizationId) {
      await prisma.player.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
  });

  it("1. Computes player career statistics including win rate and set differential", async () => {
    const stats = await PlayerStatsService.getPlayerCareerStats(player1Id);

    expect(stats.player.id).toBe(player1Id);
    expect(stats.overview.matchesPlayed).toBe(1);
    expect(stats.overview.matchesWon).toBe(1);
    expect(stats.overview.matchesLost).toBe(0);
    expect(stats.overview.winRate).toBe(100.0);
    expect(stats.overview.setsWon).toBe(2);
    expect(stats.overview.setsLost).toBe(0);
    expect(stats.overview.setDifferential).toBe(2);
    expect(stats.overview.gamesWon).toBe(12);
    expect(stats.overview.gamesLost).toBe(7);
    expect(stats.overview.gameDifferential).toBe(5);
    expect(stats.overview.titlesCount).toBe(1);

    // Verify match history
    expect(stats.matchHistory).toHaveLength(1);
    expect(stats.matchHistory[0].result).toBe("WON");
    expect(stats.matchHistory[0].setsScore).toBe("6-3, 6-4");
  });

  it("2. Correctly attributes loss and negative differential to opponent", async () => {
    const stats = await PlayerStatsService.getPlayerCareerStats(player2Id);

    expect(stats.overview.matchesPlayed).toBe(1);
    expect(stats.overview.matchesWon).toBe(0);
    expect(stats.overview.matchesLost).toBe(1);
    expect(stats.overview.winRate).toBe(0.0);
    expect(stats.overview.setDifferential).toBe(-2);
    expect(stats.overview.gameDifferential).toBe(-5);
    expect(stats.matchHistory[0].result).toBe("LOST");
  });

  it("3. Fetches top players leaderboard sorted by matches won and win rate", async () => {
    const leaderboard = await PlayerStatsService.getLeaderboard(
      10,
      organizationId,
    );

    expect(leaderboard.length).toBeGreaterThan(0);
    const topPlayer = leaderboard.find((p) => p.id === player1Id);
    expect(topPlayer).toBeDefined();
    expect(topPlayer?.matchesWon).toBe(1);
    expect(topPlayer?.winRate).toBe(100);
  });
  it("does not count a semifinal win as a title", async () => {
    const existing = await prisma.match.findFirstOrThrow({
      where: { stage: { category: { tournamentId } } },
    });
    const final = await prisma.match.create({
      data: {
        stageId: existing.stageId,
        round: 3,
        matchNumber: 2,
        status: MatchStatus.SCHEDULED,
      },
    });
    try {
      const stats = await PlayerStatsService.getPlayerCareerStats(player1Id);
      expect(stats.overview.matchesWon).toBe(1);
      expect(stats.overview.titlesCount).toBe(0);
    } finally {
      await prisma.match.delete({ where: { id: final.id } });
    }
  });
});
