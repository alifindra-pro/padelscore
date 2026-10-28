import { validateEligibility, Eligibility } from '../../packages/core/src';
import prisma from '@/lib/db';
import { EntryStatus, Prisma } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { createAuditLog } from './audit.service';

export interface CreateEntryParams {
  categoryId: string;
  name?: string;
  playerIds: string[];
  seed?: number | null;
  userId: string;
}

export interface UpdateEntryParams {
  name?: string;
  seed?: number | null;
  status?: EntryStatus;
  userId: string;
}

export interface ImportEntryItem {
  player1Name: string;
  player1Email?: string;
  player2Name?: string;
  player2Email?: string;
  seed?: number;
}

export class EntryService {
  static async createEntry(params: CreateEntryParams) {
    const category = await prisma.category.findUnique({
      where: { id: params.categoryId },
      include: {
        tournament: true,
        _count: { select: { entries: true } },
      },
    });

    if (!category) {
      throw AppError.notFound(`Category '${params.categoryId}' not found`);
    }

    if (category.maxEntries && category._count.entries >= category.maxEntries) {
      throw AppError.badRequest(`Category has reached maximum entries limit (${category.maxEntries})`);
    }

    if (!params.playerIds || params.playerIds.length === 0) {
      throw AppError.badRequest('At least 1 player is required for an entry');
    }

    // Check player existence
    const players = await prisma.player.findMany({
      where: { id: { in: params.playerIds }, ...(category.tournament.organizationId ? { organizationId: category.tournament.organizationId } : {}) },
    });

    if (players.length !== params.playerIds.length) {
      throw AppError.badRequest('One or more player IDs are invalid');
    }

    try { validateEligibility(players, (category.eligibility as Eligibility) ?? {}, category.tournament.startDate, category.tournament.timezone); }
    catch (error) { throw AppError.badRequest((error as Error).message); }

    // Check if any player is already entered in this category
    const alreadyEntered = await prisma.entryPlayer.findFirst({
      where: {
        playerId: { in: params.playerIds },
        entry: { categoryId: params.categoryId },
      },
      include: { player: true },
    });

    if (alreadyEntered) {
      throw AppError.conflict(
        `Player '${alreadyEntered.player.fullName}' is already registered in this category`
      );
    }

    const defaultName = players.map((p) => p.fullName).join(' / ');
    const entryName = params.name?.trim() || defaultName;

    return await prisma.$transaction(async (tx) => {
      const entry = await tx.entry.create({
        data: {
          categoryId: params.categoryId,
          name: entryName,
          seed: params.seed || null,
          status: EntryStatus.REGISTERED,
          players: {
            create: params.playerIds.map((playerId) => ({
              playerId,
            })),
          },
        },
        include: {
          players: { include: { player: true } },
        },
      });

      await createAuditLog({
        userId: params.userId,
        tournamentId: category.tournamentId,
        action: 'CREATE_ENTRY',
        entityType: 'Entry',
        entityId: entry.id,
        after: entry,
      }, tx);

      return entry;
    });
  }

  static async listByCategory(categoryId: string) {
    return await prisma.entry.findMany({
      where: { categoryId },
      include: {
        players: {
          include: { player: true },
        },
      },
      orderBy: [
        { seed: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
    });
  }

  static async getEntryById(id: string) {
    const entry = await prisma.entry.findUnique({
      where: { id },
      include: {
        players: { include: { player: true } },
        category: {
          include: {
            tournament: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    if (!entry) {
      throw AppError.notFound(`Entry with ID '${id}' not found`);
    }

    return entry;
  }

  static async updateEntry(id: string, params: UpdateEntryParams) {
    const current = await this.getEntryById(id);

    return await prisma.$transaction(async (tx) => {
      const data: Prisma.EntryUpdateInput = {};
      if (params.name) data.name = params.name.trim();
      if (params.seed !== undefined) data.seed = params.seed;
      if (params.status) data.status = params.status;

      const updated = await tx.entry.update({
        where: { id },
        data,
        include: {
          players: { include: { player: true } },
        },
      });

      await createAuditLog({
        userId: params.userId,
        tournamentId: current.category.tournament.id,
        action: 'UPDATE_ENTRY',
        entityType: 'Entry',
        entityId: id,
        before: current,
        after: updated,
      }, tx);

      return updated;
    });
  }

  static async deleteEntry(id: string, userId: string) {
    const current = await this.getEntryById(id);

    // Guard: Prevent deleting entry if matches exist
    const matchCount = await prisma.match.count({
      where: {
        OR: [{ entryAId: id }, { entryBId: id }],
      },
    });

    if (matchCount > 0) {
      throw AppError.badRequest(
        `Cannot delete entry because it is already assigned to ${matchCount} match(es). Mark as WITHDRAWN instead.`
      );
    }

    return await prisma.$transaction(async (tx) => {
      await tx.entry.delete({ where: { id } });

      await createAuditLog({
        userId,
        tournamentId: current.category.tournament.id,
        action: 'DELETE_ENTRY',
        entityType: 'Entry',
        entityId: id,
        before: current,
      }, tx);

      return { success: true };
    });
  }

  static async importEntries(categoryId: string, items: ImportEntryItem[], userId: string) {
    const category = await prisma.category.findUniqueOrThrow({ where: { id: categoryId }, include: { tournament: true } });
    const organizationId = category.tournament.organizationId;
    const results: (
      | Awaited<ReturnType<typeof EntryService.createEntry>>
      | { error: string; players: string[] }
    )[] = [];
    for (const item of items) {
      // Find or create player 1
      let p1 = item.player1Email
        ? await prisma.player.findFirst({ where: { organizationId, email: item.player1Email } })
        : await prisma.player.findFirst({ where: { organizationId, fullName: item.player1Name } });

      if (!p1) {
        p1 = await prisma.player.create({
          data: {
            organizationId,
            fullName: item.player1Name,
            email: item.player1Email || null,
          },
        });
      }

      const playerIds = [p1.id];

      // Find or create player 2 if provided
      if (item.player2Name) {
        let p2 = item.player2Email
          ? await prisma.player.findFirst({ where: { organizationId, email: item.player2Email } })
          : await prisma.player.findFirst({ where: { organizationId, fullName: item.player2Name } });

        if (!p2) {
          p2 = await prisma.player.create({
            data: {
              organizationId,
              fullName: item.player2Name,
              email: item.player2Email || null,
            },
          });
        }
        playerIds.push(p2.id);
      }

      try {
        const entry = await this.createEntry({
          categoryId,
          playerIds,
          seed: item.seed,
          userId,
        });
        results.push(entry);
      } catch (err) {
        results.push({
          error: err instanceof Error ? err.message : String(err),
          players: [item.player1Name, item.player2Name].filter(
            (name): name is string => Boolean(name),
          ),
        });
      }
    }

    return results;
  }
}
