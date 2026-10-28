import prisma from '@/lib/db';
import { TournamentStatus, TournamentMemberRole, Prisma } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { createAuditLog } from './audit.service';
import slugify from 'slugify';

export interface CreateTournamentParams {
  organizationId?: string;
  name: string;
  slug?: string;
  description?: string | null;
  location?: string | null;
  timezone?: string;
  startDate: string | Date;
  endDate: string | Date;
  userId: string;
}

export interface UpdateTournamentParams {
  name?: string;
  slug?: string;
  description?: string | null;
  location?: string | null;
  timezone?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  userId: string;
}

export interface ListTournamentsParams {
  accessWhere?: Prisma.TournamentWhereInput;
  page?: number;
  limit?: number;
  status?: TournamentStatus;
  search?: string;
}

export class TournamentService {
  static async createTournament(params: CreateTournamentParams) {
    const rawSlug = params.slug || slugify(params.name, { lower: true, strict: true });

    // Check slug collision
    const existing = await prisma.tournament.findUnique({
      where: { slug: rawSlug },
    });
    if (existing) {
      throw AppError.conflict(`Tournament with slug '${rawSlug}' already exists`);
    }

    const startDate = new Date(params.startDate);
    const endDate = new Date(params.endDate);

    if (endDate <= startDate) {
      throw AppError.badRequest('End date must be after start date');
    }

    return await prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.create({
        data: {
          name: params.name,
          organizationId: params.organizationId,
          slug: rawSlug,
          description: params.description || null,
          location: params.location || null,
          timezone: params.timezone || 'Asia/Jakarta',
          startDate,
          endDate,
          status: TournamentStatus.DRAFT,
          members: {
            create: {
              userId: params.userId,
              role: TournamentMemberRole.OWNER,
            },
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, fullName: true, email: true, role: true },
              },
            },
          },
        },
      });

      await createAuditLog({
        userId: params.userId,
        tournamentId: tournament.id,
        action: 'CREATE_TOURNAMENT',
        entityType: 'Tournament',
        entityId: tournament.id,
        after: tournament,
      }, tx);

      return tournament;
    });
  }

  static async getTournamentById(id: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        categories: {
          include: {
            ruleset: true,
            _count: { select: { entries: true, stages: true } },
          },
        },
        courts: true,
        members: {
          include: {
            user: {
              select: { id: true, fullName: true, email: true, role: true },
            },
          },
        },
      },
    });

    if (!tournament) {
      throw AppError.notFound(`Tournament with ID '${id}' not found`);
    }

    return tournament;
  }

  static async getTournamentBySlug(slug: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { slug },
      include: {
        categories: {
          include: {
            ruleset: true,
            _count: { select: { entries: true, stages: true } },
          },
        },
        courts: {
          where: { isActive: true },
          orderBy: { priority: 'desc' },
        },
      },
    });

    if (!tournament) {
      throw AppError.notFound(`Tournament with slug '${slug}' not found`);
    }

    return tournament;
  }

  static async listTournaments(params: ListTournamentsParams = {}) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.TournamentWhereInput = { AND: [params.accessWhere || {}] };

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { location: { contains: params.search, mode: 'insensitive' } },
        { slug: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.tournament.count({ where }),
      prisma.tournament.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDate: 'desc' },
        include: {
          _count: {
            select: { categories: true, courts: true, members: true },
          },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async updateTournament(id: string, params: UpdateTournamentParams) {
    const current = await this.getTournamentById(id);

    // Business rule: Do not allow changing slug if published or in-progress
    const lockedStatuses: TournamentStatus[] = [
      TournamentStatus.PUBLISHED,
      TournamentStatus.IN_PROGRESS,
      TournamentStatus.COMPLETED,
    ];
    if (params.slug && params.slug !== current.slug && lockedStatuses.includes(current.status)) {
      throw AppError.badRequest('Cannot change slug for published, active, or completed tournaments');
    }

    const data: Prisma.TournamentUpdateInput = {};

    if (params.name) data.name = params.name;
    if (params.slug) data.slug = params.slug;
    if (params.description !== undefined) data.description = params.description;
    if (params.location !== undefined) data.location = params.location;
    if (params.timezone) data.timezone = params.timezone;

    if (params.startDate) data.startDate = new Date(params.startDate);
    if (params.endDate) data.endDate = new Date(params.endDate);

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.tournament.update({
        where: { id },
        data,
      });

      await createAuditLog({
        userId: params.userId,
        tournamentId: id,
        action: 'UPDATE_TOURNAMENT',
        entityType: 'Tournament',
        entityId: id,
        before: current,
        after: res,
      }, tx);

      return res;
    });

    return updated;
  }

  static async changeTournamentStatus(id: string, newStatus: TournamentStatus, userId: string) {
    const current = await this.getTournamentById(id);

    // Valid state transitions
    const validTransitions: Record<TournamentStatus, TournamentStatus[]> = {
      [TournamentStatus.DRAFT]: [TournamentStatus.REGISTRATION, TournamentStatus.PUBLISHED, TournamentStatus.ARCHIVED],
      [TournamentStatus.REGISTRATION]: [TournamentStatus.PUBLISHED, TournamentStatus.IN_PROGRESS, TournamentStatus.DRAFT, TournamentStatus.ARCHIVED],
      [TournamentStatus.PUBLISHED]: [TournamentStatus.IN_PROGRESS, TournamentStatus.REGISTRATION, TournamentStatus.ARCHIVED],
      [TournamentStatus.IN_PROGRESS]: [TournamentStatus.COMPLETED, TournamentStatus.ARCHIVED],
      [TournamentStatus.COMPLETED]: [TournamentStatus.ARCHIVED, TournamentStatus.IN_PROGRESS],
      [TournamentStatus.ARCHIVED]: [TournamentStatus.DRAFT],
    };

    const allowed = validTransitions[current.status] || [];
    if (!allowed.includes(newStatus)) {
      throw AppError.badRequest(
        `Invalid status transition from ${current.status} to ${newStatus}`
      );
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.tournament.update({
        where: { id },
        data: { status: newStatus },
      });

      await createAuditLog({
        userId,
        tournamentId: id,
        action: 'CHANGE_TOURNAMENT_STATUS',
        entityType: 'Tournament',
        entityId: id,
        before: { status: current.status },
        after: { status: newStatus },
      }, tx);

      return updated;
    });
  }
}
