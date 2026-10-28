import prisma from '@/lib/db';
import { PRESETS } from '../../packages/core/src';
import { CategoryFormat, CategoryStatus, DeuceType, Prisma } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { createAuditLog } from './audit.service';

export interface CreateRulesetData {
  setsToWin?: number;
  gamesPerSet?: number;
  tiebreakAt?: number;
  tiebreakPoints?: number;
  goldenPoint?: boolean;
  superTiebreak?: boolean;
  superTiebreakPts?: number;
  deuceType?: DeuceType;
}

export interface CreateCategoryParams {
  tournamentId: string;
  name: string;
  description?: string | null;
  format: CategoryFormat;
  maxEntries?: number | null;
  ruleset?: CreateRulesetData;
  userId: string;
}

export interface UpdateCategoryParams {
  name?: string;
  description?: string | null;
  format?: CategoryFormat;
  maxEntries?: number | null;
  status?: CategoryStatus;
  ruleset?: CreateRulesetData;
  userId: string;
}

export class CategoryService {
  static async createCategory(params: CreateCategoryParams) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.tournamentId },
    });
    if (!tournament) {
      throw AppError.notFound(`Tournament '${params.tournamentId}' not found`);
    }

    return await prisma.$transaction(async (tx) => {
      const category = await tx.category.create({
        data: {
          tournamentId: params.tournamentId,
          name: params.name,
          description: params.description || null,
          format: params.format,
          maxEntries: params.maxEntries || null,
          status: CategoryStatus.DRAFT,
          rulesV2: JSON.parse(JSON.stringify(PRESETS.STANDARD)),
          ruleset: {
            create: {
              setsToWin: params.ruleset?.setsToWin ?? 2,
              gamesPerSet: params.ruleset?.gamesPerSet ?? 6,
              tiebreakAt: params.ruleset?.tiebreakAt ?? 6,
              tiebreakPoints: params.ruleset?.tiebreakPoints ?? 7,
              goldenPoint: params.ruleset?.goldenPoint ?? false,
              superTiebreak: params.ruleset?.superTiebreak ?? false,
              superTiebreakPts: params.ruleset?.superTiebreakPts ?? 10,
              deuceType: params.ruleset?.deuceType ?? (params.ruleset?.goldenPoint ? DeuceType.GOLDEN_POINT : DeuceType.ADVANTAGE),
            },
          },
        },
        include: {
          ruleset: true,
        },
      });

      await createAuditLog({
        userId: params.userId,
        tournamentId: params.tournamentId,
        action: 'CREATE_CATEGORY',
        entityType: 'Category',
        entityId: category.id,
        after: category,
      }, tx);

      return category;
    });
  }

  static async getCategoryById(id: string) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        ruleset: true,
        entries: {
          include: {
            players: {
              include: { player: true },
            },
          },
          orderBy: { seed: 'asc' },
        },
        stages: {
          include: {
            groups: true,
            _count: { select: { matches: true } },
          },
          orderBy: { order: 'asc' },
        },
        tournament: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
    });

    if (!category) {
      throw AppError.notFound(`Category with ID '${id}' not found`);
    }

    return category;
  }

  static async listByTournament(tournamentId: string) {
    return await prisma.category.findMany({
      where: { tournamentId },
      include: {
        ruleset: true,
        _count: {
          select: { entries: true, stages: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  static async updateCategory(id: string, params: UpdateCategoryParams) {
    const current = await this.getCategoryById(id);

    return await prisma.$transaction(async (tx) => {
      const data: Prisma.CategoryUpdateInput = {};
      if (params.name) data.name = params.name;
      if (params.description !== undefined) data.description = params.description;
      if (params.format) data.format = params.format;
      if (params.maxEntries !== undefined) data.maxEntries = params.maxEntries;
      if (params.status) data.status = params.status;

      if (params.ruleset) {
        data.ruleset = {
          upsert: {
            create: {
              setsToWin: params.ruleset.setsToWin ?? 2,
              gamesPerSet: params.ruleset.gamesPerSet ?? 6,
              tiebreakAt: params.ruleset.tiebreakAt ?? 6,
              tiebreakPoints: params.ruleset.tiebreakPoints ?? 7,
              goldenPoint: params.ruleset.goldenPoint ?? false,
              superTiebreak: params.ruleset.superTiebreak ?? false,
              superTiebreakPts: params.ruleset.superTiebreakPts ?? 10,
              deuceType: params.ruleset.deuceType ?? DeuceType.ADVANTAGE,
            },
            update: {
              setsToWin: params.ruleset.setsToWin,
              gamesPerSet: params.ruleset.gamesPerSet,
              tiebreakAt: params.ruleset.tiebreakAt,
              tiebreakPoints: params.ruleset.tiebreakPoints,
              goldenPoint: params.ruleset.goldenPoint,
              superTiebreak: params.ruleset.superTiebreak,
              superTiebreakPts: params.ruleset.superTiebreakPts,
              deuceType: params.ruleset.deuceType,
            },
          },
        };
      }

      const updated = await tx.category.update({
        where: { id },
        data,
        include: { ruleset: true },
      });

      await createAuditLog({
        userId: params.userId,
        tournamentId: current.tournamentId,
        action: 'UPDATE_CATEGORY',
        entityType: 'Category',
        entityId: id,
        before: current,
        after: updated,
      }, tx);

      return updated;
    });
  }

  static async deleteCategory(id: string, userId: string) {
    const category = await this.getCategoryById(id);

    // Guard: Check if matches exist across stages
    const matchCount = await prisma.match.count({
      where: {
        stage: { categoryId: id },
      },
    });

    if (matchCount > 0) {
      throw AppError.badRequest(
        `Cannot delete category '${category.name}' because it already contains ${matchCount} match(es). Archive or clear matches first.`
      );
    }

    return await prisma.$transaction(async (tx) => {
      await tx.category.delete({
        where: { id },
      });

      await createAuditLog({
        userId,
        tournamentId: category.tournamentId,
        action: 'DELETE_CATEGORY',
        entityType: 'Category',
        entityId: id,
        before: category,
      }, tx);

      return { success: true };
    });
  }
}
