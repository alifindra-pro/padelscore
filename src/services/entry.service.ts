import { validateEligibility, Eligibility } from "../../packages/core/src";
import prisma from "@/lib/db";
import { EntryStatus, Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { createAuditLog } from "./audit.service";

export interface CreateEntryParams {
  categoryId: string;
  name?: string;
  playerIds: string[];
  playerNames?: string[];
  contact?: string;
  publicSubmitter?: string;
  seed?: number | null;
  userId: string | null;
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
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM categories WHERE id = ${params.categoryId} FOR UPDATE`;
        const category = await tx.category.findUnique({
          where: { id: params.categoryId },
          include: {
            tournament: true,
            _count: { select: { entries: true, stages: true } },
          },
        });
        if (!category) throw AppError.notFound("Kategori tidak ditemukan");
        await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${category.tournamentId} FOR UPDATE`;
        const currentTournament = await tx.tournament.findUniqueOrThrow({
          where: { id: category.tournamentId },
        });
        if (
          params.publicSubmitter &&
          currentTournament.status !== "REGISTRATION"
        )
          throw AppError.conflict(
            "Pendaftaran belum dibuka atau sudah ditutup",
          );
        if (
          ["IN_PROGRESS", "COMPLETED", "ARCHIVED"].includes(
            currentTournament.status,
          ) ||
          category._count.stages
        )
          throw AppError.conflict(
            "Peserta dikunci karena bagan sudah dibuat atau turnamen telah berjalan",
          );
        const activeCount = await tx.entry.count({
          where: {
            categoryId: category.id,
            status: { in: ["REGISTERED", "CONFIRMED"] },
          },
        });
        const waitingCount = await tx.entry.count({
          where: { categoryId: category.id, status: "WAITLISTED" },
        });
        // Keep freed slots for the existing queue until an admin confirms promotion.
        const waitlisted =
          waitingCount > 0 ||
          !!(category.maxEntries && activeCount >= category.maxEntries);
        if (params.publicSubmitter) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.publicSubmitter}))`;
          const recent = await tx.auditLog.count({
            where: {
              action: "PUBLIC_REGISTER",
              ipAddress: params.publicSubmitter,
              createdAt: { gte: new Date(Date.now() - 3600000) },
            },
          });
          if (recent >= 5)
            throw new AppError(
              429,
              "RATE_LIMITED",
              "Terlalu banyak pendaftaran. Coba lagi dalam satu jam.",
            );
        }
        const ids = [...params.playerIds];
        if (params.playerNames) {
          if (
            params.playerNames.length !== 2 ||
            new Set(
              params.playerNames.map((n) => n.trim().toLocaleLowerCase("id")),
            ).size !== 2
          )
            throw AppError.badRequest("Masukkan dua nama pemain yang berbeda");
          const duplicate = await tx.entryPlayer.findFirst({
            where: {
              entry: { categoryId: category.id },
              player: {
                OR: params.playerNames.map((fullName) => ({
                  fullName: {
                    equals: fullName.trim(),
                    mode: "insensitive" as const,
                  },
                })),
              },
            },
          });
          if (duplicate)
            throw AppError.conflict(
              "Nama pemain sudah terdaftar. Hubungi admin jika ada pemain berbeda dengan nama sama.",
            );
          for (const fullName of params.playerNames)
            ids.push(
              (
                await tx.player.create({
                  data: {
                    organizationId: category.tournament.organizationId,
                    fullName: fullName.trim(),
                    phone: params.contact,
                  },
                })
              ).id,
            );
        }
        if (!ids.length || ids.length > 2 || new Set(ids).size !== ids.length)
          throw AppError.badRequest("Pemain dalam pasangan harus berbeda");
        const players = await tx.player.findMany({
          where: {
            id: { in: ids },
            ...(category.tournament.organizationId
              ? { organizationId: category.tournament.organizationId }
              : {}),
          },
        });
        if (players.length !== ids.length)
          throw AppError.badRequest(
            "Pemain tidak ditemukan dalam organisasi ini",
          );
        try {
          validateEligibility(
            players,
            (category.eligibility as Eligibility) ?? {},
            category.tournament.startDate,
            category.tournament.timezone,
          );
        } catch (e) {
          throw AppError.badRequest((e as Error).message);
        }
        if (
          await tx.entryPlayer.findFirst({
            where: {
              playerId: { in: ids },
              entry: { categoryId: category.id },
            },
          })
        )
          throw AppError.conflict("Pemain sudah terdaftar pada kategori ini");
        const last = await tx.entry.findFirst({
          where: { categoryId: category.id },
          orderBy: { createdAt: "desc" },
        });
        const entry = await tx.entry.create({
          data: {
            categoryId: category.id,
            createdAt: new Date(
              Math.max(Date.now(), (last?.createdAt.getTime() ?? 0) + 1),
            ),
            name:
              params.name?.trim() ||
              ids
                .map((id) => players.find((p) => p.id === id)!.fullName)
                .join(" / "),
            seed: params.seed ?? null,
            status: waitlisted
              ? EntryStatus.WAITLISTED
              : EntryStatus.REGISTERED,
            players: { create: ids.map((playerId) => ({ playerId })) },
          },
          include: { players: { include: { player: true } } },
        });
        await tx.auditLog.create({
          data: {
            userId: params.userId,
            tournamentId: category.tournamentId,
            action: params.publicSubmitter ? "PUBLIC_REGISTER" : "CREATE_ENTRY",
            entityType: "Entry",
            entityId: entry.id,
            ipAddress: params.publicSubmitter,
            after: { name: entry.name },
          },
        });
        return {
          ...entry,
          queuePosition: waitlisted ? waitingCount + 1 : null,
        };
      },
      { timeout: 30000 },
    );
  }

  static async listByCategory(categoryId: string) {
    return await prisma.entry.findMany({
      where: { categoryId },
      include: {
        players: {
          include: { player: true },
        },
      },
      orderBy: [{ seed: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
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
    const snapshot = await this.getEntryById(id);
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM categories WHERE id = ${snapshot.categoryId} FOR UPDATE`;
      const current = await tx.entry.findUniqueOrThrow({ where: { id } });
      const category = await tx.category.findUniqueOrThrow({
        where: { id: current.categoryId },
        include: { tournament: true },
      });
      if (params.status && params.status !== current.status) {
        if (
          (await tx.stage.count({ where: { categoryId: category.id } })) ||
          ["IN_PROGRESS", "COMPLETED", "ARCHIVED"].includes(
            category.tournament.status,
          )
        )
          throw AppError.conflict(
            "Bagan sudah dibuat. Perubahan peserta harus ditangani melalui pengelolaan pertandingan.",
          );
        if (
          ["REGISTERED", "CONFIRMED"].includes(params.status) &&
          !["REGISTERED", "CONFIRMED"].includes(current.status)
        ) {
          if (current.status !== "WAITLISTED")
            throw AppError.conflict(
              "Peserta yang batal atau didiskualifikasi tidak dapat diaktifkan kembali.",
            );
          const first = await tx.entry.findFirst({
            where: { categoryId: category.id, status: "WAITLISTED" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          });
          if (first?.id !== id)
            throw AppError.conflict(
              "Konfirmasi cadangan nomor antrean pertama terlebih dahulu.",
            );
          const count = await tx.entry.count({
            where: {
              categoryId: category.id,
              status: { in: ["REGISTERED", "CONFIRMED"] },
            },
          });
          if (category.maxEntries && count >= category.maxEntries)
            throw AppError.conflict("Belum ada slot utama kosong.");
        }
      }
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

      await createAuditLog(
        {
          userId: params.userId,
          tournamentId: category.tournamentId,
          action: "UPDATE_ENTRY",
          entityType: "Entry",
          entityId: id,
          before: current,
          after: updated,
        },
        tx,
      );

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
        `Cannot delete entry because it is already assigned to ${matchCount} match(es). Mark as WITHDRAWN instead.`,
      );
    }

    return await prisma.$transaction(async (tx) => {
      await tx.entry.delete({ where: { id } });

      await createAuditLog(
        {
          userId,
          tournamentId: current.category.tournament.id,
          action: "DELETE_ENTRY",
          entityType: "Entry",
          entityId: id,
          before: current,
        },
        tx,
      );

      return { success: true };
    });
  }

  static async importEntries(
    categoryId: string,
    items: ImportEntryItem[],
    userId: string,
  ) {
    const category = await prisma.category.findUniqueOrThrow({
      where: { id: categoryId },
      include: { tournament: true },
    });
    const organizationId = category.tournament.organizationId;
    const results: (
      | Awaited<ReturnType<typeof EntryService.createEntry>>
      | { error: string; players: string[] }
    )[] = [];
    for (const item of items) {
      // Find or create player 1
      let p1 = item.player1Email
        ? await prisma.player.findFirst({
            where: { organizationId, email: item.player1Email },
          })
        : await prisma.player.findFirst({
            where: { organizationId, fullName: item.player1Name },
          });

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
          ? await prisma.player.findFirst({
              where: { organizationId, email: item.player2Email },
            })
          : await prisma.player.findFirst({
              where: { organizationId, fullName: item.player2Name },
            });

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
