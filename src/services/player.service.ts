import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { AppError } from '@/lib/errors';

export interface CreatePlayerParams {
  organizationId?: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  rating?: number | null;
  notes?: string | null;
}

export interface UpdatePlayerParams {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  rating?: number | null;
  notes?: string | null;
}

export interface ListPlayersParams {
  organizationId?: string;
  page?: number;
  limit?: number;
  search?: string;
}

export class PlayerService {
  static async createPlayer(params: CreatePlayerParams) {
    if (params.email) {
      const existing = await prisma.player.findFirst({
        where: { email: params.email },
      });
      if (existing) {
        throw AppError.conflict(`Player with email '${params.email}' already exists`);
      }
    }

    return await prisma.player.create({
      data: {
        fullName: params.fullName.trim(),
        organizationId: params.organizationId,
        email: params.email?.trim() || null,
        phone: params.phone?.trim() || null,
        rating: params.rating || null,
        notes: params.notes?.trim() || null,
      },
    });
  }

  static async getPlayerById(id: string) {
    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        entryPlayers: {
          include: {
            entry: {
              include: {
                category: {
                  include: {
                    tournament: { select: { id: true, name: true, slug: true, status: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!player) {
      throw AppError.notFound(`Player with ID '${id}' not found`);
    }

    return player;
  }

  static async listPlayers(params: ListPlayersParams = {}) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PlayerWhereInput = { organizationId: params.organizationId };
    if (params.search) {
      where.OR = [
        { fullName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.player.count({ where }),
      prisma.player.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fullName: 'asc' },
        include: {
          _count: { select: { entryPlayers: true } },
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

  static async updatePlayer(id: string, params: UpdatePlayerParams) {
    await this.getPlayerById(id);

    if (params.email) {
      const duplicate = await prisma.player.findFirst({
        where: {
          email: params.email,
          NOT: { id },
        },
      });
      if (duplicate) {
        throw AppError.conflict(`Email '${params.email}' is already taken by another player`);
      }
    }

    return await prisma.player.update({
      where: { id },
      data: {
        fullName: params.fullName?.trim(),
        email: params.email?.trim() || null,
        phone: params.phone?.trim() || null,
        rating: params.rating,
        notes: params.notes?.trim() || null,
      },
    });
  }
}
