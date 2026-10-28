import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { createAuditLog } from './audit.service';

export interface CreateCourtParams {
  tournamentId: string;
  name: string;
  isActive?: boolean;
  priority?: number;
  userId: string;
}

export interface UpdateCourtParams {
  name?: string;
  isActive?: boolean;
  priority?: number;
  userId: string;
}

export class CourtService {
  static async createCourt(params: CreateCourtParams) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.tournamentId },
    });
    if (!tournament) {
      throw AppError.notFound(`Tournament '${params.tournamentId}' not found`);
    }

    const court = await prisma.court.create({
      data: {
        tournamentId: params.tournamentId,
        name: params.name.trim(),
        isActive: params.isActive !== undefined ? params.isActive : true,
        priority: params.priority || 0,
      },
    });

    await createAuditLog({
      userId: params.userId,
      tournamentId: params.tournamentId,
      action: 'CREATE_COURT',
      entityType: 'Court',
      entityId: court.id,
      after: court,
    });

    return court;
  }

  static async listByTournament(tournamentId: string) {
    return await prisma.court.findMany({
      where: { tournamentId },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });
  }

  static async getCourtById(id: string) {
    const court = await prisma.court.findUnique({
      where: { id },
      include: {
        matches: {
          where: {
            status: { in: ['IN_PROGRESS', 'SCHEDULED', 'WARMUP'] },
          },
        },
      },
    });

    if (!court) {
      throw AppError.notFound(`Court with ID '${id}' not found`);
    }

    return court;
  }

  static async updateCourt(id: string, params: UpdateCourtParams) {
    const current = await this.getCourtById(id);

    const data: Prisma.CourtUpdateInput = {};
    if (params.name) data.name = params.name.trim();
    if (params.isActive !== undefined) data.isActive = params.isActive;
    if (params.priority !== undefined) data.priority = params.priority;

    const updated = await prisma.court.update({
      where: { id },
      data,
    });

    await createAuditLog({
      userId: params.userId,
      tournamentId: current.tournamentId,
      action: 'UPDATE_COURT',
      entityType: 'Court',
      entityId: id,
      before: current,
      after: updated,
    });

    return updated;
  }

  static async deleteCourt(id: string, userId: string) {
    const court = await this.getCourtById(id);

    // Guard: Prevent deletion if court has active matches
    const activeMatches = await prisma.match.count({
      where: {
        courtId: id,
        status: { in: ['IN_PROGRESS', 'WARMUP'] },
      },
    });

    if (activeMatches > 0) {
      throw AppError.badRequest('Cannot delete court while a match is currently active on it');
    }

    await prisma.court.delete({ where: { id } });

    await createAuditLog({
      userId,
      tournamentId: court.tournamentId,
      action: 'DELETE_COURT',
      entityType: 'Court',
      entityId: id,
      before: court,
    });

    return { success: true };
  }
}
