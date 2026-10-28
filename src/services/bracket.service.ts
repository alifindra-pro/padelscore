import prisma from '@/lib/db';
import {
  StageType,
  StageStatus,
  MatchStatus,
  type Group,
  type Match,
} from '@prisma/client';
import { AppError } from '@/lib/errors';
import {
  generateSingleEliminationBracket,
  generateGroupStageWithKnockout,
  calculateGroupStandings,
} from '@/engines/tournament/tournament-engine';
import { TournamentEntry, MatchScoreResult } from '@/engines/tournament/types';
import { createAuditLog } from './audit.service';

export class BracketService {
  static async generateCategoryBracket(categoryId: string, userId: string) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        tournament: true,
        entries: {
          include: {
            players: true,
          },
          orderBy: [
            { seed: { sort: 'asc', nulls: 'last' } },
            { createdAt: 'asc' },
          ],
        },
        stages: {
          include: { matches: true },
        },
      },
    });

    if (!category) {
      throw AppError.notFound(`Category '${categoryId}' not found`);
    }

    if (category.entries.length < 2) {
      throw AppError.badRequest('At least 2 registered entries are required to generate a draw');
    }

    // Guard: Prevent overwriting bracket if any match has started
    const hasStartedMatches = category.stages.some((s) =>
      s.matches.some((m) => m.status !== MatchStatus.SCHEDULED && m.status !== MatchStatus.CANCELLED)
    );
    if (hasStartedMatches) {
      throw AppError.badRequest(
        'Cannot regenerate draw because matches in this category are already in progress or completed'
      );
    }

    const domainEntries: TournamentEntry[] = category.entries.map((e) => ({
      id: e.id,
      name: e.name,
      seed: e.seed,
      playerIds: e.players.map((p) => p.playerId),
    }));

    return await prisma.$transaction(async (tx) => {
      // 1. Clear old pending stages and matches
      await tx.stage.deleteMany({ where: { categoryId } });

      if (category.format === 'SINGLE_ELIMINATION') {
        const bracket = generateSingleEliminationBracket(domainEntries);

        // Create Stage
        const stage = await tx.stage.create({
          data: {
            categoryId,
            name: 'Knockout Main Draw',
            type: StageType.SINGLE_ELIMINATION,
            order: 1,
            status: StageStatus.PENDING,
            config: {
              bracketSize: bracket.bracketSize,
              totalRounds: bracket.totalRounds,
              byesCount: bracket.byesCount,
            },
          },
        });

        // Create Bracket Slots
        for (const slot of bracket.slots) {
          await tx.bracketSlot.create({
            data: {
              stageId: stage.id,
              round: slot.round,
              position: slot.position,
              entryId: slot.entry?.id || null,
              isBye: slot.isBye,
            },
          });
        }

        // Create Matches
        const createdMatches: Match[] = [];
        for (const m of bracket.matches) {
          const matchRecord = await tx.match.create({
            data: {
              stageId: stage.id,
              matchNumber: m.matchNumber,
              round: m.round,
              entryAId: m.entryA?.id || null,
              entryBId: m.entryB?.id || null,
              status: m.isByeMatch ? MatchStatus.FINISHED : MatchStatus.SCHEDULED,
              winnerId: m.isByeMatch ? (m.entryA?.id || m.entryB?.id || null) : null,
              version: 0,
            },
          });
          createdMatches.push(matchRecord);
        }

        await createAuditLog({
          userId,
          tournamentId: category.tournamentId,
          action: 'GENERATE_BRACKET',
          entityType: 'Category',
          entityId: categoryId,
          after: { format: 'SINGLE_ELIMINATION', matchesCount: createdMatches.length },
        }, tx);

        return {
          format: 'SINGLE_ELIMINATION',
          stage,
          bracket,
          matches: createdMatches,
        };
      } else if (category.format === 'GROUP_KNOCKOUT' || category.format === 'ROUND_ROBIN') {
        const numGroups = category.format === 'ROUND_ROBIN' ? 1 : Math.max(2, Math.floor(domainEntries.length / 4));
        const groupResult = generateGroupStageWithKnockout(domainEntries, { numGroups });

        const stage = await tx.stage.create({
          data: {
            categoryId,
            name: 'Group Stage',
            type: StageType.GROUP,
            order: 1,
            status: StageStatus.PENDING,
            config: { numGroups },
          },
        });

        const createdGroups: Group[] = [];
        for (const g of groupResult.groups) {
          const groupRecord = await tx.group.create({
            data: {
              stageId: stage.id,
              name: g.groupName,
            },
          });

          // Initialize Standings for each team in group
          for (const entry of g.entries) {
            await tx.standing.create({
              data: {
                groupId: groupRecord.id,
                entryId: entry.id,
              },
            });
          }

          // Create group matches
          for (const m of g.matches) {
            await tx.match.create({
              data: {
                stageId: stage.id,
                groupId: groupRecord.id,
                matchNumber: m.matchNumber,
                round: m.round,
                entryAId: m.entryA?.id || null,
                entryBId: m.entryB?.id || null,
                status: MatchStatus.SCHEDULED,
                version: 0,
              },
            });
          }

          createdGroups.push(groupRecord);
        }

        await createAuditLog({
          userId,
          tournamentId: category.tournamentId,
          action: 'GENERATE_GROUPS',
          entityType: 'Category',
          entityId: categoryId,
          after: { numGroups, format: category.format },
        }, tx);

        return {
          format: category.format,
          stage,
          groupResult,
          groups: createdGroups,
        };
      } else {
        throw AppError.badRequest(`Format '${category.format}' is not yet automated`);
      }
    });
  }

  static async getCategoryBracket(categoryId: string) {
    return await prisma.stage.findMany({
      where: { categoryId },
      include: {
        bracketSlots: {
          include: { entry: true },
          orderBy: [{ round: 'asc' }, { position: 'asc' }],
        },
        groups: {
          include: {
            standings: {
              include: { entry: true },
              orderBy: [{ points: 'desc' }, { rank: 'asc' }],
            },
          },
        },
        matches: {
          include: {
            entryA: true,
            entryB: true,
            court: true,
            winner: true,
            scoreSnapshot: true,
          },
          orderBy: [{ round: 'asc' }, { matchNumber: 'asc' }],
        },
      },
      orderBy: { order: 'asc' },
    });
  }

  static async getCategoryStandings(categoryId: string) {
    const groups = await prisma.group.findMany({
      where: { stage: { categoryId } },
      include: {
        matches: {
          include: { sets: true },
        },
        standings: {
          include: { entry: true },
        },
      },
    });

    const results: {
      groupId: string;
      groupName: string;
      standings: ReturnType<typeof calculateGroupStandings>;
    }[] = [];

    for (const group of groups) {
      const entries: TournamentEntry[] = group.standings.map((s) => ({
        id: s.entryId,
        name: s.entry.name,
      }));

      const matchScores: MatchScoreResult[] = group.matches.map((m) => {
        let setsA = 0;
        let setsB = 0;
        const gamesA: number[] = [];
        const gamesB: number[] = [];

        for (const s of m.sets) {
          gamesA.push(s.gamesA);
          gamesB.push(s.gamesB);
          if (s.winnerId === 'A') setsA++;
          if (s.winnerId === 'B') setsB++;
        }

        return {
          matchId: m.id,
          entryAId: m.entryAId || '',
          entryBId: m.entryBId || '',
          winnerId: m.winnerId,
          setsA,
          setsB,
          gamesA,
          gamesB,
        };
      });

      const calculatedStandings = calculateGroupStandings(matchScores, entries);
      results.push({
        groupId: group.id,
        groupName: group.name,
        standings: calculatedStandings,
      });
    }

    return results;
  }
}
