import prisma from "@/lib/db";
import { AppError } from "@/lib/errors";
import { MatchStatus } from "@prisma/client";

export interface PlayerCareerStats {
  player: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    rating: number | null;
    notes: string | null;
    createdAt: Date;
  };
  overview: {
    tournamentsCount: number;
    matchesPlayed: number;
    matchesWon: number;
    matchesLost: number;
    winRate: number; // percentage, e.g. 75.0
    setsWon: number;
    setsLost: number;
    setDifferential: number;
    gamesWon: number;
    gamesLost: number;
    gameDifferential: number;
    titlesCount: number;
  };
  matchHistory: Array<{
    matchId: string;
    tournamentId: string;
    tournamentName: string;
    tournamentSlug: string;
    categoryName: string;
    courtName: string | null;
    round: number;
    playedAt: Date | null;
    pairName: string;
    partnerName: string | null;
    opponentName: string;
    result: "WON" | "LOST";
    setsScore: string; // e.g. "6-4, 7-6"
  }>;
}

export class PlayerStatsService {
  static async getPlayerCareerStats(
    playerId: string,
  ): Promise<PlayerCareerStats> {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        entryPlayers: {
          include: {
            entry: {
              include: {
                category: {
                  include: {
                    tournament: true,
                  },
                },
                players: {
                  include: { player: true },
                },
                matchesAsA: {
                  where: {
                    status: {
                      in: [MatchStatus.FINISHED, MatchStatus.APPROVED],
                    },
                  },
                  include: {
                    court: true,
                    entryB: {
                      include: {
                        players: { include: { player: true } },
                      },
                    },
                    sets: { orderBy: { setNumber: "asc" } },
                    winner: true,
                    stage: {
                      include: { category: { include: { tournament: true } } },
                    },
                  },
                },
                matchesAsB: {
                  where: {
                    status: {
                      in: [MatchStatus.FINISHED, MatchStatus.APPROVED],
                    },
                  },
                  include: {
                    court: true,
                    entryA: {
                      include: {
                        players: { include: { player: true } },
                      },
                    },
                    sets: { orderBy: { setNumber: "asc" } },
                    winner: true,
                    stage: {
                      include: { category: { include: { tournament: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!player) {
      throw AppError.notFound(`Player with ID '${playerId}' not found`);
    }

    const stageIds = [
      ...new Set(
        player.entryPlayers.flatMap(({ entry }) =>
          [...entry.matchesAsA, ...entry.matchesAsB].map(
            (match) => match.stageId,
          ),
        ),
      ),
    ];
    const finalRounds = await prisma.match.groupBy({
      by: ["stageId"],
      where: { stageId: { in: stageIds }, status: { not: "CANCELLED" } },
      _max: { round: true },
    });
    const finalRoundByStage = new Map(
      finalRounds.map((stage) => [stage.stageId, stage._max.round]),
    );
    const tournamentIds = new Set<string>();
    let matchesPlayed = 0;
    let matchesWon = 0;
    let matchesLost = 0;
    let setsWon = 0;
    let setsLost = 0;
    let gamesWon = 0;
    let gamesLost = 0;
    let titlesCount = 0;

    const matchHistory: PlayerCareerStats["matchHistory"] = [];

    for (const ep of player.entryPlayers) {
      const entry = ep.entry;
      if (!entry) continue;

      const tournament = entry.category?.tournament;
      if (tournament) {
        tournamentIds.add(tournament.id);
      }

      // Partner identification
      const partnerEp = entry.players.find((p) => p.playerId !== playerId);
      const partnerName = partnerEp?.player?.fullName || null;

      // Combine matches as entryA and as entryB
      const allMatches = [
        ...entry.matchesAsA.map((m) => ({ match: m, role: "A" as const })),
        ...entry.matchesAsB.map((m) => ({ match: m, role: "B" as const })),
      ];

      for (const { match, role } of allMatches) {
        matchesPlayed++;
        const isWinner = match.winnerId === entry.id;
        if (isWinner) {
          matchesWon++;
        } else {
          matchesLost++;
        }

        // Tally sets and games
        const setScoresFormatted: string[] = [];
        for (const s of match.sets) {
          const myGames = role === "A" ? s.gamesA : s.gamesB;
          const oppGames = role === "A" ? s.gamesB : s.gamesA;

          gamesWon += myGames;
          gamesLost += oppGames;

          if (myGames > oppGames) {
            setsWon++;
          } else if (oppGames > myGames) {
            setsLost++;
          }

          setScoresFormatted.push(`${myGames}-${oppGames}`);
        }

        const opponentEntry = role === "A" ? match.entryB : match.entryA;
        const opponentName = opponentEntry?.name || "TBD";

        // Check if this was a tournament final win
        if (
          isWinner &&
          match.stage?.type === "SINGLE_ELIMINATION" &&
          match.round === finalRoundByStage.get(match.stageId) &&
          !match.nextWinnerMatchId
        ) {
          titlesCount++;
        }

        matchHistory.push({
          matchId: match.id,
          tournamentId: tournament?.id || "",
          tournamentName: tournament?.name || "Turnamen Padel",
          tournamentSlug: tournament?.slug || "",
          categoryName: entry.category?.name || "Umum",
          courtName: match.court?.name || null,
          round: match.round,
          playedAt: match.finishedAt || match.startedAt || match.scheduledAt,
          pairName: entry.name,
          partnerName,
          opponentName,
          result: isWinner ? "WON" : "LOST",
          setsScore: setScoresFormatted.join(", ") || "0-0",
        });
      }
    }

    // Sort match history by playedAt descending
    matchHistory.sort((a, b) => {
      const timeA = a.playedAt ? new Date(a.playedAt).getTime() : 0;
      const timeB = b.playedAt ? new Date(b.playedAt).getTime() : 0;
      return timeB - timeA;
    });

    const winRate =
      matchesPlayed > 0
        ? Number(((matchesWon / matchesPlayed) * 100).toFixed(1))
        : 0;

    return {
      player: {
        id: player.id,
        fullName: player.fullName,
        email: player.email,
        phone: player.phone,
        rating: player.rating,
        notes: player.notes,
        createdAt: player.createdAt,
      },
      overview: {
        tournamentsCount: tournamentIds.size,
        matchesPlayed,
        matchesWon,
        matchesLost,
        winRate,
        setsWon,
        setsLost,
        setDifferential: setsWon - setsLost,
        gamesWon,
        gamesLost,
        gameDifferential: gamesWon - gamesLost,
        titlesCount,
      },
      matchHistory,
    };
  }

  static async getLeaderboard(limit: number = 20, organizationId?: string) {
    const players = await prisma.player.findMany({
      where: { organizationId },
      include: {
        entryPlayers: {
          include: {
            entry: {
              include: {
                matchesAsA: {
                  where: {
                    status: {
                      in: [MatchStatus.FINISHED, MatchStatus.APPROVED],
                    },
                  },
                  select: { winnerId: true },
                },
                matchesAsB: {
                  where: {
                    status: {
                      in: [MatchStatus.FINISHED, MatchStatus.APPROVED],
                    },
                  },
                  select: { winnerId: true },
                },
              },
            },
          },
        },
      },
    });

    const results = players.map((p) => {
      let played = 0;
      let won = 0;

      for (const ep of p.entryPlayers) {
        if (!ep.entry) continue;
        for (const m of ep.entry.matchesAsA) {
          played++;
          if (m.winnerId === ep.entry.id) won++;
        }
        for (const m of ep.entry.matchesAsB) {
          played++;
          if (m.winnerId === ep.entry.id) won++;
        }
      }

      const winRate =
        played > 0 ? Number(((won / played) * 100).toFixed(1)) : 0;

      return {
        id: p.id,
        fullName: p.fullName,
        rating: p.rating,
        matchesPlayed: played,
        matchesWon: won,
        matchesLost: played - won,
        winRate,
      };
    });

    // Sort by matchesWon desc, then winRate desc
    results.sort((a, b) => {
      if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
      return (
        b.winRate - a.winRate ||
        a.fullName.localeCompare(b.fullName) ||
        a.id.localeCompare(b.id)
      );
    });

    return results.slice(0, limit);
  }
}
